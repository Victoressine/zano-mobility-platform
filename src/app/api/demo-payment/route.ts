import { NextRequest, NextResponse } from "next/server";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebase/admin";

// ========================================
// Types
// ========================================

type PassengerInput = {
  seatId?: unknown;
  fullName?: unknown;
  phoneNumber?: unknown;
};

type DemoPaymentRequest = {
  tripId?: unknown;
  travelDate?: unknown;
  passengers?: unknown;
};

type TripData = {
  origin?: string;
  destination?: string;
  companyId?: string;
  companyName?: string;
  routeId?: string;
  busType?: string;
  fare?: number;
  status?: string;

  departureAt?: unknown;
  arrivalAt?: unknown;

  totalSeats?: number;
  availableSeats?: number;

  scheduleType?: "daily" | "fixed";
  departureTime?: string;
  arrivalTime?: string;
  bookingEnabled?: boolean;
  bookingWindowDays?: number;
  operatingDays?: string[];
  inventoryType?: string;
};

type SeatData = {
  tripId?: string;
  seatNumber?: string;
  status?: string;
  price?: number;
  isSeatTemplate?: boolean;
};

type SanitizedPassenger = {
  seatId: string;
  fullName: string;
  phoneNumber: string;
};

type ResolvedJourney = {
  travelDate: string;
  departureAt: Timestamp;
  arrivalAt: Timestamp;
  isDateBasedInventory: boolean;
};

// ========================================
// Constants
// ========================================

const MAX_PASSENGERS = 10;
const CURRENCY = "GHS";
const DEFAULT_BOOKING_WINDOW_DAYS = 90;

// Zano currently operates with Ghana-local schedule times.
// Ghana is UTC+0 year-round, so recurring schedule timestamps
// are constructed explicitly in UTC.
const DAY_NAMES = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;

// ========================================
// POST /api/demo-payment
// ========================================

export async function POST(request: NextRequest) {
  try {
    // ========================================
    // Authenticate Passenger
    // ========================================

    const authorization = request.headers.get("authorization");

    if (!authorization?.startsWith("Bearer ")) {
      return errorResponse("Authentication is required.", 401);
    }

    const idToken = authorization.slice("Bearer ".length).trim();

    if (!idToken) {
      return errorResponse("Authentication is required.", 401);
    }

    let userId = "";

    try {
      const decodedToken = await adminAuth.verifyIdToken(idToken);
      userId = decodedToken.uid;
    } catch {
      return errorResponse(
        "Your session is invalid or has expired. Please sign in again.",
        401,
      );
    }

    // ========================================
    // Parse Request
    // ========================================

    let body: DemoPaymentRequest;

    try {
      body = (await request.json()) as DemoPaymentRequest;
    } catch {
      return errorResponse("The payment request is invalid.", 400);
    }

    const tripId =
      typeof body.tripId === "string" ? body.tripId.trim() : "";

    const requestedTravelDate =
      typeof body.travelDate === "string" ? body.travelDate.trim() : "";

    if (!tripId) {
      return errorResponse("Trip information is required.", 400);
    }

    // ========================================
    // Validate Passenger Payload
    // ========================================

    let passengers: SanitizedPassenger[];

    try {
      if (!Array.isArray(body.passengers)) {
        throw new RequestValidationError(
          "Passenger information is required.",
        );
      }

      if (
        body.passengers.length < 1 ||
        body.passengers.length > MAX_PASSENGERS
      ) {
        throw new RequestValidationError(
          `A booking must contain between 1 and ${MAX_PASSENGERS} passengers.`,
        );
      }

      passengers = body.passengers.map((value, index) => {
        if (!value || typeof value !== "object") {
          throw new RequestValidationError(
            `Passenger ${index + 1} has invalid information.`,
          );
        }

        const passenger = value as PassengerInput;

        const seatId =
          typeof passenger.seatId === "string"
            ? passenger.seatId.trim()
            : "";

        const fullName =
          typeof passenger.fullName === "string"
            ? passenger.fullName.trim()
            : "";

        const phoneNumber =
          typeof passenger.phoneNumber === "string"
            ? passenger.phoneNumber.trim()
            : "";

        if (!seatId) {
          throw new RequestValidationError(
            `Seat information is required for Passenger ${index + 1}.`,
          );
        }

        if (!fullName) {
          throw new RequestValidationError(
            `Full name is required for Passenger ${index + 1}.`,
          );
        }

        if (index === 0 && !phoneNumber) {
          throw new RequestValidationError(
            "Phone number is required for the primary passenger.",
          );
        }

        return {
          seatId,
          fullName,
          phoneNumber,
        };
      });
    } catch (error) {
      if (error instanceof RequestValidationError) {
        return errorResponse(error.message, 400);
      }

      throw error;
    }

    // ========================================
    // Prevent Duplicate Seats
    // ========================================

    const seatIds = passengers.map((passenger) => passenger.seatId);
    const uniqueSeatIds = new Set(seatIds);

    if (uniqueSeatIds.size !== seatIds.length) {
      return errorResponse(
        "The same seat cannot be assigned to multiple passengers.",
        400,
      );
    }

    // ========================================
    // Firestore References
    // ========================================

    const userReference = adminDb.collection("users").doc(userId);
    const tripReference = adminDb.collection("trips").doc(tripId);

    const bookingReference = adminDb.collection("bookings").doc();
    const paymentReference = adminDb.collection("payments").doc();
    const ticketReference = adminDb.collection("tickets").doc();

    const seatReferences = seatIds.map((seatId) =>
      adminDb.collection("seats").doc(seatId),
    );

    // ========================================
    // Booking + Payment + Ticket Transaction
    // ========================================

    const result = await adminDb.runTransaction(async (transaction) => {
      /*
       * IMPORTANT:
       * Every transaction read happens before any transaction write.
       * This is required by Firestore and also makes seat locking atomic.
       */

      // ========================================
      // Read Account, Trip, Seat Templates
      // ========================================

      const userSnapshot = await transaction.get(userReference);
      const tripSnapshot = await transaction.get(tripReference);

      const seatSnapshots = await Promise.all(
        seatReferences.map((seatReference) =>
          transaction.get(seatReference),
        ),
      );

      // ========================================
      // Validate Passenger Account
      // ========================================

      if (!userSnapshot.exists) {
        throw new ApiError(
          "Your Zano passenger profile could not be found.",
          404,
        );
      }

      const userData = userSnapshot.data();

      if (userData?.role !== "passenger") {
        throw new ApiError(
          "Only passenger accounts can create bookings.",
          403,
        );
      }

      const accountEmail =
        typeof userData?.email === "string" ? userData.email.trim() : "";

      // ========================================
      // Validate Trip
      // ========================================

      if (!tripSnapshot.exists) {
        throw new ApiError("This trip could not be found.", 404);
      }

      const trip = tripSnapshot.data() as TripData;

      if (trip.status !== "scheduled") {
        throw new ApiError(
          "This trip is no longer available for booking.",
          409,
        );
      }

      if (trip.bookingEnabled === false) {
        throw new ApiError(
          "Booking is currently disabled for this trip.",
          409,
        );
      }

      // ========================================
      // Resolve Authoritative Journey Date
      // ========================================

      const journey = resolveJourney(trip, requestedTravelDate);

      // ========================================
      // Validate Fare
      // ========================================

      const fare = Number(trip.fare);

      if (!Number.isFinite(fare) || fare < 0) {
        throw new ApiError("The trip fare is invalid.", 409);
      }

      // ========================================
      // Validate Seat Templates
      // ========================================

      const seatNumbers: string[] = [];

      seatSnapshots.forEach((seatSnapshot, index) => {
        if (!seatSnapshot.exists) {
          throw new ApiError(
            "One of the selected seats no longer exists.",
            409,
          );
        }

        const seat = seatSnapshot.data() as SeatData;

        if (seat.tripId !== tripId) {
          throw new ApiError(
            "One of the selected seats does not belong to this trip.",
            409,
          );
        }

        if (
          typeof seat.seatNumber !== "string" ||
          !seat.seatNumber.trim()
        ) {
          throw new ApiError(
            "One of the selected seats has invalid seat information.",
            409,
          );
        }

        /*
         * For recurring/date-based trips, the seat document is a template.
         * Its historical template status must NOT determine availability
         * for every future travel date.
         *
         * Fixed trips still use the seat document status directly.
         */
        if (
          !journey.isDateBasedInventory &&
          seat.status !== "available"
        ) {
          throw new ApiError(
            `Seat ${seat.seatNumber.trim()} is no longer available.`,
            409,
          );
        }

        seatNumbers.push(seat.seatNumber.trim());
      });

      // ========================================
      // Date-Specific Seat Inventory
      // ========================================

      const inventoryReferences = journey.isDateBasedInventory
        ? seatIds.map((seatId) =>
            adminDb
              .collection("tripSeatInventory")
              .doc(createInventoryId(tripId, journey.travelDate, seatId)),
          )
        : [];

      /*
       * These reads occur before any writes.
       * A deterministic inventory document ID provides one authoritative
       * lock for trip + travelDate + seat.
       */
      const inventorySnapshots = journey.isDateBasedInventory
        ? await Promise.all(
            inventoryReferences.map((inventoryReference) =>
              transaction.get(inventoryReference),
            ),
          )
        : [];

      if (journey.isDateBasedInventory) {
        inventorySnapshots.forEach((inventorySnapshot, index) => {
          if (!inventorySnapshot.exists) {
            return;
          }

          const inventory = inventorySnapshot.data();
          const status =
            typeof inventory?.status === "string"
              ? inventory.status
              : "booked";

          if (
            status === "booked" ||
            status === "reserved" ||
            status === "unavailable"
          ) {
            throw new ApiError(
              `Seat ${seatNumbers[index]} is no longer available for ${journey.travelDate}.`,
              409,
            );
          }
        });
      }

      // ========================================
      // Fixed Trip Availability
      // ========================================

      let availableSeats: number | null = null;

      if (!journey.isDateBasedInventory) {
        availableSeats = Number(trip.availableSeats);

        if (
          !Number.isInteger(availableSeats) ||
          availableSeats < 0
        ) {
          throw new ApiError(
            "The trip has invalid seat availability.",
            409,
          );
        }

        if (availableSeats < passengers.length) {
          throw new ApiError(
            "There are not enough seats available for this booking.",
            409,
          );
        }
      }

      // ========================================
      // Server-Side Amount Calculation
      // ========================================

      const passengerCount = passengers.length;
      const subtotal = fare * passengerCount;
      const bookingFee = 0;
      const totalAmount = subtotal + bookingFee;

      if (!Number.isFinite(totalAmount) || totalAmount < 0) {
        throw new ApiError(
          "The booking amount could not be calculated.",
          409,
        );
      }

      // ========================================
      // IDs + Public References
      // ========================================

      const bookingId = bookingReference.id;
      const paymentId = paymentReference.id;
      const ticketId = ticketReference.id;

      const bookingCode = createBookingReference(bookingId);
      const demoPaymentCode = createPaymentReference(paymentId);
      const ticketNumber = createTicketNumber(ticketId);

      const serverTimestamp = FieldValue.serverTimestamp();

      // ========================================
      // Passenger Records
      // ========================================

      const passengerRecords = passengers.map((passenger, index) => ({
        fullName: passenger.fullName,
        phoneNumber: passenger.phoneNumber,
        seatId: passenger.seatId,
        seatNumber: seatNumbers[index],
      }));

      // ========================================
      // Create Booking
      // ========================================

      transaction.set(bookingReference, {
        bookingReference: bookingCode,

        userId,
        tripId,

        companyId: trip.companyId ?? "",
        companyName: trip.companyName ?? "",
        routeId: trip.routeId ?? "",

        origin: trip.origin ?? "",
        destination: trip.destination ?? "",
        busType: trip.busType ?? "",

        scheduleType: trip.scheduleType ?? "fixed",
        inventoryType: journey.isDateBasedInventory
          ? "date-based"
          : "fixed",

        travelDate: journey.travelDate,
        departureAt: journey.departureAt,
        arrivalAt: journey.arrivalAt,

        passengerCount,
        passengers: passengerRecords,

        seatIds,
        seatNumbers,

        fare,
        subtotal,
        bookingFee,
        totalAmount,
        currency: CURRENCY,

        status: "confirmed",
        paymentStatus: "successful",
        paymentMethod: "demo",

        paymentId,
        paymentReference: demoPaymentCode,

        ticketId,
        ticketNumber,

        contactEmail: accountEmail,
        contactPhone: passengers[0].phoneNumber,

        confirmedAt: serverTimestamp,
        paidAt: serverTimestamp,
        createdAt: serverTimestamp,
        updatedAt: serverTimestamp,
      });

      // ========================================
      // Create Demo Payment
      // ========================================

      transaction.set(paymentReference, {
        bookingId,
        bookingReference: bookingCode,

        userId,
        tripId,

        travelDate: journey.travelDate,
        departureAt: journey.departureAt,

        reference: demoPaymentCode,

        provider: "demo",
        method: "demo",

        amount: totalAmount,
        currency: CURRENCY,

        status: "successful",
        isDemo: true,

        paidAt: serverTimestamp,
        createdAt: serverTimestamp,
        updatedAt: serverTimestamp,
      });

      // ========================================
      // Create Digital Ticket
      // ========================================

      transaction.set(ticketReference, {
        ticketNumber,

        bookingId,
        bookingReference: bookingCode,

        paymentId,
        paymentReference: demoPaymentCode,

        userId,
        tripId,

        companyId: trip.companyId ?? "",
        companyName: trip.companyName ?? "",
        routeId: trip.routeId ?? "",

        origin: trip.origin ?? "",
        destination: trip.destination ?? "",
        busType: trip.busType ?? "",

        travelDate: journey.travelDate,
        departureAt: journey.departureAt,
        arrivalAt: journey.arrivalAt,

        passengerCount,
        passengers: passengerRecords,

        seatIds,
        seatNumbers,

        fare,
        subtotal,
        bookingFee,
        totalAmount,
        currency: CURRENCY,

        status: "valid",
        paymentStatus: "successful",

        issuedAt: serverTimestamp,
        createdAt: serverTimestamp,
        updatedAt: serverTimestamp,
      });

      // ========================================
      // Book Date-Specific Seats
      // ========================================

      if (journey.isDateBasedInventory) {
        inventoryReferences.forEach((inventoryReference, index) => {
          transaction.set(inventoryReference, {
            tripId,
            travelDate: journey.travelDate,

            seatId: seatIds[index],
            seatNumber: seatNumbers[index],

            status: "booked",

            bookingId,
            bookingReference: bookingCode,

            bookedBy: userId,
            passengerName: passengers[index].fullName,

            departureAt: journey.departureAt,

            bookedAt: serverTimestamp,
            createdAt: serverTimestamp,
            updatedAt: serverTimestamp,
          });
        });
      } else {
        // ========================================
        // Book Fixed-Trip Seats
        // ========================================

        seatReferences.forEach((seatReference, index) => {
          transaction.update(seatReference, {
            status: "booked",
            bookedBy: userId,
            bookingId,
            bookedAt: serverTimestamp,
            updatedAt: serverTimestamp,
            passengerName: passengers[index].fullName,
          });
        });

        transaction.update(tripReference, {
          availableSeats:
            (availableSeats as number) - passengerCount,
          updatedAt: serverTimestamp,
        });
      }

      // ========================================
      // Transaction Result
      // ========================================

      return {
        bookingId,
        bookingReference: bookingCode,

        paymentId,
        paymentReference: demoPaymentCode,

        ticketId,
        ticketNumber,

        status: "confirmed",
        paymentStatus: "successful",

        travelDate: journey.travelDate,
        departureAt: journey.departureAt.toDate().toISOString(),
        arrivalAt: journey.arrivalAt.toDate().toISOString(),

        passengerCount,
        seatNumbers,

        fare,
        subtotal,
        bookingFee,
        totalAmount,

        currency: CURRENCY,
      };
    });

    // ========================================
    // Successful Response
    // ========================================

    return NextResponse.json(
      {
        success: true,
        booking: result,
      },
      {
        status: 201,
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    if (error instanceof RequestValidationError) {
      return errorResponse(error.message, 400);
    }

    if (error instanceof ApiError) {
      return errorResponse(error.message, error.status);
    }

    console.error("Demo payment API error:", error);

    return errorResponse(
      "We could not complete your demo payment. Please try again.",
      500,
    );
  }
}

// ========================================
// Resolve Journey
// ========================================

function resolveJourney(
  trip: TripData,
  requestedTravelDate: string,
): ResolvedJourney {
  const isDailyTrip = trip.scheduleType === "daily";

  const isDateBasedInventory =
    isDailyTrip || trip.inventoryType === "date-based";

  // ========================================
  // Daily / Recurring Trip
  // ========================================

  if (isDailyTrip) {
    if (!isValidTravelDate(requestedTravelDate)) {
      throw new ApiError(
        "A valid travel date is required for this booking.",
        400,
      );
    }

    if (
      typeof trip.departureTime !== "string" ||
      !trip.departureTime.trim() ||
      typeof trip.arrivalTime !== "string" ||
      !trip.arrivalTime.trim()
    ) {
      throw new ApiError(
        "This trip does not have a complete daily schedule.",
        409,
      );
    }

    const operatingDay = getOperatingDay(requestedTravelDate);

    const operatingDays = Array.isArray(trip.operatingDays)
      ? trip.operatingDays
          .filter((day): day is string => typeof day === "string")
          .map((day) => day.trim().toLowerCase())
      : [];

    if (
      operatingDays.length > 0 &&
      !operatingDays.includes(operatingDay)
    ) {
      throw new ApiError(
        "This trip does not operate on the selected date.",
        409,
      );
    }

    const departureAt = createGhanaTimestamp(
      requestedTravelDate,
      trip.departureTime,
    );

    let arrivalAt = createGhanaTimestamp(
      requestedTravelDate,
      trip.arrivalTime,
    );

    if (!departureAt || !arrivalAt) {
      throw new ApiError(
        "This trip has an invalid recurring schedule.",
        409,
      );
    }

    // Arrival earlier than/equal to departure means next day.
    if (arrivalAt.toMillis() <= departureAt.toMillis()) {
      arrivalAt = Timestamp.fromMillis(
        arrivalAt.toMillis() + 24 * 60 * 60 * 1000,
      );
    }

    if (departureAt.toMillis() <= Date.now()) {
      throw new ApiError(
        "This journey has already departed. Please choose another date.",
        409,
      );
    }

    const bookingWindowDays =
      Number.isInteger(trip.bookingWindowDays) &&
      Number(trip.bookingWindowDays) > 0
        ? Number(trip.bookingWindowDays)
        : DEFAULT_BOOKING_WINDOW_DAYS;

    const latestAllowedDeparture =
      Date.now() + bookingWindowDays * 24 * 60 * 60 * 1000;

    if (departureAt.toMillis() > latestAllowedDeparture) {
      throw new ApiError(
        `Bookings are available up to ${bookingWindowDays} days in advance.`,
        409,
      );
    }

    return {
      travelDate: requestedTravelDate,
      departureAt,
      arrivalAt,
      isDateBasedInventory,
    };
  }

  // ========================================
  // Fixed Trip
  // ========================================

  const departureMilliseconds = getTimestampMilliseconds(
    trip.departureAt,
  );

  const arrivalMilliseconds = getTimestampMilliseconds(
    trip.arrivalAt,
  );

  if (
    departureMilliseconds === null ||
    arrivalMilliseconds === null
  ) {
    throw new ApiError(
      "This trip has an invalid departure or arrival time.",
      409,
    );
  }

  if (departureMilliseconds <= Date.now()) {
    throw new ApiError(
      "This trip has already departed or has an invalid departure time.",
      409,
    );
  }

  const departureAt = Timestamp.fromMillis(departureMilliseconds);
  const arrivalAt = Timestamp.fromMillis(arrivalMilliseconds);

  const fixedTravelDate = formatGhanaDate(departureAt.toDate());

  if (
    requestedTravelDate &&
    requestedTravelDate !== fixedTravelDate
  ) {
    throw new ApiError(
      "The selected travel date does not match this trip.",
      409,
    );
  }

  return {
    travelDate: fixedTravelDate,
    departureAt,
    arrivalAt,
    isDateBasedInventory: false,
  };
}

// ========================================
// Ghana Date/Time Helpers
// ========================================

function isValidTravelDate(value: string): boolean {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (!match) {
    return false;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  const date = new Date(
    Date.UTC(year, month - 1, day, 12, 0, 0, 0),
  );

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function createGhanaTimestamp(
  travelDate: string,
  time: string,
): Timestamp | null {
  if (!isValidTravelDate(travelDate)) {
    return null;
  }

  const timeMatch = time.trim().match(/^(\d{2}):(\d{2})$/);

  if (!timeMatch) {
    return null;
  }

  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);

  if (
    !Number.isInteger(hour) ||
    !Number.isInteger(minute) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return null;
  }

  const [year, month, day] = travelDate.split("-").map(Number);

  const milliseconds = Date.UTC(
    year,
    month - 1,
    day,
    hour,
    minute,
    0,
    0,
  );

  const date = new Date(milliseconds);

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day ||
    date.getUTCHours() !== hour ||
    date.getUTCMinutes() !== minute
  ) {
    return null;
  }

  return Timestamp.fromMillis(milliseconds);
}

function getOperatingDay(travelDate: string): string {
  const [year, month, day] = travelDate.split("-").map(Number);

  const date = new Date(
    Date.UTC(year, month - 1, day, 12, 0, 0, 0),
  );

  return DAY_NAMES[date.getUTCDay()];
}

function formatGhanaDate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

// ========================================
// Date-Specific Inventory ID
// ========================================

function createInventoryId(
  tripId: string,
  travelDate: string,
  seatId: string,
): string {
  /*
   * Firestore auto IDs/seat IDs do not contain "/".
   * We still sanitize all components so the generated document ID
   * cannot accidentally create an invalid document path.
   */
  const safeTripId = sanitizeDocumentIdPart(tripId);
  const safeTravelDate = sanitizeDocumentIdPart(travelDate);
  const safeSeatId = sanitizeDocumentIdPart(seatId);

  return `${safeTripId}__${safeTravelDate}__${safeSeatId}`;
}

function sanitizeDocumentIdPart(value: string): string {
  const sanitized = value
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, "_");

  if (!sanitized) {
    throw new ApiError(
      "A valid seat inventory reference could not be generated.",
      500,
    );
  }

  return sanitized;
}

// ========================================
// API Error
// ========================================

class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

// ========================================
// Request Validation Error
// ========================================

class RequestValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RequestValidationError";
  }
}

// ========================================
// Error Response
// ========================================

function errorResponse(message: string, status: number) {
  return NextResponse.json(
    {
      success: false,
      error: message,
    },
    {
      status,
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}

// ========================================
// Booking Reference
// ========================================

function createBookingReference(bookingId: string) {
  return `ZANO-${sanitizeReferenceId(bookingId, 10)}`;
}

// ========================================
// Demo Payment Reference
// ========================================

function createPaymentReference(paymentId: string) {
  return `ZANO-DEMO-${sanitizeReferenceId(paymentId, 12)}`;
}

// ========================================
// Digital Ticket Number
// ========================================

function createTicketNumber(ticketId: string) {
  return `ZANO-TKT-${sanitizeReferenceId(ticketId, 12)}`;
}

// ========================================
// Reference Sanitizer
// ========================================

function sanitizeReferenceId(value: string, length: number) {
  const sanitized = value
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, length)
    .toUpperCase();

  if (!sanitized) {
    throw new ApiError(
      "A secure transaction reference could not be generated.",
      500,
    );
  }

  return sanitized;
}

// ========================================
// Timestamp Conversion
// ========================================

function getTimestampMilliseconds(value: unknown): number | null {
  if (value instanceof Timestamp) {
    return value.toMillis();
  }

  if (value instanceof Date) {
    const milliseconds = value.getTime();

    return Number.isNaN(milliseconds) ? null : milliseconds;
  }

  if (typeof value === "string") {
    const milliseconds = new Date(value).getTime();

    return Number.isNaN(milliseconds) ? null : milliseconds;
  }

  if (
    value &&
    typeof value === "object" &&
    "toMillis" in value &&
    typeof (value as { toMillis?: unknown }).toMillis === "function"
  ) {
    try {
      return (value as { toMillis: () => number }).toMillis();
    } catch {
      return null;
    }
  }

  return null;
}