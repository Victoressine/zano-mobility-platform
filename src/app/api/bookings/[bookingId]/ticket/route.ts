import { NextRequest, NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";

import {
  adminAuth,
  adminDb,
} from "@/lib/firebase/admin";

/* ========================================
   Types
======================================== */

type RouteContext = {
  params: Promise<{
    bookingId: string;
  }>;
};

type PassengerRecord = {
  fullName: string;
  phoneNumber: string;
  seatId: string;
  seatNumber: string;
};

/* ========================================
   GET Digital Ticket
======================================== */

export async function GET(
  request: NextRequest,
  context: RouteContext
) {
  try {
    /* ========================================
       Resolve Booking ID
    ======================================== */

    const { bookingId } = await context.params;

    const normalizedBookingId =
      bookingId?.trim();

    if (!normalizedBookingId) {
      return errorResponse(
        "Booking information is missing.",
        400
      );
    }

    /* ========================================
       Authenticate Passenger
    ======================================== */

    const authorizationHeader =
      request.headers.get("authorization");

    if (
      !authorizationHeader ||
      !authorizationHeader.startsWith(
        "Bearer "
      )
    ) {
      return errorResponse(
        "Authentication is required.",
        401
      );
    }

    const idToken =
      authorizationHeader
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
       Load Booking
    ======================================== */

    const bookingReference =
      adminDb
        .collection("bookings")
        .doc(normalizedBookingId);

    const bookingSnapshot =
      await bookingReference.get();

    if (!bookingSnapshot.exists) {
      return errorResponse(
        "This booking could not be found.",
        404
      );
    }

    const booking =
      bookingSnapshot.data();

    if (!booking) {
      return errorResponse(
        "This booking could not be loaded.",
        404
      );
    }

    /* ========================================
       Verify Ownership
    ======================================== */

    if (booking.userId !== userId) {
      return errorResponse(
        "You do not have permission to view this ticket.",
        403
      );
    }

    /* ========================================
       Verify Booking Status
    ======================================== */

    if (
      booking.status !== "confirmed"
    ) {
      return errorResponse(
        "A digital ticket is only available for a confirmed booking.",
        409
      );
    }

    if (
      booking.paymentStatus !==
      "successful"
    ) {
      return errorResponse(
        "A successful payment is required before this ticket can be viewed.",
        409
      );
    }

    /* ========================================
       Resolve Ticket
    ======================================== */

    const ticketId =
      stringValue(booking.ticketId);

    if (!ticketId) {
      return errorResponse(
        "No digital ticket is associated with this booking.",
        404
      );
    }

    const ticketReference =
      adminDb
        .collection("tickets")
        .doc(ticketId);

    const ticketSnapshot =
      await ticketReference.get();

    if (!ticketSnapshot.exists) {
      return errorResponse(
        "Your digital ticket could not be found.",
        404
      );
    }

    const ticket =
      ticketSnapshot.data();

    if (!ticket) {
      return errorResponse(
        "Your digital ticket could not be loaded.",
        404
      );
    }

    /* ========================================
       Verify Ticket Relationship
    ======================================== */

    if (
      ticket.bookingId !==
      normalizedBookingId
    ) {
      return errorResponse(
        "The digital ticket does not belong to this booking.",
        409
      );
    }

    if (ticket.userId !== userId) {
      return errorResponse(
        "You do not have permission to view this ticket.",
        403
      );
    }

    /* ========================================
       Verify Ticket Status
    ======================================== */

    if (
      ticket.status !== "valid"
    ) {
      return errorResponse(
        "This digital ticket is no longer valid.",
        409
      );
    }

    if (
      ticket.paymentStatus !==
      "successful"
    ) {
      return errorResponse(
        "The payment associated with this ticket has not been confirmed.",
        409
      );
    }

    /* ========================================
       Validate Payment Relationship
    ======================================== */

    const paymentId =
      stringValue(ticket.paymentId);

    if (!paymentId) {
      return errorResponse(
        "The ticket payment record is missing.",
        409
      );
    }

    const paymentSnapshot =
      await adminDb
        .collection("payments")
        .doc(paymentId)
        .get();

    if (!paymentSnapshot.exists) {
      return errorResponse(
        "The payment associated with this ticket could not be found.",
        404
      );
    }

    const payment =
      paymentSnapshot.data();

    if (!payment) {
      return errorResponse(
        "The ticket payment record could not be loaded.",
        404
      );
    }

    if (
      payment.bookingId !==
      normalizedBookingId ||
      payment.userId !== userId
    ) {
      return errorResponse(
        "The ticket payment information is invalid.",
        409
      );
    }

    if (
      payment.status !== "successful"
    ) {
      return errorResponse(
        "The ticket payment has not been completed successfully.",
        409
      );
    }

    /* ========================================
       Passenger Records
    ======================================== */

    const passengers =
      mapPassengers(ticket.passengers);

    const seatNumbers =
      stringArray(ticket.seatNumbers);

    /* ========================================
       Authoritative Ticket Response
    ======================================== */

    const response = {
      ticket: {
        id: ticketSnapshot.id,

        ticketNumber:
          stringValue(
            ticket.ticketNumber
          ),

        status:
          stringValue(ticket.status),

        bookingId:
          normalizedBookingId,

        bookingReference:
          stringValue(
            ticket.bookingReference
          ),

        paymentId,

        paymentReference:
          stringValue(
            ticket.paymentReference
          ),

        tripId:
          stringValue(ticket.tripId),

        companyId:
          stringValue(
            ticket.companyId
          ),

        companyName:
          stringValue(
            ticket.companyName
          ),

        routeId:
          stringValue(ticket.routeId),

        origin:
          stringValue(ticket.origin),

        destination:
          stringValue(
            ticket.destination
          ),

        busType:
          stringValue(ticket.busType),

        travelDate:
          stringValue(
            ticket.travelDate
          ),

        departureAt:
          timestampToIso(
            ticket.departureAt
          ),

        arrivalAt:
          timestampToIso(
            ticket.arrivalAt
          ),

        passengerCount:
          numberValue(
            ticket.passengerCount
          ),

        passengers,

        seatNumbers,

        fare:
          numberValue(ticket.fare),

        subtotal:
          numberValue(
            ticket.subtotal
          ),

        bookingFee:
          numberValue(
            ticket.bookingFee
          ),

        totalAmount:
          numberValue(
            ticket.totalAmount
          ),

        currency:
          stringValue(
            ticket.currency
          ) || "GHS",

        paymentStatus:
          stringValue(
            ticket.paymentStatus
          ),

        issuedAt:
          timestampToIso(
            ticket.issuedAt
          ),
      },

      /* ========================================
         QR Payload

         The QR intentionally contains a stable,
         non-sensitive verification payload.
      ======================================== */

      qrPayload: JSON.stringify({
        type: "zano-ticket",
        ticketId:
          ticketSnapshot.id,
        ticketNumber:
          stringValue(
            ticket.ticketNumber
          ),
        bookingReference:
          stringValue(
            ticket.bookingReference
          ),
        tripId:
          stringValue(ticket.tripId),
        travelDate:
          stringValue(
            ticket.travelDate
          ),
        status:
          stringValue(ticket.status),
      }),
    };

    return NextResponse.json(
      response,
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
      "Digital ticket API error:",
      error
    );

    return errorResponse(
      "We could not load your digital ticket. Please try again.",
      500
    );
  }
}

/* ========================================
   Passenger Mapper
======================================== */

function mapPassengers(
  value: unknown
): PassengerRecord[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((passenger) => {
    const record =
      isRecord(passenger)
        ? passenger
        : {};

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
  });
}

/* ========================================
   String Array Helper
======================================== */

function stringArray(
  value: unknown
): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(
    (
      item
    ): item is string =>
      typeof item === "string"
  );
}

/* ========================================
   String Helper
======================================== */

function stringValue(
  value: unknown
): string {
  return typeof value === "string"
    ? value
    : "";
}

/* ========================================
   Number Helper
======================================== */

function numberValue(
  value: unknown
): number {
  const parsed = Number(value);

  return Number.isFinite(parsed)
    ? parsed
    : 0;
}

/* ========================================
   Object Helper
======================================== */

function isRecord(
  value: unknown
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

/* ========================================
   Firestore Timestamp → ISO
======================================== */

function timestampToIso(
  value: unknown
): string | null {
  if (
    value instanceof Timestamp
  ) {
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
    const date = new Date(value);

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
      const date = (
        value as {
          toDate: () => Date;
        }
      ).toDate();

      return Number.isNaN(
        date.getTime()
      )
        ? null
        : date.toISOString();
    } catch {
      return null;
    }
  }

  return null;
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