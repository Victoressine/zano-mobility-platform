import { NextRequest, NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";

import { adminAuth, adminDb } from "@/lib/firebase/admin";

/* ========================================
   Route Types
======================================== */

type RouteContext = {
  params: Promise<{
    bookingId: string;
  }>;
};

/* ========================================
   GET /api/bookings/[bookingId]
======================================== */

export async function GET(
  request: NextRequest,
  context: RouteContext
) {
  try {
    /* ========================================
       Validate Booking ID
    ======================================== */

    const { bookingId: rawBookingId } =
      await context.params;

    const bookingId =
      rawBookingId?.trim();

    if (!bookingId) {
      return errorResponse(
        "Booking ID is required.",
        400
      );
    }

    /* ========================================
       Authenticate Passenger
    ======================================== */

    const authorization =
      request.headers.get("authorization");

    if (
      !authorization ||
      !authorization.startsWith("Bearer ")
    ) {
      return errorResponse(
        "Authentication is required.",
        401
      );
    }

    const idToken =
      authorization
        .slice("Bearer ".length)
        .trim();

    if (!idToken) {
      return errorResponse(
        "Authentication is required.",
        401
      );
    }

    let decodedToken;

    try {
      decodedToken =
        await adminAuth.verifyIdToken(idToken);
    } catch (authError) {
      console.error(
        "View booking authentication error:",
        authError
      );

      return errorResponse(
        "Your session is invalid or has expired. Please sign in again.",
        401
      );
    }

    const userId = decodedToken.uid;

    /* ========================================
       Verify Passenger Profile
    ======================================== */

    const userReference =
      adminDb
        .collection("users")
        .doc(userId);

    const userSnapshot =
      await userReference.get();

    if (!userSnapshot.exists) {
      return errorResponse(
        "Your passenger profile could not be found.",
        403
      );
    }

    const user =
      userSnapshot.data() ?? {};

    if (user.role !== "passenger") {
      return errorResponse(
        "Only passengers can view passenger bookings.",
        403
      );
    }

    /* ========================================
       Load Booking
    ======================================== */

    const bookingReference =
      adminDb
        .collection("bookings")
        .doc(bookingId);

    const bookingSnapshot =
      await bookingReference.get();

    if (!bookingSnapshot.exists) {
      return errorResponse(
        "Booking not found.",
        404
      );
    }

    const booking =
      bookingSnapshot.data() ?? {};

    /* ========================================
       Verify Booking Ownership
    ======================================== */

    if (
      stringValue(booking.userId) !==
      userId
    ) {
      return errorResponse(
        "You do not have permission to view this booking.",
        403
      );
    }

    /* ========================================
       Load Related Payment
    ======================================== */

    let payment:
      | Record<string, unknown>
      | null = null;

    const paymentId =
      stringValue(booking.paymentId);

    if (paymentId) {
      const paymentSnapshot =
        await adminDb
          .collection("payments")
          .doc(paymentId)
          .get();

      if (paymentSnapshot.exists) {
        const paymentData =
          paymentSnapshot.data() ?? {};

        if (
          stringValue(
            paymentData.bookingId
          ) === bookingId &&
          stringValue(
            paymentData.userId
          ) === userId
        ) {
          payment = paymentData;
        }
      }
    }

    /* ========================================
       Load Related Ticket
    ======================================== */

    let ticket:
      | Record<string, unknown>
      | null = null;

    const ticketId =
      stringValue(booking.ticketId);

    if (ticketId) {
      const ticketSnapshot =
        await adminDb
          .collection("tickets")
          .doc(ticketId)
          .get();

      if (ticketSnapshot.exists) {
        const ticketData =
          ticketSnapshot.data() ?? {};

        if (
          stringValue(
            ticketData.bookingId
          ) === bookingId &&
          stringValue(
            ticketData.userId
          ) === userId
        ) {
          ticket = ticketData;
        }
      }
    }

    /* ========================================
       Build Safe Passenger Data
    ======================================== */

    const passengers =
      arrayValue(booking.passengers).map(
        (passenger) => {
          const record =
            objectValue(passenger);

          return {
            fullName:
              stringValue(
                record.fullName
              ),

            phoneNumber:
              stringValue(
                record.phoneNumber
              ),

            seatId:
              stringValue(
                record.seatId
              ),

            seatNumber:
              stringValue(
                record.seatNumber
              ),
          };
        }
      );

    /* ========================================
       Build Safe Booking Response
    ======================================== */

    const safeBooking = {
      id: bookingSnapshot.id,

      bookingReference:
        stringValue(
          booking.bookingReference
        ),

      status:
        stringValue(booking.status),

      paymentStatus:
        stringValue(
          booking.paymentStatus
        ),

      paymentMethod:
        stringValue(
          booking.paymentMethod
        ),

      paymentReference:
        stringValue(
          booking.paymentReference
        ),

      tripId:
        stringValue(booking.tripId),

      companyId:
        stringValue(
          booking.companyId
        ),

      companyName:
        stringValue(
          booking.companyName
        ),

      routeId:
        stringValue(booking.routeId),

      origin:
        stringValue(booking.origin),

      destination:
        stringValue(
          booking.destination
        ),

      busType:
        stringValue(booking.busType),

      travelDate:
        stringValue(
          booking.travelDate
        ),

      departureAt:
        serializeDate(
          booking.departureAt
        ),

      arrivalAt:
        serializeDate(
          booking.arrivalAt
        ),

      passengerCount:
        numberValue(
          booking.passengerCount
        ),

      passengers,

      seatIds:
        stringArray(
          booking.seatIds
        ),

      seatNumbers:
        stringArray(
          booking.seatNumbers
        ),

      fare:
        numberValue(booking.fare),

      subtotal:
        numberValue(
          booking.subtotal
        ),

      bookingFee:
        numberValue(
          booking.bookingFee
        ),

      totalAmount:
        numberValue(
          booking.totalAmount
        ),

      currency:
        stringValue(
          booking.currency
        ) || "GHS",

      contactEmail:
        stringValue(
          booking.contactEmail
        ),

      contactPhone:
        stringValue(
          booking.contactPhone
        ),

      ticketId:
        ticketId || null,

      ticketNumber:
        ticket
          ? stringValue(
              ticket.ticketNumber
            )
          : stringValue(
              booking.ticketNumber
            ) || null,

      ticketStatus:
        ticket
          ? stringValue(
              ticket.status
            )
          : null,

      paymentId:
        paymentId || null,

      confirmedAt:
        serializeDate(
          booking.confirmedAt
        ),

      paidAt:
        serializeDate(
          booking.paidAt
        ),

      createdAt:
        serializeDate(
          booking.createdAt
        ),

      updatedAt:
        serializeDate(
          booking.updatedAt
        ),
    };

    /* ========================================
       Return Booking
    ======================================== */

    return NextResponse.json(
      {
        booking: safeBooking,
      },
      {
        status: 200,

        headers: {
          "Cache-Control":
            "private, no-store, max-age=0",
        },
      }
    );
  } catch (error) {
    console.error(
      "View booking API error:",
      error
    );

    return errorResponse(
      "We could not load your booking. Please try again.",
      500
    );
  }
}

/* ========================================
   Error Response
======================================== */

function errorResponse(
  message: string,
  status: number
) {
  return NextResponse.json(
    {
      error: message,
    },
    {
      status,

      headers: {
        "Cache-Control":
          "private, no-store, max-age=0",
      },
    }
  );
}

/* ========================================
   String Helper
======================================== */

function stringValue(
  value: unknown
): string {
  return typeof value === "string"
    ? value.trim()
    : "";
}

/* ========================================
   Number Helper
======================================== */

function numberValue(
  value: unknown
): number {
  if (
    typeof value === "number" &&
    Number.isFinite(value)
  ) {
    return value;
  }

  if (
    typeof value === "string"
  ) {
    const parsed =
      Number(value);

    if (
      Number.isFinite(parsed)
    ) {
      return parsed;
    }
  }

  return 0;
}

/* ========================================
   Array Helper
======================================== */

function arrayValue(
  value: unknown
): unknown[] {
  return Array.isArray(value)
    ? value
    : [];
}

/* ========================================
   Object Helper
======================================== */

function objectValue(
  value: unknown
): Record<string, unknown> {
  if (
    value &&
    typeof value === "object" &&
    !Array.isArray(value)
  ) {
    return value as Record<
      string,
      unknown
    >;
  }

  return {};
}

/* ========================================
   String Array Helper
======================================== */

function stringArray(
  value: unknown
): string[] {
  return arrayValue(value)
    .map((item) =>
      stringValue(item)
    )
    .filter(Boolean);
}

/* ========================================
   Firestore Date Serializer
======================================== */

function serializeDate(
  value: unknown
): string | null {
  if (!value) {
    return null;
  }

  if (
    value instanceof Timestamp
  ) {
    return value
      .toDate()
      .toISOString();
  }

  if (
    value instanceof Date
  ) {
    return value.toISOString();
  }

  if (
    typeof value === "string"
  ) {
    const parsed =
      new Date(value);

    if (
      !Number.isNaN(
        parsed.getTime()
      )
    ) {
      return parsed.toISOString();
    }
  }

  if (
    typeof value === "object"
  ) {
    const possibleTimestamp =
      value as {
        toDate?: () => Date;
      };

    if (
      typeof possibleTimestamp.toDate ===
      "function"
    ) {
      try {
        return possibleTimestamp
          .toDate()
          .toISOString();
      } catch {
        return null;
      }
    }
  }

  return null;
}