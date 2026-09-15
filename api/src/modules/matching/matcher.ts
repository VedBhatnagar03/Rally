import { SkillLevel, Sport } from "@prisma/client";

const skillRank: Record<SkillLevel, number> = {
  BEGINNER: 1,
  CASUAL: 2,
  INTERMEDIATE: 3,
  ADVANCED: 4,
  COMPETITIVE: 5
};

export type MatchCandidate = {
  userId: string;
  displayName: string;
  sports: Array<{ sport: Sport; skillLevel: SkillLevel; intensity: number; favorite: boolean }>;
  availability: Array<{ dayOfWeek: number; startTime: string; endTime: string }>;
  trustScore: number;
};

export function scoreCandidate(currentUser: MatchCandidate, candidate: MatchCandidate) {
  const sharedSports = currentUser.sports.flatMap((mine) => {
    const theirs = candidate.sports.find((sport) => sport.sport === mine.sport);
    return theirs ? [{ mine, theirs }] : [];
  });

  if (sharedSports.length === 0) {
    return null;
  }

  const bestSport = sharedSports
    .map(({ mine, theirs }) => {
      const skillGap = Math.abs(skillRank[mine.skillLevel] - skillRank[theirs.skillLevel]);
      const intensityGap = Math.abs(mine.intensity - theirs.intensity);
      const favoriteBonus = mine.favorite || theirs.favorite ? 12 : 0;

      return {
        sport: mine.sport,
        score: 40 - skillGap * 6 - intensityGap * 4 + favoriteBonus
      };
    })
    .sort((a, b) => b.score - a.score)[0];

  const availabilityScore = countOverlaps(currentUser.availability, candidate.availability) * 12;
  const trustScore = Math.min(candidate.trustScore, 100) * 0.2;
  const score = Math.round(bestSport.score + availabilityScore + trustScore);

  return {
    userId: candidate.userId,
    displayName: candidate.displayName,
    recommendedSport: bestSport.sport,
    score: Math.max(0, Math.min(score, 100))
  };
}

function countOverlaps(
  a: Array<{ dayOfWeek: number; startTime: string; endTime: string }>,
  b: Array<{ dayOfWeek: number; startTime: string; endTime: string }>
) {
  return a.reduce((count, first) => {
    const overlaps = b.some((second) => {
      return (
        first.dayOfWeek === second.dayOfWeek &&
        toMinutes(first.startTime) < toMinutes(second.endTime) &&
        toMinutes(second.startTime) < toMinutes(first.endTime)
      );
    });

    return overlaps ? count + 1 : count;
  }, 0);
}

function toMinutes(time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}
