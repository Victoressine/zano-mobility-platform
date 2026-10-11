import "server-only";

import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  FieldValue,
} from "firebase-admin/firestore";

import {
  adminAuth,
  adminDb,
} from "@/lib/firebase/admin";

// ========================================
// Constants
// ========================================

const ALLOWED_BUS_TYPES = [
  "Standard Coach",
  "Executive Coach",
  "Luxury Coach",
  "Mini Bus",
] as const;

const ALLOWED_LAYOUTS = [
  "2+1",
  "2+2",
] as const;

const ALLOWED_SCHEDULE_TYPES = [
  "daily",
  "weekly",
  "selected-days",
] as const;

const ALLOWED_TRIP_STATUSES = [
  "draft",
  "scheduled",
  "boarding",
  "on_trip",
  "completed",
  "cancelled",
] as const;

type TripStatus =
  (typeof ALLOWED_TRIP_STATUSES)[number];

const TRIP_STATUS_TRANSITIONS: Record<
  TripStatus,
  readonly TripStatus[]
> = {
  draft: [
    "scheduled",
    "cancelled",
  ],

  scheduled: [
    "boarding",
    "cancelled",
  ],

  boarding: [
    "on_trip",
    "cancelled",
  ],

  on_trip: [
    "completed",
  ],

  completed: [],

  cancelled: [],
};

const ALLOWED_VEHICLE_STATUSES = [
  "active",
  "maintenance",
  "inactive",
] as const;

const DAY_NAMES = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;

// ========================================
// Types
// ========================================

type OperatorContext = {
  userId: string;
  companyId: string;
  companyName: string;
};

type TripInput = {
  vehicleName?: string;
  registrationNumber?: string;
  busType?: string;

  seatCapacity?: number;
  seatLayout?: string;

  amenities?: string[];
  vehicleStatus?: string;

  origin?: string;
  destination?: string;

  boardingPoints?: string[];
  dropOffPoint?: string;

  scheduleType?: string;
  operatingDays?: string[];

  departureTime?: string;
  arrivalTime?: string;

  bookingWindowDays?: number;

  fare?: number;

  bookingEnabled?: boolean;
  status?: string;
};

type TripStatusUpdateInput = {
  tripId?: string;
  status?: string;
};

// ========================================
// Authentication
// ========================================

async function getOperatorContext(
  request: NextRequest,
): Promise<OperatorContext> {
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
    throw new ApiError(
      401,
      "Authentication is required.",
    );
  }

  const token =
    authorization
      .slice(7)
      .trim();

  if (!token) {
    throw new ApiError(
      401,
      "Authentication token is missing.",
    );
  }

  let decodedToken;

  try {
    decodedToken =
      await adminAuth.verifyIdToken(
        token,
      );
  } catch {
    throw new ApiError(
      401,
      "Your session is invalid or has expired.",
    );
  }

  const userId =
    decodedToken.uid;

  const [
    userSnapshot,
    membershipSnapshot,
  ] =
    await Promise.all([
      adminDb
        .collection("users")
        .doc(userId)
        .get(),

      adminDb
        .collection(
          "operatorMembers",
        )
        .doc(userId)
        .get(),
    ]);

  if (
    !userSnapshot.exists ||
    userSnapshot.data()?.role !==
      "operator"
  ) {
    throw new ApiError(
      403,
      "Operator access is required.",
    );
  }

  if (
    !membershipSnapshot.exists
  ) {
    throw new ApiError(
      403,
      "Operator membership was not found.",
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
    membership?.userId !== userId ||
    membership?.status !==
      "active" ||
    !companyId
  ) {
    throw new ApiError(
      403,
      "Your operator membership is not active.",
    );
  }

  const companySnapshot =
    await adminDb
      .collection("companies")
      .doc(companyId)
      .get();

  if (
    !companySnapshot.exists
  ) {
    throw new ApiError(
      404,
      "Assigned transport company was not found.",
    );
  }

  return {
    userId,
    companyId,

    companyName:
      typeof companySnapshot.data()
        ?.name === "string"
        ? companySnapshot.data()!
            .name
        : "Transport Company",
  };
}

// ========================================
// GET
// Load Company's Onboarded Trips
// ========================================

export async function GET(
  request: NextRequest,
) {
  try {
    const operator =
      await getOperatorContext(
        request,
      );

    const tripsSnapshot =
      await adminDb
        .collection("trips")
        .where(
          "companyId",
          "==",
          operator.companyId,
        )
        .get();

    const trips =
      tripsSnapshot.docs
        .map((document) => {
          const data =
            document.data();

          return {
            id: document.id,

            companyId:
              operator.companyId,

            companyName:
              data.companyName ??
              operator.companyName,

            vehicleId:
              data.vehicleId ?? "",

            routeId:
              data.routeId ?? "",

            vehicleName:
              data.vehicleName ?? "",

            registrationNumber:
              data.registrationNumber ??
              "",

            busType:
              data.busType ?? "",

            seatCapacity:
              Number(
                data.totalSeats ??
                  data.seatCapacity ??
                  0,
              ),

            seatLayout:
              data.seatLayout ?? "",

            amenities:
              Array.isArray(
                data.amenities,
              )
                ? data.amenities
                : [],

            origin:
              data.origin ?? "",

            destination:
              data.destination ??
              "",

            boardingPoints:
              Array.isArray(
                data.boardingPoints,
              )
                ? data.boardingPoints
                : [],

            dropOffPoint:
              data.dropOffPoint ?? "",

            scheduleType:
              data.scheduleType ??
              "daily",

            operatingDays:
              Array.isArray(
                data.operatingDays,
              )
                ? data.operatingDays
                : [],

            departureTime:
              data.departureTime ?? "",

            arrivalTime:
              data.arrivalTime ?? "",

            bookingWindowDays:
              Number(
                data.bookingWindowDays ??
                  90,
              ),

            fare:
              Number(
                data.fare ?? 0,
              ),

            totalSeats:
              Number(
                data.totalSeats ?? 0,
              ),

            availableSeats:
              Number(
                data.availableSeats ??
                  data.totalSeats ??
                  0,
              ),

            bookingEnabled:
              data.bookingEnabled !==
              false,

            status:
              data.status ??
              "scheduled",
          };
        })
        .sort((a, b) =>
          `${a.origin}${a.destination}${a.departureTime}`.localeCompare(
            `${b.origin}${b.destination}${b.departureTime}`,
          ),
        );

    return NextResponse.json(
      {
        success: true,

        company: {
          id:
            operator.companyId,
          name:
            operator.companyName,
        },

        trips,
      },
      {
        headers: {
          "Cache-Control":
            "private, no-store, max-age=0",
        },
      },
    );
  } catch (error) {
    return handleError(error);
  }
}

// ========================================
// PATCH
// Update Existing Trip Lifecycle Status
// ========================================

export async function PATCH(
  request: NextRequest,
) {
  try {
    const operator =
      await getOperatorContext(
        request,
      );

    let body: TripStatusUpdateInput;

    try {
      body =
        (await request.json()) as
          TripStatusUpdateInput;
    } catch {
      throw new ApiError(
        400,
        "A valid JSON request body is required.",
      );
    }

    const tripId =
      typeof body.tripId === "string"
        ? body.tripId.trim()
        : "";

    const requestedStatus =
      typeof body.status === "string"
        ? body.status
            .trim()
            .toLowerCase()
        : "";

    if (!tripId) {
      throw new ApiError(
        400,
        "Trip ID is required.",
      );
    }

    if (
      !ALLOWED_TRIP_STATUSES.includes(
        requestedStatus as TripStatus,
      )
    ) {
      throw new ApiError(
        400,
        "Select a valid trip status.",
      );
    }

    const nextStatus =
      requestedStatus as TripStatus;

    const tripRef =
      adminDb
        .collection("trips")
        .doc(tripId);

    const updatedTrip =
      await adminDb.runTransaction(
        async (transaction) => {
          const tripSnapshot =
            await transaction.get(
              tripRef,
            );

          if (!tripSnapshot.exists) {
            throw new ApiError(
              404,
              "Trip was not found.",
            );
          }

          const trip =
            tripSnapshot.data()!;

          if (
            trip.companyId !==
            operator.companyId
          ) {
            throw new ApiError(
              403,
              "You cannot manage a trip belonging to another company.",
            );
          }

          const storedStatus =
            typeof trip.status ===
              "string" &&
            ALLOWED_TRIP_STATUSES.includes(
              trip.status as TripStatus,
            )
              ? (trip.status as TripStatus)
              : "scheduled";

          if (
            storedStatus ===
            nextStatus
          ) {
            return {
              id: tripSnapshot.id,
              ...trip,
              status: storedStatus,
            };
          }

          const allowedNextStatuses =
            TRIP_STATUS_TRANSITIONS[
              storedStatus
            ];

          if (
            !allowedNextStatuses.includes(
              nextStatus,
            )
          ) {
            throw new ApiError(
              409,
              `Trip cannot move from ${storedStatus} to ${nextStatus}.`,
            );
          }

          const now =
            FieldValue.serverTimestamp();

          const updateData: Record<
            string,
            unknown
          > = {
            status: nextStatus,
            updatedAt: now,
            statusUpdatedAt: now,
            statusUpdatedBy:
              operator.userId,
          };

          // Publishing a draft makes it
          // available as a scheduled trip.
          if (
            storedStatus === "draft" &&
            nextStatus === "scheduled"
          ) {
            updateData.publishedAt =
              now;
          }

          // Record when passenger
          // boarding officially begins.
          if (
            nextStatus === "boarding"
          ) {
            updateData.boardingStartedAt =
              now;
          }

          // Record the actual trip start.
          if (
            nextStatus === "on_trip"
          ) {
            updateData.tripStartedAt =
              now;
          }

          // Completing a trip closes
          // passenger booking for it.
          if (
            nextStatus === "completed"
          ) {
            updateData.completedAt =
              now;

            updateData.bookingEnabled =
              false;
          }

          // Cancellation also closes
          // passenger booking.
          if (
            nextStatus === "cancelled"
          ) {
            updateData.cancelledAt =
              now;

            updateData.bookingEnabled =
              false;
          }

          transaction.update(
            tripRef,
            updateData,
          );

          return {
            id: tripSnapshot.id,

            companyId:
              operator.companyId,

            companyName:
              trip.companyName ??
              operator.companyName,

            vehicleId:
              trip.vehicleId ?? "",

            routeId:
              trip.routeId ?? "",

            vehicleName:
              trip.vehicleName ?? "",

            registrationNumber:
              trip.registrationNumber ??
              "",

            busType:
              trip.busType ?? "",

            seatCapacity:
              Number(
                trip.totalSeats ??
                  trip.seatCapacity ??
                  0,
              ),

            seatLayout:
              trip.seatLayout ?? "",

            amenities:
              Array.isArray(
                trip.amenities,
              )
                ? trip.amenities
                : [],

            origin:
              trip.origin ?? "",

            destination:
              trip.destination ?? "",

            boardingPoints:
              Array.isArray(
                trip.boardingPoints,
              )
                ? trip.boardingPoints
                : [],

            dropOffPoint:
              trip.dropOffPoint ?? "",

            scheduleType:
              trip.scheduleType ??
              "daily",

            operatingDays:
              Array.isArray(
                trip.operatingDays,
              )
                ? trip.operatingDays
                : [],

            departureTime:
              trip.departureTime ?? "",

            arrivalTime:
              trip.arrivalTime ?? "",

            bookingWindowDays:
              Number(
                trip.bookingWindowDays ??
                  90,
              ),

            fare:
              Number(
                trip.fare ?? 0,
              ),

            totalSeats:
              Number(
                trip.totalSeats ?? 0,
              ),

            availableSeats:
              Number(
                trip.availableSeats ??
                  trip.totalSeats ??
                  0,
              ),

            bookingEnabled:
              nextStatus ===
                "completed" ||
              nextStatus ===
                "cancelled"
                ? false
                : trip.bookingEnabled !==
                  false,

            status:
              nextStatus,
          };
        },
      );

    return NextResponse.json(
      {
        success: true,

        message:
          `Trip status updated to ${nextStatus.replace(
            /_/g,
            " ",
          )}.`,

        trip:
          updatedTrip,
      },
      {
        headers: {
          "Cache-Control":
            "private, no-store, max-age=0",
        },
      },
    );
  } catch (error) {
    return handleError(error);
  }
}

// ========================================
// POST
// Onboard Bus + Route + Trip + Seats
// ========================================

export async function POST(
  request: NextRequest,
) {
  try {
    const operator =
      await getOperatorContext(
        request,
      );

    let body: TripInput;

    try {
      body =
        (await request.json()) as
          TripInput;
    } catch {
      throw new ApiError(
        400,
        "Invalid request body.",
      );
    }

    const input =
      validateTripInput(body);

    // ========================================
    // Check Registration Number
    // ========================================

    const existingVehicles =
      await adminDb
        .collection("vehicles")
        .where(
          "companyId",
          "==",
          operator.companyId,
        )
        .where(
          "registrationNumber",
          "==",
          input.registrationNumber,
        )
        .limit(1)
        .get();

    if (
      !existingVehicles.empty
    ) {
      throw new ApiError(
        409,
        "A bus with this registration number is already onboarded for your company.",
      );
    }

    // ========================================
    // References
    // ========================================

    const vehicleRef =
      adminDb
        .collection("vehicles")
        .doc();

    const routeRef =
      adminDb
        .collection("routes")
        .doc();

    const tripRef =
      adminDb
        .collection("trips")
        .doc();

    const batch =
      adminDb.batch();

    const now =
      FieldValue.serverTimestamp();

    // ========================================
    // Vehicle
    // ========================================

    batch.set(
      vehicleRef,
      {
        companyId:
          operator.companyId,

        companyName:
          operator.companyName,

        name:
          input.vehicleName,

        registrationNumber:
          input.registrationNumber,

        busType:
          input.busType,

        seatCapacity:
          input.seatCapacity,

        seatLayout:
          input.seatLayout,

        amenities:
          input.amenities,

        status:
          input.vehicleStatus,

        createdBy:
          operator.userId,

        createdAt: now,
        updatedAt: now,
      },
    );

    // ========================================
    // Route
    // ========================================

    batch.set(
      routeRef,
      {
        companyId:
          operator.companyId,

        companyName:
          operator.companyName,

        origin:
          input.origin,

        destination:
          input.destination,

        boardingPoints:
          input.boardingPoints,

        dropOffPoint:
          input.dropOffPoint,

        status: "active",

        createdBy:
          operator.userId,

        createdAt: now,
        updatedAt: now,
      },
    );

    // ========================================
    // Trip
    // ========================================

    batch.set(
      tripRef,
      {
        companyId:
          operator.companyId,

        companyName:
          operator.companyName,

        vehicleId:
          vehicleRef.id,

        routeId:
          routeRef.id,

        vehicleName:
          input.vehicleName,

        registrationNumber:
          input.registrationNumber,

        origin:
          input.origin,

        destination:
          input.destination,

        boardingPoints:
          input.boardingPoints,

        dropOffPoint:
          input.dropOffPoint,

        busType:
          input.busType,

        seatLayout:
          input.seatLayout,

        amenities:
          input.amenities,

        scheduleType:
          input.scheduleType,

        operatingDays:
          input.operatingDays,

        departureTime:
          input.departureTime,

        arrivalTime:
          input.arrivalTime,

        bookingWindowDays:
          input.bookingWindowDays,

        fare:
          input.fare,

        totalSeats:
          input.seatCapacity,

        availableSeats:
          input.seatCapacity,

        bookingEnabled:
          input.bookingEnabled,

        status:
          input.status,

        createdBy:
          operator.userId,

        createdAt: now,
        updatedAt: now,
      },
    );

    // ========================================
    // Seat Templates
    // ========================================

    const seatNumbers =
      generateSeatNumbers(
        input.seatCapacity,
        input.seatLayout,
      );

    seatNumbers.forEach(
      (
        seatNumber,
        index,
      ) => {
        const seatRef =
          adminDb
            .collection("seats")
            .doc();

        batch.set(
          seatRef,
          {
            companyId:
              operator.companyId,

            tripId:
              tripRef.id,

            vehicleId:
              vehicleRef.id,

            seatNumber,

            seatIndex:
              index + 1,

            status:
              "available",

            active: true,

            createdAt: now,
            updatedAt: now,
          },
        );
      },
    );

    await batch.commit();

    return NextResponse.json(
      {
        success: true,

        message:
          input.status ===
          "draft"
            ? "Bus and trip saved as a draft."
            : "Bus onboarded and trip published successfully.",

        trip: {
          id: tripRef.id,

          vehicleId:
            vehicleRef.id,

          routeId:
            routeRef.id,

          companyId:
            operator.companyId,

          companyName:
            operator.companyName,

          vehicleName:
            input.vehicleName,

          registrationNumber:
            input.registrationNumber,

          busType:
            input.busType,

          seatCapacity:
            input.seatCapacity,

          seatLayout:
            input.seatLayout,

          amenities:
            input.amenities,

          origin:
            input.origin,

          destination:
            input.destination,

          boardingPoints:
            input.boardingPoints,

          dropOffPoint:
            input.dropOffPoint,

          scheduleType:
            input.scheduleType,

          operatingDays:
            input.operatingDays,

          departureTime:
            input.departureTime,

          arrivalTime:
            input.arrivalTime,

          bookingWindowDays:
            input.bookingWindowDays,

          fare:
            input.fare,

          totalSeats:
            input.seatCapacity,

          availableSeats:
            input.seatCapacity,

          bookingEnabled:
            input.bookingEnabled,

          status:
            input.status,
        },
      },
      {
        status: 201,
      },
    );
  } catch (error) {
    return handleError(error);
  }
}

// ========================================
// Validation
// ========================================

function validateTripInput(
  body: TripInput,
) {
  const vehicleName =
    cleanText(
      body.vehicleName,
      80,
    );

  const registrationNumber =
    cleanText(
      body.registrationNumber,
      30,
    ).toUpperCase();

  const busType =
    cleanText(
      body.busType,
      40,
    );

  const seatLayout =
    cleanText(
      body.seatLayout,
      10,
    );

  const vehicleStatus =
    cleanText(
      body.vehicleStatus,
      20,
    );

  const origin =
    cleanText(
      body.origin,
      80,
    );

  const destination =
    cleanText(
      body.destination,
      80,
    );

  const dropOffPoint =
    cleanText(
      body.dropOffPoint,
      120,
      false,
    );

  const scheduleType =
    cleanText(
      body.scheduleType,
      30,
    );

  const status =
    cleanText(
      body.status,
      20,
    );

  if (!vehicleName) {
    throw new ApiError(
      400,
      "Bus name or fleet number is required.",
    );
  }

  if (!registrationNumber) {
    throw new ApiError(
      400,
      "Registration number is required.",
    );
  }

  if (
    !ALLOWED_BUS_TYPES.includes(
      busType as
        (typeof ALLOWED_BUS_TYPES)[number],
    )
  ) {
    throw new ApiError(
      400,
      "Select a valid bus type.",
    );
  }

  if (
    !ALLOWED_LAYOUTS.includes(
      seatLayout as
        (typeof ALLOWED_LAYOUTS)[number],
    )
  ) {
    throw new ApiError(
      400,
      "Select a valid seat layout.",
    );
  }

  const seatCapacity =
    Number(
      body.seatCapacity,
    );

  if (
    !Number.isInteger(
      seatCapacity,
    ) ||
    seatCapacity < 1 ||
    seatCapacity > 80
  ) {
    throw new ApiError(
      400,
      "Seat capacity must be between 1 and 80.",
    );
  }

  if (
    !ALLOWED_VEHICLE_STATUSES.includes(
      vehicleStatus as
        (typeof ALLOWED_VEHICLE_STATUSES)[number],
    )
  ) {
    throw new ApiError(
      400,
      "Select a valid vehicle status.",
    );
  }

  if (
    !origin ||
    !destination
  ) {
    throw new ApiError(
      400,
      "Origin and destination are required.",
    );
  }

  if (
    origin.toLowerCase() ===
    destination.toLowerCase()
  ) {
    throw new ApiError(
      400,
      "Origin and destination must be different.",
    );
  }

  if (
    !ALLOWED_SCHEDULE_TYPES.includes(
      scheduleType as
        (typeof ALLOWED_SCHEDULE_TYPES)[number],
    )
  ) {
    throw new ApiError(
      400,
      "Select a valid schedule type.",
    );
  }

  if (
    !ALLOWED_TRIP_STATUSES.includes(
      status as
        (typeof ALLOWED_TRIP_STATUSES)[number],
    )
  ) {
    throw new ApiError(
      400,
      "Select a valid trip status.",
    );
  }

  const departureTime =
    validateTime(
      body.departureTime,
      "Departure time",
    );

  const arrivalTime =
    validateTime(
      body.arrivalTime,
      "Arrival time",
    );

  const fare =
    Number(body.fare);

  if (
    !Number.isFinite(fare) ||
    fare < 0
  ) {
    throw new ApiError(
      400,
      "Enter a valid ticket price.",
    );
  }

  const bookingWindowDays =
    Number(
      body.bookingWindowDays ??
        90,
    );

  if (
    !Number.isInteger(
      bookingWindowDays,
    ) ||
    bookingWindowDays < 1 ||
    bookingWindowDays > 365
  ) {
    throw new ApiError(
      400,
      "Booking window must be between 1 and 365 days.",
    );
  }

  const boardingPoints =
    cleanTextArray(
      body.boardingPoints,
      20,
      120,
    );

  if (
    boardingPoints.length === 0
  ) {
    throw new ApiError(
      400,
      "Add at least one boarding point.",
    );
  }

  const amenities =
    cleanTextArray(
      body.amenities,
      20,
      60,
    );

  let operatingDays =
    cleanTextArray(
      body.operatingDays,
      7,
      20,
    ).map((day) =>
      day.toLowerCase(),
    );

  operatingDays = [
    ...new Set(
      operatingDays,
    ),
  ];

  if (
    scheduleType === "daily"
  ) {
    operatingDays = [
      ...DAY_NAMES,
    ];
  } else {
    const invalidDay =
      operatingDays.find(
        (day) =>
          !DAY_NAMES.includes(
            day as
              (typeof DAY_NAMES)[number],
          ),
      );

    if (
      invalidDay ||
      operatingDays.length === 0
    ) {
      throw new ApiError(
        400,
        "Select valid operating days.",
      );
    }
  }

  return {
    vehicleName,
    registrationNumber,
    busType,
    seatCapacity,
    seatLayout,
    amenities,
    vehicleStatus,

    origin,
    destination,
    boardingPoints,
    dropOffPoint,

    scheduleType,
    operatingDays,
    departureTime,
    arrivalTime,
    bookingWindowDays,

    fare:
      Math.round(
        fare * 100,
      ) / 100,

    bookingEnabled:
      body.bookingEnabled !==
      false,

    status,
  };
}

// ========================================
// Seat Generator
// ========================================

function generateSeatNumbers(
  capacity: number,
  layout: string,
) {
  const letters =
    layout === "2+1"
      ? ["A", "B", "C"]
      : ["A", "B", "C", "D"];

  const seats: string[] =
    [];

  let row = 1;

  while (
    seats.length < capacity
  ) {
    for (
      const letter of letters
    ) {
      if (
        seats.length >=
        capacity
      ) {
        break;
      }

      seats.push(
        `${row}${letter}`,
      );
    }

    row += 1;
  }

  return seats;
}

// ========================================
// Validation Helpers
// ========================================

function cleanText(
  value: unknown,
  maxLength: number,
  required = true,
) {
  if (
    typeof value !==
    "string"
  ) {
    if (required) {
      return "";
    }

    return "";
  }

  return value
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, maxLength);
}

function cleanTextArray(
  value: unknown,
  maxItems: number,
  maxLength: number,
) {
  if (!Array.isArray(value)) {
    return [];
  }

  return [
    ...new Set(
      value
        .filter(
          (
            item,
          ): item is string =>
            typeof item ===
            "string",
        )
        .map((item) =>
          item
            .trim()
            .replace(
              /\s+/g,
              " ",
            )
            .slice(
              0,
              maxLength,
            ),
        )
        .filter(Boolean),
    ),
  ].slice(0, maxItems);
}

function validateTime(
  value: unknown,
  label: string,
) {
  if (
    typeof value !==
      "string" ||
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(
      value,
    )
  ) {
    throw new ApiError(
      400,
      `${label} is invalid.`,
    );
  }

  return value;
}

// ========================================
// API Errors
// ========================================

class ApiError extends Error {
  status: number;

  constructor(
    status: number,
    message: string,
  ) {
    super(message);

    this.status =
      status;
  }
}

function handleError(
  error: unknown,
) {
  if (
    error instanceof ApiError
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          error.message,
      },
      {
        status:
          error.status,
      },
    );
  }

  console.error(
    "Operator trips API error:",
    error,
  );

  return NextResponse.json(
    {
      success: false,
      error:
        "Unable to process the trip request.",
    },
    {
      status: 500,
    },
  );
}