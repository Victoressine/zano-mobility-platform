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
  ReactNode,
  Suspense,
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
  limit,
  query,
  Timestamp,
  where,
} from "firebase/firestore";

import {
  auth,
  db,
} from "@/lib/firebase/client";

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
  email: string;
  role: UserRole;
  photoURL?: string;
};

type PassengerBooking = {
  id: string;

  userId?: string;

  bookingReference?: string;

  tripId?: string;

  companyId?: string;
  companyName?: string;

  origin?: string;
  destination?: string;

  busType?: string;

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

  boardingPointName?: string;
  dropOffPointName?: string;

  seatNumbers?: string[];

  status?: string;
  paymentStatus?: string;

  ticketId?: string;
  ticketNumber?: string;

  createdAt?:
    | Timestamp
    | Date
    | string
    | null;
};

type TripData = {
  id: string;

  status?: string;
  tripStatus?: string;

  companyId?: string;
  companyName?: string;

  vehicleId?: string;
  vehicleName?: string;
  registrationNumber?: string;

  origin?: string;
  destination?: string;

  boardingPoints?: unknown[];

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
};

type TripLocation = {
  id: string;

  tripId?: string;

  latitude?: number;
  longitude?: number;

  locationName?: string;
  currentLocation?: string;

  speed?: number;

  updatedAt?:
    | Timestamp
    | Date
    | string
    | null;

  createdAt?:
    | Timestamp
    | Date
    | string
    | null;
};

type TrackingStatus =
  | "scheduled"
  | "boarding"
  | "on_trip"
  | "completed"
  | "cancelled";

/* ========================================
   Page
======================================== */

export default function PassengerTrackingPage() {
  return (
    <Suspense fallback={<TrackingLoading />}>
      <PassengerTrackingContent />
    </Suspense>
  );
}

/* ========================================
   Tracking Content
======================================== */

function PassengerTrackingContent() {
  const router = useRouter();
  const searchParams =
    useSearchParams();

  const requestedBookingId =
    searchParams
      .get("bookingId")
      ?.trim() || "";

  /* ========================================
     State
  ======================================== */

  const [profile, setProfile] =
    useState<UserProfile | null>(null);

  const [bookings, setBookings] =
    useState<PassengerBooking[]>([]);

  const [selectedBookingId, setSelectedBookingId] =
    useState("");

  const [trip, setTrip] =
    useState<TripData | null>(null);

  const [location, setLocation] =
    useState<TripLocation | null>(null);

  const [isLoading, setIsLoading] =
    useState(true);

  const [isTripLoading, setIsTripLoading] =
    useState(false);

  const [isSigningOut, setIsSigningOut] =
    useState(false);

  const [errorMessage, setErrorMessage] =
    useState("");

  /* ========================================
     Load Passenger + Bookings
  ======================================== */

  useEffect(() => {
    const unsubscribe =
      onAuthStateChanged(
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
               Passenger Profile
            ======================================== */

            const profileReference =
              doc(
                db,
                "users",
                user.uid
              );

            const profileSnapshot =
              await getDoc(
                profileReference
              );

            if (
              !profileSnapshot.exists()
            ) {
              setErrorMessage(
                "Your Zano profile could not be found."
              );

              return;
            }

            const profileData =
              profileSnapshot.data() as UserProfile;

            if (
              profileData.role ===
              "operator"
            ) {
              router.replace(
                "/operator/dashboard"
              );

              return;
            }

            if (
              profileData.role ===
              "admin"
            ) {
              router.replace(
                "/admin/dashboard"
              );

              return;
            }

            if (
              profileData.role !==
              "passenger"
            ) {
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
               Passenger Bookings
            ======================================== */

            const bookingsQuery =
              query(
                collection(
                  db,
                  "bookings"
                ),
                where(
                  "userId",
                  "==",
                  user.uid
                )
              );

            const bookingSnapshot =
              await getDocs(
                bookingsQuery
              );

            const rows =
              bookingSnapshot.docs.map(
                (bookingDocument) => ({
                  id:
                    bookingDocument.id,
                  ...bookingDocument.data(),
                })
              ) as PassengerBooking[];

            rows.sort(
              (a, b) =>
                getJourneyTime(b) -
                getJourneyTime(a)
            );

            setBookings(rows);

            /* ========================================
               Initial Booking Selection
            ======================================== */

            if (requestedBookingId) {
              const requestedBooking =
                rows.find(
                  (booking) =>
                    booking.id ===
                    requestedBookingId
                );

              if (requestedBooking) {
                setSelectedBookingId(
                  requestedBooking.id
                );
              } else {
                setErrorMessage(
                  "That booking could not be found in your account."
                );

                const fallback =
                  findBestTrackingBooking(
                    rows
                  );

                if (fallback) {
                  setSelectedBookingId(
                    fallback.id
                  );
                }
              }
            } else {
              const fallback =
                findBestTrackingBooking(
                  rows
                );

              if (fallback) {
                setSelectedBookingId(
                  fallback.id
                );
              }
            }
          } catch (error) {
            console.error(
              "Passenger tracking load error:",
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
  }, [
    requestedBookingId,
    router,
  ]);

  /* ========================================
     Selected Booking
  ======================================== */

  const selectedBooking =
    useMemo(
      () =>
        bookings.find(
          (booking) =>
            booking.id ===
            selectedBookingId
        ) || null,
      [
        bookings,
        selectedBookingId,
      ]
    );

  /* ========================================
     Load Trip + Latest Location
  ======================================== */

  useEffect(() => {
    let cancelled = false;

    async function loadTripTracking() {
      if (
        !selectedBooking?.tripId
      ) {
        setTrip(null);
        setLocation(null);

        return;
      }

      try {
        setIsTripLoading(true);

        /* ========================================
           Trip
        ======================================== */

        const tripReference =
          doc(
            db,
            "trips",
            selectedBooking.tripId
          );

        const tripSnapshot =
          await getDoc(
            tripReference
          );

        if (cancelled) {
          return;
        }

        if (tripSnapshot.exists()) {
          setTrip({
            id: tripSnapshot.id,
            ...tripSnapshot.data(),
          } as TripData);
        } else {
          setTrip(null);
        }

        /* ========================================
           Latest Available Location

           No fake coordinates are created.
        ======================================== */

        try {
          const locationQuery =
            query(
              collection(
                db,
                "tripLocations"
              ),
              where(
                "tripId",
                "==",
                selectedBooking.tripId
              ),
              limit(25)
            );

          const locationSnapshot =
            await getDocs(
              locationQuery
            );

          if (cancelled) {
            return;
          }

          const locationRows =
            locationSnapshot.docs.map(
              (locationDocument) => ({
                id:
                  locationDocument.id,
                ...locationDocument.data(),
              })
            ) as TripLocation[];

          locationRows.sort(
            (a, b) =>
              getLocationTime(b) -
              getLocationTime(a)
          );

          setLocation(
            locationRows[0] || null
          );
        } catch (locationError) {
          console.warn(
            "Trip location is not available:",
            locationError
          );

          if (!cancelled) {
            setLocation(null);
          }
        }
      } catch (error) {
        console.error(
          "Trip tracking error:",
          error
        );

        if (!cancelled) {
          setTrip(null);
          setLocation(null);
        }
      } finally {
        if (!cancelled) {
          setIsTripLoading(false);
        }
      }
    }

    void loadTripTracking();

    return () => {
      cancelled = true;
    };
  }, [selectedBooking]);

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
    return <TrackingLoading />;
  }

  /* ========================================
     Status
  ======================================== */

  const trackingStatus =
    getTrackingStatus(
      selectedBooking,
      trip
    );

  const statusContent =
    getStatusContent(
      trackingStatus
    );

  /* ========================================
     Main
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

          <nav className="hidden items-center gap-1 lg:flex">
            <HeaderLink href="/passenger/dashboard">
              Home
            </HeaderLink>

            <HeaderLink href="/search">
              Find Trips
            </HeaderLink>

            <HeaderLink href="/passenger/trips">
              My Trips
            </HeaderLink>

            <HeaderLink href="/passenger/tickets">
              Tickets
            </HeaderLink>

            <HeaderLink
              href="/passenger/tracking"
              active
            >
              Track Trip
            </HeaderLink>
          </nav>

          <div className="flex items-center gap-3">
            <Link
              href="/passenger/notifications"
              className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white hover:text-[#002451]"
              aria-label="Notifications"
            >
              <BellIcon />
            </Link>

            <div className="hidden text-right sm:block">
              <p className="text-sm font-black text-white">
                {profile?.firstName ||
                  "Passenger"}
              </p>

              <p className="text-xs text-white/65">
                Track your journey
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
              className="hidden rounded-xl border border-white/25 bg-white/10 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-white hover:text-[#002451] disabled:opacity-60 xl:block"
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

          <div className="mt-7">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-[#73d6ff]">
              Journey status
            </p>

            <h1 className="mt-3 text-4xl font-black tracking-tight sm:text-5xl">
              Track Trip
            </h1>

            <p className="mt-4 max-w-2xl text-sm leading-7 text-white/75 sm:text-base">
              Check your trip status,
              boarding details and the
              latest available bus
              location.
            </p>
          </div>
        </div>
      </section>

      {/* ========================================
          Content
      ======================================== */}

      <section className="relative -mt-12 px-5 sm:px-7 lg:px-10">
        <div className="mx-auto max-w-[1100px]">
          {errorMessage && (
            <div
              role="alert"
              className="mb-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700"
            >
              {errorMessage}
            </div>
          )}

          {bookings.length === 0 ? (
            <EmptyTracking />
          ) : (
            <>
              {/* ========================================
                  Trip Selector
              ======================================== */}

              <section className="rounded-[24px] border border-[#e6eaf0] bg-white p-5 shadow-[0_14px_45px_rgba(0,36,81,0.07)] sm:p-6">
                <label
                  htmlFor="tracking-booking"
                  className="text-xs font-black uppercase tracking-[0.12em] text-[#667085]"
                >
                  Select Trip
                </label>

                <select
                  id="tracking-booking"
                  value={
                    selectedBookingId
                  }
                  onChange={(event) => {
                    const bookingId =
                      event.target.value;

                    setSelectedBookingId(
                      bookingId
                    );

                    router.replace(
                      `/passenger/tracking?bookingId=${encodeURIComponent(
                        bookingId
                      )}`
                    );
                  }}
                  className="mt-3 h-12 w-full rounded-xl border border-[#d0d5dd] bg-white px-4 text-sm font-bold text-[#002451] outline-none transition focus:border-[#39b5f4] focus:ring-4 focus:ring-[#39b5f4]/10"
                >
                  {bookings.map(
                    (booking) => (
                      <option
                        key={booking.id}
                        value={booking.id}
                      >
                        {getBookingOptionLabel(
                          booking
                        )}
                      </option>
                    )
                  )}
                </select>
              </section>

              {selectedBooking && (
                <>
                  {/* ========================================
                      Main Trip Card
                  ======================================== */}

                  <section className="mt-6 overflow-hidden rounded-[26px] border border-[#e6eaf0] bg-white shadow-[0_14px_45px_rgba(0,36,81,0.07)]">
                    <div className="bg-[#002451] p-6 text-white sm:p-8">
                      <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-start">
                        <div>
                          <p className="text-xs font-black uppercase tracking-[0.16em] text-[#73d6ff]">
                            {
                              statusContent.eyebrow
                            }
                          </p>

                          <h2 className="mt-3 text-3xl font-black tracking-tight">
                            {selectedBooking.origin ||
                              trip?.origin ||
                              "Departure"}

                            <span className="mx-3 text-[#39b5f4]">
                              →
                            </span>

                            {selectedBooking.destination ||
                              trip?.destination ||
                              "Destination"}
                          </h2>

                          <p className="mt-3 text-sm font-semibold text-white/65">
                            {selectedBooking.companyName ||
                              trip?.companyName ||
                              "Transport operator"}
                          </p>
                        </div>

                        <StatusBadge
                          status={
                            trackingStatus
                          }
                        />
                      </div>
                    </div>

                    <div className="grid gap-0 lg:grid-cols-[1.1fr_0.9fr]">
                      {/* Journey */}

                      <div className="p-6 sm:p-8">
                        <h3 className="text-xl font-black text-[#002451]">
                          Journey Details
                        </h3>

                        <div className="mt-6 grid gap-5 sm:grid-cols-2">
                          <Detail
                            label="Travel Date"
                            value={formatTravelDate(
                              selectedBooking
                            )}
                          />

                          <Detail
                            label="Departure"
                            value={formatTime(
                              selectedBooking.departureAt ||
                                trip?.departureAt
                            )}
                          />

                          <Detail
                            label="Arrival"
                            value={formatTime(
                              selectedBooking.arrivalAt ||
                                trip?.arrivalAt
                            )}
                          />

                          <Detail
                            label="Seat"
                            value={
                              selectedBooking.seatNumbers?.length
                                ? selectedBooking.seatNumbers.join(
                                    ", "
                                  )
                                : "Not assigned"
                            }
                          />

                          <Detail
                            label="Boarding Point"
                            value={
                              selectedBooking.boardingPointName ||
                              "To be confirmed"
                            }
                          />

                          <Detail
                            label="Drop-off Point"
                            value={
                              selectedBooking.dropOffPointName ||
                              "To be confirmed"
                            }
                          />

                          <Detail
                            label="Bus"
                            value={
                              trip?.vehicleName ||
                              selectedBooking.busType ||
                              "To be confirmed"
                            }
                          />

                          <Detail
                            label="Registration"
                            value={
                              trip?.registrationNumber ||
                              "To be confirmed"
                            }
                          />
                        </div>
                      </div>

                      {/* Status */}

                      <div className="border-t border-[#edf0f4] bg-[#fafcff] p-6 sm:p-8 lg:border-l lg:border-t-0">
                        <h3 className="text-xl font-black text-[#002451]">
                          Trip Status
                        </h3>

                        <div className="mt-6">
                          <JourneyProgress
                            status={
                              trackingStatus
                            }
                          />
                        </div>

                        <div className="mt-7 rounded-2xl bg-white p-5 shadow-sm">
                          <div className="flex gap-3">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#eaf8ff] text-[#002451]">
                              <InfoIcon />
                            </div>

                            <div>
                              <p className="font-black text-[#002451]">
                                {
                                  statusContent.title
                                }
                              </p>

                              <p className="mt-1 text-sm leading-6 text-[#667085]">
                                {
                                  statusContent.description
                                }
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </section>

                  {/* ========================================
                      Location
                  ======================================== */}

                  <section className="mt-6 rounded-[26px] border border-[#e6eaf0] bg-white p-6 shadow-[0_14px_45px_rgba(0,36,81,0.07)] sm:p-8">
                    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                      <div>
                        <p className="text-xs font-black uppercase tracking-[0.15em] text-[#39b5f4]">
                          Live tracking
                        </p>

                        <h3 className="mt-2 text-2xl font-black text-[#002451]">
                          Latest Bus Location
                        </h3>
                      </div>

                      {location && (
                        <span className="w-fit rounded-full bg-[#ecfdf3] px-3 py-1.5 text-xs font-black text-[#027a48]">
                          Location available
                        </span>
                      )}
                    </div>

                    {isTripLoading ? (
                      <div className="mt-6 h-40 animate-pulse rounded-2xl bg-[#f2f4f7]" />
                    ) : location ? (
                      <div className="mt-6 grid gap-4 sm:grid-cols-3">
                        <LocationDetail
                          label="Current Location"
                          value={
                            location.locationName ||
                            location.currentLocation ||
                            formatCoordinates(
                              location
                            )
                          }
                        />

                        <LocationDetail
                          label="Last Updated"
                          value={formatDateTime(
                            location.updatedAt ||
                              location.createdAt
                          )}
                        />

                        <LocationDetail
                          label="Speed"
                          value={
                            typeof location.speed ===
                            "number"
                              ? `${Math.round(
                                  location.speed
                                )} km/h`
                              : "Not available"
                          }
                        />
                      </div>
                    ) : (
                      <div className="mt-6 rounded-2xl border border-dashed border-[#d0d5dd] bg-[#fafafa] p-7 text-center">
                        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-[#eaf8ff] text-[#002451]">
                          <LocationIcon />
                        </div>

                        <h4 className="mt-4 font-black text-[#002451]">
                          Live location not
                          available yet
                        </h4>

                        <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-[#667085]">
                          Zano will show the
                          latest bus location
                          here when tracking
                          data is available for
                          this trip.
                        </p>
                      </div>
                    )}
                  </section>

                  {/* ========================================
                      Booking Actions
                  ======================================== */}

                  <section className="mt-6 flex flex-wrap gap-3">
                    <Link
                      href={`/passenger/bookings/${selectedBooking.id}`}
                      className="inline-flex h-11 items-center justify-center rounded-xl bg-[#002451] px-5 text-sm font-black text-white transition hover:bg-[#003a7a]"
                    >
                      View Booking
                    </Link>

                    {selectedBooking.ticketId && (
                      <Link
                        href={`/passenger/bookings/${selectedBooking.id}/ticket`}
                        className="inline-flex h-11 items-center justify-center rounded-xl border border-[#d0d5dd] bg-white px-5 text-sm font-black text-[#002451] transition hover:border-[#002451]"
                      >
                        View Ticket
                      </Link>
                    )}

                    <Link
                      href="/passenger/trips"
                      className="inline-flex h-11 items-center justify-center rounded-xl border border-[#d0d5dd] bg-white px-5 text-sm font-black text-[#475467] transition hover:border-[#002451] hover:text-[#002451]"
                    >
                      My Trips
                    </Link>
                  </section>
                </>
              )}
            </>
          )}
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
          />

          <MobileNavLink
            href="/passenger/tickets"
            icon={<TicketIcon />}
            label="Tickets"
          />

          <MobileNavLink
            href="/passenger/tracking"
            icon={<LocationIcon />}
            label="Track"
            active
          />
        </div>
      </nav>
    </main>
  );
}

/* ========================================
   Best Booking
======================================== */

function findBestTrackingBooking(
  bookings: PassengerBooking[]
) {
  const validBookings =
    bookings.filter(
      (booking) =>
        booking.status
          ?.toLowerCase() !==
          "cancelled"
    );

  const now = Date.now();

  const upcoming =
    validBookings
      .filter(
        (booking) =>
          getJourneyTime(booking) >=
          now
      )
      .sort(
        (a, b) =>
          getJourneyTime(a) -
          getJourneyTime(b)
      );

  if (upcoming.length > 0) {
    return upcoming[0];
  }

  return validBookings[0] || null;
}

/* ========================================
   Tracking Status
======================================== */

function getTrackingStatus(
  booking: PassengerBooking | null,
  trip: TripData | null
): TrackingStatus {
  const rawStatus =
    (
      trip?.tripStatus ||
      trip?.status ||
      booking?.status ||
      ""
    )
      .trim()
      .toLowerCase()
      .replaceAll("-", "_")
      .replaceAll(" ", "_");

  if (
    rawStatus === "cancelled" ||
    rawStatus === "canceled"
  ) {
    return "cancelled";
  }

  if (
    rawStatus === "completed" ||
    rawStatus === "complete"
  ) {
    return "completed";
  }

  if (
    rawStatus === "on_trip" ||
    rawStatus === "in_progress" ||
    rawStatus === "departed"
  ) {
    return "on_trip";
  }

  if (
    rawStatus === "boarding" ||
    rawStatus === "boarding_now"
  ) {
    return "boarding";
  }

  return "scheduled";
}

function getStatusContent(
  status: TrackingStatus
) {
  switch (status) {
    case "boarding":
      return {
        eyebrow: "Boarding",
        title: "Boarding is in progress",
        description:
          "Have your digital ticket ready and proceed to your confirmed boarding point.",
      };

    case "on_trip":
      return {
        eyebrow: "On the road",
        title: "Your trip is underway",
        description:
          "The bus has started the journey. Available location updates will appear below.",
      };

    case "completed":
      return {
        eyebrow: "Completed",
        title: "Trip completed",
        description:
          "This journey has been marked as completed.",
      };

    case "cancelled":
      return {
        eyebrow: "Cancelled",
        title: "Trip cancelled",
        description:
          "This trip has been marked as cancelled. Check your booking information for details.",
      };

    default:
      return {
        eyebrow: "Scheduled",
        title: "Your trip is scheduled",
        description:
          "Check your departure time and boarding information before travelling.",
      };
  }
}

/* ========================================
   Journey Progress
======================================== */

function JourneyProgress({
  status,
}: {
  status: TrackingStatus;
}) {
  const stages = [
    {
      key: "scheduled",
      label: "Scheduled",
    },
    {
      key: "boarding",
      label: "Boarding",
    },
    {
      key: "on_trip",
      label: "On Trip",
    },
    {
      key: "completed",
      label: "Completed",
    },
  ] as const;

  const indexMap: Record<
    Exclude<
      TrackingStatus,
      "cancelled"
    >,
    number
  > = {
    scheduled: 0,
    boarding: 1,
    on_trip: 2,
    completed: 3,
  };

  if (status === "cancelled") {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-4">
        <p className="font-black text-red-700">
          Trip Cancelled
        </p>

        <p className="mt-1 text-sm text-red-600">
          Journey progress is no
          longer active.
        </p>
      </div>
    );
  }

  const activeIndex =
    indexMap[status];

  return (
    <div className="space-y-1">
      {stages.map(
        (stage, index) => {
          const complete =
            index <= activeIndex;

          return (
            <div
              key={stage.key}
              className="flex gap-3"
            >
              <div className="flex flex-col items-center">
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-full border-2 ${
                    complete
                      ? "border-[#39b5f4] bg-[#39b5f4] text-white"
                      : "border-[#d0d5dd] bg-white text-[#98a2b3]"
                  }`}
                >
                  {complete ? (
                    <CheckIcon />
                  ) : (
                    <span className="h-2 w-2 rounded-full bg-current" />
                  )}
                </div>

                {index <
                  stages.length - 1 && (
                  <div
                    className={`h-9 w-0.5 ${
                      index <
                      activeIndex
                        ? "bg-[#39b5f4]"
                        : "bg-[#e4e7ec]"
                    }`}
                  />
                )}
              </div>

              <div className="pt-1">
                <p
                  className={`text-sm font-black ${
                    complete
                      ? "text-[#002451]"
                      : "text-[#98a2b3]"
                  }`}
                >
                  {stage.label}
                </p>
              </div>
            </div>
          );
        }
      )}
    </div>
  );
}

/* ========================================
   Status Badge
======================================== */

function StatusBadge({
  status,
}: {
  status: TrackingStatus;
}) {
  const styles: Record<
    TrackingStatus,
    string
  > = {
    scheduled:
      "bg-[#eaf8ff] text-[#0078b8]",
    boarding:
      "bg-[#fff3e8] text-[#c95700]",
    on_trip:
      "bg-[#ecfdf3] text-[#027a48]",
    completed:
      "bg-white/10 text-white",
    cancelled:
      "bg-red-100 text-red-700",
  };

  const labels: Record<
    TrackingStatus,
    string
  > = {
    scheduled: "SCHEDULED",
    boarding: "BOARDING",
    on_trip: "ON TRIP",
    completed: "COMPLETED",
    cancelled: "CANCELLED",
  };

  return (
    <span
      className={`w-fit rounded-full px-3 py-1.5 text-[10px] font-black ${styles[status]}`}
    >
      {labels[status]}
    </span>
  );
}

/* ========================================
   Details
======================================== */

function Detail({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div>
      <p className="text-[10px] font-black uppercase tracking-[0.1em] text-[#98a2b3]">
        {label}
      </p>

      <p className="mt-1.5 text-sm font-black leading-5 text-[#344054]">
        {value}
      </p>
    </div>
  );
}

function LocationDetail({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl bg-[#f8fafc] p-4">
      <p className="text-[10px] font-black uppercase tracking-[0.1em] text-[#98a2b3]">
        {label}
      </p>

      <p className="mt-2 break-words text-sm font-black text-[#002451]">
        {value}
      </p>
    </div>
  );
}

/* ========================================
   Empty State
======================================== */

function EmptyTracking() {
  return (
    <section className="rounded-[26px] border border-[#e6eaf0] bg-white px-6 py-16 text-center shadow-[0_14px_45px_rgba(0,36,81,0.07)]">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[#eaf8ff] text-[#002451]">
        <LocationIcon />
      </div>

      <h2 className="mt-5 text-2xl font-black text-[#002451]">
        No trips to track
      </h2>

      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#667085]">
        Once you book a trip, its
        journey information will
        appear here.
      </p>

      <Link
        href="/search"
        className="mt-6 inline-flex h-12 items-center justify-center rounded-xl bg-[#ff7417] px-6 text-sm font-black text-white transition hover:bg-[#e96208]"
      >
        Find a Trip
      </Link>
    </section>
  );
}

/* ========================================
   Date Helpers
======================================== */

function getJourneyTime(
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

  const time =
    new Date(
      `${value}T00:00:00`
    ).getTime();

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

  if (
    value instanceof Timestamp
  ) {
    return value.toMillis();
  }

  if (value instanceof Date) {
    const time =
      value.getTime();

    return Number.isNaN(time)
      ? null
      : time;
  }

  if (
    typeof value === "string"
  ) {
    const time =
      new Date(value).getTime();

    return Number.isNaN(time)
      ? null
      : time;
  }

  return null;
}

function getLocationTime(
  location: TripLocation
) {
  return (
    getTimeValue(
      location.updatedAt
    ) ??
    getTimeValue(
      location.createdAt
    ) ??
    0
  );
}

function formatTravelDate(
  booking: PassengerBooking
) {
  const time =
    getTimeValue(
      booking.departureAt
    ) ??
    getTravelDateTime(
      booking.travelDate
    );

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
    }
  ).format(new Date(time));
}

function formatTime(
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
      hour: "numeric",
      minute: "2-digit",
    }
  ).format(new Date(time));
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
    return "Not available";
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
  ).format(new Date(time));
}

/* ========================================
   Location Helpers
======================================== */

function formatCoordinates(
  location: TripLocation
) {
  if (
    typeof location.latitude !==
      "number" ||
    typeof location.longitude !==
      "number"
  ) {
    return "Location available";
  }

  return `${location.latitude.toFixed(
    5
  )}, ${location.longitude.toFixed(
    5
  )}`;
}

/* ========================================
   Booking Selector
======================================== */

function getBookingOptionLabel(
  booking: PassengerBooking
) {
  const route = `${
    booking.origin ||
    "Departure"
  } → ${
    booking.destination ||
    "Destination"
  }`;

  const date =
    booking.travelDate ||
    "";

  return date
    ? `${route} — ${date}`
    : route;
}

/* ========================================
   General
======================================== */

function getInitial(
  value?: string
) {
  const name =
    value?.trim();

  return name
    ? name.charAt(0).toUpperCase()
    : "P";
}

/* ========================================
   Header
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
   Loading
======================================== */

function TrackingLoading() {
  return (
    <main className="min-h-screen bg-[#f7f8fc]">
      <div className="h-[82px] animate-pulse bg-[#002451]" />

      <div className="bg-[#002451] px-5 pb-24 pt-10">
        <div className="mx-auto max-w-[1100px]">
          <div className="h-4 w-32 animate-pulse rounded bg-white/20" />

          <div className="mt-6 h-12 w-64 animate-pulse rounded-xl bg-white/15" />

          <div className="mt-4 h-5 w-96 max-w-full animate-pulse rounded bg-white/10" />
        </div>
      </div>

      <div className="relative -mt-12 mx-auto max-w-[1100px] px-5">
        <div className="h-24 animate-pulse rounded-[24px] bg-white shadow-sm" />

        <div className="mt-6 h-[450px] animate-pulse rounded-[26px] bg-white shadow-sm" />

        <div className="mt-6 h-56 animate-pulse rounded-[26px] bg-white shadow-sm" />
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
      <circle cx="9" cy="15" r="1" />
      <circle cx="15" cy="15" r="1" />
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

function BellIcon() {
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
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
      <path d="M10 21h4" />
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

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      aria-hidden="true"
    >
      <path d="m5 12 4 4L19 6" />
    </svg>
  );
}

function InfoIcon() {
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
      <path d="M12 11v5" />
      <path d="M12 8h.01" />
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