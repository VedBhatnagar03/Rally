interface ConfirmedBooking {
  courtStatus: string;
  courtNumber: string | null;
  bookingReference: string | null;
  bookingOwnerId: string | null;
}

interface BookingSubmission {
  courtStatus: "BOOKED" | "UNAVAILABLE";
  courtNumber?: string;
  bookingReference?: string;
}

export function isSameConfirmedBooking(
  stored: ConfirmedBooking,
  submittedById: string,
  submitted: BookingSubmission
): boolean {
  return (
    stored.courtStatus === "BOOKED" &&
    submitted.courtStatus === "BOOKED" &&
    stored.bookingOwnerId === submittedById &&
    stored.courtNumber === (submitted.courtNumber ?? null) &&
    stored.bookingReference === (submitted.bookingReference ?? null)
  );
}

export function courtDataAfterCancellation(courtStatus: string) {
  return courtStatus === "BOOKED"
    ? {}
    : {
        courtStatus: "NOT_STARTED" as const,
        courtNumber: null,
        bookingReference: null,
        bookingOwnerId: null
      };
}
