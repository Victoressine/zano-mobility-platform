// ========================================
// Zano - Complete Demo Payment
// ========================================

import {
  FieldValue,
  getFirestore,
  Timestamp,
} from "firebase-admin/firestore";
import {HttpsError, onCall} from "firebase-functions/v2/https";

// ========================================
// Configuration
// ========================================

const db = getFirestore();
const CURRENCY = "GHS";
const DEMO_PROVIDER = "demo";

// ========================================
// Types
// ========================================

type CompleteDemoPaymentInput = {
  bookingId?: unknown;
};

// ========================================
// Validation Helpers
// ========================================

/**
 * Validates and normalizes a required string.
 *
 * @param {unknown} value Value to validate.
 * @param {string} fieldName Human-readable field name.
 * @param {number} maxLength Maximum allowed length.
 * @return {string} Sanitized string.
 */
function requireString(
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

  if (!cleaned || cleaned.length > maxLength) {
    throw new HttpsError(
      "invalid-argument",
      `Invalid ${fieldName.toLowerCase()}.`
    );
  }

  return cleaned;
}

// ========================================
// Reference Generator
// ========================================

/**
 * Creates a readable demo payment reference.
 *
 * @return {string} Payment reference.
 */
function createPaymentReference(): string {
  const randomPart = Math.random()
    .toString(36)
    .slice(2, 10)
    .toUpperCase();

  return `ZANO-DEMO-${Date.now()}-${randomPart}`;
}

// ========================================
// Complete Demo Payment
// ========================================

/**
 * Simulates successful payment for a pending Zano booking.
 *
 * This function is intended for the Zano demo/MVP environment.
 * It does not charge real money.
 *
 * It atomically:
 * - validates booking ownership;
 * - validates the reservation;
 * - creates a successful demo payment;
 * - converts reserved seats to booked;
 * - confirms the booking.
 */
export const completeDemoPayment = onCall(
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
        "You must be signed in to complete payment."
      );
    }

    const userId = request.auth.uid;

    // ========================================
    // Validate Input
    // ========================================

    const data =
      (request.data ?? {}) as CompleteDemoPaymentInput;

    const bookingId = requireString(
      data.bookingId,
      "Booking ID",
      150
    );

    // ========================================
    // Prepare References
    // ========================================

    const bookingRef = db
      .collection("bookings")
      .doc(bookingId);

    const paymentRef = db
      .collection("payments")
      .doc();

    const paymentReference = createPaymentReference();

    const now = Timestamp.now();

    // ========================================
    // Complete Payment Transaction
    // ========================================

    const result = await db.runTransaction(
      async (transaction) => {
        // ========================================
        // Read Booking
        // ========================================

        const bookingSnapshot =
          await transaction.get(bookingRef);

        if (!bookingSnapshot.exists) {
          throw new HttpsError(
            "not-found",
            "Booking not found."
          );
        }

        const booking = bookingSnapshot.data();

        if (!booking) {
          throw new HttpsError(
            "not-found",
            "Booking data is unavailable."
          );
        }

        // ========================================
        // Verify Ownership
        // ========================================

        if (booking.userId !== userId) {
          throw new HttpsError(
            "permission-denied",
            "You cannot pay for this booking."
          );
        }

        // ========================================
        // Prevent Duplicate Payment
        // ========================================

        if (
          booking.status === "confirmed" &&
          booking.paymentStatus === "successful"
        ) {
          throw new HttpsError(
            "already-exists",
            "This booking has already been paid."
          );
        }

        if (booking.status !== "pending") {
          throw new HttpsError(
            "failed-precondition",
            "This booking cannot be paid."
          );
        }

        if (booking.paymentStatus !== "pending") {
          throw new HttpsError(
            "failed-precondition",
            "This booking is not awaiting payment."
          );
        }

        // ========================================
        // Validate Reservation Expiry
        // ========================================

        const reservationExpiresAt =
          booking.reservationExpiresAt;

        if (
          !(reservationExpiresAt instanceof Timestamp)
        ) {
          throw new HttpsError(
            "failed-precondition",
            "Booking reservation is invalid."
          );
        }

        if (
          reservationExpiresAt.toMillis() <=
          now.toMillis()
        ) {
          throw new HttpsError(
            "deadline-exceeded",
            "Your seat reservation has expired."
          );
        }

        // ========================================
        // Validate Booking Amount
        // ========================================

        const totalAmount = booking.totalAmount;

        if (
          typeof totalAmount !== "number" ||
          !Number.isFinite(totalAmount) ||
          totalAmount <= 0
        ) {
          throw new HttpsError(
            "failed-precondition",
            "Booking amount is invalid."
          );
        }

        // ========================================
        // Validate Seats
        // ========================================

        const seatIds = Array.isArray(booking.seatIds) ?
          booking.seatIds.filter(
            (seatId): seatId is string =>
              typeof seatId === "string" &&
              seatId.trim().length > 0
          ) :
          [];

        const uniqueSeatIds = [...new Set(seatIds)];

        if (uniqueSeatIds.length === 0) {
          throw new HttpsError(
            "failed-precondition",
            "No seats are attached to this booking."
          );
        }

        if (
          typeof booking.passengerCount === "number" &&
          uniqueSeatIds.length !== booking.passengerCount
        ) {
          throw new HttpsError(
            "failed-precondition",
            "Booking seat information is inconsistent."
          );
        }

        const seatRefs = uniqueSeatIds.map(
          (seatId) =>
            db.collection("seats").doc(seatId)
        );

        const seatSnapshots = [];

        for (const seatRef of seatRefs) {
          const seatSnapshot =
            await transaction.get(seatRef);

          seatSnapshots.push(seatSnapshot);
        }

        // ========================================
        // Verify Seat Reservations
        // ========================================

        for (const seatSnapshot of seatSnapshots) {
          if (!seatSnapshot.exists) {
            throw new HttpsError(
              "failed-precondition",
              "One or more reserved seats no longer exist."
            );
          }

          const seat = seatSnapshot.data();

          if (!seat) {
            throw new HttpsError(
              "failed-precondition",
              "Seat information is unavailable."
            );
          }

          if (
            seat.status !== "reserved" ||
            seat.bookingId !== bookingId ||
            seat.reservedBy !== userId
          ) {
            throw new HttpsError(
              "failed-precondition",
              "One or more seats are no longer reserved."
            );
          }

          if (
            typeof booking.tripId === "string" &&
            seat.tripId !== booking.tripId
          ) {
            throw new HttpsError(
              "failed-precondition",
              "A reserved seat does not belong to this trip."
            );
          }
        }

        // ========================================
        // Create Payment
        // ========================================

        transaction.create(paymentRef, {
          bookingId,
          userId,

          reference: paymentReference,

          provider: DEMO_PROVIDER,
          method: "demo",

          amount: totalAmount,
          currency:
            typeof booking.currency === "string" ?
              booking.currency :
              CURRENCY,

          status: "successful",

          isDemo: true,

          paidAt: now,
          createdAt: now,
          updatedAt: now,
        });

        // ========================================
        // Convert Seats To Booked
        // ========================================

        for (const seatSnapshot of seatSnapshots) {
          transaction.update(seatSnapshot.ref, {
            status: "booked",

            bookedBy: userId,
            bookingId,

            reservedBy: FieldValue.delete(),
            reservationExpiresAt:
              FieldValue.delete(),

            bookedAt: now,
            updatedAt: now,
          });
        }

        // ========================================
        // Confirm Booking
        // ========================================

        transaction.update(bookingRef, {
          status: "confirmed",

          paymentStatus: "successful",
          paymentMethod: "demo",

          paymentId: paymentRef.id,
          paymentReference,

          confirmedAt: now,
          paidAt: now,
          updatedAt: now,
        });

        // ========================================
        // Return Result
        // ========================================

        return {
          bookingId,
          paymentId: paymentRef.id,
          paymentReference,

          bookingStatus: "confirmed",
          paymentStatus: "successful",

          amount: totalAmount,

          currency:
            typeof booking.currency === "string" ?
              booking.currency :
              CURRENCY,

          seatNumbers:
            Array.isArray(booking.seatNumbers) ?
              booking.seatNumbers :
              [],

          paidAt: now.toDate().toISOString(),
        };
      }
    );

    return result;
  }
);
