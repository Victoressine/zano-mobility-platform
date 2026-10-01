"use client";

/* ========================================
   Imports
======================================== */

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  ReactNode,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  onAuthStateChanged,
  signOut,
} from "firebase/auth";

import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  Timestamp,
  where,
} from "firebase/firestore";

import { auth, db } from "@/lib/firebase/client";

/* ========================================
   Types
======================================== */

type UserRole =
  | "passenger"
  | "operator"
  | "admin";

type UserProfile = {
  firstName: string;
  lastName: string;
  phoneNumber?: string;
  email: string;
  role: UserRole;
  photoURL?: string;
};

type BookingStatus =
  | "pending"
  | "confirmed"
  | "cancelled"
  | "completed"
  | "expired";

type PassengerBooking = {
  id: string;
  userId: string;

  bookingReference?: string;

  tripId?: string;
  companyId?: string;
  companyName?: string;
  routeId?: string;

  origin?: string;
  destination?: string;
  busType?: string;

  boardingPointName?: string;
  dropOffPointName?: string;

  travelDate?: string;

  departureAt?:
    | Timestamp
    | Date
    | string
    | null;

  arrivalAt?:
    | Timestamp
    | Date
    | string
    | null;

  passengerCount?: number;

  seatNumbers?: string[];

  fare?: number;
  subtotal?: number;
  bookingFee?: number;
  totalAmount?: number;
  currency?: string;

  status?: BookingStatus | string;

  paymentStatus?: string;
  paymentMethod?: string;

  ticketId?: string;
  ticketNumber?: string;

  tripStatus?: string;

  trackingEnabled?: boolean;

  createdAt?:
    | Timestamp
    | Date
    | string
    | null;
};

type TripFilter =
  | "upcoming"
  | "completed"
  | "cancelled"
  | "all";

/* ========================================
   Passenger My Trips
======================================== */

export default function PassengerTripsPage() {
  const router = useRouter();

  /* ========================================
     Passenger Data
  ======================================== */

  const [profile, setProfile] =
    useState<UserProfile | null>(null);

  const [bookings, setBookings] =
    useState<PassengerBooking[]>([]);

  /* ========================================
     UI State
  ======================================== */

  const [activeFilter, setActiveFilter] =
    useState<TripFilter>("upcoming");

  const [isLoading, setIsLoading] =
    useState(true);

  const [isSigningOut, setIsSigningOut] =
    useState(false);

  const [errorMessage, setErrorMessage] =
    useState("");

  /* ========================================
     Authentication + Bookings
  ======================================== */

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(
      auth,
      async (user) => {
        if (!user) {
          router.replace("/login");
          return;
        }

        try {
          setIsLoading(true);
          setErrorMessage("");

          /* ========================================
             Load Passenger Profile
          ======================================== */

          const profileReference = doc(
            db,
            "users",
            user.uid
          );

          const profileSnapshot =
            await getDoc(profileReference);

          if (!profileSnapshot.exists()) {
            setErrorMessage(
              "Your Zano profile could not be found."
            );

            return;
          }

          const profileData =
            profileSnapshot.data() as UserProfile;

          /* ========================================
             Role Protection
          ======================================== */

          if (profileData.role === "operator") {
            router.replace(
              "/operator/dashboard"
            );

            return;
          }

          if (profileData.role === "admin") {
            router.replace(
              "/admin/dashboard"
            );

            return;
          }

          if (profileData.role !== "passenger") {
            setErrorMessage(
              "This account does not have passenger access."
            );

            return;
          }

          setProfile({
            ...profileData,
            email:
              profileData.email ||
              user.email ||
              "",
            photoURL:
              profileData.photoURL ||
              user.photoURL ||
              "",
          });

          /* ========================================
             Load Passenger Bookings
          ======================================== */

          const bookingsQuery = query(
            collection(db, "bookings"),
            where(
              "userId",
              "==",
              user.uid
            )
          );

          const bookingsSnapshot =
            await getDocs(bookingsQuery);

          const bookingRows =
            bookingsSnapshot.docs.map(
              (documentSnapshot) => ({
                id: documentSnapshot.id,
                ...documentSnapshot.data(),
              })
            ) as PassengerBooking[];

          setBookings(bookingRows);
        } catch (error) {
          console.error(
            "Passenger trips loading error:",
            error
          );

          setErrorMessage(
            "We could not load your trips. Please refresh and try again."
          );
        } finally {
          setIsLoading(false);
        }
      }
    );

    return unsubscribe;
  }, [router]);

  /* ========================================
     Current Time
  ======================================== */

  const [currentTime] =
    useState(() => Date.now());

  /* ========================================
     Booking Groups
  ======================================== */

  const upcomingBookings =
    useMemo(() => {
      return bookings
        .filter((booking) =>
          isUpcomingBooking(
            booking,
            currentTime
          )
        )
        .sort(
          (a, b) =>
            getJourneySortTime(a) -
            getJourneySortTime(b)
        );
    }, [bookings, currentTime]);

  const completedBookings =
    useMemo(() => {
      return bookings
        .filter((booking) =>
          isCompletedBooking(
            booking,
            currentTime
          )
        )
        .sort(
          (a, b) =>
            getJourneySortTime(b) -
            getJourneySortTime(a)
        );
    }, [bookings, currentTime]);

  const cancelledBookings =
    useMemo(() => {
      return bookings
        .filter((booking) =>
          isCancelledBooking(booking)
        )
        .sort(
          (a, b) =>
            getJourneySortTime(b) -
            getJourneySortTime(a)
        );
    }, [bookings]);

  const allBookings =
    useMemo(() => {
      return [...bookings].sort(
        (a, b) =>
          getJourneySortTime(b) -
          getJourneySortTime(a)
      );
    }, [bookings]);

  /* ========================================
     Selected Trips
  ======================================== */

  const displayedBookings =
    useMemo(() => {
      switch (activeFilter) {
        case "completed":
          return completedBookings;

        case "cancelled":
          return cancelledBookings;

        case "all":
          return allBookings;

        case "upcoming":
        default:
          return upcomingBookings;
      }
    }, [
      activeFilter,
      upcomingBookings,
      completedBookings,
      cancelledBookings,
      allBookings,
    ]);

  /* ========================================
     Sign Out
  ======================================== */

  async function handleSignOut() {
    try {
      setIsSigningOut(true);
      setErrorMessage("");

      await signOut(auth);

      router.replace("/login");
    } catch (error) {
      console.error(
        "Passenger sign out error:",
        error
      );

      setErrorMessage(
        "Unable to sign out. Please try again."
      );
    } finally {
      setIsSigningOut(false);
    }
  }

  /* ========================================
     Loading
  ======================================== */

  if (isLoading) {
    return <TripsLoading />;
  }

  /* ========================================
     Main Page
  ======================================== */

  return (
    <main className="min-h-screen bg-[#f7f8fc] pb-24 text-[#101828] lg:pb-16">
      {/* ========================================
          Header
      ======================================== */}

      <header className="bg-[#002451]">
        <div className="mx-auto flex h-[82px] max-w-[1450px] items-center justify-between px-5 sm:px-7 lg:px-10">
          <Link
            href="/passenger/dashboard"
            className="flex shrink-0 items-center rounded-2xl bg-white px-3 py-1 shadow"
            aria-label="Zano passenger dashboard"
          >
            <Image
              src="/zano.webp"
              alt="Zano - Ride. Connect. Go."
              width={160}
              height={72}
              priority
              className="h-auto w-[105px] sm:w-[118px]"
            />
          </Link>

          {/* ========================================
              Desktop Navigation
          ======================================== */}

          <nav className="hidden items-center gap-1 lg:flex">
            <HeaderLink href="/passenger/dashboard">
              Home
            </HeaderLink>

            <HeaderLink href="/search">
              Find Trips
            </HeaderLink>

            <HeaderLink
              href="/passenger/trips"
              active
            >
              My Trips
            </HeaderLink>

            <HeaderLink href="/passenger/tickets">
              Tickets
            </HeaderLink>

            <HeaderLink href="/passenger/tracking">
              Track Trip
            </HeaderLink>
          </nav>

          {/* ========================================
              Passenger Account
          ======================================== */}

          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-black text-white">
                {profile?.firstName ||
                  "Passenger"}
              </p>

              <p className="text-xs text-white/65">
                {bookings.length}{" "}
                {bookings.length === 1
                  ? "trip"
                  : "trips"}
              </p>
            </div>

            <Link
              href="/passenger/profile"
              className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-full border-2 border-white/60 bg-white font-black text-[#002451]"
              aria-label="Passenger profile"
            >
              {profile?.photoURL ? (
                <Image
                  src={profile.photoURL}
                  alt=""
                  width={44}
                  height={44}
                  className="h-full w-full object-cover"
                />
              ) : (
                getInitial(
                  profile?.firstName
                )
              )}
            </Link>

            <button
              type="button"
              onClick={handleSignOut}
              disabled={isSigningOut}
              className="hidden rounded-xl border border-white/25 bg-white/10 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-white hover:text-[#002451] disabled:cursor-not-allowed disabled:opacity-60 xl:block"
            >
              {isSigningOut
                ? "Signing out..."
                : "Sign out"}
            </button>
          </div>
        </div>
      </header>

      {/* ========================================
          Hero
      ======================================== */}

      <section className="bg-[#002451] pb-24 pt-10 text-white">
        <div className="mx-auto max-w-[1450px] px-5 sm:px-7 lg:px-10">
          <Link
            href="/passenger/dashboard"
            className="inline-flex items-center gap-2 text-sm font-bold text-white/70 transition hover:text-white"
          >
            <ArrowLeftIcon />

            Back to dashboard
          </Link>

          <div className="mt-7 flex flex-col justify-between gap-7 lg:flex-row lg:items-end">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-[#73d6ff]">
                Your journeys
              </p>

              <h1 className="mt-3 text-4xl font-black tracking-tight sm:text-5xl">
                My Trips
              </h1>

              <p className="mt-4 max-w-2xl text-sm leading-7 text-white/75 sm:text-base">
                View your upcoming journeys,
                completed trips and booking
                history in one place.
              </p>
            </div>

            <Link
              href="/search"
              className="inline-flex h-12 w-fit items-center justify-center gap-2 rounded-xl bg-[#ff7417] px-6 text-sm font-black text-white shadow-lg transition hover:bg-[#e96208]"
            >
              <SearchIcon />

              Find a New Trip
            </Link>
          </div>
        </div>
      </section>

      {/* ========================================
          Main Content
      ======================================== */}

      <section className="relative -mt-12 px-5 sm:px-7 lg:px-10">
        <div className="mx-auto max-w-[1200px]">
          {/* ========================================
              Summary
          ======================================== */}

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <SummaryCard
              label="Upcoming"
              value={upcomingBookings.length}
              icon={<CalendarIcon />}
            />

            <SummaryCard
              label="Completed"
              value={completedBookings.length}
              icon={<CheckIcon />}
            />

            <SummaryCard
              label="Cancelled"
              value={cancelledBookings.length}
              icon={<CancelledIcon />}
            />

            <SummaryCard
              label="All Trips"
              value={allBookings.length}
              icon={<BusIcon />}
            />
          </div>

          {/* ========================================
              Error
          ======================================== */}

          {errorMessage && (
            <div
              role="alert"
              className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700"
            >
              {errorMessage}
            </div>
          )}

          {/* ========================================
              Trips Section
          ======================================== */}

          <section className="mt-7 rounded-[26px] border border-[#e6eaf0] bg-white shadow-[0_14px_45px_rgba(0,36,81,0.07)]">
            {/* ========================================
                Section Header
            ======================================== */}

            <div className="border-b border-[#edf0f4] p-5 sm:p-7">
              <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-center">
                <div>
                  <h2 className="text-2xl font-black text-[#002451]">
                    Your Journeys
                  </h2>

                  <p className="mt-2 text-sm text-[#667085]">
                    Select a category to view
                    your passenger trips.
                  </p>
                </div>

                {/* ========================================
                    Filters
                ======================================== */}

                <div className="flex max-w-full gap-2 overflow-x-auto pb-1">
                  <FilterButton
                    label="Upcoming"
                    count={
                      upcomingBookings.length
                    }
                    active={
                      activeFilter ===
                      "upcoming"
                    }
                    onClick={() =>
                      setActiveFilter(
                        "upcoming"
                      )
                    }
                  />

                  <FilterButton
                    label="Completed"
                    count={
                      completedBookings.length
                    }
                    active={
                      activeFilter ===
                      "completed"
                    }
                    onClick={() =>
                      setActiveFilter(
                        "completed"
                      )
                    }
                  />

                  <FilterButton
                    label="Cancelled"
                    count={
                      cancelledBookings.length
                    }
                    active={
                      activeFilter ===
                      "cancelled"
                    }
                    onClick={() =>
                      setActiveFilter(
                        "cancelled"
                      )
                    }
                  />

                  <FilterButton
                    label="All"
                    count={allBookings.length}
                    active={
                      activeFilter === "all"
                    }
                    onClick={() =>
                      setActiveFilter("all")
                    }
                  />
                </div>
              </div>
            </div>

            {/* ========================================
                Booking List
            ======================================== */}

            <div className="p-5 sm:p-7">
              {displayedBookings.length >
              0 ? (
                <div className="space-y-5">
                  {displayedBookings.map(
                    (booking) => (
                      <TripCard
                        key={booking.id}
                        booking={booking}
                        currentTime={
                          currentTime
                        }
                      />
                    )
                  )}
                </div>
              ) : (
                <EmptyTrips
                  filter={activeFilter}
                />
              )}
            </div>
          </section>
        </div>
      </section>

      {/* ========================================
          Mobile Navigation
      ======================================== */}

      <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-[#e4e7ec] bg-white/95 px-3 py-2 shadow-[0_-10px_30px_rgba(0,36,81,0.08)] backdrop-blur lg:hidden">
        <div className="mx-auto grid max-w-md grid-cols-5">
          <MobileNavLink
            href="/passenger/dashboard"
            icon={<HomeIcon />}
            label="Home"
          />

          <MobileNavLink
            href="/search"
            icon={<SearchIcon />}
            label="Search"
          />

          <MobileNavLink
            href="/passenger/trips"
            icon={<BusIcon />}
            label="Trips"
            active
          />

          <MobileNavLink
            href="/passenger/tickets"
            icon={<TicketIcon />}
            label="Tickets"
          />

          <MobileNavLink
            href="/passenger/profile"
            icon={<PersonIcon />}
            label="Profile"
          />
        </div>
      </nav>
    </main>
  );
}

/* ========================================
   Trip Card
======================================== */

function TripCard({
  booking,
  currentTime,
}: {
  booking: PassengerBooking;
  currentTime: number;
}) {
  const upcoming =
    isUpcomingBooking(
      booking,
      currentTime
    );

  const completed =
    isCompletedBooking(
      booking,
      currentTime
    );

  const cancelled =
    isCancelledBooking(booking);

  const canTrack =
    !cancelled &&
    !completed &&
    (
      booking.trackingEnabled === true ||
      booking.tripStatus === "boarding" ||
      booking.tripStatus === "departed"
    );

  const status = cancelled
    ? "cancelled"
    : completed
      ? "completed"
      : booking.status ||
        (upcoming
          ? "confirmed"
          : "pending");

  return (
    <article className="overflow-hidden rounded-[22px] border border-[#e5e9ef] bg-white transition hover:border-[#cad5e2] hover:shadow-lg">
      {/* ========================================
          Top
      ======================================== */}

      <div className="border-b border-[#edf0f4] p-5 sm:p-6">
        <div className="flex flex-col justify-between gap-5 md:flex-row md:items-start">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge
                status={status}
              />

              {booking.paymentStatus && (
                <PaymentBadge
                  status={
                    booking.paymentStatus
                  }
                />
              )}
            </div>

            <h3 className="mt-4 text-2xl font-black tracking-tight text-[#002451] sm:text-3xl">
              {booking.origin ||
                "Departure"}
              <span className="mx-2 text-[#39b5f4]">
                →
              </span>
              {booking.destination ||
                "Destination"}
            </h3>

            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-[#667085]">
              <span className="font-black text-[#344054]">
                {booking.companyName ||
                  "Transport operator"}
              </span>

              {booking.busType && (
                <>
                  <span className="hidden h-1 w-1 rounded-full bg-[#98a2b3] sm:block" />

                  <span>
                    {booking.busType}
                  </span>
                </>
              )}
            </div>
          </div>

          <div className="shrink-0 md:text-right">
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#98a2b3]">
              Total paid
            </p>

            <p className="mt-1 text-2xl font-black text-[#002451]">
              {formatMoney(
                booking.totalAmount,
                booking.currency
              )}
            </p>

            {booking.passengerCount &&
              booking.passengerCount >
                1 && (
                <p className="mt-1 text-xs font-semibold text-[#667085]">
                  {booking.passengerCount}{" "}
                  passengers
                </p>
              )}
          </div>
        </div>
      </div>

      {/* ========================================
          Journey Information
      ======================================== */}

      <div className="grid gap-5 p-5 sm:grid-cols-2 sm:p-6 lg:grid-cols-4">
        <TripDetail
          icon={<CalendarIcon />}
          label="Departure"
          value={formatJourneyDateTime(
            booking
          )}
        />

        <TripDetail
          icon={<LocationIcon />}
          label="Boarding Point"
          value={
            booking.boardingPointName ||
            "To be confirmed"
          }
        />

        <TripDetail
          icon={<SeatIcon />}
          label="Seat"
          value={
            booking.seatNumbers?.length
              ? booking.seatNumbers.join(
                  ", "
                )
              : "Not assigned"
          }
        />

        <TripDetail
          icon={<ReferenceIcon />}
          label="Booking Reference"
          value={
            booking.bookingReference ||
            booking.id
          }
        />
      </div>

      {/* ========================================
          Additional Journey Information
      ======================================== */}

      {(booking.arrivalAt ||
        booking.dropOffPointName ||
        booking.ticketNumber) && (
        <div className="grid gap-4 border-t border-[#edf0f4] bg-[#fafbfc] px-5 py-4 text-xs sm:grid-cols-3 sm:px-6">
          {booking.arrivalAt && (
            <SmallDetail
              label="Arrival"
              value={formatDateTime(
                booking.arrivalAt
              )}
            />
          )}

          {booking.dropOffPointName && (
            <SmallDetail
              label="Drop-off"
              value={
                booking.dropOffPointName
              }
            />
          )}

          {booking.ticketNumber && (
            <SmallDetail
              label="Ticket"
              value={
                booking.ticketNumber
              }
            />
          )}
        </div>
      )}

      {/* ========================================
          Actions
      ======================================== */}

      <div className="flex flex-col gap-3 border-t border-[#edf0f4] p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <p className="text-xs leading-5 text-[#667085]">
          {getTripMessage(
            booking,
            currentTime
          )}
        </p>

        <div className="flex flex-col gap-2 sm:flex-row">
          <Link
            href={`/passenger/bookings/${booking.id}`}
            className="inline-flex h-11 items-center justify-center rounded-xl border border-[#d8dee8] px-5 text-xs font-black text-[#002451] transition hover:border-[#002451] hover:bg-[#f8fafc]"
          >
            View Booking
          </Link>

          {booking.ticketId && (
            <Link
              href="/passenger/tickets"
              className="inline-flex h-11 items-center justify-center rounded-xl border border-[#d8dee8] px-5 text-xs font-black text-[#002451] transition hover:border-[#002451] hover:bg-[#f8fafc]"
            >
              View Ticket
            </Link>
          )}

          {canTrack && (
            <Link
              href={`/passenger/tracking?bookingId=${encodeURIComponent(
                booking.id
              )}`}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#ff7417] px-5 text-xs font-black text-white transition hover:bg-[#e96208]"
            >
              <TrackingIcon />

              Track Trip
            </Link>
          )}
        </div>
      </div>
    </article>
  );
}

/* ========================================
   Summary Card
======================================== */

function SummaryCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: number;
  icon: ReactNode;
}) {
  return (
    <div className="rounded-[22px] border border-[#e6eaf0] bg-white p-5 shadow-[0_10px_30px_rgba(0,36,81,0.07)]">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.1em] text-[#98a2b3]">
            {label}
          </p>

          <p className="mt-2 text-3xl font-black text-[#002451]">
            {value}
          </p>
        </div>

        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#eaf8ff] text-[#002451]">
          {icon}
        </div>
      </div>
    </div>
  );
}

/* ========================================
   Filter Button
======================================== */

function FilterButton({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex h-10 shrink-0 items-center gap-2 rounded-xl px-4 text-xs font-black transition ${
        active
          ? "bg-[#002451] text-white"
          : "bg-[#f5f7fa] text-[#667085] hover:bg-[#eaf0f6] hover:text-[#002451]"
      }`}
    >
      {label}

      <span
        className={`rounded-full px-2 py-0.5 text-[10px] ${
          active
            ? "bg-white/15 text-white"
            : "bg-white text-[#667085]"
        }`}
      >
        {count}
      </span>
    </button>
  );
}

/* ========================================
   Trip Detail
======================================== */

function TripDetail({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#f0f8ff] text-[#002451]">
        {icon}
      </div>

      <div className="min-w-0">
        <p className="text-xs font-bold text-[#98a2b3]">
          {label}
        </p>

        <p className="mt-1 break-words text-sm font-black leading-5 text-[#344054]">
          {value}
        </p>
      </div>
    </div>
  );
}

/* ========================================
   Small Detail
======================================== */

function SmallDetail({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div>
      <p className="font-bold uppercase tracking-[0.08em] text-[#98a2b3]">
        {label}
      </p>

      <p className="mt-1 font-black text-[#344054]">
        {value}
      </p>
    </div>
  );
}

/* ========================================
   Status Badge
======================================== */

function StatusBadge({
  status,
}: {
  status: string;
}) {
  const normalized =
    status.toLowerCase();

  let className =
    "bg-[#f2f4f7] text-[#475467]";

  if (
    normalized === "confirmed" ||
    normalized === "scheduled"
  ) {
    className =
      "bg-[#ecfdf3] text-[#027a48]";
  }

  if (
    normalized === "completed"
  ) {
    className =
      "bg-[#eaf8ff] text-[#006d95]";
  }

  if (
    normalized === "cancelled" ||
    normalized === "expired"
  ) {
    className =
      "bg-red-50 text-red-700";
  }

  if (normalized === "pending") {
    className =
      "bg-[#fff7e8] text-[#b54708]";
  }

  return (
    <span
      className={`inline-flex rounded-full px-3 py-1.5 text-[11px] font-black capitalize ${className}`}
    >
      {normalized.replaceAll("_", " ")}
    </span>
  );
}

/* ========================================
   Payment Badge
======================================== */

function PaymentBadge({
  status,
}: {
  status: string;
}) {
  const normalized =
    status.toLowerCase();

  const successful =
    normalized === "successful" ||
    normalized === "paid";

  return (
    <span
      className={`inline-flex rounded-full px-3 py-1.5 text-[11px] font-black ${
        successful
          ? "bg-[#ecfdf3] text-[#027a48]"
          : "bg-[#fff7e8] text-[#b54708]"
      }`}
    >
      {successful
        ? "Payment successful"
        : `Payment ${normalized.replaceAll(
            "_",
            " "
          )}`}
    </span>
  );
}

/* ========================================
   Empty State
======================================== */

function EmptyTrips({
  filter,
}: {
  filter: TripFilter;
}) {
  const content = {
    upcoming: {
      title: "No upcoming trips",
      description:
        "When you book your next journey, it will appear here.",
    },

    completed: {
      title: "No completed trips",
      description:
        "Your completed journeys will appear here after you travel.",
    },

    cancelled: {
      title: "No cancelled trips",
      description:
        "You do not have any cancelled bookings.",
    },

    all: {
      title: "No trips yet",
      description:
        "Search available routes and make your first Zano booking.",
    },
  }[filter];

  return (
    <div className="py-16 text-center">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[#eaf8ff] text-[#002451]">
        <BusIcon />
      </div>

      <h3 className="mt-5 text-xl font-black text-[#002451]">
        {content.title}
      </h3>

      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#667085]">
        {content.description}
      </p>

      {(filter === "upcoming" ||
        filter === "all") && (
        <Link
          href="/search"
          className="mt-6 inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-[#ff7417] px-6 text-sm font-black text-white transition hover:bg-[#e96208]"
        >
          <SearchIcon />

          Find a Trip
        </Link>
      )}
    </div>
  );
}

/* ========================================
   Desktop Header Link
======================================== */

function HeaderLink({
  href,
  children,
  active = false,
}: {
  href: string;
  children: ReactNode;
  active?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`rounded-xl px-4 py-2.5 text-sm font-bold transition ${
        active
          ? "bg-white/10 text-[#ff9a35]"
          : "text-white/85 hover:bg-white/10 hover:text-[#ff9a35]"
      }`}
    >
      {children}
    </Link>
  );
}

/* ========================================
   Mobile Navigation
======================================== */

function MobileNavLink({
  href,
  icon,
  label,
  active = false,
}: {
  href: string;
  icon: ReactNode;
  label: string;
  active?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`flex min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 py-2 text-[10px] font-black transition ${
        active
          ? "bg-[#fff3e8] text-[#ff7417]"
          : "text-[#667085] hover:bg-[#f8fafc] hover:text-[#002451]"
      }`}
    >
      {icon}

      <span className="truncate">
        {label}
      </span>
    </Link>
  );
}

/* ========================================
   Booking Classification
======================================== */

function isCancelledBooking(
  booking: PassengerBooking
) {
  const status =
    booking.status?.toLowerCase();

  return (
    status === "cancelled" ||
    status === "expired" ||
    booking.tripStatus?.toLowerCase() ===
      "cancelled"
  );
}

function isCompletedBooking(
  booking: PassengerBooking,
  currentTime: number
) {
  if (isCancelledBooking(booking)) {
    return false;
  }

  if (
    booking.status?.toLowerCase() ===
      "completed" ||
    booking.tripStatus?.toLowerCase() ===
      "completed"
  ) {
    return true;
  }

  const departure =
    getTimeValue(
      booking.departureAt
    );

  if (departure === null) {
    return false;
  }

  return departure < currentTime;
}

function isUpcomingBooking(
  booking: PassengerBooking,
  currentTime: number
) {
  if (
    isCancelledBooking(booking) ||
    isCompletedBooking(
      booking,
      currentTime
    )
  ) {
    return false;
  }

  const departure =
    getTimeValue(
      booking.departureAt
    );

  if (departure === null) {
    return false;
  }

  return departure >= currentTime;
}

/* ========================================
   Trip Message
======================================== */

function getTripMessage(
  booking: PassengerBooking,
  currentTime: number
) {
  if (isCancelledBooking(booking)) {
    return "This booking is no longer active.";
  }

  if (
    isCompletedBooking(
      booking,
      currentTime
    )
  ) {
    return "This journey has been completed.";
  }

  if (
    booking.tripStatus === "departed"
  ) {
    return "Your journey is currently in progress.";
  }

  if (
    booking.tripStatus === "boarding"
  ) {
    return "Boarding is currently in progress.";
  }

  if (
    booking.status === "confirmed"
  ) {
    return "Your booking is confirmed. Keep your ticket ready for boarding.";
  }

  return "Check your booking details before travelling.";
}

/* ========================================
   Date Helpers
======================================== */

function getJourneySortTime(
  booking: PassengerBooking
) {
  return (
    getTimeValue(
      booking.departureAt
    ) ??
    getTravelDateTime(
      booking.travelDate
    ) ??
    getTimeValue(
      booking.createdAt
    ) ??
    0
  );
}

function getTravelDateTime(
  value?: string
) {
  if (!value) {
    return null;
  }

  const date =
    new Date(`${value}T00:00:00`);

  const time =
    date.getTime();

  return Number.isNaN(time)
    ? null
    : time;
}

function getTimeValue(
  value:
    | Timestamp
    | Date
    | string
    | null
    | undefined
) {
  if (!value) {
    return null;
  }

  if (value instanceof Timestamp) {
    return value.toMillis();
  }

  if (value instanceof Date) {
    const time = value.getTime();

    return Number.isNaN(time)
      ? null
      : time;
  }

  if (typeof value === "string") {
    const time =
      new Date(value).getTime();

    return Number.isNaN(time)
      ? null
      : time;
  }

  return null;
}

function formatJourneyDateTime(
  booking: PassengerBooking
) {
  if (booking.departureAt) {
    return formatDateTime(
      booking.departureAt
    );
  }

  if (booking.travelDate) {
    const date =
      new Date(
        `${booking.travelDate}T00:00:00`
      );

    if (
      !Number.isNaN(
        date.getTime()
      )
    ) {
      return new Intl.DateTimeFormat(
        "en-GH",
        {
          weekday: "short",
          day: "numeric",
          month: "short",
          year: "numeric",
        }
      ).format(date);
    }
  }

  return "To be confirmed";
}

function formatDateTime(
  value:
    | Timestamp
    | Date
    | string
    | null
    | undefined
) {
  const time =
    getTimeValue(value);

  if (time === null) {
    return "To be confirmed";
  }

  return new Intl.DateTimeFormat(
    "en-GH",
    {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }
  ).format(new Date(time));
}

/* ========================================
   Money
======================================== */

function formatMoney(
  value?: number,
  currency?: string
) {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value)
  ) {
    return "—";
  }

  const normalizedCurrency =
    currency?.trim().toUpperCase() ||
    "GHS";

  try {
    return new Intl.NumberFormat(
      "en-GH",
      {
        style: "currency",
        currency:
          normalizedCurrency,
        minimumFractionDigits: 2,
      }
    ).format(value);
  } catch {
    return `GH₵${value.toFixed(2)}`;
  }
}

/* ========================================
   Helpers
======================================== */

function getInitial(
  value?: string
) {
  const trimmed =
    value?.trim();

  if (!trimmed) {
    return "P";
  }

  return trimmed
    .charAt(0)
    .toUpperCase();
}

/* ========================================
   Loading
======================================== */

function TripsLoading() {
  return (
    <main className="min-h-screen bg-[#f7f8fc]">
      <div className="h-[82px] animate-pulse bg-[#002451]" />

      <div className="bg-[#002451] px-5 pb-24 pt-10">
        <div className="mx-auto max-w-[1200px]">
          <div className="h-4 w-32 animate-pulse rounded bg-white/20" />

          <div className="mt-6 h-12 w-64 animate-pulse rounded-xl bg-white/15" />

          <div className="mt-4 h-5 w-96 max-w-full animate-pulse rounded bg-white/10" />
        </div>
      </div>

      <div className="relative -mt-12 mx-auto max-w-[1200px] px-5">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map(
            (item) => (
              <div
                key={item}
                className="h-28 animate-pulse rounded-[22px] bg-white shadow-sm"
              />
            )
          )}
        </div>

        <div className="mt-7 h-[500px] animate-pulse rounded-[26px] bg-white shadow-sm" />
      </div>
    </main>
  );
}

/* ========================================
   Icons
======================================== */

function HomeIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V21h14V9.5" />
      <path d="M9 21v-7h6v7" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <circle
        cx="11"
        cy="11"
        r="7"
      />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

function BusIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <rect
        x="5"
        y="3"
        width="14"
        height="16"
        rx="3"
      />
      <path d="M7 8h10" />
      <path d="M8 19v2M16 19v2" />
      <circle
        cx="9"
        cy="15"
        r="1"
      />
      <circle
        cx="15"
        cy="15"
        r="1"
      />
    </svg>
  );
}

function TicketIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <path d="M4 6h16v4a2 2 0 0 0 0 4v4H4v-4a2 2 0 0 0 0-4V6Z" />
      <path d="M12 8v8" />
    </svg>
  );
}

function PersonIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <circle
        cx="12"
        cy="8"
        r="4"
      />
      <path d="M4 21c1.5-4 4.2-6 8-6s6.5 2 8 6" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <rect
        x="3"
        y="5"
        width="18"
        height="16"
        rx="2"
      />
      <path d="M8 3v4M16 3v4M3 10h18" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <circle
        cx="12"
        cy="12"
        r="9"
      />
      <path d="m8 12 3 3 5-6" />
    </svg>
  );
}

function CancelledIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <circle
        cx="12"
        cy="12"
        r="9"
      />
      <path d="m9 9 6 6M15 9l-6 6" />
    </svg>
  );
}

function LocationIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" />
      <circle
        cx="12"
        cy="10"
        r="2.5"
      />
    </svg>
  );
}

function SeatIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <path d="M7 11V6a3 3 0 0 1 6 0v5" />
      <path d="M5 11h12a2 2 0 0 1 2 2v4H5v-6Z" />
      <path d="M7 17v3M17 17v3" />
    </svg>
  );
}

function ReferenceIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <path d="M7 3h10l3 3v15H4V3h3Z" />
      <path d="M8 10h8M8 14h8M8 18h5" />
    </svg>
  );
}

function TrackingIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <circle
        cx="12"
        cy="12"
        r="3"
      />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
      <circle
        cx="12"
        cy="12"
        r="8"
      />
    </svg>
  );
}

function ArrowLeftIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}