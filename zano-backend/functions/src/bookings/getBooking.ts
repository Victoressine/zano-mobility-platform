// ========================================
// Zano - Get Booking
// ========================================

import {getFirestore} from "firebase-admin/firestore";
import {HttpsError, onCall} from "firebase-functions/v2/https";

// ========================================
// Configuration
// ========================================

const db = getFirestore();

const MAX_BOOKING_ID_LENGTH = 150;

// ========================================
// Get Booking
// ========================================

/**
 * Retrieves a booking belonging to the authenticated passenger.
 *
 * The authenticated user's UID is used for authorization.
 * A passenger cannot retrieve another passenger's booking.
 */
export const getBooking = onCall(
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
        "You must be signed in to view this booking."
      );
    }

    const userId = request.auth.uid;

    // ========================================
    // Validate Request
    // ========================================

    const rawBookingId = request.data?.bookingId;

    if (typeof rawBookingId !== "string") {
      throw new HttpsError(
        "invalid-argument",
        "Booking ID is required."
      );
    }

    const bookingId = rawBookingId.trim();

    if (
      bookingId.length === 0 ||
      bookingId.length > MAX_BOOKING_ID_LENGTH
    ) {
      throw new HttpsError(
        "invalid-argument",
        "Invalid booking ID."
      );
    }

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
    // Authorization
    // ========================================

    if (
      typeof booking.userId !== "string" ||
      booking.userId !== userId
    ) {
      throw new HttpsError(
        "permission-denied",
        "You do not have access to this booking."
      );
    }

    // ========================================
    // Return Passenger-Safe Booking Data
    // ========================================

    return {
      bookingId: bookingSnapshot.id,

      status:
        typeof booking.status === "string" ?
          booking.status :
          "",

      paymentStatus:
        typeof booking.paymentStatus === "string" ?
          booking.paymentStatus :
          "",

      paymentMethod:
        typeof booking.paymentMethod === "string" ?
          booking.paymentMethod :
          "",

      tripId:
        typeof booking.tripId === "string" ?
          booking.tripId :
          "",

      companyId:
        typeof booking.companyId === "string" ?
          booking.companyId :
          "",

      companyName:
        typeof booking.companyName === "string" ?
          booking.companyName :
          "",

      routeId:
        typeof booking.routeId === "string" ?
          booking.routeId :
          "",

      origin:
        typeof booking.origin === "string" ?
          booking.origin :
          "",

      destination:
        typeof booking.destination === "string" ?
          booking.destination :
          "",

      busType:
        typeof booking.busType === "string" ?
          booking.busType :
          "",

      passengerCount:
        typeof booking.passengerCount === "number" ?
          booking.passengerCount :
          0,

      passengers:
        Array.isArray(booking.passengers) ?
          booking.passengers :
          [],

      seatNumbers:
        Array.isArray(booking.seatNumbers) ?
          booking.seatNumbers :
          [],

      farePerPassenger:
        typeof booking.farePerPassenger === "number" ?
          booking.farePerPassenger :
          0,

      subtotal:
        typeof booking.subtotal === "number" ?
          booking.subtotal :
          0,

      bookingFee:
        typeof booking.bookingFee === "number" ?
          booking.bookingFee :
          0,

      totalAmount:
        typeof booking.totalAmount === "number" ?
          booking.totalAmount :
          0,

      currency:
        typeof booking.currency === "string" ?
          booking.currency :
          "GHS",

      contactEmail:
        typeof booking.contactEmail === "string" ?
          booking.contactEmail :
          "",

      contactPhone:
        typeof booking.contactPhone === "string" ?
          booking.contactPhone :
          "",

      departureAt:
        booking.departureAt ?? null,

      reservationExpiresAt:
        booking.reservationExpiresAt ?? null,

      createdAt:
        booking.createdAt ?? null,

      updatedAt:
        booking.updatedAt ?? null,

      expiredAt:
        booking.expiredAt ?? null,
    };
  }
);
