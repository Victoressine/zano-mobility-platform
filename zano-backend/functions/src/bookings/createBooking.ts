// ========================================
// Zano - Create Booking
// Secure atomic seat reservation
// ========================================

import {getFirestore, Timestamp} from "firebase-admin/firestore";
import {HttpsError, onCall} from "firebase-functions/v2/https";

// ========================================
// Constants
// ========================================

const MAX_PASSENGERS_PER_BOOKING = 10;
const RESERVATION_MINUTES = 10;

// ========================================
// Types
// ========================================

type PassengerInput = {
  seatId: string;
  fullName: string;
  phoneNumber?: string;
};

type CreateBookingInput = {
  tripId: string;
  passengers: PassengerInput[];
};

type TripData = {
  origin?: string;
  destination?: string;
  companyId?: string;
  companyName?: string;
  busType?: string;
  fare?: number;
  availableSeats?: number;
  totalSeats?: number;
  status?: string;
  departureAt?: Timestamp;
};

type SeatData = {
  tripId?: string;
  seatNumber?: string;
  status?: string;
  price?: number;
};

// ========================================
// Validation Helpers
// ========================================
/**
 * Validates and sanitizes a required string value.
 *
 * @param {unknown} value Value to validate.
 * @param {string} fieldName Human-readable field name.
 * @param {number} maxLength Maximum allowed length.
 * @return {string} Sanitized string value.
 */
function requireNonEmptyString(
  value: unknown,
  fieldName: string,
  maxLength: number
): string {
  if (typeof value !== "string") {
    throw new HttpsError(
      "invalid-argument",
      `${fieldName} is required.`
    );
  }

  const cleaned = value.trim();

  if (!cleaned) {
    throw new HttpsError(
      "invalid-argument",
      `${fieldName} is required.`
    );
  }

  if (cleaned.length > maxLength) {
    throw new HttpsError(
      "invalid-argument",
      `${fieldName} is too long.`
    );
  }

  return cleaned;
}

/**
 * Validates and sanitizes an optional string value.
 *
 * @param {unknown} value Value to validate.
 * @param {string} fieldName Human-readable field name.
 * @param {number} maxLength Maximum allowed length.
 * @return {string} Sanitized string or an empty string.
 */
function optionalString(
  value: unknown,
  fieldName: string,
  maxLength: number
): string {
  if (value === undefined || value === null || value === "") {
    return "";
  }

  if (typeof value !== "string") {
    throw new HttpsError(
      "invalid-argument",
      `${fieldName} must be text.`
    );
  }

  const cleaned = value.trim();

  if (cleaned.length > maxLength) {
    throw new HttpsError(
      "invalid-argument",
      `${fieldName} is too long.`
    );
  }

  return cleaned;
}

// ========================================
// Create Booking Callable Function
// ========================================

export const createBooking = onCall(
  {
    region: "us-central1",
    maxInstances: 10,
  },
  async (request) => {
    // ========================================
    // Authentication
    // ========================================

    if (!request.auth) {
      throw new HttpsError(
        "unauthenticated",
        "You must be signed in to create a booking."
      );
    }

    const userId = request.auth.uid;
    const userEmail =
      typeof request.auth.token.email === "string" ?
        request.auth.token.email :
        "";

    // ========================================
    // Validate Request Body
    // ========================================

    const data = request.data as Partial<CreateBookingInput>;

    const tripId = requireNonEmptyString(
      data?.tripId,
      "Trip ID",
      128
    );

    if (!Array.isArray(data?.passengers)) {
      throw new HttpsError(
        "invalid-argument",
        "Passenger information is required."
      );
    }

    if (
      data.passengers.length < 1 ||
      data.passengers.length > MAX_PASSENGERS_PER_BOOKING
    ) {
      throw new HttpsError(
        "invalid-argument",
        [
          "You can book between 1 and",
          `${MAX_PASSENGERS_PER_BOOKING} passengers at once.`,
        ].join(" ") );
    }

    // ========================================
    // Sanitize Passenger Input
    // ========================================

    const passengers = data.passengers.map(
      (passenger, index) => {
        if (
          !passenger ||
          typeof passenger !== "object"
        ) {
          throw new HttpsError(
            "invalid-argument",
            `Passenger ${index + 1} is invalid.`
          );
        }

        const seatId = requireNonEmptyString(
          passenger.seatId,
          `Passenger ${index + 1} seat`,
          128
        );

        const fullName = requireNonEmptyString(
          passenger.fullName,
          `Passenger ${index + 1} full name`,
          120
        );

        const phoneNumber = optionalString(
          passenger.phoneNumber,
          `Passenger ${index + 1} phone number`,
          30
        );

        if (index === 0 && !phoneNumber) {
          throw new HttpsError(
            "invalid-argument",
            "The primary passenger phone number is required."
          );
        }

        return {
          seatId,
          fullName,
          phoneNumber,
        };
      }
    );

    // ========================================
    // Reject Duplicate Seat IDs
    // ========================================

    const uniqueSeatIds = new Set(
      passengers.map((passenger) => passenger.seatId)
    );

    if (uniqueSeatIds.size !== passengers.length) {
      throw new HttpsError(
        "invalid-argument",
        "The same seat cannot be assigned to multiple passengers."
      );
    }

    // ========================================
    // Firestore References
    // ========================================

    const db = getFirestore();

    const tripRef = db.collection("trips").doc(tripId);

    const bookingRef = db.collection("bookings").doc();

    const userRef = db.collection("users").doc(userId);

    const seatRefs = passengers.map((passenger) =>
      db.collection("seats").doc(passenger.seatId)
    );

    // ========================================
    // Reservation Expiry
    // ========================================

    const now = Timestamp.now();

    const reservationExpiresAt = Timestamp.fromMillis(
      now.toMillis() + RESERVATION_MINUTES * 60 * 1000
    );

    // ========================================
    // Atomic Firestore Transaction
    // ========================================

    const result = await db.runTransaction(
      async (transaction) => {
        // ----------------------------------------
        // IMPORTANT:
        // Perform all reads before writes.
        // ----------------------------------------

        const tripSnapshot = await transaction.get(tripRef);

        const userSnapshot = await transaction.get(userRef);

        const seatSnapshots = await Promise.all(
          seatRefs.map((seatRef) =>
            transaction.get(seatRef)
          )
        );

        // ========================================
        // Validate User Profile
        // ========================================

        if (!userSnapshot.exists) {
          throw new HttpsError(
            "failed-precondition",
            "Your passenger profile could not be found."
          );
        }

        const userData = userSnapshot.data();

        if (userData?.role !== "passenger") {
          throw new HttpsError(
            "permission-denied",
            "Only passenger accounts can create passenger bookings."
          );
        }

        // ========================================
        // Validate Trip
        // ========================================

        if (!tripSnapshot.exists) {
          throw new HttpsError(
            "not-found",
            "This trip could not be found."
          );
        }

        const trip = tripSnapshot.data() as TripData;

        if (trip.status !== "scheduled") {
          throw new HttpsError(
            "failed-precondition",
            "This trip is no longer available for booking."
          );
        }

        if (
          !(trip.departureAt instanceof Timestamp) ||
          trip.departureAt.toMillis() <= now.toMillis()
        ) {
          throw new HttpsError(
            "failed-precondition",
            "This trip has already departed or is no longer bookable."
          );
        }

        const fare = Number(trip.fare);

        if (!Number.isFinite(fare) || fare <= 0) {
          throw new HttpsError(
            "failed-precondition",
            "This trip does not have a valid fare."
          );
        }

        const availableSeats = Number(
          trip.availableSeats
        );

        if (
          !Number.isInteger(availableSeats) ||
          availableSeats < passengers.length
        ) {
          throw new HttpsError(
            "failed-precondition",
            "There are not enough seats available for this booking."
          );
        }

        // ========================================
        // Validate Every Seat
        // ========================================

        const validatedSeats = seatSnapshots.map(
          (seatSnapshot, index) => {
            if (!seatSnapshot.exists) {
              throw new HttpsError(
                "not-found",
                "A selected seat could not be found."
              );
            }

            const seat =
              seatSnapshot.data() as SeatData;

            if (seat.tripId !== tripId) {
              throw new HttpsError(
                "invalid-argument",
                "A selected seat does not belong to this trip."
              );
            }

            if (seat.status !== "available") {
              throw new HttpsError(
                "already-exists",
                `Seat ${
                  seat.seatNumber || ""
                } is no longer available.`
              );
            }

            if (
              typeof seat.seatNumber !== "string" ||
              !seat.seatNumber.trim()
            ) {
              throw new HttpsError(
                "failed-precondition",
                "A selected seat has invalid configuration."
              );
            }

            return {
              ref: seatRefs[index],
              id: seatSnapshot.id,
              seatNumber: seat.seatNumber.trim(),
            };
          }
        );

        // ========================================
        // Server-Side Price Calculation
        // ========================================

        const passengerCount = passengers.length;

        const subtotal = fare * passengerCount;

        // Booking fee is currently zero.
        const bookingFee = 0;

        const totalAmount = subtotal + bookingFee;

        // ========================================
        // Build Passenger + Seat Assignments
        // ========================================

        const bookingPassengers = passengers.map(
          (passenger, index) => ({
            seatId: validatedSeats[index].id,
            seatNumber:
              validatedSeats[index].seatNumber,
            fullName: passenger.fullName,
            phoneNumber: passenger.phoneNumber,
          })
        );

        // ========================================
        // Create Pending Booking
        // ========================================

        transaction.create(bookingRef, {
          userId,

          tripId,

          companyId: trip.companyId || "",
          companyName: trip.companyName || "",

          origin: trip.origin || "",
          destination: trip.destination || "",

          busType: trip.busType || "",

          departureAt: trip.departureAt,

          passengerCount,

          passengers: bookingPassengers,

          seatIds: validatedSeats.map(
            (seat) => seat.id
          ),

          seatNumbers: validatedSeats.map(
            (seat) => seat.seatNumber
          ),

          farePerPassenger: fare,

          subtotal,

          bookingFee,

          totalAmount,

          currency: "GHS",

          status: "pending",

          paymentStatus: "pending",

          paymentMethod: "mobile-money",

          contactEmail:
            userData?.email ||
            userEmail ||
            "",

          contactPhone:
            passengers[0].phoneNumber,

          reservationExpiresAt,

          createdAt: now,
          updatedAt: now,
        });

        // ========================================
        // Reserve Every Selected Seat
        // ========================================

        validatedSeats.forEach((seat) => {
          transaction.update(seat.ref, {
            status: "reserved",

            reservedBy: userId,

            bookingId: bookingRef.id,

            reservationExpiresAt,

            updatedAt: now,
          });
        });

        // ========================================
        // Update Trip Availability
        // ========================================

        transaction.update(tripRef, {
          availableSeats:
            availableSeats - passengerCount,

          updatedAt: now,
        });

        // ========================================
        // Transaction Response
        // ========================================

        return {
          bookingId: bookingRef.id,

          tripId,

          status: "pending",

          paymentStatus: "pending",

          passengerCount,

          seatNumbers: validatedSeats.map(
            (seat) => seat.seatNumber
          ),

          subtotal,

          bookingFee,

          totalAmount,

          currency: "GHS",

          reservationExpiresAt:
            reservationExpiresAt.toMillis(),
        };
      }
    );

    return result;
  }
);
