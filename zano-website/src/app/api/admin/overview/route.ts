// ========================================
// Zano - Admin Overview API
// Secure platform-wide reporting
// ========================================

import "server-only";

import { NextRequest, NextResponse } from "next/server";

import {
  adminAuth,
  adminDb,
} from "@/lib/firebase/admin";

// ========================================
// GET /api/admin/overview
// ========================================

export async function GET(
  request: NextRequest,
) {
  try {
    // ========================================
    // 1. Verify Firebase ID Token
    // ========================================

    const authorization =
      request.headers.get("authorization");

    if (
      !authorization ||
      !authorization.startsWith("Bearer ")
    ) {
      return errorResponse(
        "Authentication is required.",
        401,
      );
    }

    const idToken =
      authorization.slice(7).trim();

    if (!idToken) {
      return errorResponse(
        "Authentication token is missing.",
        401,
      );
    }

    let decodedToken;

    try {
      decodedToken =
        await adminAuth.verifyIdToken(idToken);
    } catch {
      return errorResponse(
        "Your session is invalid or has expired.",
        401,
      );
    }

    const userId = decodedToken.uid;

    // ========================================
    // 2. Verify Admin User
    // ========================================

    const userSnapshot =
      await adminDb
        .collection("users")
        .doc(userId)
        .get();

    if (!userSnapshot.exists) {
      return errorResponse(
        "Administrator account was not found.",
        403,
      );
    }

    const userData = userSnapshot.data();

    if (userData?.role !== "admin") {
      return errorResponse(
        "Administrator access is required.",
        403,
      );
    }

    // ========================================
    // 3. Load Platform Collections
    // ========================================

    const [
      companiesSnapshot,
      operatorMembersSnapshot,
      vehiclesSnapshot,
      tripsSnapshot,
      bookingsSnapshot,
      usersSnapshot,
    ] = await Promise.all([
      adminDb.collection("companies").get(),
      adminDb.collection("operatorMembers").get(),
      adminDb.collection("vehicles").get(),
      adminDb.collection("trips").get(),
      adminDb.collection("bookings").get(),
      adminDb.collection("users").get(),
    ]);

    // ========================================
    // 4. Company Statistics
    // ========================================

    const totalCompanies =
      companiesSnapshot.size;

    const activeCompanies =
      companiesSnapshot.docs.filter(
        (document) => {
          const status =
            document.data().status;

          return (
            status === undefined ||
            status === null ||
            status === "" ||
            status === "active"
          );
        },
      ).length;

    // ========================================
    // 5. Operator Statistics
    // ========================================

    const totalOperators =
      operatorMembersSnapshot.size;

    const activeOperators =
      operatorMembersSnapshot.docs.filter(
        (document) =>
          document.data().status === "active",
      ).length;

    // ========================================
    // 6. Vehicle Statistics
    // ========================================

    const totalVehicles =
      vehiclesSnapshot.size;

    const activeVehicles =
      vehiclesSnapshot.docs.filter(
        (document) =>
          document.data().status === "active",
      ).length;

    // ========================================
    // 7. Trip Statistics
    // ========================================

    const totalTrips =
      tripsSnapshot.size;

    const scheduledTrips =
      tripsSnapshot.docs.filter(
        (document) =>
          document.data().status === "scheduled",
      ).length;

    const completedTrips =
      tripsSnapshot.docs.filter(
        (document) =>
          document.data().status === "completed",
      ).length;

    const cancelledTrips =
      tripsSnapshot.docs.filter(
        (document) =>
          document.data().status === "cancelled",
      ).length;

    // ========================================
    // 8. Booking + Revenue Statistics
    // ========================================

    const totalBookings =
      bookingsSnapshot.size;

    let confirmedBookings = 0;
    let successfulPayments = 0;
    let totalRevenue = 0;
    let totalPassengersBooked = 0;

    for (
      const bookingDocument of
      bookingsSnapshot.docs
    ) {
      const booking =
        bookingDocument.data();

      if (booking.status === "confirmed") {
        confirmedBookings += 1;
      }

      if (booking.paymentStatus === "successful") {
        successfulPayments += 1;

        totalRevenue +=
          numberOrZero(
            booking.totalAmount,
          );
      }

      totalPassengersBooked +=
        numberOrZero(
          booking.passengerCount,
        );
    }

    // ========================================
    // 9. Passenger Statistics
    // ========================================

    const passengerUsers =
      usersSnapshot.docs.filter(
        (document) =>
          document.data().role === "passenger",
      );

    const totalPassengers =
      passengerUsers.length;

    // ========================================
    // 10. Recent Bookings
    // ========================================

    const recentBookings =
      bookingsSnapshot.docs
        .map((document) => {
          const booking =
            document.data();

          return {
            id: document.id,

            bookingReference:
              stringOrEmpty(
                booking.bookingReference,
              ),

            companyName:
              stringOrEmpty(
                booking.companyName,
              ),

            origin:
              stringOrEmpty(
                booking.origin,
              ),

            destination:
              stringOrEmpty(
                booking.destination,
              ),

            travelDate:
              stringOrEmpty(
                booking.travelDate,
              ),

            passengerCount:
              numberOrZero(
                booking.passengerCount,
              ),

            totalAmount:
              numberOrZero(
                booking.totalAmount,
              ),

            currency:
              stringOrEmpty(
                booking.currency,
              ) || "GHS",

            status:
              stringOrEmpty(
                booking.status,
              ),

            paymentStatus:
              stringOrEmpty(
                booking.paymentStatus,
              ),

            createdAt:
              timestampToIso(
                booking.createdAt,
              ),
          };
        })
        .sort((a, b) => {
          const aTime =
            a.createdAt
              ? new Date(
                  a.createdAt,
                ).getTime()
              : 0;

          const bTime =
            b.createdAt
              ? new Date(
                  b.createdAt,
                ).getTime()
              : 0;

          return bTime - aTime;
        })
        .slice(0, 10);

    // ========================================
    // 11. Return Sanitized Overview
    // ========================================

    return NextResponse.json(
      {
        success: true,

        admin: {
          uid: userId,

          firstName:
            stringOrEmpty(
              userData.firstName,
            ),

          lastName:
            stringOrEmpty(
              userData.lastName,
            ),

          email:
            stringOrEmpty(
              userData.email,
            ),
        },

        metrics: {
          companies: {
            total: totalCompanies,
            active: activeCompanies,
          },

          operators: {
            total: totalOperators,
            active: activeOperators,
          },

          vehicles: {
            total: totalVehicles,
            active: activeVehicles,
          },

          trips: {
            total: totalTrips,
            scheduled: scheduledTrips,
            completed: completedTrips,
            cancelled: cancelledTrips,
          },

          bookings: {
            total: totalBookings,
            confirmed: confirmedBookings,
          },

          payments: {
            successful:
              successfulPayments,

            revenue:
              totalRevenue,

            currency: "GHS",
          },

          passengers: {
            registered:
              totalPassengers,

            booked:
              totalPassengersBooked,
          },
        },

        recentBookings,

        generatedAt:
          new Date().toISOString(),
      },
      {
        status: 200,

        headers: {
          "Cache-Control":
            "private, no-store, max-age=0",
        },
      },
    );
  } catch (error) {
    console.error(
      "Admin overview API error:",
      error,
    );

    return errorResponse(
      "Unable to load admin overview.",
      500,
    );
  }
}

// ========================================
// Value Helpers
// ========================================

function stringOrEmpty(
  value: unknown,
): string {
  return typeof value === "string"
    ? value
    : "";
}

function numberOrZero(
  value: unknown,
): number {
  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : 0;
}

function timestampToIso(
  value: unknown,
): string | null {
  if (!value) {
    return null;
  }

  if (
    typeof value === "object" &&
    value !== null &&
    "toDate" in value &&
    typeof (
      value as {
        toDate?: unknown;
      }
    ).toDate === "function"
  ) {
    return (
      value as {
        toDate: () => Date;
      }
    )
      .toDate()
      .toISOString();
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "string") {
    const date =
      new Date(value);

    return Number.isNaN(
      date.getTime(),
    )
      ? null
      : date.toISOString();
  }

  return null;
}

// ========================================
// Error Response
// ========================================

function errorResponse(
  message: string,
  status: number,
) {
  return NextResponse.json(
    {
      success: false,
      error: message,
    },
    {
      status,

      headers: {
        "Cache-Control":
          "private, no-store, max-age=0",
      },
    },
  );
}