import { Prisma } from "@prisma/client";

export const rallyReadInclude = Prisma.validator<Prisma.RallyInclude>()({
  sender: {
    select: {
      id: true,
      profile: { select: { displayName: true } },
      photos: {
        select: { id: true, url: true, sortOrder: true },
        orderBy: { sortOrder: "asc" },
        take: 1
      }
    }
  },
  receiver: {
    select: {
      id: true,
      profile: { select: { displayName: true } },
      photos: {
        select: { id: true, url: true, sortOrder: true },
        orderBy: { sortOrder: "asc" },
        take: 1
      }
    }
  },
  venue: true
});

export type RallyReadRecord = Prisma.RallyGetPayload<{ include: typeof rallyReadInclude }>;

function toParticipant(user: RallyReadRecord["sender"]) {
  const photo = user.photos[0];

  return {
    id: user.id,
    displayName: user.profile?.displayName ?? "Rally member",
    photo: photo ? { id: photo.id, url: photo.url, sortOrder: photo.sortOrder } : null
  };
}

export function toRallyView(rally: RallyReadRecord) {
  return {
    id: rally.id,
    senderId: rally.senderId,
    receiverId: rally.receiverId,
    sport: rally.sport,
    proposedStartAt: rally.proposedStartAt,
    proposedEndAt: rally.proposedEndAt,
    venueId: rally.venueId,
    status: rally.status,
    courtStatus: rally.courtStatus,
    courtNumber: rally.courtNumber,
    bookingOwnerId: rally.bookingOwnerId,
    bookingReference: rally.bookingReference,
    cancelledAt: rally.cancelledAt,
    cancelledById: rally.cancelledById,
    cancellationReason: rally.cancellationReason,
    acceptedAt: rally.acceptedAt,
    scheduledAt: rally.scheduledAt,
    completedAt: rally.completedAt,
    createdAt: rally.createdAt,
    updatedAt: rally.updatedAt,
    sender: toParticipant(rally.sender),
    receiver: toParticipant(rally.receiver),
    venue: rally.venue
  };
}
