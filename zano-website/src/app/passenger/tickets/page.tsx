"use client";

/* ========================================
   Imports
======================================== */

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { ReactNode, useEffect, useMemo, useState } from "react";

import { onAuthStateChanged, signOut } from "firebase/auth";

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

type UserRole = "passenger" | "operator" | "admin";

type UserProfile = {
  firstName: string;
  lastName: string;
  email: string;
  role: UserRole;
  photoURL?: string;
};

type TicketPassenger = {
  fullName?: string;
  phoneNumber?: string;
  seatId?: string;
  seatNumber?: string;
};

type PassengerTicket = {
  id: string;

  userId?: string;

  ticketNumber?: string;

  bookingId?: string;
  bookingReference?: string;

  tripId?: string;

  companyId?: string;
  companyName?: string;

  origin?: string;
  destination?: string;
  busType?: string;

  travelDate?: string;

  departureAt?: Timestamp | Date | string | null;

  arrivalAt?: Timestamp | Date | string | null;

  boardingPointName?: string;
  dropOffPointName?: string;

  passengerCount?: number;
  passengers?: TicketPassenger[];

  seatNumbers?: string[];

  totalAmount?: number;
  currency?: string;

  bookingStatus?: string;
  paymentStatus?: string;

  status?: string;

  createdAt?: Timestamp | Date | string | null;
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

  departureAt?: Timestamp | Date | string | null;

  arrivalAt?: Timestamp | Date | string | null;

  boardingPointName?: string;
  dropOffPointName?: string;

  passengerCount?: number;
  passengers?: TicketPassenger[];

  seatNumbers?: string[];

  totalAmount?: number;
  currency?: string;

  status?: string;
  paymentStatus?: string;

  ticketId?: string;
  ticketNumber?: string;

  createdAt?: Timestamp | Date | string | null;
};

type TicketFilter = "active" | "past" | "all";

/* ========================================
   Passenger Tickets Page
======================================== */

export default function PassengerTicketsPage() {
  const router = useRouter();

  /* ========================================
     State
  ======================================== */

  const [profile, setProfile] = useState<UserProfile | null>(null);

  const [tickets, setTickets] = useState<PassengerTicket[]>([]);

  const [activeFilter, setActiveFilter] = useState<TicketFilter>("active");

  const [isLoading, setIsLoading] = useState(true);

  const [isSigningOut, setIsSigningOut] = useState(false);

  const [errorMessage, setErrorMessage] = useState("");

  const [currentTime] = useState(() => Date.now());

  /* ========================================
     Authentication + Ticket Loading
  ======================================== */

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
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

        const profileReference = doc(db, "users", user.uid);

        const profileSnapshot = await getDoc(profileReference);

        if (!profileSnapshot.exists()) {
          setErrorMessage("Your Zano profile could not be found.");

          return;
        }

        const profileData = profileSnapshot.data() as UserProfile;

        /* ========================================
             Role Protection
          ======================================== */

        if (profileData.role === "operator") {
          router.replace("/operator/dashboard");

          return;
        }

        if (profileData.role === "admin") {
          router.replace("/admin/dashboard");

          return;
        }

        if (profileData.role !== "passenger") {
          setErrorMessage("This account does not have passenger access.");

          return;
        }

        setProfile({
          ...profileData,
          email: profileData.email || user.email || "",
          photoURL: profileData.photoURL || user.photoURL || "",
        });

        /* ========================================
             Load Passenger Tickets
          ======================================== */

        const ticketQuery = query(
          collection(db, "tickets"),
          where("userId", "==", user.uid),
        );

        const ticketSnapshot = await getDocs(ticketQuery);

        const ticketRows = ticketSnapshot.docs.map((ticketDocument) => ({
          id: ticketDocument.id,
          ...ticketDocument.data(),
        })) as PassengerTicket[];

        /* ========================================
             Load Confirmed Passenger Bookings

             This provides a safe compatibility
             fallback for existing bookings that
             contain ticketId/ticketNumber.
          ======================================== */

        const bookingQuery = query(
          collection(db, "bookings"),
          where("userId", "==", user.uid),
        );

        const bookingSnapshot = await getDocs(bookingQuery);

        const bookingRows = bookingSnapshot.docs.map((bookingDocument) => ({
          id: bookingDocument.id,
          ...bookingDocument.data(),
        })) as PassengerBooking[];

        /* ========================================
             Merge Ticket + Booking Information
          ======================================== */

        const mergedTickets = mergePassengerTickets(ticketRows, bookingRows);

        setTickets(mergedTickets);
      } catch (error) {
        console.error("Passenger tickets loading error:", error);

        setErrorMessage(
          "We could not load your tickets. Please refresh and try again.",
        );
      } finally {
        setIsLoading(false);
      }
    });

    return unsubscribe;
  }, [router]);

  /* ========================================
     Ticket Groups
  ======================================== */

  const activeTickets = useMemo(() => {
    return tickets
      .filter((ticket) => isActiveTicket(ticket, currentTime))
      .sort((a, b) => getTicketSortTime(a) - getTicketSortTime(b));
  }, [tickets, currentTime]);

  const pastTickets = useMemo(() => {
    return tickets
      .filter((ticket) => isPastTicket(ticket, currentTime))
      .sort((a, b) => getTicketSortTime(b) - getTicketSortTime(a));
  }, [tickets, currentTime]);

  const allTickets = useMemo(() => {
    return [...tickets].sort(
      (a, b) => getTicketSortTime(b) - getTicketSortTime(a),
    );
  }, [tickets]);

  const displayedTickets = useMemo(() => {
    if (activeFilter === "past") {
      return pastTickets;
    }

    if (activeFilter === "all") {
      return allTickets;
    }

    return activeTickets;
  }, [activeFilter, activeTickets, pastTickets, allTickets]);

  /* ========================================
     Sign Out
  ======================================== */

  async function handleSignOut() {
    try {
      setIsSigningOut(true);

      await signOut(auth);

      router.replace("/login");
    } catch (error) {
      console.error("Passenger sign out error:", error);

      setErrorMessage("Unable to sign out. Please try again.");
    } finally {
      setIsSigningOut(false);
    }
  }

  /* ========================================
     Loading
  ======================================== */

  if (isLoading) {
    return <TicketsLoading />;
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

          {/* Desktop Navigation */}

          <nav className="hidden items-center gap-1 lg:flex">
            <HeaderLink href="/passenger/dashboard">Home</HeaderLink>

            <HeaderLink href="/search">Find Trips</HeaderLink>

            <HeaderLink href="/passenger/trips">My Trips</HeaderLink>

            <HeaderLink href="/passenger/tickets" active>
              Tickets
            </HeaderLink>

            <HeaderLink href="/passenger/tracking">Track Trip</HeaderLink>
          </nav>

          {/* Passenger */}

          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-black text-white">
                {profile?.firstName || "Passenger"}
              </p>

              <p className="text-xs text-white/65">
                {activeTickets.length} active{" "}
                {activeTickets.length === 1 ? "ticket" : "tickets"}
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
                getInitial(profile?.firstName)
              )}
            </Link>

            <button
              type="button"
              onClick={handleSignOut}
              disabled={isSigningOut}
              className="hidden rounded-xl border border-white/25 bg-white/10 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-white hover:text-[#002451] disabled:opacity-60 xl:block"
            >
              {isSigningOut ? "Signing out..." : "Sign out"}
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
                Ready to board
              </p>

              <h1 className="mt-3 text-4xl font-black tracking-tight sm:text-5xl">
                Tickets
              </h1>

              <p className="mt-4 max-w-2xl text-sm leading-7 text-white/75 sm:text-base">
                Access your Zano travel tickets and boarding details in one
                place.
              </p>
            </div>

            <Link
              href="/search"
              className="inline-flex h-12 w-fit items-center justify-center gap-2 rounded-xl bg-[#ff7417] px-6 text-sm font-black text-white shadow-lg transition hover:bg-[#e96208]"
            >
              <SearchIcon />
              Book Another Trip
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

          <div className="grid gap-4 sm:grid-cols-3">
            <SummaryCard
              label="Active Tickets"
              value={activeTickets.length}
              icon={<TicketIcon />}
            />

            <SummaryCard
              label="Past Tickets"
              value={pastTickets.length}
              icon={<HistoryIcon />}
            />

            <SummaryCard
              label="All Tickets"
              value={allTickets.length}
              icon={<CollectionIcon />}
            />
          </div>

          {/* Error */}

          {errorMessage && (
            <div
              role="alert"
              className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700"
            >
              {errorMessage}
            </div>
          )}

          {/* ========================================
              Tickets
          ======================================== */}

          <section className="mt-7 overflow-hidden rounded-[26px] border border-[#e6eaf0] bg-white shadow-[0_14px_45px_rgba(0,36,81,0.07)]">
            <div className="border-b border-[#edf0f4] p-5 sm:p-7">
              <div className="flex flex-col justify-between gap-5 md:flex-row md:items-center">
                <div>
                  <h2 className="text-2xl font-black text-[#002451]">
                    Your Tickets
                  </h2>

                  <p className="mt-2 text-sm text-[#667085]">
                    Keep your active ticket ready when boarding.
                  </p>
                </div>

                <div className="flex gap-2 overflow-x-auto pb-1">
                  <FilterButton
                    label="Active"
                    count={activeTickets.length}
                    active={activeFilter === "active"}
                    onClick={() => setActiveFilter("active")}
                  />

                  <FilterButton
                    label="Past"
                    count={pastTickets.length}
                    active={activeFilter === "past"}
                    onClick={() => setActiveFilter("past")}
                  />

                  <FilterButton
                    label="All"
                    count={allTickets.length}
                    active={activeFilter === "all"}
                    onClick={() => setActiveFilter("all")}
                  />
                </div>
              </div>
            </div>

            <div className="p-5 sm:p-7">
              {displayedTickets.length > 0 ? (
                <div className="grid gap-5 lg:grid-cols-2">
                  {displayedTickets.map((ticket) => (
                    <TicketCard
                      key={ticket.id}
                      ticket={ticket}
                      currentTime={currentTime}
                    />
                  ))}
                </div>
              ) : (
                <EmptyTickets filter={activeFilter} />
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

          <MobileNavLink href="/search" icon={<SearchIcon />} label="Search" />

          <MobileNavLink
            href="/passenger/trips"
            icon={<BusIcon />}
            label="Trips"
          />

          <MobileNavLink
            href="/passenger/tickets"
            icon={<TicketIcon />}
            label="Tickets"
            active
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
   Ticket Card
======================================== */

function TicketCard({
  ticket,
  currentTime,
}: {
  ticket: PassengerTicket;
  currentTime: number;
}) {
  const active = isActiveTicket(ticket, currentTime);

  const passengerNames = ticket.passengers
    ?.map((passenger) => passenger.fullName?.trim())
    .filter(Boolean)
    .join(", ");

  return (
    <article className="overflow-hidden rounded-[24px] border border-[#dfe5ec] bg-white shadow-sm transition hover:shadow-lg">
      {/* Ticket Top */}

      <div className="bg-[#002451] p-5 text-white sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#73d6ff]">
              Zano Digital Ticket
            </p>

            <p className="mt-2 text-sm font-bold text-white/70">
              {ticket.companyName || "Transport operator"}
            </p>
          </div>

          <span
            className={`rounded-full px-3 py-1.5 text-[10px] font-black ${
              active
                ? "bg-[#ecfdf3] text-[#027a48]"
                : "bg-white/10 text-white/75"
            }`}
          >
            {active ? "ACTIVE" : "PAST"}
          </span>
        </div>

        <div className="mt-6">
          <h3 className="text-2xl font-black tracking-tight">
            {ticket.origin || "Departure"}
            <span className="mx-2 text-[#39b5f4]">→</span>
            {ticket.destination || "Destination"}
          </h3>

          {ticket.busType && (
            <p className="mt-2 text-xs font-semibold text-white/60">
              {ticket.busType}
            </p>
          )}
        </div>
      </div>

      {/* Ticket Body */}

      <div className="p-5 sm:p-6">
        <div className="grid grid-cols-2 gap-x-5 gap-y-5">
          <TicketDetail label="Travel Date" value={formatTravelDate(ticket)} />

          <TicketDetail
            label="Departure"
            value={formatTravelTime(ticket.departureAt)}
          />

          <TicketDetail
            label="Seat"
            value={
              ticket.seatNumbers?.length
                ? ticket.seatNumbers.join(", ")
                : getPassengerSeats(ticket.passengers) || "Not assigned"
            }
          />

          <TicketDetail
            label="Passenger"
            value={passengerNames || "Passenger"}
          />

          <TicketDetail
            label="Boarding"
            value={ticket.boardingPointName || "To be confirmed"}
          />

          <TicketDetail
            label="Ticket Number"
            value={ticket.ticketNumber || ticket.id}
          />
        </div>

        {/* Tear Line */}

        <div className="relative my-6 border-t border-dashed border-[#d0d5dd]">
          <div className="absolute -left-8 -top-3 h-6 w-6 rounded-full bg-[#f7f8fc]" />

          <div className="absolute -right-8 -top-3 h-6 w-6 rounded-full bg-[#f7f8fc]" />
        </div>

        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#98a2b3]">
              Booking Reference
            </p>

            <p className="mt-1 break-all text-sm font-black text-[#002451]">
              {ticket.bookingReference || ticket.bookingId || "—"}
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            {ticket.bookingId ? (
              <Link
                href={`/passenger/bookings/${encodeURIComponent(
                  ticket.bookingId,
                )}/ticket`}
                className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-[#ff7417] px-5 text-xs font-black text-white transition hover:bg-[#e96208]"
              >
                <TicketIcon />
                View Ticket
              </Link>
            ) : (
              <span className="inline-flex h-11 shrink-0 cursor-not-allowed items-center justify-center gap-2 rounded-xl bg-[#e8e9ee] px-5 text-xs font-black text-[#92959f]">
                <TicketIcon />
                Ticket Unavailable
              </span>
            )}

            {ticket.bookingId && isActiveTicket(ticket, currentTime) && (
              <Link
                href={`/passenger/tracking?bookingId=${encodeURIComponent(
                  ticket.bookingId,
                )}`}
                className="inline-flex h-11 shrink-0 items-center justify-center rounded-xl bg-[#002451] px-5 text-xs font-black text-white transition hover:bg-[#003a7a]"
              >
                Track Trip
              </Link>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

/* ========================================
   Merge Tickets + Bookings
======================================== */

function mergePassengerTickets(
  tickets: PassengerTicket[],
  bookings: PassengerBooking[],
) {
  const ticketMap = new Map<string, PassengerTicket>();

  /* ========================================
     Existing Ticket Documents
  ======================================== */

  tickets.forEach((ticket) => {
    ticketMap.set(ticket.id, ticket);
  });

  /* ========================================
     Enrich / Recover From Booking
  ======================================== */

  bookings.forEach((booking) => {
    if (!booking.ticketId && !booking.ticketNumber) {
      return;
    }

    const ticketId = booking.ticketId || booking.ticketNumber || booking.id;

    const existing = ticketMap.get(ticketId);

    const bookingTicket: PassengerTicket = {
      id: ticketId,

      userId: booking.userId,

      ticketNumber: booking.ticketNumber,

      bookingId: booking.id,

      bookingReference: booking.bookingReference,

      tripId: booking.tripId,

      companyId: booking.companyId,

      companyName: booking.companyName,

      origin: booking.origin,

      destination: booking.destination,

      busType: booking.busType,

      travelDate: booking.travelDate,

      departureAt: booking.departureAt,

      arrivalAt: booking.arrivalAt,

      boardingPointName: booking.boardingPointName,

      dropOffPointName: booking.dropOffPointName,

      passengerCount: booking.passengerCount,

      passengers: booking.passengers,

      seatNumbers: booking.seatNumbers,

      totalAmount: booking.totalAmount,

      currency: booking.currency,

      bookingStatus: booking.status,

      paymentStatus: booking.paymentStatus,

      createdAt: booking.createdAt,
    };

    if (existing) {
      ticketMap.set(ticketId, {
        ...bookingTicket,
        ...existing,

        bookingId: existing.bookingId || booking.id,

        bookingReference: existing.bookingReference || booking.bookingReference,

        ticketNumber: existing.ticketNumber || booking.ticketNumber,

        companyName: existing.companyName || booking.companyName,

        origin: existing.origin || booking.origin,

        destination: existing.destination || booking.destination,

        busType: existing.busType || booking.busType,

        travelDate: existing.travelDate || booking.travelDate,

        departureAt: existing.departureAt || booking.departureAt,

        arrivalAt: existing.arrivalAt || booking.arrivalAt,

        boardingPointName:
          existing.boardingPointName || booking.boardingPointName,

        dropOffPointName: existing.dropOffPointName || booking.dropOffPointName,

        passengers: existing.passengers?.length
          ? existing.passengers
          : booking.passengers,

        seatNumbers: existing.seatNumbers?.length
          ? existing.seatNumbers
          : booking.seatNumbers,

        totalAmount: existing.totalAmount ?? booking.totalAmount,

        currency: existing.currency || booking.currency,

        bookingStatus: existing.bookingStatus || booking.status,

        paymentStatus: existing.paymentStatus || booking.paymentStatus,
      });

      return;
    }

    ticketMap.set(ticketId, bookingTicket);
  });

  return Array.from(ticketMap.values());
}

/* ========================================
   Ticket Classification
======================================== */

function isActiveTicket(ticket: PassengerTicket, currentTime: number) {
  const status = ticket.status?.trim().toLowerCase();

  const bookingStatus = ticket.bookingStatus?.trim().toLowerCase();

  if (
    status === "cancelled" ||
    status === "used" ||
    status === "expired" ||
    bookingStatus === "cancelled"
  ) {
    return false;
  }

  const journeyTime = getTicketJourneyTime(ticket);

  if (journeyTime === null) {
    return (
      bookingStatus === "confirmed" ||
      ticket.paymentStatus?.toLowerCase() === "successful"
    );
  }

  return journeyTime >= currentTime;
}

function isPastTicket(ticket: PassengerTicket, currentTime: number) {
  return !isActiveTicket(ticket, currentTime);
}

/* ========================================
   Date Helpers
======================================== */

function getTicketSortTime(ticket: PassengerTicket) {
  return getTicketJourneyTime(ticket) ?? getTimeValue(ticket.createdAt) ?? 0;
}

function getTicketJourneyTime(ticket: PassengerTicket) {
  const departureTime = getTimeValue(ticket.departureAt);

  if (departureTime !== null) {
    return departureTime;
  }

  return getTravelDateTime(ticket.travelDate);
}

function getTravelDateTime(value?: string) {
  if (!value) {
    return null;
  }

  const date = new Date(`${value}T00:00:00`);

  const time = date.getTime();

  return Number.isNaN(time) ? null : time;
}

function getTimeValue(value: Timestamp | Date | string | null | undefined) {
  if (!value) {
    return null;
  }

  if (value instanceof Timestamp) {
    return value.toMillis();
  }

  if (value instanceof Date) {
    const time = value.getTime();

    return Number.isNaN(time) ? null : time;
  }

  if (typeof value === "string") {
    const time = new Date(value).getTime();

    return Number.isNaN(time) ? null : time;
  }

  return null;
}

function formatTravelDate(ticket: PassengerTicket) {
  const departureTime = getTimeValue(ticket.departureAt);

  if (departureTime !== null) {
    return new Intl.DateTimeFormat("en-GH", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(new Date(departureTime));
  }

  if (ticket.travelDate) {
    const time = getTravelDateTime(ticket.travelDate);

    if (time !== null) {
      return new Intl.DateTimeFormat("en-GH", {
        weekday: "short",
        day: "numeric",
        month: "short",
        year: "numeric",
      }).format(new Date(time));
    }
  }

  return "To be confirmed";
}

function formatTravelTime(value: Timestamp | Date | string | null | undefined) {
  const time = getTimeValue(value);

  if (time === null) {
    return "To be confirmed";
  }

  return new Intl.DateTimeFormat("en-GH", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(time));
}

/* ========================================
   Passenger Helpers
======================================== */

function getPassengerSeats(passengers?: TicketPassenger[]) {
  if (!passengers?.length) {
    return "";
  }

  return passengers
    .map((passenger) => passenger.seatNumber)
    .filter(Boolean)
    .join(", ");
}

function getInitial(value?: string) {
  const name = value?.trim();

  return name ? name.charAt(0).toUpperCase() : "P";
}

/* ========================================
   Summary
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

          <p className="mt-2 text-3xl font-black text-[#002451]">{value}</p>
        </div>

        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#eaf8ff] text-[#002451]">
          {icon}
        </div>
      </div>
    </div>
  );
}

/* ========================================
   Ticket Detail
======================================== */

function TicketDetail({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#98a2b3]">
        {label}
      </p>

      <p className="mt-1 break-words text-sm font-black leading-5 text-[#344054]">
        {value}
      </p>
    </div>
  );
}

/* ========================================
   Filters
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
          active ? "bg-white/15 text-white" : "bg-white text-[#667085]"
        }`}
      >
        {count}
      </span>
    </button>
  );
}

/* ========================================
   Empty State
======================================== */

function EmptyTickets({ filter }: { filter: TicketFilter }) {
  const content = {
    active: {
      title: "No active tickets",
      description:
        "Your ticket will appear here after you complete a successful booking.",
    },

    past: {
      title: "No past tickets",
      description: "Tickets from your previous journeys will appear here.",
    },

    all: {
      title: "No tickets yet",
      description:
        "Book an intercity journey to receive your first Zano digital ticket.",
    },
  }[filter];

  return (
    <div className="py-16 text-center">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[#eaf8ff] text-[#002451]">
        <TicketIcon />
      </div>

      <h3 className="mt-5 text-xl font-black text-[#002451]">
        {content.title}
      </h3>

      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#667085]">
        {content.description}
      </p>

      {(filter === "active" || filter === "all") && (
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
   Header Link
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

      <span className="truncate">{label}</span>
    </Link>
  );
}

/* ========================================
   Loading
======================================== */

function TicketsLoading() {
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
        <div className="grid gap-4 sm:grid-cols-3">
          {[1, 2, 3].map((item) => (
            <div
              key={item}
              className="h-28 animate-pulse rounded-[22px] bg-white shadow-sm"
            />
          ))}
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
      <circle cx="11" cy="11" r="7" />
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
      <rect x="5" y="3" width="14" height="16" rx="3" />
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
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c1.5-4 4.2-6 8-6s6.5 2 8 6" />
    </svg>
  );
}

function HistoryIcon() {
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
      <path d="M3 12a9 9 0 1 0 3-6.7" />
      <path d="M3 4v5h5" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

function CollectionIcon() {
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
      <rect x="4" y="5" width="16" height="14" rx="2" />
      <path d="M8 3h8M8 9h8M8 13h5" />
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
