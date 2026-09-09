// ========================================
// Zano AI Assistant - Trip Search Helpers
//
// Server-side trip lookup logic shared by
// the AI assistant's tools. This mirrors the
// daily/fixed schedule resolution rules used
// on the public /search page so the assistant
// never shows a trip the passenger couldn't
// actually book.
// ========================================

import { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";

// ========================================
// Types
// ========================================

export type BoardingPoint = {
  id?: string;
  name?: string;
};

type RawTrip = {
  origin?: string;
  destination?: string;
  routeId?: string;

  companyId?: string;
  companyName?: string;

  busType?: string;
  amenities?: string[];

  departureAt?: Timestamp;
  arrivalAt?: Timestamp;

  fare?: number;

  totalSeats?: number;
  availableSeats?: number;

  status?: string;

  scheduleType?: "daily" | "fixed";
  departureTime?: string;
  arrivalTime?: string;
  bookingEnabled?: boolean;
  bookingWindowDays?: number;

  boardingPoints?: BoardingPoint[];
};

export type ResolvedTrip = {
  id: string;

  origin: string;
  destination: string;
  routeId: string;

  companyId: string;
  companyName: string;

  busType: string;
  amenities: string[];

  departureAt: string; // ISO 8601
  arrivalAt: string; // ISO 8601
  durationMinutes: number;

  fare: number;

  totalSeats: number;
  availableSeats: number;

  travelDate: string; // YYYY-MM-DD, resolved

  boardingPoints: string[];
};

// ========================================
// Small Date Helpers
// (mirrors zano-website SearchPageClient.tsx)
// ========================================

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/**
 * Formats a Date as YYYY-MM-DD using its UTC
 * fields, matching how trip documents store
 * naive wall-clock times.
 */
function toDateOnly(date: Date): string {
  return `${date.getUTCFullYear()}-${pad(
    date.getUTCMonth() + 1
  )}-${pad(date.getUTCDate())}`;
}

function createTripDateTime(
  travelDate: string,
  time: string
): Date | null {
  const dateMatch =
    /^(\d{4})-(\d{2})-(\d{2})$/.exec(travelDate);
  const timeMatch = /^(\d{2}):(\d{2})$/.exec(time);

  if (!dateMatch || !timeMatch) {
    return null;
  }

  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);
  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);

  if (
    month < 1 || month > 12 ||
    day < 1 || day > 31 ||
    hour > 23 || minute > 59
  ) {
    return null;
  }

  return new Date(
    Date.UTC(year, month - 1, day, hour, minute)
  );
}

/**
 * Resolves a raw trip document into a concrete,
 * bookable trip instance for the given date, or
 * returns null if it isn't actually available.
 *
 * Handles both "daily" recurring trips and
 * "fixed" single-departure trips, applying the
 * same rules as the passenger-facing search page:
 * booking window, already-departed, and seat
 * capacity checks.
 */
function resolveTripInstance(
  id: string,
  trip: RawTrip,
  requestedDate: string | undefined,
  minSeats: number
): ResolvedTrip | null {
  const rawDeparture = trip.departureAt?.toDate();
  const rawArrival = trip.arrivalAt?.toDate();

  if (!rawDeparture || !rawArrival) {
    return null;
  }

  if ((trip.availableSeats ?? 0) < minSeats) {
    return null;
  }

  let departure: Date;
  let arrival: Date;
  let travelDate: string;

  if (trip.scheduleType === "daily") {
    if (trip.bookingEnabled === false) {
      return null;
    }

    // Daily trips need an explicit date to resolve
    // to a concrete departure. Default to "today".
    const targetDate =
      requestedDate ?? toDateOnly(new Date());

    const departureTime =
      trip.departureTime ??
      `${pad(rawDeparture.getUTCHours())}:${pad(
        rawDeparture.getUTCMinutes()
      )}`;

    const arrivalTime =
      trip.arrivalTime ??
      `${pad(rawArrival.getUTCHours())}:${pad(
        rawArrival.getUTCMinutes()
      )}`;

    const resolvedDeparture = createTripDateTime(
      targetDate,
      departureTime
    );

    let resolvedArrival = createTripDateTime(
      targetDate,
      arrivalTime
    );

    if (!resolvedDeparture || !resolvedArrival) {
      return null;
    }

    // Handle overnight journeys.
    if (
      resolvedArrival.getTime() <=
      resolvedDeparture.getTime()
    ) {
      resolvedArrival = new Date(
        resolvedArrival.getTime() + 24 * 60 * 60 * 1000
      );
    }

    if (resolvedDeparture.getTime() < Date.now()) {
      return null;
    }

    const bookingWindowDays =
      trip.bookingWindowDays ?? 90;

    const latestBookingDate = new Date();
    latestBookingDate.setUTCHours(23, 59, 59, 999);
    latestBookingDate.setUTCDate(
      latestBookingDate.getUTCDate() + bookingWindowDays
    );

    if (
      resolvedDeparture.getTime() >
      latestBookingDate.getTime()
    ) {
      return null;
    }

    departure = resolvedDeparture;
    arrival = resolvedArrival;
    travelDate = targetDate;
  } else {
    // Fixed-date trip.
    if (rawDeparture.getTime() < Date.now()) {
      return null;
    }

    if (
      requestedDate &&
      toDateOnly(rawDeparture) !== requestedDate
    ) {
      return null;
    }

    departure = rawDeparture;
    arrival = rawArrival;
    travelDate = toDateOnly(rawDeparture);
  }

  const durationMinutes = Math.round(
    (arrival.getTime() - departure.getTime()) / 60000
  );

  return {
    id,
    origin: trip.origin ?? "",
    destination: trip.destination ?? "",
    routeId: trip.routeId ?? "",
    companyId: trip.companyId ?? "",
    companyName: trip.companyName ?? "Unknown operator",
    busType: trip.busType ?? "Standard",
    amenities: trip.amenities ?? [],
    departureAt: departure.toISOString(),
    arrivalAt: arrival.toISOString(),
    durationMinutes,
    fare: trip.fare ?? 0,
    totalSeats: trip.totalSeats ?? 0,
    availableSeats: trip.availableSeats ?? 0,
    travelDate,
    boardingPoints: (trip.boardingPoints ?? [])
      .map((point) => point.name)
      .filter((name): name is string => Boolean(name)),
  };
}

// ========================================
// City Name Normalization
// ========================================

/**
 * Title-cases a free-form city name so it has a
 * chance of matching the exact-match "origin" /
 * "destination" fields stored on trip documents
 * (e.g. "accra" -> "Accra", "cape coast" -> "Cape Coast").
 */
export function normalizeCityName(value: string): string {
  return value
    .trim()
    .split(/\s+/)
    .map(
      (word) =>
        word.charAt(0).toUpperCase() +
        word.slice(1).toLowerCase()
    )
    .join(" ");
}

// ========================================
// Search: by exact origin -> destination route
// ========================================

export async function searchTripsByRoute(params: {
  origin: string;
  destination: string;
  date?: string;
  passengers?: number;
}): Promise<ResolvedTrip[]> {
  const origin = normalizeCityName(params.origin);
  const destination = normalizeCityName(params.destination);
  const minSeats = Math.max(1, params.passengers ?? 1);

  const snapshot = await adminDb
    .collection("trips")
    .where("origin", "==", origin)
    .where("destination", "==", destination)
    .where("status", "==", "scheduled")
    .get();

  const resolved: ResolvedTrip[] = [];

  snapshot.docs.forEach((docSnapshot) => {
    const trip = resolveTripInstance(
      docSnapshot.id,
      docSnapshot.data() as RawTrip,
      params.date,
      minSeats
    );

    if (trip) {
      resolved.push(trip);
    }
  });

  return resolved;
}

// ========================================
// Search: trips passing through a location
// (origin, destination, or a boarding point)
// ========================================

const LOCATION_SCAN_LIMIT = 300;

export async function searchTripsByLocation(params: {
  location: string;
  date?: string;
  passengers?: number;
}): Promise<ResolvedTrip[]> {
  const needle = params.location.trim().toLowerCase();
  const minSeats = Math.max(1, params.passengers ?? 1);

  if (!needle) {
    return [];
  }

  const snapshot = await adminDb
    .collection("trips")
    .where("status", "==", "scheduled")
    .limit(LOCATION_SCAN_LIMIT)
    .get();

  const resolved: ResolvedTrip[] = [];

  snapshot.docs.forEach((docSnapshot) => {
    const raw = docSnapshot.data() as RawTrip;

    const matches =
      raw.origin?.toLowerCase().includes(needle) ||
      raw.destination?.toLowerCase().includes(needle) ||
      (raw.boardingPoints ?? []).some((point) =>
        point.name?.toLowerCase().includes(needle)
      );

    if (!matches) {
      return;
    }

    const trip = resolveTripInstance(
      docSnapshot.id,
      raw,
      params.date,
      minSeats
    );

    if (trip) {
      resolved.push(trip);
    }
  });

  return resolved;
}

// ========================================
// Lookup: single trip by id
// ========================================

export async function getTripById(
  tripId: string,
  date?: string
): Promise<ResolvedTrip | null> {
  const docSnapshot = await adminDb
    .collection("trips")
    .doc(tripId)
    .get();

  if (!docSnapshot.exists) {
    return null;
  }

  return resolveTripInstance(
    docSnapshot.id,
    docSnapshot.data() as RawTrip,
    date,
    1
  );
}

// ========================================
// Sorting helper (cheapest / earliest / etc.)
// ========================================

export type TripSortBy =
  | "cheapest"
  | "earliest"
  | "fastest"
  | "most_seats";

export function sortTrips(
  trips: ResolvedTrip[],
  sortBy: TripSortBy | undefined
): ResolvedTrip[] {
  const sorted = [...trips];

  switch (sortBy) {
    case "cheapest":
      sorted.sort((a, b) => a.fare - b.fare);
      break;
    case "fastest":
      sorted.sort(
        (a, b) => a.durationMinutes - b.durationMinutes
      );
      break;
    case "most_seats":
      sorted.sort(
        (a, b) => b.availableSeats - a.availableSeats
      );
      break;
    case "earliest":
    default:
      sorted.sort(
        (a, b) =>
          new Date(a.departureAt).getTime() -
          new Date(b.departureAt).getTime()
      );
      break;
  }

  return sorted;
}
