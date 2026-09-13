/** Availability intersection — pure function. Owner: Ved. */

import type { AvailabilitySlot, DayOfWeek, TimeBlock, UserProfile } from '@/types';

const DAY_ORDER: DayOfWeek[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

const BLOCK_QUALITY: Record<TimeBlock, number> = {
  morning: 0.6,
  afternoon: 0.8,
  evening: 1,
};

function key(slot: AvailabilitySlot): string {
  return `${slot.day}:${slot.block}`;
}

export function intersectAvailability(
  a: UserProfile,
  b: UserProfile,
): AvailabilitySlot[] {
  const bSlots = new Set(b.availability.map(key));
  return a.availability
    .filter((slot) => bSlots.has(key(slot)))
    .sort(
      (x, y) =>
        DAY_ORDER.indexOf(x.day) - DAY_ORDER.indexOf(y.day) ||
        BLOCK_QUALITY[y.block] - BLOCK_QUALITY[x.block],
    );
}

/** Next calendar date matching `day`, searching forward from today. */
export function nextDateForDay(day: DayOfWeek, from: Date = new Date()): string {
  const target = DAY_ORDER.indexOf(day);
  const current = (from.getDay() + 6) % 7;
  const delta = (target - current + 7) % 7 || 7;
  const result = new Date(from);
  result.setDate(from.getDate() + delta);
  return result.toISOString().slice(0, 10);
}

export function slotQuality(slot: AvailabilitySlot): number {
  const weekendBonus = slot.day === 'sat' || slot.day === 'sun' ? 0.1 : 0;
  return Math.min(BLOCK_QUALITY[slot.block] + weekendBonus, 1);
}
