/**
 * UIUC venue recommendation. Owner: Ved.
 *
 * Rally recommends a venue and hands off booking; it never claims live
 * court availability.
 *
 * TODO(ved): verify these venue names/URLs against campus rec before demo.
 */

import type { SportId, Venue } from '@/types';

export const UIUC_VENUES: Venue[] = [
  {
    id: 'arc-courts',
    name: 'ARC Courts',
    sports: ['badminton', 'squash', 'racquetball', 'pickleball'],
    location: 'Activities and Recreation Center',
    bookingUrl: null,
    requiresReservation: true,
  },
  {
    id: 'crce-courts',
    name: 'CRCE Courts',
    sports: ['badminton', 'racquetball', 'pickleball'],
    location: 'Campus Recreation Center East',
    bookingUrl: null,
    requiresReservation: true,
  },
  {
    id: 'atkins-tennis',
    name: 'Atkins Tennis Center',
    sports: ['tennis'],
    location: 'Atkins Tennis Center',
    bookingUrl: null,
    requiresReservation: true,
  },
  {
    id: 'illini-grove',
    name: 'Illini Grove Courts',
    sports: ['tennis'],
    location: 'Illini Grove',
    bookingUrl: null,
    requiresReservation: false,
  },
];

export function venuesForSport(sport: SportId): Venue[] {
  return UIUC_VENUES.filter((v) => v.sports.includes(sport));
}

export function recommendVenue(sport: SportId): Venue | null {
  const options = venuesForSport(sport);
  if (options.length === 0) return null;
  const walkOn = options.find((v) => !v.requiresReservation);
  return walkOn ?? options[0];
}
