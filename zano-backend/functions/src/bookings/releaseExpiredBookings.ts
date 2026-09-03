// ========================================
// Zano - Release Expired Bookings
// ========================================

import {getFirestore, Timestamp} from "firebase-admin/firestore";
import {onSchedule} from "firebase-functions/v2/scheduler";

// ========================================
// Configuration
// ========================================

const db = getFirestore();
const BATCH_LIMIT = 100;

// ========================================
// Release Expired Bookings
// ========================================

/**
 * Releases seats held by expired pending bookings.
 *
 * Runs periodically and:
 * - Finds expired pending bookings.
 * - Returns reserved seats to available.
 * - Restores the trip's available seat count.
 * - Marks the booking as expired.
 */
export const releaseExpiredBookings = onSchedule(
  {
    schedule: "every 5 minutes",
    region: "us-central1",
    timeZone: "UTC",
    maxInstances: 1,
  },
  async () => {
    const now = Timestamp.now();

    // ========================================
    // Find Expired Pending Bookings
    // ========================================

    const expiredBookingsSnapshot = await db
      .collection("bookings")
      .where("status", "==", "pending")
      .where("reservationExpiresAt", "<=", now)
      .limit(BATCH_LIMIT)
      .get();

    if (expiredBookingsSnapshot.empty) {
      console.log("No expired bookings found.");
      return;
    }

    // ========================================
    // Process Each Expired Booking
    // ========================================

    for (const bookingDocument of expiredBookingsSnapshot.docs) {
      try {
        await db.runTransaction(async (transaction) => {
          const bookingRef = bookingDocument.ref;
          const bookingSnapshot = await transaction.get(bookingRef);

          if (!bookingSnapshot.exists) {
            return;
          }

          const booking = bookingSnapshot.data();

          if (!booking) {
            console.error(
              `Booking data missing: ${bookingSnapshot.id}`
            );
            return;
          }

          // ========================================
          // Re-check Booking State
          // ========================================

          if (booking.status !== "pending") {
            return;
          }

          const expiresAt = booking.reservationExpiresAt;

          if (
            !(expiresAt instanceof Timestamp) ||
            expiresAt.toMillis() > now.toMillis()
          ) {
            return;
          }

          // ========================================
          // Validate Booking References
          // ========================================

          const tripId =
            typeof booking.tripId === "string" ?
              booking.tripId :
              "";

          const seatIds = Array.isArray(booking.seatIds) ?
            booking.seatIds.filter(
              (seatId): seatId is string =>
                typeof seatId === "string" &&
                seatId.trim().length > 0
            ) :
            [];

          const uniqueSeatIds = [...new Set(seatIds)];

          if (!tripId || uniqueSeatIds.length === 0) {
            console.error(
              `Invalid expired booking data: ${bookingSnapshot.id}`
            );

            transaction.update(bookingRef, {
              status: "expired",
              updatedAt: now,
            });

            return;
          }

          // ========================================
          // Read Trip and Seats
          // ========================================

          const tripRef = db.collection("trips").doc(tripId);

          const seatRefs = uniqueSeatIds.map((seatId) =>
            db.collection("seats").doc(seatId)
          );

          const tripSnapshot = await transaction.get(tripRef);

          const seatSnapshots = [];

          for (const seatRef of seatRefs) {
            const seatSnapshot = await transaction.get(seatRef);
            seatSnapshots.push(seatSnapshot);
          }

          // ========================================
          // Determine Seats Still Held
          // ========================================

          const seatsToRelease = seatSnapshots.filter((seatSnapshot) => {
            if (!seatSnapshot.exists) {
              return false;
            }

            const seat = seatSnapshot.data();

            if (!seat) {
              return false;
            }

            return (
              seat.status === "reserved" &&
              seat.bookingId === bookingSnapshot.id
            );
          });

          // ========================================
          // Release Seats
          // ========================================

          for (const seatSnapshot of seatsToRelease) {
            transaction.update(seatSnapshot.ref, {
              status: "available",
              reservedBy: null,
              bookingId: null,
              reservationExpiresAt: null,
              updatedAt: now,
            });
          }

          // ========================================
          // Restore Trip Availability
          // ========================================

          if (tripSnapshot.exists && seatsToRelease.length > 0) {
            const trip = tripSnapshot.data();

            if (trip) {
              const currentAvailableSeats =
                typeof trip.availableSeats === "number" ?
                  trip.availableSeats :
                  0;

              const totalSeats =
                typeof trip.totalSeats === "number" ?
                  trip.totalSeats :
                  currentAvailableSeats + seatsToRelease.length;

              const restoredAvailableSeats = Math.min(
                totalSeats,
                currentAvailableSeats + seatsToRelease.length
              );

              transaction.update(tripRef, {
                availableSeats: restoredAvailableSeats,
                updatedAt: now,
              });
            }
          }

          // ========================================
          // Expire Booking
          // ========================================

          transaction.update(bookingRef, {
            status: "expired",
            paymentStatus:
              booking.paymentStatus === "pending" ?
                "expired" :
                booking.paymentStatus,
            expiredAt: now,
            updatedAt: now,
          });
        });

        console.log(
          `Expired booking processed: ${bookingDocument.id}`
        );
      } catch (error) {
        console.error(
          `Failed to process booking ${bookingDocument.id}:`,
          error
        );
      }
    }
  }
);
