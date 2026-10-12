export function conversionRate(numerator: number, denominator: number) {
  if (denominator === 0) return 0;
  return Math.round((numerator / denominator) * 1000) / 10;
}

export function perActiveUser(completedRallies: number, activeUsers: number) {
  if (activeUsers === 0) return 0;
  return Math.round((completedRallies / activeUsers) * 100) / 100;
}

export function buildFunnelRates(input: {
  sent: number;
  accepted: number;
  scheduled: number;
  completed: number;
}) {
  return {
    sentToAccepted: conversionRate(input.accepted, input.sent),
    acceptedToScheduled: conversionRate(input.scheduled, input.accepted),
    scheduledToCompleted: conversionRate(input.completed, input.scheduled)
  };
}
