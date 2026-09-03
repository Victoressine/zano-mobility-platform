"use client";

/* ========================================
   Imports
======================================== */

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  FormEvent,
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
   User Types
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

/* ========================================
   Booking Types
======================================== */

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

  origin?: string;
  destination?: string;

  boardingPointName?: string;
  dropOffPointName?: string;

  departureAt?: Timestamp | Date | string | null;
  arrivalAt?: Timestamp | Date | string | null;

  seatNumbers?: string[];

  totalAmount?: number;

  status?: BookingStatus;

  tripStatus?: string;

  trackingEnabled?: boolean;
};

/* ========================================
   Ticket Types
======================================== */

type PassengerTicket = {
  id: string;
  userId: string;

  bookingId?: string;
  tripId?: string;

  ticketNumber?: string;

  qrCode?: string;

  status?: string;
};

/* ========================================
   Notification Types
======================================== */

type PassengerNotification = {
  id: string;

  userId: string;

  title?: string;
  message?: string;

  read?: boolean;

  createdAt?: Timestamp | Date | string | null;
};

/* ========================================
   Trip Types
======================================== */

type TripStatus =
  | "draft"
  | "scheduled"
  | "boarding"
  | "departed"
  | "completed"
  | "cancelled";

type DiscoveryTrip = {
  id: string;

  companyId?: string;
  companyName?: string;

  routeId?: string;

  origin?: string;
  destination?: string;

  departureAt?: Timestamp | Date | string | null;
  arrivalAt?: Timestamp | Date | string | null;

  boardingPoints?: Array<{
    id?: string;
    name?: string;
  }>;

  fare?: number;

  busType?: string;

  amenities?: string[];

  availableSeats?: number;
  totalSeats?: number;

  status?: TripStatus | string;
};

/* ========================================
   Derived Dashboard Types
======================================== */

type PopularRoute = {
  from: string;
  to: string;

  tripCount: number;

  lowestFare?: number;

  nextDeparture?: number | null;

  image: string;
};

type PopularOperator = {
  companyId: string;

  companyName: string;

  availableTrips: number;

  lowestFare?: number;
};

/* ========================================
   Hero Images

   These are online bus/coach images.
   No local bus image files are required.
======================================== */

const HERO_IMAGES = [
  {
    src:
      "https://unsplash.com/photos/AA2pOnLZykE/download?force=true&w=2400",
    alt:
      "Intercity bus travelling on the road",
  },
  {
    src:
      "https://unsplash.com/photos/DpUrHlLOSvA/download?force=true&w=2400",
    alt:
      "Coach bus travelling on a highway",
  },
  {
    src:
      "https://unsplash.com/photos/E7iKkQaLVRU/download?force=true&w=2400",
    alt:
      "Tour coach travelling on a highway",
  },
  {
    src:
      "https://unsplash.com/photos/8NJjjkmIaxA/download?force=true&w=2400",
    alt:
      "Modern passenger coach",
  },
  {
    src:
      "https://unsplash.com/photos/66TYNtRBnws/download?force=true&w=2400",
    alt:
      "Passenger buses travelling on a highway",
  },
] as const;

/* ========================================
   Route Visual Images

   These are purely visual assets.

   Route pricing and availability come from
   Firestore trips, not these constants.
======================================== */

const ROUTE_IMAGES = [
  HERO_IMAGES[1].src,
  HERO_IMAGES[2].src,
  HERO_IMAGES[4].src,
  HERO_IMAGES[0].src,
] as const;

/* ========================================
   Passenger Dashboard
======================================== */

export default function PassengerDashboardPage() {
  const router = useRouter();

  /* ========================================
     Passenger Data
  ======================================== */

  const [profile, setProfile] =
    useState<UserProfile | null>(null);

  const [bookings, setBookings] =
    useState<PassengerBooking[]>([]);

  const [tickets, setTickets] =
    useState<PassengerTicket[]>([]);

  const [notifications, setNotifications] =
    useState<PassengerNotification[]>([]);

  const [availableTrips, setAvailableTrips] =
    useState<DiscoveryTrip[]>([]);

  /* ========================================
     Search State
  ======================================== */

  const [fromLocation, setFromLocation] =
    useState("Accra");

  const [toLocation, setToLocation] =
    useState("Kumasi");

  const [travelDate, setTravelDate] =
    useState("");

  const [passengers, setPassengers] =
    useState(1);

  const [searchError, setSearchError] =
    useState("");

  /* ========================================
     UI State
  ======================================== */

  const [isLoading, setIsLoading] =
    useState(true);

  const [isSigningOut, setIsSigningOut] =
    useState(false);

  const [errorMessage, setErrorMessage] =
    useState("");

  /* ========================================
     Authentication + Dashboard Loading
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
             Load User Profile
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
             Role Routing
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

          setProfile(profileData);

          /* ========================================
             Passenger Queries
          ======================================== */

          const bookingsQuery = query(
            collection(db, "bookings"),
            where("userId", "==", user.uid)
          );

          const ticketsQuery = query(
            collection(db, "tickets"),
            where("userId", "==", user.uid)
          );

          const notificationsQuery = query(
            collection(db, "notifications"),
            where("userId", "==", user.uid)
          );

          /*
           * Public passenger discovery data.
           *
           * Operators publish trips using:
           * status = "scheduled"
           */

          const tripsQuery = query(
            collection(db, "trips"),
            where("status", "==", "scheduled")
          );

          const [
            bookingsSnapshot,
            ticketsSnapshot,
            notificationsSnapshot,
            tripsSnapshot,
          ] = await Promise.all([
            getDocs(bookingsQuery),
            getDocs(ticketsQuery),
            getDocs(notificationsQuery),
            getDocs(tripsQuery),
          ]);

          /* ========================================
             Map Bookings
          ======================================== */

          const bookingRows =
            bookingsSnapshot.docs.map(
              (documentSnapshot) => ({
                id: documentSnapshot.id,
                ...documentSnapshot.data(),
              })
            ) as PassengerBooking[];

          /* ========================================
             Map Tickets
          ======================================== */

          const ticketRows =
            ticketsSnapshot.docs.map(
              (documentSnapshot) => ({
                id: documentSnapshot.id,
                ...documentSnapshot.data(),
              })
            ) as PassengerTicket[];

          /* ========================================
             Map Notifications
          ======================================== */

          const notificationRows =
            notificationsSnapshot.docs.map(
              (documentSnapshot) => ({
                id: documentSnapshot.id,
                ...documentSnapshot.data(),
              })
            ) as PassengerNotification[];

          /* ========================================
             Map Trips
          ======================================== */

          const tripRows =
            tripsSnapshot.docs.map(
              (documentSnapshot) => ({
                id: documentSnapshot.id,
                ...documentSnapshot.data(),
              })
            ) as DiscoveryTrip[];

          setBookings(bookingRows);

          setTickets(ticketRows);

          setNotifications(
            notificationRows
          );

          setAvailableTrips(
            tripRows.filter((trip) => {
              const departure =
                getTimeValue(
                  trip.departureAt
                );

              return (
                departure !== null &&
                departure >= Date.now()
              );
            })
          );
        } catch (error) {
          console.error(
            "Passenger dashboard loading error:",
            error
          );

          setErrorMessage(
            "We could not load your dashboard. Please refresh and try again."
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

const [currentTime] = useState(() =>
  Date.now()
);

/* ========================================
   Upcoming Bookings
======================================== */

const upcomingBookings =
  useMemo(() => {
    return bookings
      .filter((booking) => {
        const departure =
          getTimeValue(
            booking.departureAt
          );

        if (departure === null) {
          return false;
        }

        return (
          departure >= currentTime &&
          booking.status !==
            "cancelled" &&
          booking.status !==
            "expired" &&
          booking.status !==
            "completed"
        );
      })
      .sort(
        (a, b) =>
          (getTimeValue(
            a.departureAt
          ) ?? Infinity) -
          (getTimeValue(
            b.departureAt
          ) ?? Infinity)
      );
  }, [bookings, currentTime]);

  /* ========================================
     Next Booking
  ======================================== */

  const nextBooking =
    upcomingBookings[0] ?? null;

  /* ========================================
     Active / Trackable Booking
  ======================================== */

  const activeTripBooking =
    useMemo(() => {
      return (
        bookings.find(
          (booking) =>
            booking.status ===
              "confirmed" &&
            (
              booking.tripStatus ===
                "boarding" ||
              booking.tripStatus ===
                "departed" ||
              booking.trackingEnabled ===
                true
            )
        ) ?? null
      );
    }, [bookings]);

  /* ========================================
     Unread Notifications
  ======================================== */

  const unreadNotificationCount =
    useMemo(() => {
      return notifications.filter(
        (notification) =>
          notification.read !== true
      ).length;
    }, [notifications]);

  /* ========================================
     Valid Tickets
  ======================================== */

  const validTickets = useMemo(() => {
    return tickets.filter(
      (ticket) =>
        ticket.status !== "cancelled" &&
        ticket.status !== "expired"
    );
  }, [tickets]);

  /* ========================================
     Popular Routes From Real Trips
  ======================================== */

  const popularRoutes =
    useMemo(() => {
      return buildPopularRoutes(
        availableTrips
      );
    }, [availableTrips]);

  /* ========================================
     Operators From Real Trips
  ======================================== */

  const popularOperators =
    useMemo(() => {
      return buildPopularOperators(
        availableTrips
      );
    }, [availableTrips]);

  /* ========================================
     Search
  ======================================== */

  function handleSearch(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    setSearchError("");

    const from =
      fromLocation.trim();

    const to =
      toLocation.trim();

    if (!from || !to) {
      setSearchError(
        "Enter both your departure city and destination."
      );

      return;
    }

    if (
      from.toLowerCase() ===
      to.toLowerCase()
    ) {
      setSearchError(
        "Departure and destination cannot be the same."
      );

      return;
    }

    if (!travelDate) {
      setSearchError(
        "Choose your travel date."
      );

      return;
    }

    if (
      passengers < 1 ||
      passengers > 6
    ) {
      setSearchError(
        "Passenger count must be between 1 and 6."
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

  function handleSwapLocations() {
    const oldFrom =
      fromLocation;

    setFromLocation(
      toLocation
    );

    setToLocation(
      oldFrom
    );

    setSearchError("");
  }

  /* ========================================
     Sign Out
  ======================================== */

  async function handleSignOut() {
    try {
      setIsSigningOut(true);

      await signOut(auth);

      router.replace("/login");
    } catch (error) {
      console.error(
        "Sign out error:",
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
    return <DashboardLoading />;
  }

  /* ========================================
     Dashboard
  ======================================== */

  return (
    <main className="min-h-screen bg-[#f7f8fc] pb-24 text-[#101828] lg:pb-0">

      {/* ========================================
          Hero
      ======================================== */}

      <section className="relative min-h-[640px] overflow-hidden bg-[#002451] sm:min-h-[680px] lg:min-h-[720px]">

        <HeroCarousel />

        {/* ========================================
            Hero Overlays
        ======================================== */}

        <div className="pointer-events-none absolute inset-0 z-[2] bg-[linear-gradient(90deg,rgba(0,18,43,0.94)_0%,rgba(0,28,61,0.76)_38%,rgba(0,26,55,0.42)_68%,rgba(0,0,0,0.2)_100%)]" />

        <div className="pointer-events-none absolute inset-0 z-[2] bg-gradient-to-t from-black/40 via-transparent to-black/35" />

        {/* ========================================
            Header
        ======================================== */}

        <header className="relative z-30">
          <div className="mx-auto flex h-[88px] max-w-[1540px] items-center justify-between px-5 sm:px-7 lg:px-10 xl:px-14">

            {/* ========================================
                Logo
            ======================================== */}

            <Link
              href="/passenger/dashboard"
              className="flex shrink-0 items-center rounded-2xl bg-white/95 px-3 py-1 shadow-lg backdrop-blur"
              aria-label="Zano home"
            >
              <Image
                src="/zano.webp"
                alt="Zano - Ride. Connect. Go."
                width={160}
                height={72}
                priority
                className="h-auto w-[105px] sm:w-[120px]"
              />
            </Link>

            {/* ========================================
                Desktop Navigation
            ======================================== */}

            <nav className="hidden items-center gap-1 lg:flex">
              <HeroNavLink
                href="/passenger/dashboard"
                active
              >
                Home
              </HeroNavLink>

              <HeroNavLink href="/search">
                Find Trips
              </HeroNavLink>

              <HeroNavLink href="/passenger/trips">
                My Trips
              </HeroNavLink>

              <HeroNavLink href="/passenger/tickets">
                Tickets
              </HeroNavLink>

              <HeroNavLink href="/passenger/tracking">
                Track Trip
              </HeroNavLink>
            </nav>

            {/* ========================================
                Account
            ======================================== */}

            <div className="flex items-center gap-3">

              <Link
                href="/passenger/notifications"
                aria-label="Notifications"
                className="relative flex h-11 w-11 items-center justify-center rounded-full border border-white/30 bg-white/10 text-white backdrop-blur transition hover:bg-white hover:text-[#002451]"
              >
                <BellIcon />

                {unreadNotificationCount >
                  0 && (
                  <span className="absolute -right-1 -top-1 flex min-h-5 min-w-5 items-center justify-center rounded-full bg-[#ff7417] px-1 text-[10px] font-black text-white">
                    {unreadNotificationCount >
                    9
                      ? "9+"
                      : unreadNotificationCount}
                  </span>
                )}
              </Link>

              <div className="hidden text-right sm:block">
                <p className="text-sm font-bold text-white">
                  {profile?.firstName ||
                    "Passenger"}
                </p>

                <p className="text-xs text-white/70">
                  {validTickets.length}{" "}
                  {validTickets.length ===
                  1
                    ? "ticket"
                    : "tickets"}
                </p>
              </div>

              <Link
                href="/passenger/profile"
                className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-full border-2 border-white/60 bg-[#002451] font-extrabold text-white"
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
                className="hidden rounded-xl border border-white/25 bg-white/10 px-4 py-2.5 text-sm font-bold text-white backdrop-blur transition hover:bg-white hover:text-[#002451] disabled:cursor-not-allowed disabled:opacity-60 xl:block"
              >
                {isSigningOut
                  ? "Signing out..."
                  : "Sign out"}
              </button>
            </div>
          </div>
        </header>

        {/* ========================================
            Hero Content
        ======================================== */}

        <div className="relative z-20 mx-auto max-w-[1540px] px-5 pb-40 pt-14 sm:px-7 sm:pt-20 lg:px-10 lg:pt-24 xl:px-14">

          <div className="max-w-[790px]">

            <p className="mb-4 text-xs font-extrabold uppercase tracking-[0.24em] text-[#73d6ff] sm:text-sm">
              Ride. Connect. Go.
            </p>

            <h1 className="max-w-[800px] text-5xl font-black leading-[0.96] tracking-[-0.045em] text-white sm:text-6xl lg:text-7xl xl:text-[84px]">
              Travel Ghana
              <br />

              <span className="text-[#ff8a29]">
                your way.
              </span>
            </h1>

            <p className="mt-7 max-w-[650px] text-base leading-7 text-white/[0.88] sm:text-lg lg:text-xl lg:leading-8">
              Search transport operators,
              compare fares and departure
              times, choose your bus and seat,
              pay securely, receive your
              digital ticket and track your
              journey with Zano.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">

              <Link
                href="/search"
                className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-[#ff7417] px-6 text-sm font-extrabold text-white shadow-lg transition hover:bg-[#e96208]"
              >
                <SearchIcon />

                Find a trip
              </Link>

              {activeTripBooking && (
                <Link
                  href={`/passenger/tracking?bookingId=${encodeURIComponent(
                    activeTripBooking.id
                  )}`}
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-white/30 bg-white/10 px-6 text-sm font-extrabold text-white backdrop-blur transition hover:bg-white hover:text-[#002451]"
                >
                  <TrackingIcon />

                  Track active trip
                </Link>
              )}
            </div>

            {profile?.firstName && (
              <p className="mt-6 text-sm font-semibold text-white/75">
                Welcome back,{" "}
                {profile.firstName}.
              </p>
            )}
          </div>
        </div>
      </section>

      {/* ========================================
          Search Panel
      ======================================== */}

      <section className="relative z-30 -mt-24 px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-[1450px]">

          <SearchPanel
            fromLocation={
              fromLocation
            }
            toLocation={
              toLocation
            }
            travelDate={
              travelDate
            }
            passengers={
              passengers
            }
            searchError={
              searchError
            }
            setFromLocation={
              setFromLocation
            }
            setToLocation={
              setToLocation
            }
            setTravelDate={
              setTravelDate
            }
            setPassengers={
              setPassengers
            }
            onSwap={
              handleSwapLocations
            }
            onSubmit={
              handleSearch
            }
          />
        </div>
      </section>

      {/* ========================================
          Main Dashboard
      ======================================== */}

      <div className="mx-auto max-w-[1450px] px-4 pb-16 pt-6 sm:px-6 lg:px-8 lg:pb-24">

        {/* ========================================
            Error
        ======================================== */}

        {errorMessage && (
          <div
            role="alert"
            className="mb-7 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-700"
          >
            {errorMessage}
          </div>
        )}

        {/* ========================================
            Journey Features
        ======================================== */}

        <JourneyFeatureStrip />

        {/* ========================================
            Passenger Overview
        ======================================== */}

        <section className="mt-12">

          <SectionTitle
            eyebrow="Your Zano"
            title="Travel overview"
            description="Everything you need before, during and after your journey."
          />

          <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">

            <OverviewCard
              icon={<BusIcon />}
              title="Upcoming trips"
              value={String(
                upcomingBookings.length
              )}
              href="/passenger/trips"
            />

            <OverviewCard
              icon={<TicketIcon />}
              title="Digital tickets"
              value={String(
                validTickets.length
              )}
              href="/passenger/tickets"
            />

            <OverviewCard
              icon={<BellIcon />}
              title="Notifications"
              value={String(
                unreadNotificationCount
              )}
              href="/passenger/notifications"
            />

            <OverviewCard
              icon={<TrackingIcon />}
              title="Live journey"
              value={
                activeTripBooking
                  ? "Active"
                  : "None"
              }
              href="/passenger/tracking"
            />
          </div>
        </section>

        {/* ========================================
            Next Journey
        ======================================== */}

        {nextBooking && (
          <section className="mt-14">

            <SectionHeader
              title="Your Next Journey"
              action="View all trips"
              href="/passenger/trips"
            />

            <NextJourneyCard
              booking={nextBooking}
            />
          </section>
        )}

        {/* ========================================
            Active Tracking
        ======================================== */}

        {activeTripBooking && (
          <ActiveTripBanner
            booking={
              activeTripBooking
            }
          />
        )}

        {/* ========================================
            Popular Routes
        ======================================== */}

        <section className="mt-14">

          <SectionHeader
            title="Popular Routes"
            action="Explore trips"
            href="/search"
          />

          {popularRoutes.length >
          0 ? (
            <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {popularRoutes
                .slice(0, 4)
                .map(
                  (
                    route,
                    index
                  ) => (
                    <PopularRouteCard
                      key={`${route.from}-${route.to}`}
                      route={
                        route
                      }
                      image={
                        ROUTE_IMAGES[
                          index %
                            ROUTE_IMAGES.length
                        ]
                      }
                    />
                  )
                )}
            </div>
          ) : (
            <DiscoveryEmptyState
              title="No published trips yet"
              description="Available routes will appear here as transport operators publish their schedules."
            />
          )}
        </section>

        {/* ========================================
            Transport Operators
        ======================================== */}

        <section className="mt-14">

          <SectionHeader
            title="Transport Operators"
            action="Find trips"
            href="/search"
          />

          {popularOperators.length >
          0 ? (
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {popularOperators
                .slice(0, 4)
                .map(
                  (operator) => (
                    <OperatorCard
                      key={
                        operator.companyId
                      }
                      operator={
                        operator
                      }
                    />
                  )
                )}
            </div>
          ) : (
            <DiscoveryEmptyState
              title="Operators are preparing schedules"
              description="Transport companies with active trips will appear here automatically."
            />
          )}
        </section>

        {/* ========================================
            Zano Journey
        ======================================== */}

        <ZanoJourneySection />

        {/* ========================================
            Why Zano
        ======================================== */}

        <WhyZanoSection />

        {/* ========================================
            Mobile Sign Out
        ======================================== */}

        <button
          type="button"
          disabled={isSigningOut}
          onClick={handleSignOut}
          className="mt-10 text-sm font-bold text-[#667085] underline lg:hidden"
        >
          {isSigningOut
            ? "Signing out..."
            : "Sign out"}
        </button>
      </div>

      {/* ========================================
          Mobile Navigation
      ======================================== */}

      <PassengerBottomNavigation
        notificationCount={
          unreadNotificationCount
        }
      />
    </main>
  );
}

/* ========================================
   Hero Carousel
======================================== */

function HeroCarousel() {
  const [activeIndex, setActiveIndex] =
    useState(0);

  const [isPaused, setIsPaused] =
    useState(false);

  /* ========================================
     Automatic Rotation
  ======================================== */

  useEffect(() => {
    if (isPaused) {
      return;
    }

    const interval =
      window.setInterval(() => {
        setActiveIndex(
          (current) =>
            (current + 1) %
            HERO_IMAGES.length
        );
      }, 5500);

    return () => {
      window.clearInterval(
        interval
      );
    };
  }, [isPaused]);

  function showPrevious() {
    setActiveIndex(
      (current) =>
        (current -
          1 +
          HERO_IMAGES.length) %
        HERO_IMAGES.length
    );
  }

  function showNext() {
    setActiveIndex(
      (current) =>
        (current + 1) %
        HERO_IMAGES.length
    );
  }

  return (
    <div
      className="absolute inset-0"
      onMouseEnter={() =>
        setIsPaused(true)
      }
      onMouseLeave={() =>
        setIsPaused(false)
      }
    >

      {/* ========================================
          Slides
      ======================================== */}

      {HERO_IMAGES.map(
        (image, index) => (
          <div
            key={image.src}
            aria-hidden={
              index !==
              activeIndex
            }
            className={`absolute inset-0 transition-[opacity,transform] duration-[1500ms] ease-in-out ${
              index ===
              activeIndex
                ? "scale-100 opacity-100"
                : "pointer-events-none scale-[1.04] opacity-0"
            }`}
          >
            <Image
              src={image.src}
              alt={
                index ===
                activeIndex
                  ? image.alt
                  : ""
              }
              fill
              priority={index === 0}
              sizes="100vw"
              className="object-cover object-center"
            />
          </div>
        )
      )}

      {/* ========================================
          Previous
      ======================================== */}

      <button
        type="button"
        onClick={showPrevious}
        aria-label="Previous hero image"
        className="absolute left-5 top-1/2 z-20 hidden h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-white/30 bg-black/20 text-white backdrop-blur transition hover:bg-white hover:text-[#002451] lg:flex"
      >
        <ChevronLeftIcon />
      </button>

      {/* ========================================
          Next
      ======================================== */}

      <button
        type="button"
        onClick={showNext}
        aria-label="Next hero image"
        className="absolute right-5 top-1/2 z-20 hidden h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-white/30 bg-black/20 text-white backdrop-blur transition hover:bg-white hover:text-[#002451] lg:flex"
      >
        <ChevronRightIcon />
      </button>

      {/* ========================================
          Indicators
      ======================================== */}

      <div className="absolute bottom-[118px] left-1/2 z-20 flex -translate-x-1/2 items-center gap-2">

        {HERO_IMAGES.map(
          (image, index) => (
            <button
              key={image.src}
              type="button"
              onClick={() =>
                setActiveIndex(
                  index
                )
              }
              aria-label={`Show carousel image ${
                index + 1
              }`}
              aria-current={
                activeIndex ===
                index
                  ? "true"
                  : undefined
              }
              className={`h-2 rounded-full transition-all ${
                activeIndex ===
                index
                  ? "w-8 bg-[#ff7417]"
                  : "w-2 bg-white/70 hover:bg-white"
              }`}
            />
          )
        )}
      </div>
    </div>
  );
}

/* ========================================
   Hero Navigation
======================================== */

function HeroNavLink({
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
          : "text-white hover:bg-white/10 hover:text-[#ff9a35]"
      }`}
    >
      {children}
    </Link>
  );
}

/* ========================================
   Search Panel
======================================== */

type SearchPanelProps = {
  fromLocation: string;
  toLocation: string;
  travelDate: string;
  passengers: number;

  searchError: string;

  setFromLocation: (
    value: string
  ) => void;

  setToLocation: (
    value: string
  ) => void;

  setTravelDate: (
    value: string
  ) => void;

  setPassengers: (
    value: number
  ) => void;

  onSwap: () => void;

  onSubmit: (
    event: FormEvent<HTMLFormElement>
  ) => void;
};

function SearchPanel({
  fromLocation,
  toLocation,
  travelDate,
  passengers,
  searchError,
  setFromLocation,
  setToLocation,
  setTravelDate,
  setPassengers,
  onSwap,
  onSubmit,
}: SearchPanelProps) {
  return (
    <form
      onSubmit={onSubmit}
      className="rounded-[24px] border border-white/70 bg-white p-5 shadow-[0_24px_70px_rgba(0,30,68,0.18)] sm:p-6 lg:p-7"
    >

      <div className="mb-5 flex flex-col justify-between gap-2 sm:flex-row sm:items-center">

        <div>
          <p className="text-lg font-black text-[#002451]">
            Where are you going?
          </p>

          <p className="mt-1 text-xs text-[#667085] sm:text-sm">
            Search and compare available
            intercity trips.
          </p>
        </div>

        <span className="inline-flex w-fit items-center gap-2 rounded-full bg-[#eaf8ff] px-3 py-1.5 text-xs font-bold text-[#006d95]">
          <ShieldIcon />

          Secure booking
        </span>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.15fr_1.15fr_1fr_0.8fr_auto] lg:items-end">

        <SearchInput
          id="from"
          label="From"
          value={fromLocation}
          icon={<LocationPinIcon />}
          onChange={
            setFromLocation
          }
          placeholder="Departure city"
        />

        <div className="relative">

          <button
            type="button"
            onClick={onSwap}
            aria-label="Swap departure and destination"
            className="absolute -left-[30px] top-[38px] z-10 hidden h-10 w-10 items-center justify-center rounded-full border border-[#e5e7eb] bg-white text-[#002451] shadow-md transition hover:bg-[#f5f7fa] lg:flex"
          >
            <SwapIcon />
          </button>

          <SearchInput
            id="to"
            label="To"
            value={toLocation}
            icon={<LocationPinIcon />}
            onChange={
              setToLocation
            }
            placeholder="Destination city"
          />
        </div>

        {/* ========================================
            Travel Date
        ======================================== */}

        <div>
          <label
            htmlFor="travelDate"
            className="mb-2 block text-xs font-bold text-[#344054]"
          >
            Travel date
          </label>

          <div className="flex h-[56px] items-center gap-3 rounded-xl border border-[#d8dee8] px-4 transition focus-within:border-[#39b5f4] focus-within:ring-2 focus-within:ring-[#39b5f4]/10">

            <CalendarIcon />

            <input
              id="travelDate"
              type="date"
              required
              value={travelDate}
              min={getTodayDateInput()}
              onChange={(
                event
              ) =>
                setTravelDate(
                  event.target
                    .value
                )
              }
              className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-[#101828] outline-none"
            />
          </div>
        </div>

        {/* ========================================
            Passengers
        ======================================== */}

        <div>
          <label
            htmlFor="passengers"
            className="mb-2 block text-xs font-bold text-[#344054]"
          >
            Passengers
          </label>

          <div className="flex h-[56px] items-center gap-3 rounded-xl border border-[#d8dee8] px-4 transition focus-within:border-[#39b5f4]">

            <PersonIcon />

            <select
              id="passengers"
              value={passengers}
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
              className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-[#101828] outline-none"
            >
              {[1, 2, 3, 4, 5, 6].map(
                (number) => (
                  <option
                    key={number}
                    value={number}
                  >
                    {number}{" "}
                    {number === 1
                      ? "Passenger"
                      : "Passengers"}
                  </option>
                )
              )}
            </select>
          </div>
        </div>

        {/* ========================================
            Search Button
        ======================================== */}

        <button
          type="submit"
          className="flex h-[56px] items-center justify-center gap-2 rounded-xl bg-[#002451] px-7 text-sm font-black text-white shadow-lg transition hover:bg-[#06396c] lg:min-w-[180px]"
        >
          <SearchIcon />

          Search Trips
        </button>
      </div>

      {searchError && (
        <p
          role="alert"
          className="mt-4 text-sm font-semibold text-red-600"
        >
          {searchError}
        </p>
      )}
    </form>
  );
}

/* ========================================
   Search Input
======================================== */

function SearchInput({
  id,
  label,
  value,
  placeholder,
  icon,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  placeholder: string;
  icon: ReactNode;
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

      <div className="flex h-[56px] items-center gap-3 rounded-xl border border-[#d8dee8] px-4 transition focus-within:border-[#39b5f4] focus-within:ring-2 focus-within:ring-[#39b5f4]/10">

        <span className="text-[#002451]">
          {icon}
        </span>

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
          className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-[#101828] outline-none placeholder:text-[#98a2b3]"
        />
      </div>
    </div>
  );
}

/* ========================================
   Zano Journey Feature Strip
======================================== */

function JourneyFeatureStrip() {
  const features = [
    {
      title:
        "Search & Compare",
      text:
        "Compare operators, fares and schedules",
      icon: <SearchIcon />,
    },
    {
      title:
        "Choose Your Seat",
      text:
        "Pick your bus and preferred seat",
      icon: <SeatIcon />,
    },
    {
      title:
        "Secure Payment",
      text:
        "Complete your booking digitally",
      icon: <PaymentIcon />,
    },
    {
      title:
        "QR Ticket",
      text:
        "Receive your digital boarding ticket",
      icon: <TicketIcon />,
    },
    {
      title:
        "Live Tracking",
      text:
        "Follow your journey in real time",
      icon: <TrackingIcon />,
    },
  ];

  return (
    <section className="rounded-[22px] border border-[#edf0f4] bg-white px-5 py-6 shadow-[0_10px_35px_rgba(0,36,81,0.07)] lg:px-7">

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-5 lg:gap-0">

        {features.map(
          (feature, index) => (
            <div
              key={feature.title}
              className={`flex items-center gap-4 ${
                index > 0
                  ? "lg:border-l lg:border-[#e9edf2] lg:pl-6"
                  : ""
              }`}
            >

              <div
                className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${
                  index === 1 ||
                  index === 3
                    ? "bg-[#ff7417] text-white"
                    : "bg-[#002451] text-white"
                }`}
              >
                {feature.icon}
              </div>

              <div>
                <p className="font-extrabold text-[#101828]">
                  {feature.title}
                </p>

                <p className="mt-1 text-xs leading-5 text-[#667085]">
                  {feature.text}
                </p>
              </div>
            </div>
          )
        )}
      </div>
    </section>
  );
}

/* ========================================
   Section Title
======================================== */

function SectionTitle({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description?: string;
}) {
  return (
    <div>
      <p className="text-xs font-black uppercase tracking-[0.18em] text-[#ff7417]">
        {eyebrow}
      </p>

      <h2 className="mt-2 text-2xl font-black tracking-tight text-[#101828] lg:text-3xl">
        {title}
      </h2>

      {description && (
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[#667085]">
          {description}
        </p>
      )}
    </div>
  );
}

/* ========================================
   Section Header
======================================== */

function SectionHeader({
  title,
  action,
  href,
}: {
  title: string;
  action: string;
  href: string;
}) {
  return (
    <div className="flex items-center justify-between gap-5">

      <h2 className="text-xl font-black tracking-tight text-[#101828] lg:text-2xl">
        {title}
      </h2>

      <Link
        href={href}
        className="shrink-0 text-xs font-extrabold text-[#002451] hover:text-[#ff7417] sm:text-sm"
      >
        {action} →
      </Link>
    </div>
  );
}

/* ========================================
   Overview Card
======================================== */

function OverviewCard({
  icon,
  title,
  value,
  href,
}: {
  icon: ReactNode;
  title: string;
  value: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="group rounded-[20px] border border-[#e7eaf0] bg-white p-5 shadow-sm transition hover:-translate-y-1 hover:border-[#cbd9e8] hover:shadow-lg"
    >

      <div className="flex items-start justify-between">

        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#eaf8ff] text-[#002451]">
          {icon}
        </div>

        <span className="text-[#98a2b3] transition group-hover:text-[#ff7417]">
          →
        </span>
      </div>

      <p className="mt-5 text-3xl font-black text-[#002451]">
        {value}
      </p>

      <p className="mt-1 text-sm font-semibold text-[#667085]">
        {title}
      </p>
    </Link>
  );
}

/* ========================================
   Next Journey Card
======================================== */

function NextJourneyCard({
  booking,
}: {
  booking: PassengerBooking;
}) {
  return (
    <article className="mt-6 overflow-hidden rounded-[26px] bg-[#002451] text-white shadow-xl">

      <div className="grid lg:grid-cols-[1fr_auto]">

        <div className="p-6 sm:p-8">

          <div className="flex flex-wrap items-center gap-3">

            <StatusBadge
              status={
                booking.status
              }
            />

            {booking.companyName && (
              <span className="text-sm font-semibold text-white/70">
                {booking.companyName}
              </span>
            )}
          </div>

          <h3 className="mt-5 text-3xl font-black sm:text-4xl">
            {booking.origin ||
              "Departure"}
            {" "}
            <span className="text-[#72d8ff]">
              →
            </span>
            {" "}
            {booking.destination ||
              "Destination"}
          </h3>

          <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">

            <JourneyDetail
              label="Departure"
              value={formatDateTime(
                booking.departureAt
              )}
            />

            <JourneyDetail
              label="Boarding point"
              value={
                booking.boardingPointName ||
                "To be confirmed"
              }
            />

            <JourneyDetail
              label="Seat"
              value={
                booking.seatNumbers?.length
                  ? booking.seatNumbers.join(
                      ", "
                    )
                  : "Not assigned"
              }
            />

            <JourneyDetail
              label="Booking"
              value={
                booking.bookingReference ||
                booking.id
              }
            />
          </div>
        </div>

        <div className="flex flex-col justify-center gap-3 border-t border-white/10 bg-white/[0.06] p-6 lg:min-w-[240px] lg:border-l lg:border-t-0">

          <Link
            href={`/passenger/bookings/${booking.id}`}
            className="flex h-12 items-center justify-center rounded-xl bg-[#ff7417] px-5 text-sm font-extrabold text-white transition hover:bg-[#e96208]"
          >
            View booking
          </Link>

          {booking.trackingEnabled && (
            <Link
              href={`/passenger/tracking?bookingId=${encodeURIComponent(
                booking.id
              )}`}
              className="flex h-12 items-center justify-center gap-2 rounded-xl border border-white/25 bg-white/10 px-5 text-sm font-extrabold text-white"
            >
              <TrackingIcon />

              Track bus
            </Link>
          )}
        </div>
      </div>
    </article>
  );
}

/* ========================================
   Journey Detail
======================================== */

function JourneyDetail({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div>

      <p className="text-xs font-bold uppercase tracking-[0.12em] text-white/55">
        {label}
      </p>

      <p className="mt-2 text-sm font-extrabold leading-6 text-white">
        {value}
      </p>
    </div>
  );
}

/* ========================================
   Active Trip
======================================== */

function ActiveTripBanner({
  booking,
}: {
  booking: PassengerBooking;
}) {
  return (
    <section className="mt-10 overflow-hidden rounded-[24px] bg-[linear-gradient(120deg,#057ba5,#39b5f4)] p-6 text-white shadow-lg sm:p-8">

      <div className="flex flex-col justify-between gap-6 md:flex-row md:items-center">

        <div className="flex items-start gap-4">

          <div className="flex h-13 w-13 shrink-0 items-center justify-center rounded-2xl bg-white/15 p-3">
            <TrackingIcon />
          </div>

          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-white/70">
              Live journey
            </p>

            <h2 className="mt-2 text-2xl font-black">
              Your trip is active
            </h2>

            <p className="mt-2 text-sm text-white/[0.84]">
              {booking.origin}
              {" → "}
              {booking.destination}
            </p>
          </div>
        </div>

        <Link
          href={`/passenger/tracking?bookingId=${encodeURIComponent(
            booking.id
          )}`}
          className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-white px-6 text-sm font-black text-[#006c94]"
        >
          <TrackingIcon />

          Track Bus Live
        </Link>
      </div>
    </section>
  );
}

/* ========================================
   Popular Route
======================================== */

function PopularRouteCard({
  route,
  image,
}: {
  route: PopularRoute;
  image: string;
}) {
  const params =
    new URLSearchParams({
      from: route.from,
      to: route.to,
    });

  return (
    <Link
      href={`/search?${params.toString()}`}
      className="group overflow-hidden rounded-[20px] border border-[#e7eaf0] bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-xl"
    >

      <div className="relative h-[165px] overflow-hidden">

        <Image
          src={image}
          alt={`${route.from} to ${route.to}`}
          fill
          sizes="(max-width: 768px) 100vw, 360px"
          className="object-cover transition duration-700 group-hover:scale-105"
        />

        <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-transparent" />

        <span className="absolute bottom-3 left-3 rounded-full bg-white/95 px-3 py-1 text-[11px] font-black text-[#002451]">
          {route.tripCount}{" "}
          {route.tripCount === 1
            ? "trip"
            : "trips"}
        </span>
      </div>

      <div className="p-5">

        <h3 className="text-lg font-black text-[#101828]">
          {route.from}
          {" → "}
          {route.to}
        </h3>

        {route.nextDeparture && (
          <p className="mt-2 flex items-center gap-2 text-xs font-medium text-[#667085]">
            <ClockIcon />

            Next:{" "}
            {formatShortDateTime(
              route.nextDeparture
            )}
          </p>
        )}

        <div className="mt-4 flex items-end justify-between gap-4">

          <div>
            <p className="text-xs text-[#98a2b3]">
              From
            </p>

            <p className="text-lg font-black text-[#002451]">
              {typeof route.lowestFare ===
              "number"
                ? formatMoney(
                    route.lowestFare
                  )
                : "See fares"}
            </p>
          </div>

          <span className="text-sm font-black text-[#ff7417]">
            Search →
          </span>
        </div>
      </div>
    </Link>
  );
}

/* ========================================
   Operator Card
======================================== */

function OperatorCard({
  operator,
}: {
  operator: PopularOperator;
}) {
  const params =
    new URLSearchParams({
      company:
        operator.companyId,
    });

  return (
    <Link
      href={`/search?${params.toString()}`}
      className="group rounded-[20px] border border-[#e7eaf0] bg-white p-5 shadow-sm transition hover:-translate-y-1 hover:shadow-lg"
    >

      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#eff8ff] text-xl font-black text-[#002451]">
        {getCompanyInitials(
          operator.companyName
        )}
      </div>

      <h3 className="mt-5 line-clamp-2 font-black text-[#101828]">
        {operator.companyName}
      </h3>

      <p className="mt-2 text-xs font-semibold text-[#667085]">
        {operator.availableTrips}
        {" "}
        available{" "}
        {operator.availableTrips ===
        1
          ? "trip"
          : "trips"}
      </p>

      <div className="mt-5 flex items-center justify-between">

        <span className="text-sm font-black text-[#002451]">
          {typeof operator.lowestFare ===
          "number"
            ? `From ${formatMoney(
                operator.lowestFare
              )}`
            : "View trips"}
        </span>

        <span className="font-black text-[#ff7417] transition group-hover:translate-x-1">
          →
        </span>
      </div>
    </Link>
  );
}

/* ========================================
   Discovery Empty State
======================================== */

function DiscoveryEmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="mt-6 rounded-[22px] border border-dashed border-[#ccd5df] bg-white p-8 text-center">

      <div className="mx-auto flex h-13 w-13 items-center justify-center rounded-full bg-[#edf8ff] text-[#002451]">
        <BusIcon />
      </div>

      <h3 className="mt-4 font-black text-[#101828]">
        {title}
      </h3>

      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-[#667085]">
        {description}
      </p>
    </div>
  );
}

/* ========================================
   Zano Passenger Journey
======================================== */

function ZanoJourneySection() {
  const steps = [
    {
      number: "01",
      title: "Search",
      text:
        "Choose your origin, destination and travel date.",
    },
    {
      number: "02",
      title: "Compare",
      text:
        "Compare operators, fares, buses and departure times.",
    },
    {
      number: "03",
      title: "Choose",
      text:
        "Select a bus, boarding point and preferred seat.",
    },
    {
      number: "04",
      title: "Book & Pay",
      text:
        "Confirm passenger information and complete payment.",
    },
    {
      number: "05",
      title: "Ticket",
      text:
        "Receive your QR digital ticket immediately.",
    },
    {
      number: "06",
      title: "Track",
      text:
        "Get trip updates and track your bus during the journey.",
    },
  ];

  return (
    <section className="mt-16 overflow-hidden rounded-[30px] bg-[#001d42] px-6 py-10 text-white sm:px-8 lg:px-12 lg:py-14">

      <div className="max-w-2xl">

        <p className="text-xs font-black uppercase tracking-[0.2em] text-[#72d8ff]">
          One connected journey
        </p>

        <h2 className="mt-3 text-3xl font-black tracking-tight lg:text-4xl">
          From search to arrival.
        </h2>

        <p className="mt-3 text-sm leading-6 text-white/70">
          Zano brings trip discovery,
          booking, ticketing and journey
          tracking into one passenger
          experience.
        </p>
      </div>

      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">

        {steps.map(
          (step) => (
            <div
              key={step.number}
              className="rounded-2xl border border-white/10 bg-white/[0.06] p-5"
            >
              <span className="text-xs font-black text-[#ff8b2d]">
                {step.number}
              </span>

              <h3 className="mt-3 font-black">
                {step.title}
              </h3>

              <p className="mt-2 text-xs leading-5 text-white/60">
                {step.text}
              </p>
            </div>
          )
        )}
      </div>
    </section>
  );
}

/* ========================================
   Why Zano
======================================== */

function WhyZanoSection() {
  return (
    <section className="mt-16 border-t border-[#e4e7ec] pt-12">

      <div className="grid gap-10 xl:grid-cols-[1.25fr_0.75fr]">

        <div>

          <SectionTitle
            eyebrow="Why Zano"
            title="Travel with more control."
            description="Discover multiple operators and manage the entire journey from one place."
          />

          <div className="mt-8 grid gap-7 sm:grid-cols-2">

            <WhyItem
              icon={<CompareIcon />}
              title="Compare Your Options"
              text="Compare schedules, fares, bus types and seat availability."
            />

            <WhyItem
              icon={<SeatIcon />}
              title="Choose Your Seat"
              text="Select your boarding point and preferred available seat."
            />

            <WhyItem
              icon={<TicketIcon />}
              title="Digital Travel"
              text="Keep bookings and QR tickets accessible from your account."
            />

            <WhyItem
              icon={<TrackingIcon />}
              title="Journey Visibility"
              text="Receive trip updates and access live tracking when enabled."
            />
          </div>
        </div>

        <div className="rounded-[28px] bg-[linear-gradient(135deg,#002451,#07558b)] p-8 text-white shadow-xl lg:p-9">

          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#72d8ff]">
            Start travelling
          </p>

          <h3 className="mt-4 text-3xl font-black">
            Your next trip starts here.
          </h3>

          <p className="mt-4 text-sm leading-6 text-white/75">
            Discover available routes
            and transport operators,
            compare your options and
            choose the journey that works
            for you.
          </p>

          <Link
            href="/search"
            className="mt-7 inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-[#ff7417] px-6 text-sm font-black text-white"
          >
            <SearchIcon />

            Search Trips
          </Link>
        </div>
      </div>
    </section>
  );
}

/* ========================================
   Why Item
======================================== */

function WhyItem({
  icon,
  title,
  text,
}: {
  icon: ReactNode;
  title: string;
  text: string;
}) {
  return (
    <div className="flex gap-4">

      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white text-[#002451] shadow-sm">
        {icon}
      </div>

      <div>
        <h3 className="font-black text-[#101828]">
          {title}
        </h3>

        <p className="mt-2 text-sm leading-6 text-[#667085]">
          {text}
        </p>
      </div>
    </div>
  );
}

/* ========================================
   Status Badge
======================================== */

function StatusBadge({
  status,
}: {
  status?: BookingStatus;
}) {
  const label =
    formatBookingStatus(
      status
    );

  return (
    <span className="inline-flex rounded-full bg-[#39b5f4]/20 px-3 py-1.5 text-xs font-black text-[#9ce3ff]">
      {label}
    </span>
  );
}

/* ========================================
   Mobile Navigation
======================================== */

function PassengerBottomNavigation({
  notificationCount,
}: {
  notificationCount: number;
}) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-[#e4e7ec] bg-white/95 backdrop-blur-xl lg:hidden">

      <div className="mx-auto grid h-[82px] max-w-lg grid-cols-5 px-2">

        <BottomNavItem
          href="/passenger/dashboard"
          label="Home"
          active
          icon={<HomeIcon />}
        />

        <BottomNavItem
          href="/search"
          label="Explore"
          icon={<SearchIcon />}
        />

        <BottomNavItem
          href="/passenger/trips"
          label="Trips"
          icon={<BusIcon />}
        />

        <BottomNavItem
          href="/passenger/tickets"
          label="Tickets"
          icon={<TicketIcon />}
        />

        <BottomNavItem
          href="/passenger/profile"
          label="Me"
          icon={
            <div className="relative">
              <PersonIcon />

              {notificationCount >
                0 && (
                <span className="absolute -right-2 -top-2 h-2.5 w-2.5 rounded-full bg-[#ff7417]" />
              )}
            </div>
          }
        />
      </div>
    </nav>
  );
}

/* ========================================
   Bottom Navigation Item
======================================== */

function BottomNavItem({
  href,
  label,
  icon,
  active = false,
}: {
  href: string;
  label: string;
  icon: ReactNode;
  active?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`my-2 flex flex-col items-center justify-center gap-1 rounded-xl text-[11px] font-bold ${
        active
          ? "bg-[#e7f7ff] text-[#006b94]"
          : "text-[#667085]"
      }`}
    >
      {icon}

      {label}
    </Link>
  );
}

/* ========================================
   Loading State
======================================== */

function DashboardLoading() {
  return (
    <main className="min-h-screen animate-pulse bg-[#f7f8fc]">

      <div className="h-[700px] bg-[#dce3ea]" />

      <div className="mx-auto -mt-24 max-w-[1450px] px-6">

        <div className="h-48 rounded-[24px] bg-white shadow-xl" />

        <div className="mt-7 h-28 rounded-[22px] bg-white" />

        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <div className="h-40 rounded-2xl bg-white" />
          <div className="h-40 rounded-2xl bg-white" />
          <div className="h-40 rounded-2xl bg-white" />
          <div className="h-40 rounded-2xl bg-white" />
        </div>
      </div>
    </main>
  );
}

/* ========================================
   Build Popular Routes
======================================== */

function buildPopularRoutes(
  trips: DiscoveryTrip[]
): PopularRoute[] {
  const routeMap =
    new Map<
      string,
      PopularRoute
    >();

  trips.forEach(
    (trip, index) => {
      const from =
        trip.origin?.trim();

      const to =
        trip.destination?.trim();

      if (!from || !to) {
        return;
      }

      const key =
        `${from.toLowerCase()}-${to.toLowerCase()}`;

      const departure =
        getTimeValue(
          trip.departureAt
        );

      const fare =
        typeof trip.fare ===
        "number"
          ? trip.fare
          : undefined;

      const existing =
        routeMap.get(key);

      if (!existing) {
        routeMap.set(key, {
          from,
          to,
          tripCount: 1,
          lowestFare: fare,
          nextDeparture:
            departure,
          image:
            ROUTE_IMAGES[
              index %
                ROUTE_IMAGES.length
            ],
        });

        return;
      }

      existing.tripCount += 1;

      if (
        fare !== undefined &&
        (
          existing.lowestFare ===
            undefined ||
          fare <
            existing.lowestFare
        )
      ) {
        existing.lowestFare =
          fare;
      }

      if (
        departure !== null &&
        (
          existing.nextDeparture ===
            null ||
          existing.nextDeparture ===
            undefined ||
          departure <
            existing.nextDeparture
        )
      ) {
        existing.nextDeparture =
          departure;
      }
    }
  );

  return Array.from(
    routeMap.values()
  ).sort(
    (a, b) =>
      b.tripCount -
      a.tripCount
  );
}

/* ========================================
   Build Popular Operators
======================================== */

function buildPopularOperators(
  trips: DiscoveryTrip[]
): PopularOperator[] {
  const operatorMap =
    new Map<
      string,
      PopularOperator
    >();

  trips.forEach((trip) => {
    if (
      !trip.companyId ||
      !trip.companyName
    ) {
      return;
    }

    const fare =
      typeof trip.fare ===
      "number"
        ? trip.fare
        : undefined;

    const existing =
      operatorMap.get(
        trip.companyId
      );

    if (!existing) {
      operatorMap.set(
        trip.companyId,
        {
          companyId:
            trip.companyId,
          companyName:
            trip.companyName,
          availableTrips: 1,
          lowestFare: fare,
        }
      );

      return;
    }

    existing.availableTrips += 1;

    if (
      fare !== undefined &&
      (
        existing.lowestFare ===
          undefined ||
        fare <
          existing.lowestFare
      )
    ) {
      existing.lowestFare =
        fare;
    }
  });

  return Array.from(
    operatorMap.values()
  ).sort(
    (a, b) =>
      b.availableTrips -
      a.availableTrips
  );
}

/* ========================================
   Utilities
======================================== */

function getInitial(
  name?: string
) {
  return (
    name
      ?.trim()
      .charAt(0)
      .toUpperCase() ||
    "U"
  );
}

function getCompanyInitials(
  name: string
) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(
      (part) =>
        part.charAt(0)
    )
    .join("")
    .toUpperCase();
}

function getTodayDateInput() {
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

function getTimeValue(
  value?:
    | Timestamp
    | Date
    | string
    | null
): number | null {
  if (!value) {
    return null;
  }

  if (
    value instanceof Timestamp
  ) {
    return value.toMillis();
  }

  if (
    value instanceof Date
  ) {
    return value.getTime();
  }

  const parsed =
    new Date(
      value
    ).getTime();

  return Number.isNaN(
    parsed
  )
    ? null
    : parsed;
}

function formatDateTime(
  value?:
    | Timestamp
    | Date
    | string
    | null
) {
  const timestamp =
    getTimeValue(value);

  if (timestamp === null) {
    return "Schedule pending";
  }

  return new Intl.DateTimeFormat(
    "en-GH",
    {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }
  ).format(
    new Date(timestamp)
  );
}

function formatShortDateTime(
  timestamp: number
) {
  return new Intl.DateTimeFormat(
    "en-GH",
    {
      day: "numeric",
      month: "short",
      hour: "numeric",
      minute: "2-digit",
    }
  ).format(
    new Date(timestamp)
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

function formatBookingStatus(
  status?: BookingStatus
) {
  if (!status) {
    return "Booking";
  }

  return (
    status
      .charAt(0)
      .toUpperCase() +
    status.slice(1)
  );
}

/* ========================================
   Icons
======================================== */

function LocationPinIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M12 21s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12Z"
        stroke="currentColor"
        strokeWidth="2"
      />

      <circle
        cx="12"
        cy="9"
        r="2.2"
        fill="currentColor"
      />
    </svg>
  );
}

function SwapIcon() {
  return (
    <svg
      width="20"
      height="20"
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

function SearchIcon() {
  return (
    <svg
      width="20"
      height="20"
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

function CalendarIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <rect
        x="4"
        y="5"
        width="16"
        height="15"
        rx="2"
        stroke="currentColor"
        strokeWidth="2"
      />

      <path
        d="M8 3v4M16 3v4M4 10h16"
        stroke="currentColor"
        strokeWidth="2"
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

function ShieldIcon() {
  return (
    <svg
      width="19"
      height="19"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M12 3 19 6v5c0 4.8-3 8-7 10-4-2-7-5.2-7-10V6l7-3Z"
        stroke="currentColor"
        strokeWidth="2"
      />

      <path
        d="m9 12 2 2 4-4"
        stroke="currentColor"
        strokeWidth="2"
      />
    </svg>
  );
}

function TicketIcon() {
  return (
    <svg
      width="21"
      height="21"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M4 6h16v4a2 2 0 0 0 0 4v4H4v-4a2 2 0 0 0 0-4V6Z"
        stroke="currentColor"
        strokeWidth="2"
      />
    </svg>
  );
}

function SeatIcon() {
  return (
    <svg
      width="21"
      height="21"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M7 4v8h10V7M7 12l-2 3v4M17 12l2 3v4M7 16h10"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle
        cx="12"
        cy="12"
        r="9"
        stroke="currentColor"
        strokeWidth="2"
      />

      <path
        d="M12 7v5l3 2"
        stroke="currentColor"
        strokeWidth="2"
      />
    </svg>
  );
}

function BusIcon() {
  return (
    <svg
      width="22"
      height="22"
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

function HomeIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M3 11.5 12 4l9 7.5V20h-6v-6H9v6H3v-8.5Z"
        fill="currentColor"
      />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg
      width="21"
      height="21"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M6 10a6 6 0 0 1 12 0v4l2 3H4l2-3v-4Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />

      <path
        d="M10 20h4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function TrackingIcon() {
  return (
    <svg
      width="21"
      height="21"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M12 21s6-5.4 6-11a6 6 0 1 0-12 0c0 5.6 6 11 6 11Z"
        stroke="currentColor"
        strokeWidth="2"
      />

      <circle
        cx="12"
        cy="10"
        r="2"
        fill="currentColor"
      />
    </svg>
  );
}

function PaymentIcon() {
  return (
    <svg
      width="21"
      height="21"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <rect
        x="3"
        y="5"
        width="18"
        height="14"
        rx="2"
        stroke="currentColor"
        strokeWidth="2"
      />

      <path
        d="M3 10h18M7 15h4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CompareIcon() {
  return (
    <svg
      width="21"
      height="21"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M8 7h11M16 4l3 3-3 3M16 17H5M8 14l-3 3 3 3"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ChevronLeftIcon() {
  return (
    <svg
      width="23"
      height="23"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="m15 18-6-6 6-6"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg
      width="23"
      height="23"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="m9 6 6 6-6 6"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}