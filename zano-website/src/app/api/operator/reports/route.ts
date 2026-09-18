// ========================================
// Zano - Operator Reports API
// Secure server-side company reporting
// ========================================

import "server-only";

import { NextRequest, NextResponse } from "next/server";

import {
  adminAuth,
  adminDb,
} from "@/lib/firebase/admin";

// ========================================
// Types
// ========================================

type BookingPassenger = {
  fullName?: string;
  phoneNumber?: string;
  seatId?: string;
  seatNumber?: string;
};

type BookingRecord = {
  id: string;

  bookingReference?: string;

  userId?: string;
  tripId?: string;

  companyId?: string;
  companyName?: string;

  routeId?: string;
  origin?: string;
  destination?: string;
  busType?: string;

  travelDate?: string;

  passengerCount?: number;
  passengers?: BookingPassenger[];

  seatIds?: string[];
  seatNumbers?: string[];

  fare?: number;
  subtotal?: number;
  bookingFee?: number;
  totalAmount?: number;

  currency?: string;

  status?: string;
  paymentStatus?: string;

  contactEmail?: string;
  contactPhone?: string;

  createdAt?: string | null;
};

// ========================================
// GET /api/operator/reports
// ========================================

export async function GET(
  request: NextRequest,
) {
  try {
    // ========================================
    // 1. Verify Firebase ID Token
    // ========================================

    const authorization =
      request.headers.get(
        "authorization",
      );

    if (
      !authorization ||
      !authorization.startsWith(
        "Bearer ",
      )
    ) {
      return errorResponse(
        "Authentication is required.",
        401,
      );
    }

    const idToken =
      authorization
        .slice(7)
        .trim();

    if (!idToken) {
      return errorResponse(
        "Authentication token is missing.",
        401,
      );
    }

    let decodedToken;

    try {
      decodedToken =
        await adminAuth.verifyIdToken(
          idToken,
        );
    } catch {
      return errorResponse(
        "Your session is invalid or has expired.",
        401,
      );
    }

    const userId =
      decodedToken.uid;

    // ========================================
    // 2. Verify Operator User
    // ========================================

    const userSnapshot =
      await adminDb
        .collection("users")
        .doc(userId)
        .get();

    if (!userSnapshot.exists) {
      return errorResponse(
        "Operator account was not found.",
        403,
      );
    }

    const userData =
      userSnapshot.data();

    if (
      userData?.role !==
      "operator"
    ) {
      return errorResponse(
        "Operator access is required.",
        403,
      );
    }

    // ========================================
    // 3. Verify Active Membership
    // ========================================

    const membershipSnapshot =
      await adminDb
        .collection(
          "operatorMembers",
        )
        .doc(userId)
        .get();

    if (
      !membershipSnapshot.exists
    ) {
      return errorResponse(
        "Operator membership was not found.",
        403,
      );
    }

    const membership =
      membershipSnapshot.data();

    const companyId =
      typeof membership?.companyId ===
      "string"
        ? membership.companyId.trim()
        : "";

    if (
      membership?.status !==
        "active" ||
      !companyId
    ) {
      return errorResponse(
        "Your operator membership is not active.",
        403,
      );
    }

    // ========================================
    // 4. Load Assigned Company
    // ========================================

    const companySnapshot =
      await adminDb
        .collection("companies")
        .doc(companyId)
        .get();

    if (
      !companySnapshot.exists
    ) {
      return errorResponse(
        "Assigned transport company was not found.",
        404,
      );
    }

    const companyData =
      companySnapshot.data();

    const companyName =
      typeof companyData?.name ===
      "string"
        ? companyData.name
        : "Transport Company";

    // ========================================
    // 5. Load Company Trips
    // ========================================

    const tripsSnapshot =
      await adminDb
        .collection("trips")
        .where(
          "companyId",
          "==",
          companyId,
        )
        .get();

    const tripIds =
      new Set(
        tripsSnapshot.docs.map(
          (document) =>
            document.id,
        ),
      );

    // ========================================
    // 6. Load Company Bookings
    //
    // New bookings contain companyId.
    // Historical bookings can also be
    // recognised by their company trip.
    // ========================================

    const bookingsByCompany =
      await adminDb
        .collection("bookings")
        .where(
          "companyId",
          "==",
          companyId,
        )
        .get();

    const bookingMap =
      new Map<
        string,
        BookingRecord
      >();

    for (
      const bookingDocument of
      bookingsByCompany.docs
    ) {
      const booking =
        serializeBooking(
          bookingDocument.id,
          bookingDocument.data(),
        );

      bookingMap.set(
        booking.id,
        booking,
      );
    }

    // ========================================
    // Historical Booking Compatibility
    //
    // Only perform trip-based lookups for
    // the authenticated company's trips.
    // ========================================

    for (
      const tripId of tripIds
    ) {
      const historicalSnapshot =
        await adminDb
          .collection(
            "bookings",
          )
          .where(
            "tripId",
            "==",
            tripId,
          )
          .get();

      for (
        const bookingDocument of
        historicalSnapshot.docs
      ) {
        if (
          bookingMap.has(
            bookingDocument.id,
          )
        ) {
          continue;
        }

        const booking =
          serializeBooking(
            bookingDocument.id,
            bookingDocument.data(),
          );

        bookingMap.set(
          booking.id,
          booking,
        );
      }
    }

    const bookings =
      Array.from(
        bookingMap.values(),
      );

    // ========================================
    // 7. Return Sanitized Report Data
    // ========================================

    return NextResponse.json(
      {
        success: true,

        company: {
          id: companyId,
          name: companyName,
        },

        trips: tripsSnapshot.docs.map(
          (tripDocument) => {
            const trip =
              tripDocument.data();

            return {
              id:
                tripDocument.id,

              companyId:
                trip.companyId ??
                companyId,

              companyName:
                trip.companyName ??
                companyName,

              origin:
                trip.origin ?? "",

              destination:
                trip.destination ??
                "",

              busType:
                trip.busType ?? "",

              departureTime:
                trip.departureTime ??
                "",

              arrivalTime:
                trip.arrivalTime ??
                "",

              fare:
                numberOrZero(
                  trip.fare,
                ),

              totalSeats:
                numberOrZero(
                  trip.totalSeats,
                ),

              availableSeats:
                numberOrZero(
                  trip.availableSeats,
                ),

              status:
                trip.status ?? "",
            };
          },
        ),

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
      "Operator reports API error:",
      error,
    );

    return errorResponse(
      "Unable to load operator reports.",
      500,
    );
  }
}

// ========================================
// Booking Serializer
// ========================================

function serializeBooking(
  id: string,
  data: FirebaseFirestore.DocumentData,
): BookingRecord {
  return {
    id,

    bookingReference:
      stringOrUndefined(
        data.bookingReference,
      ),

    userId:
      stringOrUndefined(
        data.userId,
      ),

    tripId:
      stringOrUndefined(
        data.tripId,
      ),

    companyId:
      stringOrUndefined(
        data.companyId,
      ),

    companyName:
      stringOrUndefined(
        data.companyName,
      ),

    routeId:
      stringOrUndefined(
        data.routeId,
      ),

    origin:
      stringOrUndefined(
        data.origin,
      ),

    destination:
      stringOrUndefined(
        data.destination,
      ),

    busType:
      stringOrUndefined(
        data.busType,
      ),

    travelDate:
      stringOrUndefined(
        data.travelDate,
      ),

    passengerCount:
      numberOrZero(
        data.passengerCount,
      ),

    passengers:
      Array.isArray(
        data.passengers,
      )
        ? data.passengers.map(
            (passenger) => ({
              fullName:
                stringOrUndefined(
                  passenger?.fullName,
                ),

              phoneNumber:
                stringOrUndefined(
                  passenger?.phoneNumber,
                ),

              seatId:
                stringOrUndefined(
                  passenger?.seatId,
                ),

              seatNumber:
                stringOrUndefined(
                  passenger?.seatNumber,
                ),
            }),
          )
        : [],

    seatIds:
      stringArray(
        data.seatIds,
      ),

    seatNumbers:
      stringArray(
        data.seatNumbers,
      ),

    fare:
      numberOrZero(
        data.fare,
      ),

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
      stringOrUndefined(
        data.currency,
      ),

    status:
      stringOrUndefined(
        data.status,
      ),

    paymentStatus:
      stringOrUndefined(
        data.paymentStatus,
      ),

    contactEmail:
      stringOrUndefined(
        data.contactEmail,
      ),

    contactPhone:
      stringOrUndefined(
        data.contactPhone,
      ),

    createdAt:
      timestampToIso(
        data.createdAt,
      ),
  };
}

// ========================================
// Value Helpers
// ========================================

function stringOrUndefined(
  value: unknown,
): string | undefined {
  return typeof value ===
    "string"
    ? value
    : undefined;
}

function numberOrZero(
  value: unknown,
): number {
  const number =
    Number(value);

  return Number.isFinite(
    number,
  )
    ? number
    : 0;
}

function stringArray(
  value: unknown,
): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(
    (
      item,
    ): item is string =>
      typeof item ===
      "string",
  );
}

function timestampToIso(
  value: unknown,
): string | null {
  if (!value) {
    return null;
  }

  if (
    typeof value ===
      "object" &&
    value !== null &&
    "toDate" in value &&
    typeof (
      value as {
        toDate?: unknown;
      }
    ).toDate ===
      "function"
  ) {
    return (
      value as {
        toDate: () => Date;
      }
    )
      .toDate()
      .toISOString();
  }

  if (
    value instanceof Date
  ) {
    return value.toISOString();
  }

  if (
    typeof value ===
    "string"
  ) {
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