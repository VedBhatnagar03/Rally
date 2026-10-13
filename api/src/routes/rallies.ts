import { Prisma } from "@prisma/client";
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
import {
  canCompleteRally,
  rallyWindowErrorMessage,
  validateRallyWindow
} from "../modules/rallies/integrity.js";
import { rallyReadInclude, toRallyView } from "../modules/rallies/presentation.js";
import { isSameConfirmedBooking } from "../modules/rallies/booking-integrity.js";
import { writeAuditLog } from "../utils/audit.js";

const activeRallyStatuses = ["PENDING", "ACCEPTED", "SCHEDULED"] as const;

export async function rallyRoutes(app: FastifyInstance) {
  app.get("/", { preHandler: app.authenticate }, async (request) => {
    const rallies = await prisma.rally.findMany({
      where: {
        OR: [{ senderId: request.user.sub }, { receiverId: request.user.sub }]
      },
      include: rallyReadInclude,
      orderBy: { createdAt: "desc" }
    });

    return { rallies: rallies.map(toRallyView) };
  });

  app.get("/:rallyId", { preHandler: app.authenticate }, async (request, reply) => {
    const params = request.params as { rallyId: string };
    const rally = await prisma.rally.findFirst({
      where: {
        id: params.rallyId,
        OR: [{ senderId: request.user.sub }, { receiverId: request.user.sub }]
      },
      include: rallyReadInclude
    });

    if (!rally) return reply.code(404).send({ error: "Rally not found" });

    return { rally: toRallyView(rally) };
  });

  app.post("/", { preHandler: app.authenticate }, async (request, reply) => {
    const body = createRallySchema.parse(request.body);

    if (body.receiverId === request.user.sub) {
      return reply.code(400).send({ error: "You cannot send a Rally to yourself" });
    }

    const windowError = validateRallyWindow(body.proposedStartAt, body.proposedEndAt);
    if (windowError) return reply.code(400).send({ error: rallyWindowErrorMessage(windowError) });

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

    const existingRally = await prisma.rally.findFirst({
      where: {
        status: { in: [...activeRallyStatuses] },
        OR: [
          { senderId: request.user.sub, receiverId: body.receiverId },
          { senderId: body.receiverId, receiverId: request.user.sub }
        ]
      },
      select: { id: true }
    });
    if (existingRally) {
      return reply.code(409).send({ error: "An active Rally already exists between these users" });
    }

    let rally;
    try {
      rally = await prisma.$transaction(async (tx) => {
        const created = await tx.rally.create({
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
        await tx.notification.create({
          data: { userId: body.receiverId, type: "RALLY_RECEIVED", rallyId: created.id }
        });
        return created;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return reply.code(409).send({ error: "An active Rally already exists between these users" });
      }
      throw error;
    }

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

    const transitioned = await prisma.$transaction(async (tx) => {
      const result = await tx.rally.updateMany({
        where: { id: rally.id, receiverId: request.user.sub, status: "PENDING" },
        data: {
          status: body.status,
          acceptedAt: body.status === "ACCEPTED" ? new Date() : undefined,
          courtStatus: "NOT_STARTED"
        }
      });
      if (result.count === 1) {
        await tx.notification.create({
          data: {
            userId: rally.senderId,
            type: body.status === "ACCEPTED" ? "RALLY_ACCEPTED" : "RALLY_DECLINED",
            rallyId: rally.id
          }
        });
      }
      return result;
    });
    if (transitioned.count !== 1) {
      return reply.code(409).send({ error: "Rally has already been resolved" });
    }

    const updated = await prisma.rally.findUniqueOrThrow({
      where: { id: rally.id },
      include: { venue: true }
    });

    return { rally: updated };
  });

  app.post("/:rallyId/schedule", { preHandler: app.authenticate }, async (request, reply) => {
    const params = request.params as { rallyId: string };
    const body = selectScheduleSchema.parse(request.body);

    const windowError = validateRallyWindow(body.proposedStartAt, body.proposedEndAt);
    if (windowError) return reply.code(400).send({ error: rallyWindowErrorMessage(windowError) });

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

    const transitioned = await prisma.$transaction(async (tx) => {
      const result = await tx.rally.updateMany({
        where: { id: rally.id, status: "ACCEPTED" },
        data: {
          status: "SCHEDULED",
          scheduledAt: new Date(),
          proposedStartAt: body.proposedStartAt,
          proposedEndAt: body.proposedEndAt,
          venueId: body.venueId,
          courtStatus: "NEEDS_USER_ACTION"
        }
      });
      if (result.count === 1) {
        await tx.notification.create({
          data: {
            userId: request.user.sub === rally.senderId ? rally.receiverId : rally.senderId,
            type: "RALLY_SCHEDULED",
            rallyId: rally.id
          }
        });
      }
      return result;
    });
    if (transitioned.count !== 1) {
      return reply.code(409).send({ error: "Rally is no longer available for scheduling" });
    }

    const updated = await prisma.rally.findUniqueOrThrow({
      where: { id: rally.id },
      include: { venue: true }
    });

    return { rally: updated };
  });

  app.post("/:rallyId/court-booking", { preHandler: app.authenticate }, async (request, reply) => {
    const params = request.params as { rallyId: string };
    const body = courtBookingSchema.parse(request.body);

    const rally = await prisma.rally.findUnique({
      where: { id: params.rallyId },
      include: { venue: true }
    });

    if (!rally || (rally.senderId !== request.user.sub && rally.receiverId !== request.user.sub)) {
      return reply.code(404).send({ error: "Rally not found" });
    }

    if (rally.status !== "SCHEDULED") {
      return reply.code(409).send({ error: "Court booking can only be updated after scheduling" });
    }

    if (rally.courtStatus === "BOOKED") {
      if (isSameConfirmedBooking(rally, request.user.sub, body)) return { rally };
      return reply.code(409).send({ error: "Confirmed court booking cannot be changed" });
    }

    const transitioned = await prisma.rally.updateMany({
      where: {
        id: rally.id,
        status: "SCHEDULED",
        courtStatus: { in: ["NEEDS_USER_ACTION", "UNAVAILABLE"] }
      },
      data:
        body.courtStatus === "BOOKED"
          ? {
              courtStatus: "BOOKED",
              courtNumber: body.courtNumber,
              bookingReference: body.bookingReference,
              bookingOwnerId: request.user.sub
            }
          : {
              courtStatus: "UNAVAILABLE",
              courtNumber: null,
              bookingReference: null,
              bookingOwnerId: null
            }
    });
    if (transitioned.count !== 1) {
      const current = await prisma.rally.findUnique({
        where: { id: rally.id },
        include: { venue: true }
      });
      if (current && isSameConfirmedBooking(current, request.user.sub, body)) {
        return { rally: current };
      }
      return reply.code(409).send({ error: "Rally is no longer available for court booking" });
    }

    const updated = await prisma.rally.findUniqueOrThrow({
      where: { id: rally.id },
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

    if (rally.status === "SCHEDULED" && !canCompleteRally(rally.proposedStartAt)) {
      return reply.code(409).send({ error: "Rally cannot be completed before its scheduled start" });
    }

    if (rally.status === "SCHEDULED") {
      const transitioned = await prisma.$transaction(async (tx) => {
        const result = await tx.rally.updateMany({
          where: { id: rally.id, status: "SCHEDULED" },
          data: { status: "COMPLETED", completedAt: new Date() }
        });
        if (result.count === 1) {
          await tx.notification.createMany({
            data: [rally.senderId, rally.receiverId].map((userId) => ({
              userId,
              type: "RALLY_COMPLETED" as const,
              rallyId: rally.id
            })),
            skipDuplicates: true
          });
        }
        return result;
      });
      if (transitioned.count !== 1) {
        const current = await prisma.rally.findUnique({ where: { id: rally.id } });
        if (current?.status !== "COMPLETED") {
          return reply.code(409).send({ error: "Rally is no longer available for completion" });
        }
      }
    }

    const updated = await prisma.rally.findUniqueOrThrow({
      where: { id: rally.id },
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

    const transitioned = await prisma.$transaction(async (tx) => {
      const result = await tx.rally.updateMany({
        where: { id: rally.id, status: { in: ["PENDING", "ACCEPTED", "SCHEDULED"] } },
        data: {
          status: "CANCELLED",
          cancelledAt: new Date(),
          cancelledById: request.user.sub,
          cancellationReason: body.reason,
          courtStatus: "NOT_STARTED"
        }
      });
      if (result.count === 1) {
        await tx.notification.create({
          data: {
            userId: request.user.sub === rally.senderId ? rally.receiverId : rally.senderId,
            type: "RALLY_CANCELLED",
            rallyId: rally.id
          }
        });
      }
      return result;
    });
    if (transitioned.count !== 1) {
      return reply.code(409).send({ error: "Rally can no longer be cancelled" });
    }

    const updated = await prisma.rally.findUniqueOrThrow({
      where: { id: rally.id },
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
