import { DatingIntent, Gender, SkillLevel, Sport } from "@prisma/client";

const weights = {
  intent: 0.3,
  sport: 0.25,
  schedule: 0.2,
  skill: 0.15,
  profile: 0.1
} as const;

const skillRank: Record<SkillLevel, number> = {
  BEGINNER: 0,
  CASUAL: 0.5,
  INTERMEDIATE: 1,
  ADVANCED: 1.5,
  COMPETITIVE: 2
};

type MatchProfile = {
  age: number | null;
  preferredAgeMin: number;
  preferredAgeMax: number;
  gender: Gender | null;
  interestedIn: Gender[];
  datingIntent: DatingIntent;
  major: string | null;
  classYear: string | null;
};

export type MatchCandidate = {
  userId: string;
  displayName: string;
  profile: MatchProfile;
  sports: Array<{ sport: Sport; skillLevel: SkillLevel; intensity: number; favorite: boolean }>;
  availability: Array<{ dayOfWeek: number; startTime: string; endTime: string }>;
};

type ScoreTerm = {
  key: keyof typeof weights;
  label: string;
  raw: number;
  detail: string;
};

export function scoreCandidate(currentUser: MatchCandidate, candidate: MatchCandidate) {
  if (!passesHardFilters(currentUser, candidate)) return null;

  const sharedSports = currentUser.sports.flatMap((mine) => {
    const theirs = candidate.sports.find((sport) => sport.sport === mine.sport);
    return theirs ? [{ mine, theirs }] : [];
  });
  const overlapCount = countOverlaps(currentUser.availability, candidate.availability);
  const bestSport = [...sharedSports].sort(
    (a, b) =>
      skillCompatibility(b.mine.skillLevel, b.theirs.skillLevel) -
      skillCompatibility(a.mine.skillLevel, a.theirs.skillLevel)
  )[0];

  const terms: ScoreTerm[] = [
    {
      key: "intent",
      label: "Dating intent",
      raw: intentCompatibility(currentUser.profile.datingIntent, candidate.profile.datingIntent),
      detail: `${currentUser.profile.datingIntent} vs ${candidate.profile.datingIntent}`
    },
    {
      key: "sport",
      label: "Sport overlap",
      raw: Math.min(
        sharedSports.length / Math.max(1, Math.min(currentUser.sports.length, candidate.sports.length)),
        1
      ),
      detail: `${sharedSports.length} shared: ${sharedSports.map(({ mine }) => mine.sport).join(", ")}`
    },
    {
      key: "schedule",
      label: "Schedule overlap",
      raw: Math.min(overlapCount / 4, 1),
      detail: `${overlapCount} shared window${overlapCount === 1 ? "" : "s"}`
    },
    {
      key: "skill",
      label: "Skill match",
      raw:
        sharedSports.reduce(
          (total, pair) => total + skillCompatibility(pair.mine.skillLevel, pair.theirs.skillLevel),
          0
        ) / sharedSports.length,
      detail: sharedSports
        .map(({ mine, theirs }) => `${mine.sport}: ${mine.skillLevel}/${theirs.skillLevel}`)
        .join(", ")
    },
    {
      key: "profile",
      label: "Profile overlap",
      raw: profileCompatibility(currentUser.profile, candidate.profile),
      detail: profileOverlapDetail(currentUser.profile, candidate.profile)
    }
  ];

  const breakdown = terms.map((term) => ({
    label: term.label,
    weight: weights[term.key],
    raw: round(term.raw),
    weighted: round(term.raw * weights[term.key]),
    detail: term.detail
  }));
  const normalizedScore = breakdown.reduce((total, term) => total + term.weighted, 0);

  return {
    userId: candidate.userId,
    displayName: candidate.displayName,
    recommendedSport: bestSport.mine.sport,
    score: Math.round(normalizedScore * 100),
    sharedSports: sharedSports.map(({ mine }) => mine.sport),
    reasons: buildReasons(currentUser, candidate, bestSport.mine.sport, overlapCount),
    breakdown
  };
}

export function passesHardFilters(currentUser: MatchCandidate, candidate: MatchCandidate) {
  const mine = currentUser.profile;
  const theirs = candidate.profile;
  if (mine.age === null || theirs.age === null || mine.age < 18 || theirs.age < 18) return false;
  if (!mine.gender || !theirs.gender) return false;
  if (theirs.age < mine.preferredAgeMin || theirs.age > mine.preferredAgeMax) return false;
  if (mine.age < theirs.preferredAgeMin || mine.age > theirs.preferredAgeMax) return false;
  if (!acceptsGender(mine.interestedIn, theirs.gender)) return false;
  if (!acceptsGender(theirs.interestedIn, mine.gender)) return false;

  const candidateSports = new Set(candidate.sports.map(({ sport }) => sport));
  if (!currentUser.sports.some(({ sport }) => candidateSports.has(sport))) return false;
  return countOverlaps(currentUser.availability, candidate.availability) > 0;
}

function acceptsGender(preferences: Gender[], gender: Gender) {
  return preferences.length === 0 || preferences.includes(gender);
}

function intentCompatibility(a: DatingIntent, b: DatingIntent) {
  if (a === b) return 1;
  if (a === DatingIntent.FRIENDS || b === DatingIntent.FRIENDS) return 0.6;
  return 0.2;
}

function skillCompatibility(a: SkillLevel, b: SkillLevel) {
  return 1 - Math.min(Math.abs(skillRank[a] - skillRank[b]) / 2, 1);
}

function profileCompatibility(a: MatchProfile, b: MatchProfile) {
  let score = 0;
  if (a.classYear && a.classYear === b.classYear) score += 0.5;
  if (a.major && a.major === b.major) score += 0.5;
  return score;
}

function profileOverlapDetail(a: MatchProfile, b: MatchProfile) {
  const overlap = [
    a.classYear && a.classYear === b.classYear ? `same year (${a.classYear})` : null,
    a.major && a.major === b.major ? `same major (${a.major})` : null
  ].filter(Boolean);
  return overlap.join(", ") || "no profile overlap";
}

function buildReasons(
  currentUser: MatchCandidate,
  candidate: MatchCandidate,
  recommendedSport: Sport,
  overlapCount: number
) {
  const mine = currentUser.sports.find(({ sport }) => sport === recommendedSport);
  const theirs = candidate.sports.find(({ sport }) => sport === recommendedSport);
  const reasons = [
    {
      kind: mine?.skillLevel === theirs?.skillLevel ? "skill" : "sport",
      text:
        mine?.skillLevel === theirs?.skillLevel
          ? `Both play ${mine?.skillLevel.toLowerCase()} ${recommendedSport.toLowerCase()}`
          : `Both play ${recommendedSport.toLowerCase()}`
    },
    {
      kind: "schedule",
      text: `${overlapCount} shared time window${overlapCount === 1 ? "" : "s"}`
    }
  ];

  if (currentUser.profile.datingIntent === candidate.profile.datingIntent) {
    reasons.push({ kind: "intent", text: "Compatible dating intent" });
  }
  return reasons.slice(0, 3);
}

function countOverlaps(
  a: Array<{ dayOfWeek: number; startTime: string; endTime: string }>,
  b: Array<{ dayOfWeek: number; startTime: string; endTime: string }>
) {
  return a.reduce((count, first) => {
    const overlaps = b.some(
      (second) =>
        first.dayOfWeek === second.dayOfWeek &&
        toMinutes(first.startTime) < toMinutes(second.endTime) &&
        toMinutes(second.startTime) < toMinutes(first.endTime)
    );
    return overlaps ? count + 1 : count;
  }, 0);
}

function toMinutes(time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

function round(value: number) {
  return Math.round(value * 1000) / 1000;
}
