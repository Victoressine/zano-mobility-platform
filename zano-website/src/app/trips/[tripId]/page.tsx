"use client";

// ========================================
// Imports
// ========================================

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  Timestamp,
  where,
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db } from "@/lib/firebase/client";

// ========================================
// Types
// ========================================

type TripScheduleType = "daily" | "fixed";

type Trip = {
  id: string;
  origin: string;
  destination: string;
  routeId: string;
  companyId: string;
  companyName: string;
  busType: string;

  departureAt: Timestamp;
  arrivalAt: Timestamp;

  fare: number;
  totalSeats: number;
  availableSeats: number;
  status: string;

  // Recurring schedule fields
  scheduleType?: TripScheduleType;
  departureTime?: string;
  arrivalTime?: string;
  bookingEnabled?: boolean;
  bookingWindowDays?: number;
  operatingDays?: string[];
  inventoryType?: string;
};

type SeatStatus = "available" | "reserved" | "booked" | "unavailable";

type Seat = {
  id: string;
  tripId: string;
  seatNumber: string;
  row: number;
  column: string;
  status: SeatStatus;
  price: number;
  isSeatTemplate?: boolean;
};

// ========================================
// Constants
// ========================================

const DEFAULT_BOOKING_WINDOW_DAYS = 90;
const MAX_PASSENGERS = 10;

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
// Formatting Helpers
// ========================================

function formatTime(timestamp?: Timestamp) {
  if (!timestamp) return "--";

  return timestamp.toDate().toLocaleTimeString("en-GB", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function formatDate(timestamp?: Timestamp) {
  if (!timestamp) return "--";

  return timestamp.toDate().toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatMoney(amount: number) {
  return new Intl.NumberFormat("en-GH", {
    style: "currency",
    currency: "GHS",
    minimumFractionDigits: 0,
  }).format(amount);
}

// ========================================
// Date Helpers
// ========================================

function isValidTravelDate(value: string | null): value is string {
  if (!value) return false;

  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  const date = new Date(year, month - 1, day, 12, 0, 0, 0);

  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}

function createTripDateTime(
  travelDate: string,
  time: string,
): Timestamp | null {
  const dateMatch = travelDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  const timeMatch = time.match(/^(\d{2}):(\d{2})$/);

  if (!dateMatch || !timeMatch) {
    return null;
  }

  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);

  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);

  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return null;
  }

  const date = new Date(year, month - 1, day, hour, minute, 0, 0);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day ||
    date.getHours() !== hour ||
    date.getMinutes() !== minute
  ) {
    return null;
  }

  return Timestamp.fromDate(date);
}

function getDayName(travelDate: string) {
  const [year, month, day] = travelDate.split("-").map(Number);

  const date = new Date(year, month - 1, day, 12, 0, 0, 0);

  return DAY_NAMES[date.getDay()];
}

function resolveRecurringTrip(
  trip: Trip,
  travelDate: string,
): {
  trip?: Trip;
  error?: string;
} {
  if (!trip.departureTime || !trip.arrivalTime) {
    return {
      error: "This trip does not have a complete daily schedule.",
    };
  }

  if (trip.bookingEnabled === false) {
    return {
      error: "Booking is currently disabled for this trip.",
    };
  }

  const operatingDays =
    trip.operatingDays?.map((day) => day.toLowerCase()) ?? [];

  if (
    operatingDays.length > 0 &&
    !operatingDays.includes(getDayName(travelDate))
  ) {
    return {
      error: "This trip does not operate on the selected day.",
    };
  }

  const departureAt = createTripDateTime(travelDate, trip.departureTime);

  let arrivalAt = createTripDateTime(travelDate, trip.arrivalTime);

  if (!departureAt || !arrivalAt) {
    return {
      error: "The selected journey date could not be created.",
    };
  }

  // Arrival can be on the following day.
  if (arrivalAt.toMillis() <= departureAt.toMillis()) {
    arrivalAt = Timestamp.fromMillis(
      arrivalAt.toMillis() + 24 * 60 * 60 * 1000,
    );
  }

  const now = Date.now();

  if (departureAt.toMillis() <= now) {
    return {
      error: "This journey has already departed. Please choose another date.",
    };
  }

  const bookingWindowDays =
    Number.isInteger(trip.bookingWindowDays) &&
    Number(trip.bookingWindowDays) > 0
      ? Number(trip.bookingWindowDays)
      : DEFAULT_BOOKING_WINDOW_DAYS;

  const latestBookingTime = now + bookingWindowDays * 24 * 60 * 60 * 1000;

  if (departureAt.toMillis() > latestBookingTime) {
    return {
      error: `Bookings are currently available up to ${bookingWindowDays} days in advance.`,
    };
  }

  return {
    trip: {
      ...trip,
      departureAt,
      arrivalAt,
    },
  };
}

// ========================================
// Passenger Count Helper
// ========================================

function getPassengerCount(value: string | null) {
  const parsed = Number(value);

  if (!Number.isInteger(parsed)) {
    return 1;
  }

  return Math.min(MAX_PASSENGERS, Math.max(1, parsed));
}

// ========================================
// Page
// ========================================

export default function TripDetailsPage() {
  const router = useRouter();

  const params = useParams<{ tripId: string }>();

  const searchParams = useSearchParams();

  const tripId = params.tripId;

  const requestedPassengers = getPassengerCount(searchParams.get("passengers"));

  const travelDate = searchParams.get("travelDate");

  const [trip, setTrip] = useState<Trip | null>(null);

  const [seats, setSeats] = useState<Seat[]>([]);

  const [selectedSeatIds, setSelectedSeatIds] = useState<string[]>([]);

  const [loading, setLoading] = useState(true);

  const [error, setError] = useState("");

  // ========================================
  // Authentication + Firestore Data
  // ========================================

  useEffect(() => {
let cancelled = false;
let unsubscribeInventory: (() => void) | null = null;

const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        const returnParams = new URLSearchParams({
          passengers: String(requestedPassengers),
        });

        if (travelDate) {
          returnParams.set("travelDate", travelDate);
        }

        const returnUrl = encodeURIComponent(
          `/trips/${tripId}?${returnParams.toString()}`,
        );

        router.replace(`/login?returnUrl=${returnUrl}`);

        return;
      }

      try {
        if (!cancelled) {
          setLoading(true);
          setError("");
          setTrip(null);
          setSeats([]);
          setSelectedSeatIds([]);
        }

        // ========================================
        // Load Trip
        // ========================================

        const tripRef = doc(db, "trips", tripId);

        const tripSnapshot = await getDoc(tripRef);

        if (cancelled) return;

        if (!tripSnapshot.exists()) {
          setError("This trip could not be found.");

          return;
        }

        let tripData = {
          id: tripSnapshot.id,
          ...tripSnapshot.data(),
        } as Trip;

        // ========================================
        // Basic Trip Validation
        // ========================================

        if (tripData.status !== "scheduled") {
          setError("This trip is no longer available for booking.");

          return;
        }

        if (
          typeof tripData.fare !== "number" ||
          !Number.isFinite(tripData.fare) ||
          tripData.fare < 0
        ) {
          setError("This trip has an invalid fare.");

          return;
        }

        // ========================================
        // Resolve Daily Recurring Schedule
        // ========================================

        if (tripData.scheduleType === "daily") {
          if (!isValidTravelDate(travelDate)) {
            setError("Please select a valid travel date.");

            return;
          }

          const resolved = resolveRecurringTrip(tripData, travelDate);

          if (resolved.error || !resolved.trip) {
            setError(resolved.error ?? "This journey is unavailable.");

            return;
          }

          tripData = resolved.trip;
        } else {
          // ========================================
          // Fixed Trip Validation
          // ========================================

          if (!tripData.departureAt || !tripData.arrivalAt) {
            setError("This trip schedule is incomplete.");

            return;
          }

          if (tripData.departureAt.toMillis() <= Date.now()) {
            setError(
              "This trip has already departed or is no longer bookable.",
            );

            return;
          }

          // If a fixed trip is opened with a
          // travelDate, ensure it matches.
          if (travelDate && isValidTravelDate(travelDate)) {
            const departureDate = tripData.departureAt.toDate();

            const expectedDate = [
              departureDate.getFullYear(),
              String(departureDate.getMonth() + 1).padStart(2, "0"),
              String(departureDate.getDate()).padStart(2, "0"),
            ].join("-");

            if (expectedDate !== travelDate) {
              setError("This trip is not scheduled for the selected date.");

              return;
            }
          }
        }

        // ========================================
        // Load Seat Templates
        // ========================================

        const seatsQuery = query(
          collection(db, "seats"),
          where("tripId", "==", tripId),
        );

        const seatSnapshots = await getDocs(seatsQuery);

        if (cancelled) return;

        const seatData = seatSnapshots.docs.map(
          (seatDocument) =>
            ({
              id: seatDocument.id,
              ...seatDocument.data(),
            }) as Seat,
        );

        seatData.sort((a, b) => {
          if (a.row !== b.row) {
            return a.row - b.row;
          }

          return a.column.localeCompare(b.column);
        });

        if (seatData.length === 0) {
          setError("No seats have been configured for this trip.");

          return;
        }

// ========================================
// Real-Time Date-Specific Seat Inventory
// ========================================

const isDateBasedInventory =
  tripData.scheduleType === "daily" &&
  tripData.inventoryType === "date-based";

const baseSeats = isDateBasedInventory
  ? seatData.map((seat) => ({
      ...seat,
      status: "available" as const,
    }))
  : seatData;

// ========================================
// Fixed Trip
// ========================================

if (!isDateBasedInventory) {
  const selectableSeatCount = baseSeats.filter(
    (seat) => seat.status === "available",
  ).length;

  if (selectableSeatCount < requestedPassengers) {
    setError(
      `Only ${selectableSeatCount} seats are currently available for this journey.`,
    );

    return;
  }

  if (!cancelled) {
    setTrip({
      ...tripData,
      availableSeats: selectableSeatCount,
    });

    setSeats(baseSeats);
  }

  return;
}

// ========================================
// Daily / Date-Based Trip
// ========================================

if (!travelDate || !isValidTravelDate(travelDate)) {
  setError("Please select a valid travel date.");
  return;
}

const inventoryQuery = query(
  collection(db, "tripSeatInventory"),
  where("tripId", "==", tripId),
  where("travelDate", "==", travelDate),
);

unsubscribeInventory = onSnapshot(
  inventoryQuery,
  (inventorySnapshot) => {
    if (cancelled) return;

    const inventoryBySeatId = new Map<string, SeatStatus>();

    inventorySnapshot.docs.forEach((inventoryDocument) => {
      const inventory = inventoryDocument.data();

      const seatId =
        typeof inventory.seatId === "string"
          ? inventory.seatId
          : "";

      const status: SeatStatus =
        inventory.status === "booked" ||
        inventory.status === "reserved" ||
        inventory.status === "unavailable"
          ? inventory.status
          : "available";

      if (seatId) {
        inventoryBySeatId.set(seatId, status);
      }
    });

    // ========================================
    // Merge Templates With Live Inventory
    // ========================================

    const liveSeats = baseSeats.map((seat) => ({
      ...seat,
      status: inventoryBySeatId.get(seat.id) ?? "available",
    }));

    const selectableSeatCount = liveSeats.filter(
      (seat) => seat.status === "available",
    ).length;

    // ========================================
    // Update UI
    // ========================================

    setTrip({
      ...tripData,
      availableSeats: selectableSeatCount,
    });

    setSeats(liveSeats);

    // If another passenger books a seat that
    // this passenger selected, remove it.
    setSelectedSeatIds((current) =>
      current.filter((seatId) => {
        const seat = liveSeats.find(
          (candidate) => candidate.id === seatId,
        );

        return seat?.status === "available";
      }),
    );

    if (selectableSeatCount < requestedPassengers) {
      setError(
        `Only ${selectableSeatCount} seats are currently available for this journey.`,
      );
    } else {
      setError("");
    }
  },
  (inventoryError) => {
    console.error(
      "Unable to listen for seat inventory:",
      inventoryError,
    );

    if (!cancelled) {
      setError(
        "We couldn't keep seat availability updated. Please refresh and try again.",
      );
    }
  },
);

// ========================================
// Cleanup Inventory Listener
// ========================================

return () => {
  unsubscribeInventory?.();
};
      } catch (err) {
        console.error("Unable to load trip:", err);

        if (!cancelled) {
          setError("We couldn't load this trip. Please try again.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    });

return () => {
  cancelled = true;
  unsubscribeInventory?.();
  unsubscribe();
};
  }, [router, tripId, requestedPassengers, travelDate]);

  // ========================================
  // Selected Seats
  // ========================================

  const selectedSeats = useMemo(
    () => seats.filter((seat) => selectedSeatIds.includes(seat.id)),
    [seats, selectedSeatIds],
  );

  const totalFare = useMemo(() => {
    if (!trip) return 0;

    return selectedSeats.length * trip.fare;
  }, [selectedSeats, trip]);

  // ========================================
  // Seat Selection
  // ========================================

  function handleSeatClick(seat: Seat) {
    if (seat.status !== "available") {
      return;
    }

    const alreadySelected = selectedSeatIds.includes(seat.id);

    if (alreadySelected) {
      setSelectedSeatIds((current) => current.filter((id) => id !== seat.id));

      return;
    }

    if (selectedSeatIds.length >= requestedPassengers) {
      return;
    }

    setSelectedSeatIds((current) => [...current, seat.id]);
  }

  // ========================================
  // Continue To Checkout
  // ========================================

  function handleContinue() {
    if (!trip) return;

    if (selectedSeats.length !== requestedPassengers) {
      return;
    }

    const seatIds = selectedSeats.map((seat) => seat.id).join(",");

    const seatNumbers = selectedSeats.map((seat) => seat.seatNumber).join(",");

    const checkoutParams = new URLSearchParams({
      tripId: trip.id,
      passengers: String(requestedPassengers),
      seats: seatIds,
      seatNumbers,
    });

    // ========================================
    // Preserve Selected Journey Date
    // ========================================

    if (travelDate) {
      checkoutParams.set("travelDate", travelDate);
    }

    router.push(`/checkout?${checkoutParams.toString()}`);
  }

  // ========================================
  // Loading
  // ========================================

  if (loading) {
    return (
      <main className="min-h-screen bg-[#f8f7ff]">
        <div className="mx-auto flex min-h-[70vh] max-w-6xl items-center justify-center px-5">
          <div className="text-center">
            <div className="mx-auto h-9 w-9 animate-spin rounded-full border-4 border-[#002451]/15 border-t-[#ff7417]" />

            <p className="mt-4 text-sm font-medium text-[#747680]">
              Loading trip...
            </p>
          </div>
        </div>
      </main>
    );
  }

  // ========================================
  // Error
  // ========================================

  if (error || !trip) {
    return (
      <main className="min-h-screen bg-[#f8f7ff]">
        <div className="mx-auto flex min-h-[70vh] max-w-xl items-center justify-center px-5">
          <div className="w-full rounded-3xl bg-white p-8 text-center shadow-sm">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-orange-50 text-2xl">
              !
            </div>

            <h1 className="mt-5 text-xl font-bold text-[#002451]">
              Trip unavailable
            </h1>

            <p className="mt-2 text-sm leading-6 text-[#747680]">
              {error || "This trip could not be loaded."}
            </p>

            <button
              type="button"
              onClick={() => router.back()}
              className="mt-6 rounded-xl bg-[#002451] px-6 py-3 text-sm font-semibold text-white transition hover:opacity-90"
            >
              Go Back
            </button>
          </div>
        </div>
      </main>
    );
  }

  // ========================================
  // Main UI
  // ========================================

  return (
    <main className="min-h-screen bg-[#f8f7ff] pb-40">
      {/* ========================================
          Top Navigation
      ======================================== */}

      <header className="border-b border-black/5 bg-white">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-5 py-4">
          <button
            type="button"
            onClick={() => router.back()}
            aria-label="Go back"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#dfe1e8] text-[#002451] transition hover:bg-[#f8f7ff]"
          >
            <span className="text-xl">←</span>
          </button>

          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[#ff7417]">
              Select your seat
            </p>

            <h1 className="truncate text-lg font-bold text-[#002451] sm:text-xl">
              {trip.companyName}
            </h1>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-5 py-6">
        {/* ========================================
            Trip Information
        ======================================== */}

        <section className="overflow-hidden rounded-3xl bg-[#002451] text-white shadow-sm">
          <div className="grid gap-6 p-6 sm:p-8 lg:grid-cols-[1.4fr_0.6fr]">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold">
                  {trip.busType}
                </span>

                <span className="rounded-full bg-[#ff7417] px-3 py-1 text-xs font-semibold">
                  {trip.availableSeats} seats available
                </span>
              </div>

              <div className="mt-7 grid grid-cols-[1fr_auto_1fr] items-center gap-4">
                <div>
                  <p className="text-2xl font-bold">
                    {formatTime(trip.departureAt)}
                  </p>

                  <p className="mt-1 text-sm text-white/70">{trip.origin}</p>
                </div>

                <div className="flex min-w-20 items-center">
                  <div className="h-px flex-1 bg-white/25" />

                  <span className="mx-2 text-[#39b5f4]">→</span>

                  <div className="h-px flex-1 bg-white/25" />
                </div>

                <div className="text-right">
                  <p className="text-2xl font-bold">
                    {formatTime(trip.arrivalAt)}
                  </p>

                  <p className="mt-1 text-sm text-white/70">
                    {trip.destination}
                  </p>
                </div>
              </div>

              <p className="mt-6 text-sm text-white/65">
                {formatDate(trip.departureAt)}
              </p>
            </div>

            <div className="flex flex-col justify-between rounded-2xl bg-white/10 p-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-white/60">
                  Fare per passenger
                </p>

                <p className="mt-2 text-3xl font-bold">
                  {formatMoney(trip.fare)}
                </p>
              </div>

              <p className="mt-5 text-sm text-white/70">
                {requestedPassengers}{" "}
                {requestedPassengers === 1 ? "passenger" : "passengers"}
              </p>
            </div>
          </div>
        </section>

        {/* ========================================
            Amenities
        ======================================== */}

        <section className="mt-5 rounded-3xl bg-white p-5 shadow-sm sm:p-6">
          <h2 className="font-bold text-[#002451]">Coach amenities</h2>

          <div className="mt-4 flex flex-wrap gap-2">
            {[
              "Air conditioning",
              "Charging ports",
              "Comfortable seats",
              "Luggage space",
            ].map((amenity) => (
              <span
                key={amenity}
                className="rounded-full bg-[#f3f5f8] px-3 py-2 text-xs font-semibold text-[#4f5563]"
              >
                {amenity}
              </span>
            ))}
          </div>
        </section>

        {/* ========================================
            Seat Selection
        ======================================== */}

        <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_360px]">
          <section className="rounded-3xl bg-white p-5 shadow-sm sm:p-7">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#ff7417]">
                  Seat selection
                </p>

                <h2 className="mt-1 text-xl font-bold text-[#002451]">
                  Choose your seat
                </h2>

                <p className="mt-1 text-sm text-[#747680]">
                  Select {requestedPassengers}{" "}
                  {requestedPassengers === 1 ? "seat" : "seats"}.
                </p>
              </div>

              {/* Legend */}

              <div className="flex flex-wrap gap-3 text-xs text-[#626672]">
                <div className="flex items-center gap-1.5">
                  <span className="h-3 w-3 rounded bg-white ring-1 ring-[#b8bdc8]" />
                  Available
                </div>

                <div className="flex items-center gap-1.5">
                  <span className="h-3 w-3 rounded bg-[#ff7417]" />
                  Selected
                </div>

                <div className="flex items-center gap-1.5">
                  <span className="h-3 w-3 rounded bg-[#ffe1dc]" />
                  Booked
                </div>
              </div>
            </div>

            {/* ========================================
                Coach
            ======================================== */}

            <div className="mx-auto mt-8 max-w-md">
              <div className="rounded-[2rem] border-2 border-[#d7d9e2] bg-[#fafaff] p-4 sm:p-6">
                <div className="mb-6 flex items-center justify-between border-b border-dashed border-[#d5d7df] pb-5">
                  <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#9a9da8]">
                    Driver
                  </span>

                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#002451] text-xl text-white">
                    ◉
                  </div>

                  <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#9a9da8]">
                    Front Seat
                  </span>
                </div>

                {/* ========================================
    30-Seat VIP Layout
    2 + 1 configuration: A B | C
======================================== */}

                <div className="space-y-3">
                  {Array.from(
                    new Set(
                      seats
                        .filter(
                          (seat) =>
                            seat.row >= 1 &&
                            seat.row <= 10 &&
                            ["A", "B", "C"].includes(seat.column),
                        )
                        .map((seat) => seat.row),
                    ),
                  )
                    .sort((a, b) => a - b)
                    .map((row) => {
                      const rowSeats = seats
                        .filter(
                          (seat) =>
                            seat.row === row &&
                            ["A", "B", "C"].includes(seat.column),
                        )
                        .sort((a, b) => a.column.localeCompare(b.column));

                      const seatA = rowSeats.find(
                        (seat) => seat.column === "A",
                      );

                      const seatB = rowSeats.find(
                        (seat) => seat.column === "B",
                      );

                      const seatC = rowSeats.find(
                        (seat) => seat.column === "C",
                      );

                      return (
                        <div
                          key={row}
                          className="grid grid-cols-[1fr_1fr_42px_1fr] items-center gap-2"
                        >
                          {/* Left window seat */}
                          {seatA ? (
                            <SeatButton
                              seat={seatA}
                              selected={selectedSeatIds.includes(seatA.id)}
                              onClick={() => handleSeatClick(seatA)}
                            />
                          ) : (
                            <div />
                          )}

                          {/* Left aisle seat */}
                          {seatB ? (
                            <SeatButton
                              seat={seatB}
                              selected={selectedSeatIds.includes(seatB.id)}
                              onClick={() => handleSeatClick(seatB)}
                            />
                          ) : (
                            <div />
                          )}

                          {/* Aisle / row number */}
                          <div className="flex items-center justify-center">
                            <span className="text-[10px] font-semibold text-[#b0b3bd]">
                              {row}
                            </span>
                          </div>

                          {/* Right single VIP seat */}
                          {seatC ? (
                            <SeatButton
                              seat={seatC}
                              selected={selectedSeatIds.includes(seatC.id)}
                              onClick={() => handleSeatClick(seatC)}
                            />
                          ) : (
                            <div />
                          )}
                        </div>
                      );
                    })}

                  {/* Rear marker */}

                  <div className="border-t border-dashed border-[#d5d7df] pt-5 text-center">
                    <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#9a9da8]">
                      Rear
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* ========================================
              Selection Summary
          ======================================== */}

          <aside className="h-fit rounded-3xl bg-white p-6 shadow-sm lg:sticky lg:top-5">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#ff7417]">
              Your selection
            </p>

            <h2 className="mt-1 text-xl font-bold text-[#002451]">
              Trip summary
            </h2>

            <div className="mt-6 border-b border-[#ececf1] pb-5">
              <div className="flex justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-[#002451]">
                    {trip.origin} → {trip.destination}
                  </p>

                  <p className="mt-1 text-xs text-[#747680]">
                    {formatDate(trip.departureAt)}
                  </p>
                </div>

                <p className="text-sm font-bold text-[#002451]">
                  {formatTime(trip.departureAt)}
                </p>
              </div>
            </div>

            <div className="mt-5">
              <div className="flex items-center justify-between">
                <span className="text-sm text-[#747680]">Selected seats</span>

                <span className="text-sm font-semibold text-[#002451]">
                  {selectedSeats.length}/{requestedPassengers}
                </span>
              </div>

              {selectedSeats.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {selectedSeats.map((seat) => (
                    <span
                      key={seat.id}
                      className="rounded-lg bg-[#fff1e8] px-3 py-2 text-sm font-bold text-[#ff7417]"
                    >
                      {seat.seatNumber}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="mt-3 rounded-xl bg-[#f7f7fa] px-4 py-3 text-xs text-[#8a8d97]">
                  No seat selected yet.
                </p>
              )}
            </div>

            <div className="mt-6 flex items-end justify-between border-t border-[#ececf1] pt-5">
              <span className="text-sm text-[#747680]">Total</span>

              <span className="text-2xl font-bold text-[#002451]">
                {formatMoney(totalFare)}
              </span>
            </div>

            <button
              type="button"
              onClick={handleContinue}
              disabled={selectedSeats.length !== requestedPassengers}
              className="mt-6 w-full rounded-xl bg-[#ff7417] px-5 py-3.5 text-sm font-bold text-white transition hover:bg-[#ec6710] disabled:cursor-not-allowed disabled:bg-[#d6d7dc]"
            >
              {selectedSeats.length === requestedPassengers
                ? "Continue"
                : `Select ${requestedPassengers - selectedSeats.length} more ${
                    requestedPassengers - selectedSeats.length === 1
                      ? "seat"
                      : "seats"
                  }`}
            </button>

            <p className="mt-3 text-center text-[11px] leading-5 text-[#9699a3]">
              Your seat will be confirmed during booking.
            </p>
          </aside>
        </div>
      </div>
    </main>
  );
}

// ========================================
// Seat Button
// ========================================

function SeatButton({
  seat,
  selected,
  onClick,
}: {
  seat: Seat;
  selected: boolean;
  onClick: () => void;
}) {
  const disabled =
    seat.status === "booked" ||
    seat.status === "reserved" ||
    seat.status === "unavailable";

  let seatStyle =
    "border-[#b9bdc8] bg-white text-[#002451] hover:border-[#ff7417] hover:bg-[#fff8f3]";

  if (selected) {
    seatStyle = "border-[#ff7417] bg-[#ff7417] text-white shadow-sm";
  } else if (seat.status === "booked") {
    seatStyle =
      "cursor-not-allowed border-[#f2c7c1] bg-[#ffe1dc] text-[#c87c72]";
  } else if (seat.status === "reserved" || seat.status === "unavailable") {
    seatStyle =
      "cursor-not-allowed border-[#d9dbe2] bg-[#eceef2] text-[#a6a9b1]";
  }

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-label={`Seat ${seat.seatNumber}, ${seat.status}`}
      className={`relative flex h-12 items-center justify-center rounded-xl border text-xs font-bold transition ${seatStyle}`}
    >
      <span>{seat.seatNumber}</span>

      <span
        className={`absolute bottom-1 left-2 right-2 h-1 rounded-full ${
          selected
            ? "bg-white/40"
            : seat.status === "booked"
              ? "bg-[#e8aaa1]"
              : "bg-[#d8dae1]"
        }`}
      />
    </button>
  );
}
