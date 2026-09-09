/* ========================================
   Zano - Booking Receipt API
   Server-side only
======================================== */

import {NextRequest, NextResponse} from "next/server";

import {Timestamp} from "firebase-admin/firestore";

import {
  adminAuth,
  adminDb,
} from "@/lib/firebase/admin";

/* ========================================
   Route Types
======================================== */

type RouteContext = {
  params: Promise<{
    bookingId: string;
  }>;
};

/* ========================================
   GET /api/bookings/[bookingId]/receipt
======================================== */

export async function GET(
  request: NextRequest,
  context: RouteContext
) {
  try {
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
        "Authentication token is missing.",
        401
      );
    }

    let decodedToken;

    try {
      decodedToken =
        await adminAuth.verifyIdToken(
          idToken
        );
    } catch {
      return errorResponse(
        "Your session is invalid or has expired.",
        401
      );
    }

    const userId = decodedToken.uid;

    /* ========================================
       Booking ID
    ======================================== */

    const {bookingId: rawBookingId} =
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
       Load Booking
    ======================================== */

    const bookingSnapshot =
      await adminDb
        .collection("bookings")
        .doc(bookingId)
        .get();

    if (!bookingSnapshot.exists) {
      return errorResponse(
        "Booking not found.",
        404
      );
    }

    const booking =
      bookingSnapshot.data();

    if (!booking) {
      return errorResponse(
        "Booking data is unavailable.",
        404
      );
    }

    /* ========================================
       Verify Ownership
    ======================================== */

    if (booking.userId !== userId) {
      return errorResponse(
        "You do not have permission to view this receipt.",
        403
      );
    }

    /* ========================================
       Verify Confirmed Booking
    ======================================== */

    if (
      booking.status !== "confirmed" ||
      booking.paymentStatus !==
        "successful"
    ) {
      return errorResponse(
        "A receipt is only available for a confirmed successful payment.",
        409
      );
    }

    /* ========================================
       Payment ID
    ======================================== */

    const paymentId =
      typeof booking.paymentId === "string"
        ? booking.paymentId.trim()
        : "";

    if (!paymentId) {
      return errorResponse(
        "Payment information is missing from this booking.",
        409
      );
    }

    /* ========================================
       Load Payment
    ======================================== */

    const paymentSnapshot =
      await adminDb
        .collection("payments")
        .doc(paymentId)
        .get();

    if (!paymentSnapshot.exists) {
      return errorResponse(
        "Payment record not found.",
        404
      );
    }

    const payment =
      paymentSnapshot.data();

    if (!payment) {
      return errorResponse(
        "Payment data is unavailable.",
        404
      );
    }

    /* ========================================
       Verify Payment Relationship
    ======================================== */

    if (
      payment.bookingId !== bookingId ||
      payment.userId !== userId
    ) {
      return errorResponse(
        "The payment record does not match this booking.",
        409
      );
    }

    if (payment.status !== "successful") {
      return errorResponse(
        "The payment has not been completed successfully.",
        409
      );
    }

    /* ========================================
       Verify Payment Amount
    ======================================== */

    const bookingAmount =
      Number(booking.totalAmount);

    const paymentAmount =
      Number(payment.amount);

    if (
      !Number.isFinite(bookingAmount) ||
      !Number.isFinite(paymentAmount) ||
      bookingAmount !== paymentAmount
    ) {
      return errorResponse(
        "The booking and payment amounts do not match.",
        409
      );
    }

    const bookingCurrency =
      typeof booking.currency === "string"
        ? booking.currency
        : "GHS";

    const paymentCurrency =
      typeof payment.currency === "string"
        ? payment.currency
        : "";

    if (
      paymentCurrency &&
      bookingCurrency !== paymentCurrency
    ) {
      return errorResponse(
        "The booking and payment currencies do not match.",
        409
      );
    }

    /* ========================================
       Build Authoritative Receipt
    ======================================== */

    const receiptNumber =
      `ZANO-RCP-${paymentId
        .replace(/[^a-zA-Z0-9]/g, "")
        .slice(0, 12)
        .toUpperCase()}`;

    const receipt = {
      receiptNumber,

      bookingId,

      bookingReference:
        stringValue(
          booking.bookingReference
        ),

      paymentId,

      paymentReference:
        stringValue(
          payment.reference
        ),

      /* Journey */

      tripId:
        stringValue(booking.tripId),

      companyName:
        stringValue(
          booking.companyName
        ),

      origin:
        stringValue(booking.origin),

      destination:
        stringValue(
          booking.destination
        ),

      busType:
        stringValue(booking.busType),

      departureAt:
        serializeTimestamp(
          booking.departureAt
        ),

      /* Passenger */

      passengerCount:
        numberValue(
          booking.passengerCount
        ),

      passengers:
        Array.isArray(
          booking.passengers
        )
          ? booking.passengers.map(
              (passenger) => ({
                fullName:
                  stringValue(
                    passenger?.fullName
                  ),

                phoneNumber:
                  stringValue(
                    passenger?.phoneNumber
                  ),

                seatNumber:
                  stringValue(
                    passenger?.seatNumber
                  ),
              })
            )
          : [],

      seatNumbers:
        Array.isArray(
          booking.seatNumbers
        )
          ? booking.seatNumbers.filter(
              (
                seatNumber
              ): seatNumber is string =>
                typeof seatNumber ===
                "string"
            )
          : [],

      /* Contact */

      contactEmail:
        stringValue(
          booking.contactEmail
        ),

      contactPhone:
        stringValue(
          booking.contactPhone
        ),

      /* Amount */

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
        bookingAmount,

      currency:
        bookingCurrency,

      /* Payment */

      paymentMethod:
        stringValue(
          payment.method
        ),

      paymentProvider:
        stringValue(
          payment.provider
        ),

      paymentStatus:
        stringValue(
          payment.status
        ),

      isDemo:
        payment.isDemo === true,

      paidAt:
        serializeTimestamp(
          payment.paidAt
        ),

      /* Booking */

      bookingStatus:
        stringValue(
          booking.status
        ),

      confirmedAt:
        serializeTimestamp(
          booking.confirmedAt
        ),

      createdAt:
        serializeTimestamp(
          booking.createdAt
        ),
    };

    /* ========================================
       Response
    ======================================== */

    return NextResponse.json({
      success: true,
      receipt,
    });
  } catch (error) {
    console.error(
      "Receipt API error:",
      error
    );

    return errorResponse(
      "We could not load this receipt.",
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
      success: false,
      error: message,
    },
    {
      status,
    }
  );
}

/* ========================================
   String Helper
======================================== */

function stringValue(
  value: unknown
) {
  return typeof value === "string"
    ? value
    : "";
}

/* ========================================
   Number Helper
======================================== */

function numberValue(
  value: unknown
) {
  const parsed =
    Number(value);

  return Number.isFinite(parsed)
    ? parsed
    : 0;
}

/* ========================================
   Timestamp Serializer
======================================== */

function serializeTimestamp(
  value: unknown
): string | null {
  if (value instanceof Timestamp) {
    return value
      .toDate()
      .toISOString();
  }

  if (value instanceof Date) {
    return Number.isNaN(
      value.getTime()
    )
      ? null
      : value.toISOString();
  }

  if (
    typeof value === "string"
  ) {
    const date =
      new Date(value);

    return Number.isNaN(
      date.getTime()
    )
      ? null
      : date.toISOString();
  }

  if (
    value &&
    typeof value === "object" &&
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