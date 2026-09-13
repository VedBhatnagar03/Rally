/** Hard filters — run before scoring. Owner: Ved. */

import type { UserProfile } from '@/types';

function genderMatchesPreference(
  candidate: UserProfile,
  viewer: UserProfile,
): boolean {
  const want = viewer.preferences.interestedIn;
  if (want === 'everyone') return true;
  if (want === 'men') return candidate.preferences.gender === 'man';
  return candidate.preferences.gender === 'woman';
}

export function passesHardFilters(
  candidate: UserProfile,
  viewer: UserProfile,
  blockedIds: Set<string>,
): boolean {
  if (candidate.id === viewer.id) return false;
  if (blockedIds.has(candidate.id)) return false;
  if (candidate.age < 18 || viewer.age < 18) return false;

  if (
    candidate.age < viewer.preferences.ageMin ||
    candidate.age > viewer.preferences.ageMax
  ) {
    return false;
  }
  if (
    viewer.age < candidate.preferences.ageMin ||
    viewer.age > candidate.preferences.ageMax
  ) {
    return false;
  }

  if (!genderMatchesPreference(candidate, viewer)) return false;
  if (!genderMatchesPreference(viewer, candidate)) return false;

  const viewerSports = new Set(viewer.sports.map((s) => s.sport));
  const hasSharedSport = candidate.sports.some((s) => viewerSports.has(s.sport));
  if (!hasSharedSport) return false;

  return true;
}
