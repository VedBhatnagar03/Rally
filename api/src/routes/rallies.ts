import type { FastifyInstance } from "fastify";
import { prisma } from "../db/prisma.js";
import {
  cancelRallySchema,
  courtBookingSchema,
  createRallySchema,
  respondToRallySchema,
  scheduleSuggestionParamsSchema,
  selectScheduleSchema
} from "../modules/rallies/schemas.js";
import { suggestRallySlots } from "../modules/scheduling/scheduler.js";
import { passesHardFilters } from "../modules/matching/matcher.js";
import { writeAuditLog } from "../utils/audit.js";

export async function rallyRoutes(app: FastifyInstance) {
  app.get("/", { preHandler: app.authenticate }, async (request) => {
    const rallies = await prisma.rally.findMany({
      where: {
        OR: [{ senderId: request.user.sub }, { receiverId: request.user.sub }]
      },
      include: {
        sender: { select: { id: true, email: true, profile: true } },
        receiver: { select: { id: true, email: true, profile: true } },
        venue: true
      },
      orderBy: { createdAt: "desc" }
    });

    return { rallies };
  });

  app.post("/", { preHandler: app.authenticate }, async (request, reply) => {
    const body = createRallySchema.parse(request.body);

    if (body.receiverId === request.user.sub) {
      return reply.code(400).send({ error: "You cannot send a Rally to yourself" });
    }

    if (body.proposedEndAt <= body.proposedStartAt) {
      return reply.code(400).send({ error: "Rally end time must be after start time" });
    }

    const [sender, receiver] = await Promise.all([
      prisma.user.findUnique({
        where: { id: request.user.sub },
        include: { profile: true, sportProfiles: true, availability: true }
      }),
      prisma.user.findUnique({
        where: { id: body.receiverId },
        include: { profile: true, sportProfiles: true, availability: true }
      })
    ]);
    if (!receiver || receiver.status !== "ACTIVE") {
      return reply.code(404).send({ error: "Receiver not found" });
    }

    const block = await prisma.block.findFirst({
      where: {
        OR: [
          { blockerId: request.user.sub, blockedId: body.receiverId },
          { blockerId: body.receiverId, blockedId: request.user.sub }
        ]
      }
    });

    if (block) {
      return reply.code(403).send({ error: "Rally unavailable" });
    }

    if (
      !sender?.profile ||
      !receiver.profile ||
      !passesHardFilters(
        {
          userId: sender.id,
          displayName: sender.profile.displayName,
          profile: sender.profile,
          sports: sender.sportProfiles,
          availability: sender.availability
        },
        {
          userId: receiver.id,
          displayName: receiver.profile.displayName,
          profile: receiver.profile,
          sports: receiver.sportProfiles,
          availability: receiver.availability
        }
      ) ||
      !sender.sportProfiles.some(({ sport }) => sport === body.sport) ||
      !receiver.sportProfiles.some(({ sport }) => sport === body.sport)
    ) {
      return reply.code(403).send({ error: "Rally unavailable" });
    }

    const rally = await prisma.rally.create({
      data: {
        senderId: request.user.sub,
        receiverId: body.receiverId,
        sport: body.sport,
        proposedStartAt: body.proposedStartAt,
        proposedEndAt: body.proposedEndAt,
        venueId: body.venueId
      },
      include: { venue: true }
    });

    return reply.code(201).send({ rally });
  });

  app.get("/suggestions/:receiverId", { preHandler: app.authenticate }, async (request, reply) => {
    const params = scheduleSuggestionParamsSchema.parse(request.params);

    if (params.receiverId === request.user.sub) {
      return reply.code(400).send({ error: "You cannot schedule a Rally with yourself" });
    }

    const [currentUser, receiver, venues, block] = await Promise.all([
      prisma.user.findUnique({
        where: { id: request.user.sub },
        include: { sportProfiles: true, availability: true }
      }),
      prisma.user.findUnique({
        where: { id: params.receiverId },
        include: { sportProfiles: true, availability: true }
      }),
      prisma.venue.findMany(),
      prisma.block.findFirst({
        where: {
          OR: [
            { blockerId: request.user.sub, blockedId: params.receiverId },
            { blockerId: params.receiverId, blockedId: request.user.sub }
          ]
        }
      })
    ]);

    if (!currentUser || !receiver || receiver.status !== "ACTIVE") {
      return reply.code(404).send({ error: "Receiver not found" });
    }

    if (block) {
      return reply.code(403).send({ error: "Rally unavailable" });
    }

    const sharedSports = currentUser.sportProfiles
      .map((sportProfile) => sportProfile.sport)
      .filter((sport) => receiver.sportProfiles.some((receiverSport) => receiverSport.sport === sport));

    const suggestions = suggestRallySlots({
      sharedSports,
      requesterAvailability: currentUser.availability,
      receiverAvailability: receiver.availability,
      venues,
      maxSuggestions: 3
    });

    return { suggestions };
  });

  app.post("/:rallyId/respond", { preHandler: app.authenticate }, async (request, reply) => {
    const params = request.params as { rallyId: string };
    const body = respondToRallySchema.parse(request.body);

    const rally = await prisma.rally.findUnique({ where: { id: params.rallyId } });

    if (!rally || rally.receiverId !== request.user.sub) {
      return reply.code(404).send({ error: "Rally not found" });
    }

    if (rally.status !== "PENDING") {
      return reply.code(409).send({ error: "Rally has already been resolved" });
    }

    const updated = await prisma.rally.update({
      where: { id: rally.id },
      data: {
        status: body.status,
        acceptedAt: body.status === "ACCEPTED" ? new Date() : undefined,
        courtStatus: "NOT_STARTED"
      },
      include: { venue: true }
    });

    return { rally: updated };
  });

  app.post("/:rallyId/schedule", { preHandler: app.authenticate }, async (request, reply) => {
    const params = request.params as { rallyId: string };
    const body = selectScheduleSchema.parse(request.body);

    if (body.proposedEndAt <= body.proposedStartAt) {
      return reply.code(400).send({ error: "Rally end time must be after start time" });
    }

    const rally = await prisma.rally.findUnique({ where: { id: params.rallyId } });

    if (!rally || (rally.senderId !== request.user.sub && rally.receiverId !== request.user.sub)) {
      return reply.code(404).send({ error: "Rally not found" });
    }

    if (rally.status !== "ACCEPTED") {
      return reply.code(409).send({ error: "Schedule can only be selected after acceptance" });
    }

    const venue = await prisma.venue.findUnique({ where: { id: body.venueId } });
    if (!venue || !venue.sports.includes(rally.sport)) {
      return reply.code(400).send({ error: "Venue is not compatible with this Rally sport" });
    }

    const updated = await prisma.rally.update({
      where: { id: rally.id },
      data: {
        status: "SCHEDULED",
        scheduledAt: new Date(),
        proposedStartAt: body.proposedStartAt,
        proposedEndAt: body.proposedEndAt,
        venueId: body.venueId,
        courtStatus: "NEEDS_USER_ACTION"
      },
      include: { venue: true }
    });

    return { rally: updated };
  });

  app.post("/:rallyId/court-booking", { preHandler: app.authenticate }, async (request, reply) => {
    const params = request.params as { rallyId: string };
    const body = courtBookingSchema.parse(request.body);

    const rally = await prisma.rally.findUnique({ where: { id: params.rallyId } });

    if (!rally || (rally.senderId !== request.user.sub && rally.receiverId !== request.user.sub)) {
      return reply.code(404).send({ error: "Rally not found" });
    }

    if (rally.status !== "SCHEDULED") {
      return reply.code(409).send({ error: "Court booking can only be updated after scheduling" });
    }

    const updated = await prisma.rally.update({
      where: { id: rally.id },
      data: {
        courtStatus: body.courtStatus,
        courtNumber: body.courtNumber,
        bookingReference: body.bookingReference,
        bookingOwnerId: request.user.sub
      },
      include: { venue: true }
    });

    return { rally: updated };
  });

  app.post("/:rallyId/complete", { preHandler: app.authenticate }, async (request, reply) => {
    const params = request.params as { rallyId: string };
    const rally = await prisma.rally.findUnique({ where: { id: params.rallyId } });

    if (!rally || (rally.senderId !== request.user.sub && rally.receiverId !== request.user.sub)) {
      return reply.code(404).send({ error: "Rally not found" });
    }

    if (rally.status !== "SCHEDULED" && rally.status !== "COMPLETED") {
      return reply.code(409).send({ error: "Only scheduled Rallies can be completed" });
    }

    const updated = await prisma.rally.update({
      where: { id: rally.id },
      data: { status: "COMPLETED", completedAt: rally.completedAt ?? new Date() },
      include: { venue: true }
    });

    return { rally: updated };
  });

  app.post("/:rallyId/cancel", { preHandler: app.authenticate }, async (request, reply) => {
    const params = request.params as { rallyId: string };
    const body = cancelRallySchema.parse(request.body);
    const rally = await prisma.rally.findUnique({ where: { id: params.rallyId } });

    if (!rally || (rally.senderId !== request.user.sub && rally.receiverId !== request.user.sub)) {
      return reply.code(404).send({ error: "Rally not found" });
    }

    if (!["PENDING", "ACCEPTED", "SCHEDULED"].includes(rally.status)) {
      return reply.code(409).send({ error: "Rally can no longer be cancelled" });
    }

    const updated = await prisma.rally.update({
      where: { id: rally.id },
      data: {
        status: "CANCELLED",
        cancelledAt: new Date(),
        cancelledById: request.user.sub,
        cancellationReason: body.reason,
        courtStatus: "NOT_STARTED"
      },
      include: { venue: true }
    });

    await writeAuditLog({
      userId: request.user.sub,
      action: "rally.cancel",
      metadata: { rallyId: rally.id },
      request
    });

    return { rally: updated };
  });
}
