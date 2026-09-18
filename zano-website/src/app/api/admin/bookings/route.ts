import "server-only";

import { NextRequest, NextResponse } from "next/server";
import type { DocumentData } from "firebase-admin/firestore";

import { adminAuth, adminDb } from "@/lib/firebase/admin";

// ========================================
// Types
// ========================================

type PassengerRecord = {
  fullName: string;
  phoneNumber: string;
  seatId: string;
  seatNumber: string;
};

// ========================================
// GET /api/admin/bookings
// ========================================

export async function GET(request: NextRequest) {
  try {
    // ========================================
    // Authenticate Platform Admin
    // ========================================

    const authorization = request.headers.get("authorization");

    if (!authorization?.startsWith("Bearer ")) {
      return errorResponse(
        "Authentication is required.",
        401,
      );
    }

    const idToken = authorization
      .slice("Bearer ".length)
      .trim();

    if (!idToken) {
      return errorResponse(
        "Authentication is required.",
        401,
      );
    }

    let userId = "";

    try {
      const decodedToken =
        await adminAuth.verifyIdToken(idToken);

      userId = decodedToken.uid;
    } catch {
      return errorResponse(
        "Your session is invalid or has expired.",
        401,
      );
    }

    // ========================================
    // Verify Platform Admin Role
    // ========================================

    const userSnapshot = await adminDb
      .collection("users")
      .doc(userId)
      .get();

    if (
      !userSnapshot.exists ||
      userSnapshot.data()?.role !== "admin"
    ) {
      return errorResponse(
        "Administrator access is required.",
        403,
      );
    }

    // ========================================
    // Load Bookings + Companies
    // ========================================

    const [
      bookingsSnapshot,
      companiesSnapshot,
    ] = await Promise.all([
      adminDb.collection("bookings").get(),
      adminDb.collection("companies").get(),
    ]);

    // ========================================
    // Company Filter Options
    // ========================================

    const companies = companiesSnapshot.docs
      .map((document) => {
        const data = document.data();

        return {
          id: document.id,
          name:
            stringOrEmpty(data.name) ||
            document.id,
        };
      })
      .sort((a, b) =>
        a.name.localeCompare(b.name, "en", {
          sensitivity: "base",
        }),
      );

    // ========================================
    // Sanitize Bookings
    // ========================================

    const bookings = bookingsSnapshot.docs
      .map((document) =>
        sanitizeBooking(
          document.id,
          document.data(),
        ),
      )
      .sort((a, b) => {
        const aTime =
          a.createdAt
            ? new Date(a.createdAt).getTime()
            : 0;

        const bTime =
          b.createdAt
            ? new Date(b.createdAt).getTime()
            : 0;

        return bTime - aTime;
      });

    // ========================================
    // Summary
    // ========================================

    let confirmed = 0;
    let cancelled = 0;
    let pending = 0;
    let successfulPayments = 0;
    let passengerSeats = 0;
    let revenue = 0;

    for (const booking of bookings) {
      const status =
        booking.status.toLowerCase();

      const paymentStatus =
        booking.paymentStatus.toLowerCase();

      if (status === "confirmed") {
        confirmed += 1;
      }

      if (status === "cancelled") {
        cancelled += 1;
      }

      if (status === "pending") {
        pending += 1;
      }

      passengerSeats += booking.passengerCount;

      /*
       * Revenue follows the authoritative
       * Zano reporting rule:
       *
       * booking = confirmed
       * payment = successful
       */
      if (
        status === "confirmed" &&
        paymentStatus === "successful"
      ) {
        successfulPayments += 1;
        revenue += booking.totalAmount;
      }
    }

    // ========================================
    // Response
    // ========================================

    return NextResponse.json(
      {
        success: true,

        summary: {
          total: bookings.length,
          confirmed,
          cancelled,
          pending,
          successfulPayments,
          passengerSeats,
          revenue,
          currency: "GHS",
        },

        companies,

        bookings,

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
      "Admin bookings API error:",
      error,
    );

    return errorResponse(
      "Unable to load bookings.",
      500,
    );
  }
}

// ========================================
// Booking Sanitizer
// ========================================

function sanitizeBooking(
  id: string,
  data: DocumentData,
) {
  const passengers =
    sanitizePassengers(
      data.passengers,
    );

  const seatNumbers =
    Array.isArray(data.seatNumbers)
      ? data.seatNumbers
          .filter(
            (
              value,
            ): value is string =>
              typeof value === "string",
          )
          .map((value) =>
            value.trim(),
          )
          .filter(Boolean)
      : passengers
          .map(
            (passenger) =>
              passenger.seatNumber,
          )
          .filter(Boolean);

  return {
    id,

    bookingReference:
      stringOrEmpty(
        data.bookingReference,
      ),

    userId:
      stringOrEmpty(data.userId),

    tripId:
      stringOrEmpty(data.tripId),

    companyId:
      stringOrEmpty(
        data.companyId,
      ),

    companyName:
      stringOrEmpty(
        data.companyName,
      ),

    routeId:
      stringOrEmpty(
        data.routeId,
      ),

    origin:
      stringOrEmpty(
        data.origin,
      ),

    destination:
      stringOrEmpty(
        data.destination,
      ),

    busType:
      stringOrEmpty(
        data.busType,
      ),

    scheduleType:
      stringOrEmpty(
        data.scheduleType,
      ),

    inventoryType:
      stringOrEmpty(
        data.inventoryType,
      ),

    travelDate:
      stringOrEmpty(
        data.travelDate,
      ),

    departureAt:
      timestampToIso(
        data.departureAt,
      ),

    arrivalAt:
      timestampToIso(
        data.arrivalAt,
      ),

    passengerCount:
      integerOrZero(
        data.passengerCount,
      ),

    passengers,

    seatNumbers,

    fare:
      numberOrZero(data.fare),

    subtotal:
      numberOrZero(
        data.subtotal,
      ),

    bookingFee:
      numberOrZero(
        data.bookingFee,
      ),

    totalAmount:
      numberOrZero(
        data.totalAmount,
      ),

    currency:
      stringOrEmpty(
        data.currency,
      ) || "GHS",

    status:
      stringOrEmpty(
        data.status,
      ) || "unknown",

    paymentStatus:
      stringOrEmpty(
        data.paymentStatus,
      ) || "unknown",

    paymentMethod:
      stringOrEmpty(
        data.paymentMethod,
      ),

    paymentId:
      stringOrEmpty(
        data.paymentId,
      ),

    paymentReference:
      stringOrEmpty(
        data.paymentReference,
      ),

    ticketId:
      stringOrEmpty(
        data.ticketId,
      ),

    ticketNumber:
      stringOrEmpty(
        data.ticketNumber,
      ),

    contactEmail:
      stringOrEmpty(
        data.contactEmail,
      ),

    contactPhone:
      stringOrEmpty(
        data.contactPhone,
      ),

    confirmedAt:
      timestampToIso(
        data.confirmedAt,
      ),

    paidAt:
      timestampToIso(
        data.paidAt,
      ),

    createdAt:
      timestampToIso(
        data.createdAt,
      ),

    updatedAt:
      timestampToIso(
        data.updatedAt,
      ),
  };
}

// ========================================
// Passenger Sanitizer
// ========================================

function sanitizePassengers(
  value: unknown,
): PassengerRecord[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter(
      (
        passenger,
      ): passenger is Record<
        string,
        unknown
      > =>
        Boolean(
          passenger &&
            typeof passenger ===
              "object",
        ),
    )
    .map((passenger) => ({
      fullName:
        stringOrEmpty(
          passenger.fullName,
        ),

      phoneNumber:
        stringOrEmpty(
          passenger.phoneNumber,
        ),

      seatId:
        stringOrEmpty(
          passenger.seatId,
        ),

      seatNumber:
        stringOrEmpty(
          passenger.seatNumber,
        ),
    }));
}

// ========================================
// String Helper
// ========================================

function stringOrEmpty(
  value: unknown,
): string {
  return typeof value === "string"
    ? value.trim()
    : "";
}

// ========================================
// Number Helpers
// ========================================

function numberOrZero(
  value: unknown,
): number {
  const number =
    Number(value);

  return Number.isFinite(number)
    ? number
    : 0;
}

function integerOrZero(
  value: unknown,
): number {
  const number =
    Number(value);

  return Number.isInteger(number) &&
    number >= 0
    ? number
    : 0;
}

// ========================================
// Timestamp Helper
// ========================================

function timestampToIso(
  value: unknown,
): string | null {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (
    typeof value === "string"
  ) {
    const date =
      new Date(value);

    return Number.isNaN(
      date.getTime(),
    )
      ? null
      : date.toISOString();
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
    try {
      return (
        value as {
          toDate: () => Date;
        }
      )
        .toDate()
        .toISOString();
    } catch {
      return null;
    }
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