"use client";

/* ========================================
   Imports
======================================== */

import Image from "next/image";
import Link from "next/link";
import {
  useRouter,
  useSearchParams,
} from "next/navigation";

import {
  FormEvent,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  collection,
  getDocs,
  query,
  Timestamp,
  where,
} from "firebase/firestore";

import {
  onAuthStateChanged,
} from "firebase/auth";

import { auth, db } from "@/lib/firebase/client";

/* ========================================
   Types
======================================== */

type Trip = {
  id: string;

  companyId: string;
  companyName: string;

  routeId: string;

  origin: string;
  destination: string;

  departureAt:
    | Timestamp
    | Date
    | string;

  arrivalAt:
    | Timestamp
    | Date
    | string;

  fare: number;

  busType: string;

  availableSeats: number;
  totalSeats: number;

  amenities?: string[];

  status: string;

scheduleType?: "daily" | "fixed";
departureTime?: string;
arrivalTime?: string;
bookingEnabled?: boolean;
bookingWindowDays?: number;

// Date selected by the passenger for this journey.
travelDate?: string;
};

type SortOption =
  | "departure"
  | "price"
  | "seats";

/* ========================================
   Search Trips Page
======================================== */

export default function SearchPage() {
  const router = useRouter();

  const searchParams =
    useSearchParams();

  /* ========================================
     URL Search Values
  ======================================== */

  const urlFrom =
    searchParams.get("from") ?? "";

  const urlTo =
    searchParams.get("to") ?? "";

  const urlDate =
    searchParams.get("date") ?? "";

  const urlPassengers =
    Number(
      searchParams.get(
        "passengers"
      ) ?? "1"
    );

  /* ========================================
     Search Form State
  ======================================== */

  const [fromLocation, setFromLocation] =
    useState(urlFrom);

  const [toLocation, setToLocation] =
    useState(urlTo);

  const [travelDate, setTravelDate] =
    useState(urlDate);

  const [passengers, setPassengers] =
    useState(
      Number.isFinite(
        urlPassengers
      ) &&
        urlPassengers >= 1
        ? urlPassengers
        : 1
    );

  /* ========================================
     Results State
  ======================================== */

  const [trips, setTrips] =
    useState<Trip[]>([]);

  const [sortOption, setSortOption] =
    useState<SortOption>(
      "departure"
    );

  const [isLoading, setIsLoading] =
    useState(true);

  const [errorMessage, setErrorMessage] =
    useState("");

  /* ========================================
     Authentication + Trip Search
  ======================================== */

  useEffect(() => {
    const unsubscribe =
      onAuthStateChanged(
        auth,
        async (user) => {
          if (!user) {
            const returnUrl =
              `/search?${searchParams.toString()}`;

            router.replace(
              `/login?returnUrl=${encodeURIComponent(
                returnUrl
              )}`
            );

            return;
          }

          try {
            setIsLoading(true);
            setErrorMessage("");

            /* ========================================
               Require Search Criteria
            ======================================== */

            if (
              !urlFrom ||
              !urlTo
            ) {
              setTrips([]);
              return;
            }

            /* ========================================
               Query Firestore

               We query the route/status first.

               Date filtering is performed below
               against timestamps to avoid relying
               on string dates.
            ======================================== */

            const tripsQuery =
              query(
                collection(
                  db,
                  "trips"
                ),
                where(
                  "origin",
                  "==",
                  urlFrom
                ),
                where(
                  "destination",
                  "==",
                  urlTo
                ),
                where(
                  "status",
                  "==",
                  "scheduled"
                )
              );

            const snapshot =
              await getDocs(
                tripsQuery
              );

            const rows =
              snapshot.docs.map(
                (
                  documentSnapshot
                ) => ({
                  id:
                    documentSnapshot.id,
                  ...documentSnapshot.data(),
                })
              ) as Trip[];

            /* ========================================
               Filter Invalid / Unavailable Trips
            ======================================== */

    const filtered = rows
  .map((trip) => {
    const originalDeparture =
      getDate(trip.departureAt);

    const originalArrival =
      getDate(trip.arrivalAt);

    if (
      !originalDeparture ||
      !originalArrival
    ) {
      return null;
    }

    /* ========================================
       Daily Recurring Trip
    ======================================== */

    if (
      trip.scheduleType === "daily" &&
      urlDate
    ) {
      if (
        trip.bookingEnabled === false
      ) {
        return null;
      }

      const departureTime =
        trip.departureTime ??
        `${String(
          originalDeparture.getUTCHours()
        ).padStart(2, "0")}:${String(
          originalDeparture.getUTCMinutes()
        ).padStart(2, "0")}`;

      const arrivalTime =
        trip.arrivalTime ??
        `${String(
          originalArrival.getUTCHours()
        ).padStart(2, "0")}:${String(
          originalArrival.getUTCMinutes()
        ).padStart(2, "0")}`;

      const departure =
        createTripDateTime(
          urlDate,
          departureTime
        );

      let arrival =
        createTripDateTime(
          urlDate,
          arrivalTime
        );

      if (!departure || !arrival) {
        return null;
      }

      // Handle overnight journeys.
      if (
        arrival.getTime() <=
        departure.getTime()
      ) {
        arrival = new Date(
          arrival.getTime() +
            24 * 60 * 60 * 1000
        );
      }

      /* ========================================
         Do not show already departed journeys
      ======================================== */

      if (
        departure.getTime() <
        Date.now()
      ) {
        return null;
      }

      /* ========================================
         Booking Window
      ======================================== */

      const bookingWindowDays =
        trip.bookingWindowDays ?? 90;

      const latestBookingDate =
        new Date();

      latestBookingDate.setHours(
        23,
        59,
        59,
        999
      );

      latestBookingDate.setDate(
        latestBookingDate.getDate() +
          bookingWindowDays
      );

      if (
        departure.getTime() >
        latestBookingDate.getTime()
      ) {
        return null;
      }

      /* ========================================
         Passenger Capacity
      ======================================== */

      if (
        trip.availableSeats <
        passengers
      ) {
        return null;
      }

      return {
        ...trip,

        // Use the passenger-selected date.
        departureAt: departure,
        arrivalAt: arrival,
        travelDate: urlDate,
      } satisfies Trip;
    }

    /* ========================================
       Fixed-Date Trip
    ======================================== */

    if (
      originalDeparture.getTime() <
      Date.now()
    ) {
      return null;
    }

    if (
      trip.availableSeats <
      passengers
    ) {
      return null;
    }

    if (
      urlDate &&
      !isSameLocalDate(
        originalDeparture,
        urlDate
      )
    ) {
      return null;
    }

    return {
      ...trip,
      travelDate: urlDate,
    } satisfies Trip;
  })
  .filter(
  (trip) => trip !== null
) as Trip[];

            setTrips(filtered);
          } catch (error) {
            console.error(
              "Trip search error:",
              error
            );

            setErrorMessage(
              "We could not load available trips. Please try again."
            );
            setTrips([]);
          } finally {
            setIsLoading(false);
          }
        }
      );

    return unsubscribe;
  }, [
    router,
    searchParams,
    urlFrom,
    urlTo,
    urlDate,
    passengers,
  ]);

  /* ========================================
     Sorted Results
  ======================================== */

  const sortedTrips =
    useMemo(() => {
      return [...trips].sort(
        (a, b) => {
          if (
            sortOption ===
            "price"
          ) {
            return (
              a.fare -
              b.fare
            );
          }

          if (
            sortOption ===
            "seats"
          ) {
            return (
              b.availableSeats -
              a.availableSeats
            );
          }

          return (
            getDate(
              a.departureAt
            )!.getTime() -
            getDate(
              b.departureAt
            )!.getTime()
          );
        }
      );
    }, [
      trips,
      sortOption,
    ]);

  /* ========================================
     Search Again
  ======================================== */

  function handleSearch(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    const from =
      fromLocation.trim();

    const to =
      toLocation.trim();

    if (
      !from ||
      !to ||
      !travelDate
    ) {
      setErrorMessage(
        "Enter your departure, destination and travel date."
      );

      return;
    }

    if (
      from.toLowerCase() ===
      to.toLowerCase()
    ) {
      setErrorMessage(
        "Departure and destination cannot be the same."
      );

      return;
    }

    const params =
      new URLSearchParams({
        from,
        to,
        date: travelDate,
        passengers:
          String(passengers),
      });

    router.push(
      `/search?${params.toString()}`
    );
  }

  /* ========================================
     Swap Locations
  ======================================== */

  function handleSwap() {
    const previousFrom =
      fromLocation;

    setFromLocation(
      toLocation
    );

    setToLocation(
      previousFrom
    );
  }

  /* ========================================
     Page
  ======================================== */

  return (
    <main className="min-h-screen bg-[#f8f7ff] text-[#101828]">

      {/* ========================================
          Header
      ======================================== */}

      <header className="border-b border-[#e6e9ef] bg-white">
        <div className="mx-auto flex h-[82px] max-w-[1400px] items-center justify-between px-5 sm:px-7 lg:px-10">

          <Link
            href="/passenger/dashboard"
            className="flex items-center"
          >
            <Image
              src="/zano.webp"
              alt="Zano"
              width={150}
              height={65}
              priority
              className="h-auto w-[105px] sm:w-[120px]"
            />
          </Link>

          <div className="flex items-center gap-3">

            <Link
              href="/passenger/trips"
              className="hidden text-sm font-bold text-[#475467] transition hover:text-[#002451] sm:block"
            >
              My Trips
            </Link>

            <Link
              href="/passenger/tickets"
              className="hidden text-sm font-bold text-[#475467] transition hover:text-[#002451] sm:block"
            >
              Tickets
            </Link>

            <Link
              href="/passenger/profile"
              className="flex h-10 w-10 items-center justify-center rounded-full bg-[#002451] text-white"
              aria-label="Profile"
            >
              <PersonIcon />
            </Link>
          </div>
        </div>
      </header>

      {/* ========================================
          Search Heading
      ======================================== */}

      <section className="bg-[#002451] px-5 pb-24 pt-12 text-white sm:px-7 lg:px-10">

        <div className="mx-auto max-w-[1400px]">

          <Link
            href="/passenger/dashboard"
            className="inline-flex items-center gap-2 text-sm font-bold text-white/70 transition hover:text-white"
          >
            <ArrowLeftIcon />

            Back to home
          </Link>

          <div className="mt-7 flex flex-col justify-between gap-5 lg:flex-row lg:items-end">

            <div>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-[#72d8ff]">
                Find your journey
              </p>

              <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl lg:text-5xl">
                {urlFrom &&
                urlTo
                  ? `${urlFrom} → ${urlTo}`
                  : "Search Trips"}
              </h1>

              {urlDate && (
                <p className="mt-3 text-sm font-semibold text-white/70">
                  {formatSearchDate(
                    urlDate
                  )}
                  {" • "}
                  {passengers}{" "}
                  {passengers ===
                  1
                    ? "passenger"
                    : "passengers"}
                </p>
              )}
            </div>

            {!isLoading &&
              sortedTrips.length >
                0 && (
                <p className="text-sm font-semibold text-white/70">
                  {
                    sortedTrips.length
                  }{" "}
                  {sortedTrips.length ===
                  1
                    ? "trip"
                    : "trips"}{" "}
                  available
                </p>
              )}
          </div>
        </div>
      </section>

      {/* ========================================
          Search Form
      ======================================== */}

      <section className="relative z-10 -mt-14 px-4 sm:px-6">

        <form
          onSubmit={handleSearch}
          className="mx-auto grid max-w-[1400px] gap-4 rounded-[22px] border border-[#e5e7eb] bg-white p-5 shadow-[0_18px_55px_rgba(0,36,81,0.14)] md:grid-cols-2 lg:grid-cols-[1fr_1fr_0.9fr_0.7fr_auto] lg:items-end"
        >

          <SearchField
            id="search-from"
            label="From"
            value={
              fromLocation
            }
            placeholder="Departure city"
            onChange={
              setFromLocation
            }
          />

          <div className="relative">

            <button
              type="button"
              onClick={
                handleSwap
              }
              aria-label="Swap locations"
              className="absolute -left-7 top-[38px] z-10 hidden h-10 w-10 items-center justify-center rounded-full border border-[#e5e7eb] bg-white text-[#002451] shadow lg:flex"
            >
              <SwapIcon />
            </button>

            <SearchField
              id="search-to"
              label="To"
              value={
                toLocation
              }
              placeholder="Destination"
              onChange={
                setToLocation
              }
            />
          </div>

          <div>
            <label
              htmlFor="search-date"
              className="mb-2 block text-xs font-bold text-[#344054]"
            >
              Travel date
            </label>

            <input
              id="search-date"
              type="date"
              required
              min={
                getTodayInput()
              }
              value={
                travelDate
              }
              onChange={(
                event
              ) =>
                setTravelDate(
                  event.target
                    .value
                )
              }
              className="h-14 w-full rounded-xl border border-[#d8dee8] bg-white px-4 text-sm font-semibold outline-none transition focus:border-[#39b5f4] focus:ring-2 focus:ring-[#39b5f4]/10"
            />
          </div>

          <div>
            <label
              htmlFor="search-passengers"
              className="mb-2 block text-xs font-bold text-[#344054]"
            >
              Passengers
            </label>

            <select
              id="search-passengers"
              value={
                passengers
              }
              onChange={(
                event
              ) =>
                setPassengers(
                  Number(
                    event.target
                      .value
                  )
                )
              }
              className="h-14 w-full rounded-xl border border-[#d8dee8] bg-white px-4 text-sm font-semibold outline-none transition focus:border-[#39b5f4]"
            >
              {[1, 2, 3, 4, 5, 6].map(
                (number) => (
                  <option
                    key={number}
                    value={number}
                  >
                    {number}
                  </option>
                )
              )}
            </select>
          </div>

          <button
            type="submit"
            className="flex h-14 items-center justify-center gap-2 rounded-xl bg-[#ff7417] px-7 text-sm font-black text-white transition hover:bg-[#e96308]"
          >
            <SearchIcon />

            Search
          </button>
        </form>
      </section>

      {/* ========================================
          Results
      ======================================== */}

      <section className="mx-auto max-w-[1400px] px-5 pb-20 pt-12 sm:px-7 lg:px-10">

        {errorMessage && (
          <div
            role="alert"
            className="mb-7 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700"
          >
            {errorMessage}
          </div>
        )}

        {/* ========================================
            Sort
        ======================================== */}

        {!isLoading &&
          sortedTrips.length >
            0 && (
            <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">

              <div>
                <h2 className="text-xl font-black text-[#101828]">
                  Available Trips
                </h2>

                <p className="mt-1 text-sm text-[#667085]">
                  Compare departure
                  times, fares and
                  available seats.
                </p>
              </div>

              <div className="flex flex-wrap gap-2">

                <SortButton
                  active={
                    sortOption ===
                    "departure"
                  }
                  onClick={() =>
                    setSortOption(
                      "departure"
                    )
                  }
                >
                  Earliest
                </SortButton>

                <SortButton
                  active={
                    sortOption ===
                    "price"
                  }
                  onClick={() =>
                    setSortOption(
                      "price"
                    )
                  }
                >
                  Lowest Price
                </SortButton>

                <SortButton
                  active={
                    sortOption ===
                    "seats"
                  }
                  onClick={() =>
                    setSortOption(
                      "seats"
                    )
                  }
                >
                  Most Seats
                </SortButton>
              </div>
            </div>
          )}

        {/* ========================================
            Loading
        ======================================== */}

        {isLoading && (
          <TripResultsLoading />
        )}

        {/* ========================================
            Empty
        ======================================== */}

        {!isLoading &&
          sortedTrips.length ===
            0 &&
          !errorMessage && (
            <EmptyResults
              from={urlFrom}
              to={urlTo}
              date={urlDate}
            />
          )}

        {/* ========================================
            Trip Cards
        ======================================== */}

        {!isLoading &&
          sortedTrips.length >
            0 && (
            <div className="space-y-5">

              {sortedTrips.map(
                (trip) => (
                  <TripCard
                    key={
                      trip.id
                    }
                    trip={
                      trip
                    }
                    passengers={
                      passengers
                    }
                  />
                )
              )}
            </div>
          )}
      </section>
    </main>
  );
}

/* ========================================
   Trip Card
======================================== */

function TripCard({
  trip,
  passengers,
}: {
  trip: Trip;
  passengers: number;
}) {
  const departure =
    getDate(
      trip.departureAt
    );

  const arrival =
    getDate(
      trip.arrivalAt
    );

  return (
    <article className="overflow-hidden rounded-[22px] border border-[#e5e9ef] bg-white shadow-sm transition hover:border-[#cbd7e5] hover:shadow-lg">

      <div className="grid lg:grid-cols-[220px_1fr_auto]">

        {/* ========================================
            Operator
        ======================================== */}

        <div className="flex items-center gap-4 border-b border-[#edf0f3] bg-[#f9fafb] p-6 lg:block lg:border-b-0 lg:border-r">

          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#002451] text-lg font-black text-white">
            {getCompanyInitials(
              trip.companyName
            )}
          </div>

          <div className="lg:mt-4">

            <p className="font-black text-[#101828]">
              {trip.companyName}
            </p>

            <p className="mt-1 text-xs font-semibold text-[#667085]">
              {trip.busType}
            </p>
          </div>
        </div>

        {/* ========================================
            Journey
        ======================================== */}

        <div className="p-6 sm:p-7">

          <div className="grid items-center gap-5 sm:grid-cols-[auto_1fr_auto]">

            <TripTime
              label={
                trip.origin
              }
              date={
                departure
              }
            />

            <div className="hidden items-center sm:flex">

              <div className="h-2.5 w-2.5 rounded-full border-2 border-[#002451] bg-white" />

              <div className="relative h-px flex-1 bg-[#ccd5df]">

                <BusJourneyIcon />

              </div>

              <div className="h-2.5 w-2.5 rounded-full bg-[#ff7417]" />
            </div>

            <TripTime
              label={
                trip.destination
              }
              date={
                arrival
              }
              alignRight
            />
          </div>

          <div className="mt-6 flex flex-wrap gap-2">

            <TripPill>
              {trip.availableSeats}{" "}
              seats available
            </TripPill>

            <TripPill>
              {trip.busType}
            </TripPill>

            {trip.amenities
              ?.slice(0, 3)
              .map(
                (amenity) => (
                  <TripPill
                    key={
                      amenity
                    }
                  >
                    {amenity}
                  </TripPill>
                )
              )}
          </div>
        </div>

        {/* ========================================
            Fare / CTA
        ======================================== */}

        <div className="flex flex-row items-center justify-between gap-5 border-t border-[#edf0f3] p-6 lg:min-w-[220px] lg:flex-col lg:items-end lg:justify-center lg:border-l lg:border-t-0">

          <div className="lg:text-right">

            <p className="text-xs font-semibold text-[#98a2b3]">
              Fare per passenger
            </p>

            <p className="mt-1 text-2xl font-black text-[#002451]">
              {formatMoney(
                trip.fare
              )}
            </p>

            {passengers >
              1 && (
              <p className="mt-1 text-xs font-semibold text-[#667085]">
                {formatMoney(
                  trip.fare *
                    passengers
                )}{" "}
                total
              </p>
            )}
          </div>

          <Link
            href={`/trips/${trip.id}?${new URLSearchParams({
              passengers: String(passengers),
              ...(trip.travelDate
                ? { travelDate: trip.travelDate }
                : {}),
            }).toString()}`}
            className="flex h-12 items-center justify-center rounded-xl bg-[#ff7417] px-6 text-sm font-black text-white transition hover:bg-[#e96308]"
          >
            View Trip
          </Link>
        </div>
      </div>
    </article>
  );
}

/* ========================================
   Trip Time
======================================== */

function TripTime({
  label,
  date,
  alignRight = false,
}: {
  label: string;
  date: Date | null;
  alignRight?: boolean;
}) {
  return (
    <div
      className={
        alignRight
          ? "sm:text-right"
          : ""
      }
    >
      <p className="text-2xl font-black text-[#101828]">
        {date
          ? formatTime(
              date
            )
          : "--:--"}
      </p>

      <p className="mt-1 text-sm font-bold text-[#667085]">
        {label}
      </p>
    </div>
  );
}

/* ========================================
   Search Field
======================================== */

function SearchField({
  id,
  label,
  value,
  placeholder,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  placeholder: string;
  onChange: (
    value: string
  ) => void;
}) {
  return (
    <div>

      <label
        htmlFor={id}
        className="mb-2 block text-xs font-bold text-[#344054]"
      >
        {label}
      </label>

      <input
        id={id}
        value={value}
        required
        autoComplete="off"
        placeholder={placeholder}
        onChange={(
          event
        ) =>
          onChange(
            event.target.value
          )
        }
        className="h-14 w-full rounded-xl border border-[#d8dee8] bg-white px-4 text-sm font-semibold outline-none transition focus:border-[#39b5f4] focus:ring-2 focus:ring-[#39b5f4]/10"
      />
    </div>
  );
}

/* ========================================
   Sort Button
======================================== */

function SortButton({
  children,
  active,
  onClick,
}: {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-4 py-2 text-xs font-extrabold transition ${
        active
          ? "border-[#002451] bg-[#002451] text-white"
          : "border-[#d9dee7] bg-white text-[#475467] hover:border-[#002451]"
      }`}
    >
      {children}
    </button>
  );
}

/* ========================================
   Trip Pill
======================================== */

function TripPill({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <span className="rounded-full bg-[#f2f4f7] px-3 py-1.5 text-xs font-bold text-[#475467]">
      {children}
    </span>
  );
}

/* ========================================
   Empty Results
======================================== */

function EmptyResults({
  from,
  to,
  date,
}: {
  from: string;
  to: string;
  date: string;
}) {
  return (
    <div className="rounded-[24px] border border-dashed border-[#cfd6df] bg-white px-6 py-16 text-center">

      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#eaf8ff] text-[#002451]">
        <BusIcon />
      </div>

      <h2 className="mt-5 text-xl font-black text-[#101828]">
        No trips found
      </h2>

      <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-[#667085]">
        {from &&
        to
          ? `There are currently no scheduled trips from ${from} to ${to}${
              date
                ? ` on ${formatSearchDate(
                    date
                  )}`
                : ""
            }.`
          : "Enter your journey details above to find available trips."}
      </p>

      <p className="mt-3 text-sm text-[#667085]">
        Try another date or destination.
      </p>
    </div>
  );
}

/* ========================================
   Loading Results
======================================== */

function TripResultsLoading() {
  return (
    <div className="space-y-5 animate-pulse">

      {[1, 2, 3].map(
        (item) => (
          <div
            key={item}
            className="h-[220px] rounded-[22px] bg-white"
          />
        )
      )}
    </div>
  );
}

/* ========================================
   Helpers
======================================== */

function getDate(
  value:
    | Timestamp
    | Date
    | string
    | undefined
    | null
): Date | null {
  if (!value) {
    return null;
  }

  if (
    value instanceof Timestamp
  ) {
    return value.toDate();
  }

  if (
    value instanceof Date
  ) {
    return value;
  }

  const parsed =
    new Date(value);

  return Number.isNaN(
    parsed.getTime()
  )
    ? null
    : parsed;
}

function isSameLocalDate(
  date: Date,
  dateInput: string
) {
  const [
    year,
    month,
    day,
  ] = dateInput
    .split("-")
    .map(Number);

  return (
    date.getFullYear() ===
      year &&
    date.getMonth() + 1 ===
      month &&
    date.getDate() ===
      day
  );
}

function createTripDateTime(
  travelDate: string,
  time: string
): Date | null {
  const dateMatch =
    /^(\d{4})-(\d{2})-(\d{2})$/.exec(
      travelDate
    );

  const timeMatch =
    /^(\d{2}):(\d{2})$/.exec(
      time
    );

  if (!dateMatch || !timeMatch) {
    return null;
  }

  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);
  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);

  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return null;
  }

  const date = new Date(
    year,
    month - 1,
    day,
    hour,
    minute,
    0,
    0
  );

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day ||
    date.getHours() !== hour ||
    date.getMinutes() !== minute
  ) {
    return null;
  }

  return date;
}

function formatTime(
  date: Date
) {
  return new Intl.DateTimeFormat(
    "en-GH",
    {
      hour: "numeric",
      minute: "2-digit",
    }
  ).format(date);
}

function formatSearchDate(
  value: string
) {
  const [
    year,
    month,
    day,
  ] = value
    .split("-")
    .map(Number);

  if (
    !year ||
    !month ||
    !day
  ) {
    return value;
  }

  return new Intl.DateTimeFormat(
    "en-GH",
    {
      weekday: "short",
      day: "numeric",
      month: "long",
      year: "numeric",
    }
  ).format(
    new Date(
      year,
      month - 1,
      day
    )
  );
}

function formatMoney(
  amount: number
) {
  return new Intl.NumberFormat(
    "en-GH",
    {
      style: "currency",
      currency: "GHS",
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }
  ).format(amount);
}

function getCompanyInitials(
  name: string
) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(
      (word) =>
        word.charAt(0)
    )
    .join("")
    .toUpperCase();
}

function getTodayInput() {
  const date = new Date();

  const year =
    date.getFullYear();

  const month =
    String(
      date.getMonth() + 1
    ).padStart(2, "0");

  const day =
    String(
      date.getDate()
    ).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

/* ========================================
   Icons
======================================== */

function SearchIcon() {
  return (
    <svg
      width="19"
      height="19"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle
        cx="11"
        cy="11"
        r="6"
        stroke="currentColor"
        strokeWidth="2"
      />

      <path
        d="m16 16 4 4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function SwapIcon() {
  return (
    <svg
      width="19"
      height="19"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M8 7h10M15 4l3 3-3 3M16 17H6M9 14l-3 3 3 3"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ArrowLeftIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="m15 18-6-6 6-6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PersonIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle
        cx="12"
        cy="8"
        r="3"
        stroke="currentColor"
        strokeWidth="2"
      />

      <path
        d="M5 20c0-3.3 2.7-6 6-6h2c3.3 0 6 2.7 6 6"
        stroke="currentColor"
        strokeWidth="2"
      />
    </svg>
  );
}

function BusIcon() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <rect
        x="5"
        y="3"
        width="14"
        height="16"
        rx="3"
        stroke="currentColor"
        strokeWidth="2"
      />

      <path
        d="M7 8h10M8 15h1M15 15h1M8 19v2M16 19v2"
        stroke="currentColor"
        strokeWidth="2"
      />
    </svg>
  );
}

function BusJourneyIcon() {
  return (
    <span className="absolute left-1/2 top-1/2 flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-[#d9e1ea] bg-white text-[#002451]">
      <svg
        width="17"
        height="17"
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
      >
        <rect
          x="5"
          y="3"
          width="14"
          height="16"
          rx="3"
          stroke="currentColor"
          strokeWidth="2"
        />

        <path
          d="M7 8h10M8 15h1M15 15h1"
          stroke="currentColor"
          strokeWidth="2"
        />
      </svg>
    </span>
  );
}