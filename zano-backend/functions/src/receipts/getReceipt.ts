// ========================================
// Zano - Get Payment Receipt
// ========================================

import {
  DocumentData,
  getFirestore,
  Timestamp,
} from "firebase-admin/firestore";
import {HttpsError, onCall} from "firebase-functions/v2/https";

// ========================================
// Configuration
// ========================================

const db = getFirestore();
const MAX_BOOKING_ID_LENGTH = 150;

// ========================================
// Types
// ========================================

type GetReceiptInput = {
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
// Safe Data Helpers
// ========================================

/**
 * Returns a safe string from Firestore data.
 *
 * @param {unknown} value Raw Firestore value.
 * @param {string} fallback Fallback value.
 * @return {string} Safe string.
 */
function safeString(
  value: unknown,
  fallback = ""
): string {
  return typeof value === "string" ?
    value :
    fallback;
}

/**
 * Returns a safe number from Firestore data.
 *
 * @param {unknown} value Raw Firestore value.
 * @return {number} Safe number.
 */
function safeNumber(value: unknown): number {
  return typeof value === "number" &&
    Number.isFinite(value) ?
    value :
    0;
}

/**
 * Returns a safe string array.
 *
 * @param {unknown} value Raw Firestore value.
 * @return {string[]} Safe string array.
 */
function safeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(
    (item): item is string =>
      typeof item === "string"
  );
}

/**
 * Converts a Firestore timestamp to an ISO string.
 *
 * @param {unknown} value Raw Firestore value.
 * @return {string|null} ISO date string or null.
 */
function timestampToIso(
  value: unknown
): string | null {
  if (!(value instanceof Timestamp)) {
    return null;
  }

  return value.toDate().toISOString();
}

/**
 * Creates the public receipt number.
 *
 * @param {string} paymentId Payment document ID.
 * @return {string} Receipt number.
 */
function createReceiptNumber(
  paymentId: string
): string {
  return `ZANO-RCP-${paymentId.toUpperCase()}`;
}

// ========================================
// Passenger Sanitization
// ========================================

/**
 * Returns passenger-safe receipt information.
 *
 * @param {unknown} value Raw passenger data.
 * @return {Array<Record<string, string>>} Safe passengers.
 */
function sanitizePassengers(
  value: unknown
): Array<Record<string, string>> {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter(
      (passenger): passenger is DocumentData =>
        typeof passenger === "object" &&
        passenger !== null
    )
    .map((passenger) => ({
      fullName: safeString(passenger.fullName),
      phoneNumber: safeString(passenger.phoneNumber),
      seatId: safeString(passenger.seatId),
      seatNumber: safeString(passenger.seatNumber),
    }));
}

// ========================================
// Get Receipt
// ========================================

/**
 * Retrieves the payment receipt for a confirmed booking.
 *
 * The receipt is generated from authoritative booking and
 * payment records. The authenticated passenger must own
 * the booking.
 */
export const getReceipt = onCall(
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
        "You must be signed in to view this receipt."
      );
    }

    const userId = request.auth.uid;

    // ========================================
    // Validate Input
    // ========================================

    const data =
      (request.data ?? {}) as GetReceiptInput;

    const bookingId = requireString(
      data.bookingId,
      "Booking ID",
      MAX_BOOKING_ID_LENGTH
    );

    // ========================================
    // Retrieve Booking
    // ========================================

    const bookingRef = db
      .collection("bookings")
      .doc(bookingId);

    const bookingSnapshot = await bookingRef.get();

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
    // Verify Booking Ownership
    // ========================================

    if (booking.userId !== userId) {
      throw new HttpsError(
        "permission-denied",
        "You do not have access to this receipt."
      );
    }

    // ========================================
    // Verify Booking Status
    // ========================================

    if (
      booking.status !== "confirmed" ||
      booking.paymentStatus !== "successful"
    ) {
      throw new HttpsError(
        "failed-precondition",
        "A receipt is not available for this booking."
      );
    }

    // ========================================
    // Validate Payment Reference
    // ========================================

    const paymentId = safeString(
      booking.paymentId
    );

    if (!paymentId) {
      throw new HttpsError(
        "failed-precondition",
        "Payment information is missing."
      );
    }

    // ========================================
    // Retrieve Payment
    // ========================================

    const paymentRef = db
      .collection("payments")
      .doc(paymentId);

    const paymentSnapshot =
      await paymentRef.get();

    if (!paymentSnapshot.exists) {
      throw new HttpsError(
        "not-found",
        "Payment record not found."
      );
    }

    const payment = paymentSnapshot.data();

    if (!payment) {
      throw new HttpsError(
        "not-found",
        "Payment data is unavailable."
      );
    }

    // ========================================
    // Verify Payment Integrity
    // ========================================

    if (
      payment.bookingId !== bookingId ||
      payment.userId !== userId
    ) {
      throw new HttpsError(
        "failed-precondition",
        "Payment does not match this booking."
      );
    }

    if (payment.status !== "successful") {
      throw new HttpsError(
        "failed-precondition",
        "Payment has not been completed."
      );
    }

    const bookingAmount = safeNumber(
      booking.totalAmount
    );

    const paymentAmount = safeNumber(
      payment.amount
    );

    if (
      bookingAmount <= 0 ||
      paymentAmount <= 0 ||
      bookingAmount !== paymentAmount
    ) {
      throw new HttpsError(
        "failed-precondition",
        "Payment amount does not match the booking."
      );
    }

    const bookingCurrency = safeString(
      booking.currency,
      "GHS"
    );

    const paymentCurrency = safeString(
      payment.currency,
      "GHS"
    );

    if (bookingCurrency !== paymentCurrency) {
      throw new HttpsError(
        "failed-precondition",
        "Payment currency does not match the booking."
      );
    }

    // ========================================
    // Build Receipt
    // ========================================

    const receiptNumber =
      createReceiptNumber(paymentSnapshot.id);

    return {
      receiptNumber,

      bookingId: bookingSnapshot.id,

      paymentId: paymentSnapshot.id,

      paymentReference: safeString(
        payment.reference
      ),

      // ========================================
      // Journey
      // ========================================

      tripId: safeString(booking.tripId),

      routeId: safeString(booking.routeId),

      origin: safeString(booking.origin),

      destination: safeString(
        booking.destination
      ),

      departureAt: timestampToIso(
        booking.departureAt
      ),

      companyId: safeString(
        booking.companyId
      ),

      companyName: safeString(
        booking.companyName
      ),

      busType: safeString(
        booking.busType
      ),

      // ========================================
      // Passenger
      // ========================================

      passengerCount: safeNumber(
        booking.passengerCount
      ),

      passengers: sanitizePassengers(
        booking.passengers
      ),

      seatNumbers: safeStringArray(
        booking.seatNumbers
      ),

      contactEmail: safeString(
        booking.contactEmail
      ),

      contactPhone: safeString(
        booking.contactPhone
      ),

      // ========================================
      // Amount
      // ========================================

      farePerPassenger: safeNumber(
        booking.farePerPassenger
      ),

      subtotal: safeNumber(
        booking.subtotal
      ),

      bookingFee: safeNumber(
        booking.bookingFee
      ),

      totalPaid: paymentAmount,

      currency: paymentCurrency,

      // ========================================
      // Payment
      // ========================================

      paymentMethod: safeString(
        payment.method,
        "demo"
      ),

      paymentProvider: safeString(
        payment.provider,
        "demo"
      ),

      paymentStatus: safeString(
        payment.status
      ),

      isDemo: payment.isDemo === true,

      paidAt: timestampToIso(
        payment.paidAt
      ),

      // ========================================
      // Receipt Metadata
      // ========================================

      bookingStatus: safeString(
        booking.status
      ),

      confirmedAt: timestampToIso(
        booking.confirmedAt
      ),

      createdAt: timestampToIso(
        payment.createdAt
      ),
    };
  }
);
