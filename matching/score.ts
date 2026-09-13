/**
 * Deterministic, explainable candidate scoring. Owner: Ved.
 *
 * Weights are product hypotheses, not science. Every score must be
 * reducible to human-readable reasons the demo can show.
 */

import type {
  CandidateMatch,
  MatchReason,
  ScoreComponent,
  SkillLevel,
  SportId,
  UserProfile,
} from '@/types';

export const WEIGHTS = {
  intent: 0.3,
  sport: 0.25,
  schedule: 0.2,
  skill: 0.15,
  interests: 0.1,
} as const;

const SKILL_RANK: Record<SkillLevel, number> = {
  beginner: 0,
  intermediate: 1,
  advanced: 2,
};

const SPORT_LABEL: Record<SportId, string> = {
  tennis: 'tennis',
  pickleball: 'pickleball',
  badminton: 'badminton',
  squash: 'squash',
  racquetball: 'racquetball',
};

function slotKey(day: string, block: string): string {
  return `${day}:${block}`;
}

export function sharedSports(a: UserProfile, b: UserProfile): SportId[] {
  const bSports = new Set(b.sports.map((s) => s.sport));
  return a.sports.filter((s) => bSports.has(s.sport)).map((s) => s.sport);
}

export function sharedSlots(a: UserProfile, b: UserProfile): number {
  const bSlots = new Set(b.availability.map((s) => slotKey(s.day, s.block)));
  return a.availability.filter((s) => bSlots.has(slotKey(s.day, s.block)))
    .length;
}

function intentScore(a: UserProfile, b: UserProfile): number {
  const x = a.preferences.intent;
  const y = b.preferences.intent;
  if (x === y) return 1;
  if (x === 'open' || y === 'open') return 0.6;
  return 0.2;
}

function sportScore(shared: SportId[], a: UserProfile, b: UserProfile): number {
  const maxPossible = Math.min(a.sports.length, b.sports.length) || 1;
  return Math.min(shared.length / maxPossible, 1);
}

function scheduleScore(overlap: number): number {
  return Math.min(overlap / 4, 1);
}

function skillScore(a: UserProfile, b: UserProfile, shared: SportId[]): number {
  if (shared.length === 0) return 0;
  const gaps = shared.map((sport) => {
    const aSkill = a.sports.find((s) => s.sport === sport)!.skill;
    const bSkill = b.sports.find((s) => s.sport === sport)!.skill;
    return Math.abs(SKILL_RANK[aSkill] - SKILL_RANK[bSkill]);
  });
  const avgGap = gaps.reduce((t, g) => t + g, 0) / gaps.length;
  return 1 - avgGap / 2;
}

function interestsScore(a: UserProfile, b: UserProfile): number {
  let score = 0;
  if (a.year === b.year) score += 0.5;
  if (a.major === b.major) score += 0.5;
  return score;
}

function buildReasons(
  a: UserProfile,
  b: UserProfile,
  shared: SportId[],
  overlap: number,
): MatchReason[] {
  const reasons: MatchReason[] = [];

  if (shared.length > 0) {
    const sport = shared[0];
    const aSkill = a.sports.find((s) => s.sport === sport)!.skill;
    const bSkill = b.sports.find((s) => s.sport === sport)!.skill;
    reasons.push(
      aSkill === bSkill
        ? {
            kind: 'skill',
            text: `Both play ${aSkill} ${SPORT_LABEL[sport]}`,
          }
        : {
            kind: 'sport',
            text: `Both play ${SPORT_LABEL[sport]}`,
          },
    );
  }

  if (overlap > 0) {
    reasons.push({
      kind: 'schedule',
      text: `${overlap} shared time window${overlap === 1 ? '' : 's'}`,
    });
  }

  if (a.preferences.intent === b.preferences.intent) {
    reasons.push({
      kind: 'intent',
      text:
        a.preferences.intent === 'casual'
          ? 'Both keeping it casual'
          : a.preferences.intent === 'serious'
            ? 'Both looking for something serious'
            : 'Both open to what happens',
    });
  }

  if (a.major === b.major) {
    reasons.push({ kind: 'interests', text: `Both studying ${a.major}` });
  }

  return reasons.slice(0, 3);
}

export function scoreCandidate(
  candidate: UserProfile,
  viewer: UserProfile,
): CandidateMatch {
  const shared = sharedSports(viewer, candidate);
  const overlap = sharedSlots(viewer, candidate);

  const terms: Array<{ key: keyof typeof WEIGHTS; label: string; raw: number; detail: string }> = [
    {
      key: 'intent',
      label: 'Dating intent',
      raw: intentScore(viewer, candidate),
      detail: `${viewer.preferences.intent} vs ${candidate.preferences.intent}`,
    },
    {
      key: 'sport',
      label: 'Sport overlap',
      raw: sportScore(shared, viewer, candidate),
      detail: shared.length
        ? `${shared.length} shared: ${shared.join(', ')}`
        : 'none shared',
    },
    {
      key: 'schedule',
      label: 'Schedule overlap',
      raw: scheduleScore(overlap),
      detail: `${overlap} shared window${overlap === 1 ? '' : 's'}`,
    },
    {
      key: 'skill',
      label: 'Skill match',
      raw: skillScore(viewer, candidate, shared),
      detail: shared.length
        ? shared
            .map((s) => {
              const a = viewer.sports.find((x) => x.sport === s)!.skill;
              const b = candidate.sports.find((x) => x.sport === s)!.skill;
              return `${s}: ${a}/${b}`;
            })
            .join(', ')
        : 'no shared sport',
    },
    {
      key: 'interests',
      label: 'Interests',
      raw: interestsScore(viewer, candidate),
      detail: [
        viewer.year === candidate.year ? `same year (${viewer.year})` : null,
        viewer.major === candidate.major ? `same major` : null,
      ]
        .filter(Boolean)
        .join(', ') || 'no overlap',
    },
  ];

  const breakdown: ScoreComponent[] = terms.map((t) => ({
    label: t.label,
    weight: WEIGHTS[t.key],
    raw: Math.round(t.raw * 100) / 100,
    weighted: Math.round(WEIGHTS[t.key] * t.raw * 1000) / 1000,
    detail: t.detail,
  }));

  const score = breakdown.reduce((total, c) => total + c.weighted, 0);

  return {
    user: candidate,
    score: Math.round(score * 100) / 100,
    reasons: buildReasons(viewer, candidate, shared, overlap),
    sharedSports: shared,
    breakdown,
  };
}

export function rankCandidates(
  candidates: UserProfile[],
  viewer: UserProfile,
): CandidateMatch[] {
  return candidates
    .map((c) => scoreCandidate(c, viewer))
    .sort((a, b) => b.score - a.score);
}
