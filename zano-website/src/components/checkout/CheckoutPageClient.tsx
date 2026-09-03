"use client";

// ========================================
// Imports
// ========================================

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  collection,
  documentId,
  doc,
  getDoc,
  getDocs,
  query,
  Timestamp,
  where,
} from "firebase/firestore";
import { onAuthStateChanged, type User } from "firebase/auth";
import { auth, db } from "@/lib/firebase/client";

// ========================================
// Types
// ========================================

type Trip = {
  id: string;
  origin: string;
  destination: string;
  companyName: string;
  busType: string;
  departureAt: Timestamp;
  arrivalAt: Timestamp;
  fare: number;
  status: string;
  scheduleType?: "daily" | "fixed";
  departureTime?: string;
  arrivalTime?: string;
  bookingEnabled?: boolean;
  bookingWindowDays?: number;
  operatingDays?: string[];
  inventoryType?: "date-based";
};

type SeatStatus = "available" | "reserved" | "booked" | "unavailable";

type Seat = {
  id: string;
  tripId: string;
  seatNumber: string;
  status: SeatStatus;
  price: number;
  isSeatTemplate?: boolean;
};

type PassengerProfile = {
  firstName?: string;
  lastName?: string;
  email?: string;
  phoneNumber?: string;
};

type BookingPassenger = {
  seatId: string;
  seatNumber: string;
  fullName: string;
  phoneNumber: string;
};

// ========================================
// Constants
// ========================================

const MAX_PASSENGERS = 10;
const DEFAULT_BOOKING_WINDOW_DAYS = 90;

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
// Helpers
// ========================================

function formatMoney(amount: number) {
  return new Intl.NumberFormat("en-GH", {
    style: "currency",
    currency: "GHS",
    minimumFractionDigits: 0,
  }).format(amount);
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

function formatTime(timestamp?: Timestamp) {
  if (!timestamp) return "--";

  return timestamp.toDate().toLocaleTimeString("en-GB", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function getPassengerCount(value: string | null) {
  const parsed = Number(value ?? "1");

  if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_PASSENGERS) {
    return null;
  }

  return parsed;
}

function buildPrimaryPassengerName(profile: PassengerProfile | null) {
  if (!profile) return "";

  return [profile.firstName, profile.lastName].filter(Boolean).join(" ").trim();
}

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

function createTripDateTime(travelDate: string, time: string): Timestamp | null {
  const dateMatch = travelDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const timeMatch = time.match(/^(\d{2}):(\d{2})$/);

  if (!dateMatch || !timeMatch) return null;

  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);
  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);

  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;

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

function getOperatingDay(travelDate: string) {
  const [year, month, day] = travelDate.split("-").map(Number);
  const date = new Date(year, month - 1, day, 12, 0, 0, 0);

  return DAY_NAMES[date.getDay()];
}

function resolveTripForTravelDate(trip: Trip, travelDate: string): Trip {
  if (!trip.departureTime || !trip.arrivalTime) {
    throw new Error("This trip does not have a complete daily schedule.");
  }

  if (trip.bookingEnabled === false) {
    throw new Error("Booking is currently disabled for this trip.");
  }

  const operatingDays = trip.operatingDays?.map((day) => day.toLowerCase()) ?? [];

  if (
    operatingDays.length > 0 &&
    !operatingDays.includes(getOperatingDay(travelDate))
  ) {
    throw new Error("This trip does not operate on the selected date.");
  }

  const departureAt = createTripDateTime(travelDate, trip.departureTime);
  let arrivalAt = createTripDateTime(travelDate, trip.arrivalTime);

  if (!departureAt || !arrivalAt) {
    throw new Error("The selected journey date is invalid.");
  }

  if (arrivalAt.toMillis() <= departureAt.toMillis()) {
    arrivalAt = Timestamp.fromMillis(
      arrivalAt.toMillis() + 24 * 60 * 60 * 1000,
    );
  }

  const now = Date.now();

  if (departureAt.toMillis() <= now) {
    throw new Error(
      "This journey has already departed. Please choose another date.",
    );
  }

  const bookingWindowDays =
    Number.isInteger(trip.bookingWindowDays) &&
    Number(trip.bookingWindowDays) > 0
      ? Number(trip.bookingWindowDays)
      : DEFAULT_BOOKING_WINDOW_DAYS;

  const latestDeparture =
    now + bookingWindowDays * 24 * 60 * 60 * 1000;

  if (departureAt.toMillis() > latestDeparture) {
    throw new Error(
      `Bookings are available up to ${bookingWindowDays} days in advance.`,
    );
  }

  return {
    ...trip,
    departureAt,
    arrivalAt,
  };
}

// ========================================
// Checkout Page
// ========================================

export default function CheckoutPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // ========================================
  // URL Parameters
  // ========================================

  const tripId = searchParams.get("tripId")?.trim() ?? "";
  const travelDate = searchParams.get("travelDate");

  const passengers = useMemo(
    () => getPassengerCount(searchParams.get("passengers")),
    [searchParams],
  );

  const seatIds = useMemo(() => {
    const value = searchParams.get("seats");

    if (!value) return [];

    return [
      ...new Set(
        value
          .split(",")
          .map((seatId) => seatId.trim())
          .filter(Boolean),
      ),
    ];
  }, [searchParams]);

  // ========================================
  // State
  // ========================================

  const [user, setUser] = useState<User | null>(null);

  const [profile, setProfile] = useState<PassengerProfile | null>(null);

  const [trip, setTrip] = useState<Trip | null>(null);

  const [seats, setSeats] = useState<Seat[]>([]);

  const [bookingPassengers, setBookingPassengers] = useState<
    BookingPassenger[]
  >([]);

  const [paymentMethod, setPaymentMethod] = useState("mobile-money");

  const [loading, setLoading] = useState(true);

  const [error, setError] = useState("");

  // ========================================
  // Demo Payment State
  // ========================================

  const [isPaying, setIsPaying] = useState(false);

  const [paymentError, setPaymentError] = useState("");

  // ========================================
  // Authentication + Checkout Validation
  // ========================================

  useEffect(() => {
    let active = true;

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (!currentUser) {
        const returnUrl = encodeURIComponent(
          window.location.pathname + window.location.search,
        );

        router.replace(`/login?returnUrl=${returnUrl}`);
        return;
      }

      if (!active) return;

      setUser(currentUser);

      try {
        setLoading(true);
        setError("");

        // ========================================
        // Validate URL Parameters
        // ========================================

        if (!tripId) {
          throw new Error("Trip information is missing.");
        }

        if (!passengers) {
          throw new Error(
            `Passenger count must be between 1 and ${MAX_PASSENGERS}.`,
          );
        }

        if (seatIds.length === 0) {
          throw new Error("No seats were selected.");
        }

        if (seatIds.length !== passengers) {
          throw new Error(
            "The selected seats do not match the passenger count.",
          );
        }

        // Firestore "in" queries support a limited number of values.
        // Zano currently caps one booking at 10 passengers.
        if (seatIds.length > MAX_PASSENGERS) {
          throw new Error(
            `A maximum of ${MAX_PASSENGERS} passengers can be booked at once.`,
          );
        }

        // ========================================
        // Load Passenger Profile
        // ========================================

        const userSnapshot = await getDoc(doc(db, "users", currentUser.uid));

        let loadedProfile: PassengerProfile | null = null;

        if (userSnapshot.exists()) {
          loadedProfile = userSnapshot.data() as PassengerProfile;

          if (active) {
            setProfile(loadedProfile);
          }
        }

        // ========================================
        // Load Trip
        // ========================================

        const tripSnapshot = await getDoc(doc(db, "trips", tripId));

        if (!tripSnapshot.exists()) {
          throw new Error("This trip no longer exists.");
        }

        let tripData = {
          id: tripSnapshot.id,
          ...tripSnapshot.data(),
        } as Trip;

        if (tripData.status !== "scheduled") {
          throw new Error("This trip is no longer available for booking.");
        }

        if (tripData.scheduleType === "daily") {
          if (!isValidTravelDate(travelDate)) {
            throw new Error("A valid travel date is required for this booking.");
          }

          tripData = resolveTripForTravelDate(tripData, travelDate);
        } else {
          if (!tripData.departureAt || !tripData.arrivalAt) {
            throw new Error("This trip schedule is incomplete.");
          }

          if (tripData.departureAt.toMillis() <= Date.now()) {
            throw new Error(
              "This trip has already departed or is no longer bookable.",
            );
          }
        }

        // ========================================
        // Load Selected Seats
        // ========================================

        const selectedSeatsQuery = query(
          collection(db, "seats"),
          where(documentId(), "in", seatIds),
        );

        const selectedSeatSnapshots = await getDocs(selectedSeatsQuery);

        const selectedSeatData = selectedSeatSnapshots.docs.map(
          (seatDocument) =>
            ({
              id: seatDocument.id,
              ...seatDocument.data(),
            }) as Seat,
        );

        // ========================================
        // Validate Selected Seats
        // ========================================

        if (selectedSeatData.length !== seatIds.length) {
          throw new Error("One or more selected seats could not be found.");
        }

        const invalidSeat = selectedSeatData.find((seat) => {
          if (seat.tripId !== tripId) {
            return true;
          }

          if (
            tripData.scheduleType === "daily" &&
            tripData.inventoryType === "date-based" &&
            seat.isSeatTemplate
          ) {
            return false;
          }

          return seat.status !== "available";
        });

        if (invalidSeat) {
          throw new Error(
            `Seat ${invalidSeat.seatNumber} is no longer available. Please choose another seat.`,
          );
        }

        // ========================================
        // Sort Seats
        // ========================================

        selectedSeatData.sort((a, b) =>
          a.seatNumber.localeCompare(b.seatNumber, undefined, {
            numeric: true,
            sensitivity: "base",
          }),
        );

        // ========================================
        // Build Passenger Records
        // ========================================

        const primaryPassengerName = buildPrimaryPassengerName(loadedProfile);

        const primaryPhoneNumber = loadedProfile?.phoneNumber?.trim() ?? "";

        const passengerData: BookingPassenger[] = selectedSeatData.map(
          (seat, index) => ({
            seatId: seat.id,
            seatNumber: seat.seatNumber,

            // Account holder is Passenger 1.
            fullName: index === 0 ? primaryPassengerName : "",

            phoneNumber: index === 0 ? primaryPhoneNumber : "",
          }),
        );

        if (!active) return;

        setTrip(tripData);
        setSeats(selectedSeatData);
        setBookingPassengers(passengerData);
      } catch (err) {
        console.error("Checkout validation error:", err);

        if (!active) return;

        setError(
          err instanceof Error ? err.message : "Unable to load checkout.",
        );
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [router, tripId, passengers, seatIds, travelDate]);

  // ========================================
  // Passenger Input Handler
  // ========================================

  function updatePassenger(
    index: number,
    field: "fullName" | "phoneNumber",
    value: string,
  ) {
    setBookingPassengers((current) =>
      current.map((passenger, passengerIndex) =>
        passengerIndex === index
          ? {
              ...passenger,
              [field]: value,
            }
          : passenger,
      ),
    );
  }

  // ========================================
  // Passenger Validation
  // ========================================

  const passengerValidation = (() => {
    if (!passengers) {
      return {
        valid: false,
        message: "Invalid passenger count.",
      };
    }

    if (bookingPassengers.length !== passengers) {
      return {
        valid: false,
        message: "Passenger details are incomplete.",
      };
    }

    for (let index = 0; index < bookingPassengers.length; index++) {
      const passenger = bookingPassengers[index];

      if (!passenger.fullName.trim()) {
        return {
          valid: false,
          message: `Enter the full name for Passenger ${index + 1}.`,
        };
      }

      // Primary passenger must have a phone number.
      if (index === 0 && !passenger.phoneNumber.trim()) {
        return {
          valid: false,
          message: "Enter a phone number for the primary passenger.",
        };
      }
    }

    return {
      valid: true,
      message: "",
    };
  })();

  // ========================================
  // Calculations
  // ========================================

  const totalFare = useMemo(() => {
    if (!trip) return 0;

    return trip.fare * seats.length;
  }, [trip, seats.length]);

  const selectedSeatNumbers = useMemo(
    () => seats.map((seat) => seat.seatNumber).join(", "),
    [seats],
  );

  // ========================================
  // Demo Payment Handler
  // ========================================

  async function handlePayment() {
    if (isPaying) {
      return;
    }

    setPaymentError("");

    // ========================================
    // Validate Checkout
    // ========================================

    if (!passengerValidation.valid) {
      setPaymentError(passengerValidation.message);

      return;
    }

    if (!user) {
      setPaymentError("Your session has expired. Please sign in again.");

      return;
    }

    if (!trip || !tripId) {
      setPaymentError("Trip information is unavailable.");

      return;
    }

    if (
      seats.length !== passengers ||
      bookingPassengers.length !== passengers
    ) {
      setPaymentError(
        "Your selected seats and passenger details do not match.",
      );

      return;
    }

    try {
      setIsPaying(true);

      // ========================================
      // Firebase Authentication Token
      // ========================================

      const idToken = await user.getIdToken();

      // ========================================
      // Build Passenger + Seat Payload
      // ========================================

      const paymentPassengers = bookingPassengers.map((passenger, index) => ({
        seatId: seats[index].id,

        fullName: passenger.fullName.trim(),

        phoneNumber: passenger.phoneNumber.trim(),
      }));

      // ========================================
      // Call Secure Server API
      // ========================================
      
const response = await fetch("/api/demo-payment", {
  method: "POST",

  headers: {
    "Content-Type": "application/json",

    Authorization: `Bearer ${idToken}`,
  },

  cache: "no-store",

  body: JSON.stringify({
    tripId,
    travelDate,
    passengers: paymentPassengers,
  }),
});

   const result = (await response.json()) as {
  success?: boolean;

  error?: string;

  booking?: {
    bookingId?: string;
    bookingReference?: string;

    paymentId?: string;
    paymentReference?: string;

    ticketId?: string;
    ticketNumber?: string;

    status?: string;
    paymentStatus?: string;

    passengerCount?: number;
    seatNumbers?: string[];

    fare?: number;
    subtotal?: number;
    bookingFee?: number;
    totalAmount?: number;

    currency?: string;
  };
};

      // ========================================
      // Handle API Failure
      // ========================================

      if (!response.ok || !result.success) {
        throw new Error(
          result.error || "The demo payment could not be completed.",
        );
      }

     const completedBooking = result.booking;

if (!completedBooking) {
  throw new Error(
    "The payment was completed but no booking information was returned.",
  );
}

const bookingId = completedBooking.bookingId;
const bookingReference = completedBooking.bookingReference;

const paymentId = completedBooking.paymentId;
const paymentReference = completedBooking.paymentReference;

const ticketId = completedBooking.ticketId;
const ticketNumber = completedBooking.ticketNumber;

// ========================================
// Validate Booking
// ========================================

if (!bookingId || !bookingReference) {
  throw new Error(
    "The payment was completed but the booking information is incomplete.",
  );
}

// ========================================
// Validate Payment
// ========================================

if (!paymentId || !paymentReference) {
  throw new Error(
    "The booking was created but the payment confirmation is incomplete.",
  );
}

if (
  completedBooking.status !== "confirmed" ||
  completedBooking.paymentStatus !== "successful"
) {
  throw new Error(
    "The booking or payment could not be confirmed.",
  );
}

// ========================================
// Validate Digital Ticket
// ========================================

if (!ticketId || !ticketNumber) {
  throw new Error(
    "Your booking was confirmed, but the digital ticket could not be verified.",
  );
}

// ========================================
// Validate Passenger + Seat Result
// ========================================

if (completedBooking.passengerCount !== passengers) {
  throw new Error(
    "The confirmed passenger count does not match your checkout.",
  );
}

if (
  !Array.isArray(completedBooking.seatNumbers) ||
  completedBooking.seatNumbers.length !== passengers
) {
  throw new Error(
    "The confirmed seat information is incomplete.",
  );
}

      // ========================================
      // Successful Booking + Demo Payment
      // ========================================

    router.replace(
  `/passenger/bookings/${encodeURIComponent(bookingId)}/confirmation`,
);
    } catch (paymentError) {
      console.error("Demo payment error:", paymentError);

      setPaymentError(
        paymentError instanceof Error
          ? paymentError.message
          : "We could not complete your demo payment. Please try again.",
      );
    } finally {
      setIsPaying(false);
    }
  }

  // ========================================
  // Loading State
  // ========================================

  if (loading) {
    return (
      <main className="min-h-screen bg-[#f8f7ff]">
        <div className="flex min-h-[70vh] items-center justify-center px-5">
          <div className="text-center">
            <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-[#002451]/15 border-t-[#ff7417]" />

            <p className="mt-4 text-sm font-medium text-[#747680]">
              Preparing your checkout...
            </p>
          </div>
        </div>
      </main>
    );
  }

  // ========================================
  // Error State
  // ========================================

  if (error || !trip || !user || !passengers) {
    return (
      <main className="min-h-screen bg-[#f8f7ff] px-5 py-12">
        <div className="mx-auto max-w-lg rounded-3xl bg-white p-8 text-center shadow-sm">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#fff1e8] text-xl font-bold text-[#ff7417]">
            !
          </div>

          <h1 className="mt-5 text-xl font-bold text-[#002451]">
            Unable to continue
          </h1>

          <p className="mt-2 text-sm leading-6 text-[#747680]">
            {error || "Checkout could not be loaded."}
          </p>

          <button
            type="button"
            onClick={() => router.back()}
            className="mt-6 rounded-xl bg-[#002451] px-6 py-3 text-sm font-semibold text-white transition hover:opacity-90"
          >
            Go Back
          </button>
        </div>
      </main>
    );
  }

  // ========================================
  // Main Checkout UI
  // ========================================

  return (
    <main className="min-h-screen bg-[#f8f7ff] pb-32">
      {/* ========================================
          Header
      ======================================== */}

      <header className="border-b border-black/5 bg-white">
        <div className="mx-auto flex max-w-5xl items-center gap-4 px-5 py-4">
          <button
            type="button"
            onClick={() => router.back()}
            aria-label="Go back"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#dfe1e8] text-xl text-[#002451] transition hover:bg-[#f8f7ff]"
          >
            ←
          </button>

          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#ff7417]">
              Checkout
            </p>

            <h1 className="truncate text-xl font-bold text-[#002451]">
              Confirm Your Trip
            </h1>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-5xl gap-5 px-5 py-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-5">
          {/* ========================================
              Trip Summary
          ======================================== */}

          <section className="overflow-hidden rounded-3xl bg-white shadow-sm">
            <div className="bg-[#002451] p-6 text-white">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-white/65">
                    {trip.companyName}
                  </p>

                  <h2 className="mt-1 text-xl font-bold">
                    {trip.origin} → {trip.destination}
                  </h2>

                  <p className="mt-2 text-sm text-white/65">{trip.busType}</p>
                </div>

                <div className="rounded-xl bg-white/10 px-4 py-3 text-right">
                  <p className="text-xs text-white/60">Fare per passenger</p>

                  <p className="mt-1 text-lg font-bold text-white">
                    {formatMoney(trip.fare)}
                  </p>
                </div>
              </div>
            </div>

            <div className="p-6">
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-[#9a9da8]">
                    Departure
                  </p>

                  <p className="mt-2 text-xl font-bold text-[#002451]">
                    {formatTime(trip.departureAt)}
                  </p>

                  <p className="mt-1 text-sm text-[#747680]">{trip.origin}</p>
                </div>

                <div className="flex items-center">
                  <div className="h-px w-5 bg-[#d7d9e0] sm:w-10" />

                  <span className="mx-2 text-[#ff7417]">→</span>

                  <div className="h-px w-5 bg-[#d7d9e0] sm:w-10" />
                </div>

                <div className="text-right">
                  <p className="text-xs font-bold uppercase tracking-wide text-[#9a9da8]">
                    Arrival
                  </p>

                  <p className="mt-2 text-xl font-bold text-[#002451]">
                    {formatTime(trip.arrivalAt)}
                  </p>

                  <p className="mt-1 text-sm text-[#747680]">
                    {trip.destination}
                  </p>
                </div>
              </div>

              <div className="mt-5 border-t border-[#ececf1] pt-5">
                <p className="text-sm font-semibold text-[#002451]">
                  {formatDate(trip.departureAt)}
                </p>

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold text-[#747680]">
                    {seats.length === 1 ? "Selected seat:" : "Selected seats:"}
                  </span>

                  {seats.map((seat) => (
                    <span
                      key={seat.id}
                      className="rounded-lg bg-[#002451] px-3 py-2 text-sm font-bold text-white"
                    >
                      {seat.seatNumber}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* ========================================
              Passenger Details
          ======================================== */}

          <section className="rounded-3xl bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-[#002451]">
                  Passenger details
                </h2>

                <p className="mt-1 text-sm leading-6 text-[#747680]">
                  Enter the name of each passenger travelling on this booking.
                </p>
              </div>

              <span className="rounded-full bg-[#f3f5f8] px-3 py-1.5 text-xs font-bold text-[#002451]">
                {passengers} {passengers === 1 ? "Passenger" : "Passengers"}
              </span>
            </div>

            <div className="mt-6 space-y-5">
              {bookingPassengers.map((passenger, index) => (
                <div
                  key={passenger.seatId}
                  className="rounded-2xl border border-[#e1e3e8] p-5"
                >
                  {/* ========================================
                      Passenger Header
                  ======================================== */}

                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="font-bold text-[#002451]">
                        Passenger {index + 1}
                      </p>

                      {index === 0 && (
                        <p className="mt-1 text-xs text-[#747680]">
                          Primary passenger
                        </p>
                      )}
                    </div>

                    <span className="rounded-lg bg-[#fff1e8] px-3 py-2 text-sm font-bold text-[#ff7417]">
                      Seat {passenger.seatNumber}
                    </span>
                  </div>

                  {/* ========================================
                      Passenger Form
                  ======================================== */}

                  <div className="mt-5 grid gap-4 sm:grid-cols-2">
                    <div>
                      <label
                        htmlFor={`passenger-name-${index}`}
                        className="mb-2 block text-xs font-semibold text-[#626672]"
                      >
                        Full name
                        <span className="ml-1 text-[#ff7417]">*</span>
                      </label>

                      <input
                        id={`passenger-name-${index}`}
                        type="text"
                        autoComplete={index === 0 ? "name" : "off"}
                        value={passenger.fullName}
                        onChange={(event) =>
                          updatePassenger(index, "fullName", event.target.value)
                        }
                        placeholder="Enter passenger full name"
                        className="w-full rounded-xl border border-[#dfe1e8] bg-white px-4 py-3 text-sm text-[#002451] outline-none transition placeholder:text-[#b0b3bb] focus:border-[#ff7417] focus:ring-2 focus:ring-[#ff7417]/10"
                      />
                    </div>

                    <div>
                      <label
                        htmlFor={`passenger-phone-${index}`}
                        className="mb-2 block text-xs font-semibold text-[#626672]"
                      >
                        Phone number
                        {index === 0 ? (
                          <span className="ml-1 text-[#ff7417]">*</span>
                        ) : (
                          <span className="ml-1 font-normal text-[#9a9da8]">
                            (optional)
                          </span>
                        )}
                      </label>

                      <input
                        id={`passenger-phone-${index}`}
                        type="tel"
                        inputMode="tel"
                        autoComplete={index === 0 ? "tel" : "off"}
                        value={passenger.phoneNumber}
                        onChange={(event) =>
                          updatePassenger(
                            index,
                            "phoneNumber",
                            event.target.value,
                          )
                        }
                        placeholder="+233..."
                        className="w-full rounded-xl border border-[#dfe1e8] bg-white px-4 py-3 text-sm text-[#002451] outline-none transition placeholder:text-[#b0b3bb] focus:border-[#ff7417] focus:ring-2 focus:ring-[#ff7417]/10"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* ========================================
                Booking Contact
            ======================================== */}

            <div className="mt-5 rounded-2xl bg-[#f7f7fa] p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-[#92959f]">
                Booking contact
              </p>

              <p className="mt-2 break-all text-sm font-semibold text-[#002451]">
                {profile?.email || user.email || "No email provided"}
              </p>

              <p className="mt-1 text-xs leading-5 text-[#747680]">
                Booking confirmation and ticket information will be sent to the
                account holder.
              </p>
            </div>
          </section>

          {/* ========================================
              Payment Method
          ======================================== */}

          <section className="rounded-3xl bg-white p-6 shadow-sm">
            <h2 className="text-lg font-bold text-[#002451]">Payment method</h2>

            <p className="mt-1 text-sm text-[#747680]">
              Choose how you want to pay for this booking.
            </p>

            <label className="mt-5 flex cursor-pointer items-center gap-4 rounded-2xl border-2 border-[#ff7417] bg-[#fffaf6] p-4">
              <input
                type="radio"
                name="payment"
                value="mobile-money"
                checked={paymentMethod === "mobile-money"}
                onChange={() => setPaymentMethod("mobile-money")}
                className="h-4 w-4 accent-[#ff7417]"
              />

              <div className="min-w-0 flex-1">
                <p className="font-bold text-[#002451]">Mobile Money</p>

                <p className="mt-1 text-xs leading-5 text-[#747680]">
                  Pay securely using your mobile money account.
                </p>
              </div>

              <span className="shrink-0 rounded-lg bg-[#002451] px-3 py-2 text-xs font-bold text-white">
                MoMo
              </span>
            </label>
          </section>
        </div>

        {/* ========================================
            Booking Summary
        ======================================== */}

        <aside className="h-fit rounded-3xl bg-white p-6 shadow-sm lg:sticky lg:top-5">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#ff7417]">
            Booking summary
          </p>

          <h2 className="mt-1 text-xl font-bold text-[#002451]">Your total</h2>

          {/* ========================================
              Route
          ======================================== */}

          <div className="mt-5 rounded-2xl bg-[#f7f7fa] p-4">
            <p className="text-sm font-bold text-[#002451]">
              {trip.origin} → {trip.destination}
            </p>

            <p className="mt-1 text-xs text-[#747680]">
              {formatDate(trip.departureAt)}
            </p>

            <p className="mt-1 text-xs text-[#747680]">
              Departure {formatTime(trip.departureAt)}
            </p>
          </div>

          {/* ========================================
              Seat Summary
          ======================================== */}

          <div className="mt-5">
            <div className="flex justify-between gap-4 text-sm">
              <span className="text-[#747680]">
                {seats.length === 1 ? "Seat" : "Seats"}
              </span>

              <span className="text-right font-semibold text-[#002451]">
                {selectedSeatNumbers}
              </span>
            </div>

            <div className="mt-4 flex justify-between gap-4 text-sm">
              <span className="text-[#747680]">Passengers</span>

              <span className="font-semibold text-[#002451]">{passengers}</span>
            </div>
          </div>

          {/* ========================================
              Price Summary
          ======================================== */}

          <div className="mt-5 space-y-4 border-t border-[#ececf1] pt-5 text-sm">
            <div className="flex justify-between gap-4">
              <span className="text-[#747680]">
                {formatMoney(trip.fare)} × {seats.length}
              </span>

              <span className="font-semibold text-[#002451]">
                {formatMoney(totalFare)}
              </span>
            </div>

            <div className="flex justify-between gap-4">
              <span className="text-[#747680]">Booking fee</span>

              <span className="font-semibold text-[#002451]">
                {formatMoney(0)}
              </span>
            </div>
          </div>

          {/* ========================================
              Total
          ======================================== */}

          <div className="mt-6 flex items-end justify-between border-t border-[#ececf1] pt-5">
            <div>
              <p className="font-semibold text-[#002451]">Total</p>

              <p className="mt-1 text-xs text-[#92959f]">Taxes included</p>
            </div>

            <span className="text-2xl font-bold text-[#002451]">
              {formatMoney(totalFare)}
            </span>
          </div>

          {/* ========================================
              Validation Message
          ======================================== */}

          {!passengerValidation.valid && (
            <div className="mt-5 rounded-xl bg-[#fff6f3] px-4 py-3">
              <p className="text-xs leading-5 text-[#b4533d]">
                {passengerValidation.message}
              </p>
            </div>
          )}

          {/* ========================================
              Payment Button
          ======================================== */}

          {/* ========================================
    Payment Error
======================================== */}

          {paymentError && (
            <div
              role="alert"
              className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3"
            >
              <p className="text-xs font-medium leading-5 text-red-700">
                {paymentError}
              </p>
            </div>
          )}

          {/* ========================================
    Demo Payment Button
======================================== */}

          <button
            type="button"
            onClick={handlePayment}
            disabled={
              isPaying ||
              !passengerValidation.valid ||
              !user ||
              !trip ||
              seats.length !== passengers
            }
            className="mt-6 flex w-full items-center justify-center rounded-xl bg-[#ff7417] px-5 py-4 font-bold text-white transition hover:bg-[#e96208] disabled:cursor-not-allowed disabled:bg-[#ff7417]/60"
          >
            {isPaying
              ? "Processing demo payment..."
              : `Pay ${formatMoney(totalFare)}`}
          </button>

          <p className="mt-3 text-center text-[11px] leading-5 text-[#92959f]">
            Demo payment only. No real money will be charged.
          </p>
        </aside>
      </div>
    </main>
  );
}