export const safetyCancellationReason = "This Rally is no longer available";

export function safetyCancellationData(now: Date) {
  return {
    status: "CANCELLED" as const,
    cancelledAt: now,
    cancelledById: null,
    cancellationReason: safetyCancellationReason
  };
}

