import type { FastifyInstance } from "fastify";
import { prisma } from "../db/prisma.js";
import { courtBookingSchema, createRallySchema, respondToRallySchema, scheduleSuggestionParamsSchema } from "../modules/rallies/schemas.js";
import { suggestRallySlots } from "../modules/scheduling/scheduler.js";

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

    const receiver = await prisma.user.findUnique({ where: { id: body.receiverId } });
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

    const rally = await prisma.rally.create({
      data: {
        senderId: request.user.sub,
        receiverId: body.receiverId,
        sport: body.sport,
        proposedStartAt: body.proposedStartAt,
        proposedEndAt: body.proposedEndAt,
        venueId: body.venueId
      }
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
        courtStatus: body.status === "ACCEPTED" ? "NEEDS_USER_ACTION" : "NOT_STARTED"
      }
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

    if (rally.status !== "ACCEPTED") {
      return reply.code(409).send({ error: "Court booking can only be updated after acceptance" });
    }

    const updated = await prisma.rally.update({
      where: { id: rally.id },
      data: {
        courtStatus: body.courtStatus,
        courtNumber: body.courtNumber,
        bookingReference: body.bookingReference,
        bookingOwnerId: request.user.sub
      }
    });

    return { rally: updated };
  });
}
