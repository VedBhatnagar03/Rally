const MIN_RALLY_DURATION_MS = 30 * 60 * 1000;
const MAX_RALLY_DURATION_MS = 3 * 60 * 60 * 1000;

export type RallyWindowError = "PAST_START" | "TOO_SHORT" | "TOO_LONG" | null;

export function validateRallyWindow(start: Date, end: Date, now = new Date()): RallyWindowError {
  if (start <= now) return "PAST_START";

  const duration = end.getTime() - start.getTime();
  if (duration < MIN_RALLY_DURATION_MS) return "TOO_SHORT";
  if (duration > MAX_RALLY_DURATION_MS) return "TOO_LONG";
  return null;
}

export function rallyWindowErrorMessage(error: Exclude<RallyWindowError, null>) {
  switch (error) {
    case "PAST_START":
      return "Rally start time must be in the future";
    case "TOO_SHORT":
      return "Rallies must be at least 30 minutes";
    case "TOO_LONG":
      return "Rallies cannot be longer than 3 hours";
  }
}
