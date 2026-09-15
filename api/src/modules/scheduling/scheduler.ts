import { Sport } from "@prisma/client";

type AvailabilityWindow = {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
};

type VenueOption = {
  id: string;
  name: string;
  campusArea: string;
  bookingLeadTime: number | null;
  sports: Sport[];
};

export type ScheduleSuggestion = {
  sport: Sport;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  venue: {
    id: string;
    name: string;
    campusArea: string;
    bookingLeadTime: number | null;
  } | null;
  reason: string;
};

export function suggestRallySlots(input: {
  sharedSports: Sport[];
  requesterAvailability: AvailabilityWindow[];
  receiverAvailability: AvailabilityWindow[];
  venues: VenueOption[];
  maxSuggestions?: number;
}): ScheduleSuggestion[] {
  const maxSuggestions = input.maxSuggestions ?? 3;
  const windows = findAvailabilityOverlaps(input.requesterAvailability, input.receiverAvailability);

  return input.sharedSports
    .flatMap((sport) =>
      windows.map((window) => {
        const venue = input.venues.find((candidate) => candidate.sports.includes(sport)) ?? null;

        return {
          sport,
          dayOfWeek: window.dayOfWeek,
          startTime: window.startTime,
          endTime: window.endTime,
          venue: venue
            ? {
                id: venue.id,
                name: venue.name,
                campusArea: venue.campusArea,
                bookingLeadTime: venue.bookingLeadTime
              }
            : null,
          reason: buildReason(sport, window.dayOfWeek, venue)
        };
      })
    )
    .sort((a, b) => {
      const dayDelta = a.dayOfWeek - b.dayOfWeek;
      if (dayDelta !== 0) return dayDelta;
      return toMinutes(a.startTime) - toMinutes(b.startTime);
    })
    .slice(0, maxSuggestions);
}

export function findAvailabilityOverlaps(a: AvailabilityWindow[], b: AvailabilityWindow[]) {
  return a
    .flatMap((first) =>
      b.flatMap((second) => {
        if (first.dayOfWeek !== second.dayOfWeek) return [];

        const start = Math.max(toMinutes(first.startTime), toMinutes(second.startTime));
        const end = Math.min(toMinutes(first.endTime), toMinutes(second.endTime));

        if (end - start < 45) return [];

        return [
          {
            dayOfWeek: first.dayOfWeek,
            startTime: toClock(start),
            endTime: toClock(Math.min(start + 60, end))
          }
        ];
      })
    )
    .sort((first, second) => {
      const dayDelta = first.dayOfWeek - second.dayOfWeek;
      if (dayDelta !== 0) return dayDelta;
      return toMinutes(first.startTime) - toMinutes(second.startTime);
    });
}

function buildReason(sport: Sport, dayOfWeek: number, venue: VenueOption | null) {
  const venueText = venue ? `${venue.name} in ${venue.campusArea}` : "a sport-compatible UIUC venue";
  return `${sportLabel(sport)} works for both schedules on ${weekday(dayOfWeek)}; Rally recommends ${venueText}.`;
}

function sportLabel(sport: Sport) {
  return sport
    .toLowerCase()
    .split("_")
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
}

function weekday(dayOfWeek: number) {
  return ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][dayOfWeek] ?? "a shared day";
}

function toMinutes(time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

function toClock(minutes: number) {
  const hours = Math.floor(minutes / 60)
    .toString()
    .padStart(2, "0");
  const remainder = (minutes % 60).toString().padStart(2, "0");
  return `${hours}:${remainder}`;
}
