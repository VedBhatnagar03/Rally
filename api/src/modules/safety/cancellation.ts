import type { CourtBookingStatus, Prisma } from "@prisma/client";
import { courtDataAfterCancellation } from "../rallies/booking-integrity.js";

export const safetyCancellationReason = "This Rally is no longer available";

const activeRallyStatuses = ["PENDING", "ACCEPTED", "SCHEDULED"] as const;

export function safetyCancellationData(now: Date) {
  return {
    status: "CANCELLED" as const,
    cancelledAt: now,
    cancelledById: null,
    cancellationReason: safetyCancellationReason
  };
}

export function safetyCancellationNotificationData(rally: {
  id: string;
  senderId: string;
  receiverId: string;
}) {
  return [rally.senderId, rally.receiverId].map((userId) => ({
    userId,
    type: "RALLY_CANCELLED" as const,
    rallyId: rally.id
  }));
}

async function cancelRallies(
  tx: Prisma.TransactionClient,
  rallies: Array<{
    id: string;
    senderId: string;
    receiverId: string;
    courtStatus: CourtBookingStatus;
  }>,
  now: Date
) {
  let cancelledCount = 0;
  for (const rally of rallies) {
    const cancelled = await tx.rally.updateMany({
      where: {
        id: rally.id,
        status: { in: [...activeRallyStatuses] },
        courtStatus: rally.courtStatus
      },
      data: {
        ...safetyCancellationData(now),
        ...courtDataAfterCancellation(rally.courtStatus)
      }
    });
    if (cancelled.count !== 1) continue;

    cancelledCount += 1;
    await tx.notification.createMany({
      data: safetyCancellationNotificationData(rally),
      skipDuplicates: true
    });
  }

  return cancelledCount;
}

export async function cancelActiveRalliesForSafetyAction(
  tx: Prisma.TransactionClient,
  firstUserId: string,
  secondUserId: string,
  now: Date
) {
  const rallies = await tx.rally.findMany({
    where: {
      status: { in: [...activeRallyStatuses] },
      OR: [
        { senderId: firstUserId, receiverId: secondUserId },
        { senderId: secondUserId, receiverId: firstUserId }
      ]
    },
    select: { id: true, senderId: true, receiverId: true, courtStatus: true }
  });

  return cancelRallies(tx, rallies, now);
}

export async function cancelActiveRalliesForUnavailableUser(
  tx: Prisma.TransactionClient,
  userId: string,
  now: Date
) {
  const rallies = await tx.rally.findMany({
    where: {
      status: { in: [...activeRallyStatuses] },
      OR: [{ senderId: userId }, { receiverId: userId }]
    },
    select: { id: true, senderId: true, receiverId: true, courtStatus: true }
  });

  return cancelRallies(tx, rallies, now);
}
