import { CourtBookingStatus, RallyStatus, Sport } from "@prisma/client";
import { z } from "zod";

export const createRallySchema = z.object({
  receiverId: z.string().cuid(),
  sport: z.nativeEnum(Sport),
  proposedStartAt: z.coerce.date(),
  proposedEndAt: z.coerce.date(),
  venueId: z.string().cuid().optional()
});

export const respondToRallySchema = z.object({
  status: z.enum([RallyStatus.ACCEPTED, RallyStatus.DECLINED])
});

export const courtBookingSchema = z.object({
  courtStatus: z.nativeEnum(CourtBookingStatus),
  courtNumber: z.string().trim().max(40).optional(),
  bookingReference: z.string().trim().max(160).optional()
});

export const scheduleSuggestionParamsSchema = z.object({
  receiverId: z.string().cuid()
});
