import type { RallyFeedback } from "@prisma/client";

type FeedbackDecision = Pick<
  RallyFeedback,
  "played" | "feltSafe" | "rallyAgain" | "experienceScore" | "notes"
>;

export interface FeedbackSubmission {
  played: boolean;
  feltSafe: boolean;
  rallyAgain: boolean;
  experienceScore?: number;
  notes?: string;
}

export function isSameFeedback(
  stored: FeedbackDecision,
  submitted: FeedbackSubmission
): boolean {
  return (
    stored.played === submitted.played &&
    stored.feltSafe === submitted.feltSafe &&
    stored.rallyAgain === submitted.rallyAgain &&
    stored.experienceScore === (submitted.experienceScore ?? null) &&
    stored.notes === (submitted.notes ?? null)
  );
}
