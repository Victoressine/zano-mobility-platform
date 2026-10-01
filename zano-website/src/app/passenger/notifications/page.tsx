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
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
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
  email: string;
  role: UserRole;
  photoURL?: string;
};

type NotificationType =
  | "booking"
  | "ticket"
  | "trip"
  | "payment"
  | "general";

type PassengerNotification = {
  id: string;

  userId?: string;

  title?: string;
  message?: string;

  type?: NotificationType | string;

  read?: boolean;
  isRead?: boolean;

  bookingId?: string;
  bookingReference?: string;

  ticketId?: string;
  ticketNumber?: string;

  tripId?: string;

  link?: string;
  href?: string;

  createdAt?:
    | Timestamp
    | Date
    | string
    | null;

  readAt?:
    | Timestamp
    | Date
    | string
    | null;
};

type NotificationFilter =
  | "all"
  | "unread";

/* ========================================
   Passenger Notifications Page
======================================== */

export default function PassengerNotificationsPage() {
  const router = useRouter();

  /* ========================================
     State
  ======================================== */

  const [profile, setProfile] =
    useState<UserProfile | null>(null);

  const [notifications, setNotifications] =
    useState<PassengerNotification[]>([]);

  const [activeFilter, setActiveFilter] =
    useState<NotificationFilter>("all");

  const [isLoading, setIsLoading] =
    useState(true);

  const [isSigningOut, setIsSigningOut] =
    useState(false);

  const [isMarkingAll, setIsMarkingAll] =
    useState(false);

  const [updatingNotificationId, setUpdatingNotificationId] =
    useState<string | null>(null);

  const [errorMessage, setErrorMessage] =
    useState("");

  /* ========================================
     Authentication + Notifications
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
             Load Passenger Notifications
          ======================================== */

          const notificationsQuery = query(
            collection(db, "notifications"),
            where(
              "userId",
              "==",
              user.uid
            )
          );

          const notificationsSnapshot =
            await getDocs(
              notificationsQuery
            );

          const rows =
            notificationsSnapshot.docs.map(
              (notificationDocument) => ({
                id: notificationDocument.id,
                ...notificationDocument.data(),
              })
            ) as PassengerNotification[];

          rows.sort(
            (a, b) =>
              getNotificationTime(b) -
              getNotificationTime(a)
          );

          setNotifications(rows);
        } catch (error) {
          console.error(
            "Passenger notifications loading error:",
            error
          );

          setErrorMessage(
            "We could not load your notifications. Please refresh and try again."
          );
        } finally {
          setIsLoading(false);
        }
      }
    );

    return unsubscribe;
  }, [router]);

  /* ========================================
     Notification Counts
  ======================================== */

  const unreadNotifications =
    useMemo(() => {
      return notifications.filter(
        (notification) =>
          !notificationIsRead(
            notification
          )
      );
    }, [notifications]);

  const displayedNotifications =
    useMemo(() => {
      if (activeFilter === "unread") {
        return unreadNotifications;
      }

      return notifications;
    }, [
      activeFilter,
      notifications,
      unreadNotifications,
    ]);

  /* ========================================
     Mark One As Read
  ======================================== */

  async function handleMarkAsRead(
    notification: PassengerNotification
  ) {
    if (
      notificationIsRead(notification)
    ) {
      return;
    }

    try {
      setUpdatingNotificationId(
        notification.id
      );

      setErrorMessage("");

      await updateDoc(
        doc(
          db,
          "notifications",
          notification.id
        ),
        {
          read: true,
          isRead: true,
          readAt: serverTimestamp(),
        }
      );

      setNotifications(
        (currentNotifications) =>
          currentNotifications.map(
            (currentNotification) =>
              currentNotification.id ===
              notification.id
                ? {
                    ...currentNotification,
                    read: true,
                    isRead: true,
                    readAt: new Date(),
                  }
                : currentNotification
          )
      );
    } catch (error) {
      console.error(
        "Mark notification as read error:",
        error
      );

      setErrorMessage(
        "We could not update that notification. Please try again."
      );
    } finally {
      setUpdatingNotificationId(null);
    }
  }

  /* ========================================
     Mark All As Read
  ======================================== */

  async function handleMarkAllAsRead() {
    if (
      !auth.currentUser ||
      unreadNotifications.length === 0
    ) {
      return;
    }

    try {
      setIsMarkingAll(true);
      setErrorMessage("");

      const batch =
        writeBatch(db);

      unreadNotifications.forEach(
        (notification) => {
          const notificationReference =
            doc(
              db,
              "notifications",
              notification.id
            );

          batch.update(
            notificationReference,
            {
              read: true,
              isRead: true,
              readAt:
                serverTimestamp(),
            }
          );
        }
      );

      await batch.commit();

      setNotifications(
        (currentNotifications) =>
          currentNotifications.map(
            (notification) => ({
              ...notification,
              read: true,
              isRead: true,
              readAt:
                notification.readAt ||
                new Date(),
            })
          )
      );
    } catch (error) {
      console.error(
        "Mark all notifications as read error:",
        error
      );

      setErrorMessage(
        "We could not mark all notifications as read. Please try again."
      );
    } finally {
      setIsMarkingAll(false);
    }
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
    return <NotificationsLoading />;
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

            <HeaderLink href="/passenger/tracking">
              Track Trip
            </HeaderLink>
          </nav>

          {/* Passenger Controls */}

          <div className="flex items-center gap-3">
            <Link
              href="/passenger/notifications"
              className="relative flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white hover:text-[#002451]"
              aria-label="Notifications"
            >
              <BellIcon />

              {unreadNotifications.length >
                0 && (
                <span className="absolute -right-1 -top-1 flex min-h-5 min-w-5 items-center justify-center rounded-full bg-[#ff7417] px-1 text-[9px] font-black text-white">
                  {unreadNotifications.length >
                  99
                    ? "99+"
                    : unreadNotifications.length}
                </span>
              )}
            </Link>

            <div className="hidden text-right sm:block">
              <p className="text-sm font-black text-white">
                {profile?.firstName ||
                  "Passenger"}
              </p>

              <p className="text-xs text-white/65">
                {unreadNotifications.length}{" "}
                unread
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

          <div className="mt-7 flex flex-col justify-between gap-6 md:flex-row md:items-end">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-[#73d6ff]">
                Stay informed
              </p>

              <h1 className="mt-3 text-4xl font-black tracking-tight sm:text-5xl">
                Notifications
              </h1>

              <p className="mt-4 max-w-2xl text-sm leading-7 text-white/75 sm:text-base">
                Booking confirmations,
                ticket information and
                important trip updates from
                Zano appear here.
              </p>
            </div>

            {unreadNotifications.length >
              0 && (
              <button
                type="button"
                onClick={
                  handleMarkAllAsRead
                }
                disabled={isMarkingAll}
                className="inline-flex h-12 w-fit items-center justify-center gap-2 rounded-xl bg-white px-5 text-sm font-black text-[#002451] transition hover:bg-[#edf8ff] disabled:cursor-not-allowed disabled:opacity-60"
              >
                <CheckIcon />

                {isMarkingAll
                  ? "Updating..."
                  : "Mark all as read"}
              </button>
            )}
          </div>
        </div>
      </section>

      {/* ========================================
          Main Content
      ======================================== */}

      <section className="relative -mt-12 px-5 sm:px-7 lg:px-10">
        <div className="mx-auto max-w-[1000px]">
          {/* Summary */}

          <div className="grid gap-4 sm:grid-cols-3">
            <SummaryCard
              label="All"
              value={notifications.length}
              icon={<BellIcon />}
            />

            <SummaryCard
              label="Unread"
              value={
                unreadNotifications.length
              }
              icon={<UnreadIcon />}
            />

            <SummaryCard
              label="Read"
              value={
                notifications.length -
                unreadNotifications.length
              }
              icon={<CheckIcon />}
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

          {/* Notifications */}

          <section className="mt-7 overflow-hidden rounded-[26px] border border-[#e6eaf0] bg-white shadow-[0_14px_45px_rgba(0,36,81,0.07)]">
            <div className="flex flex-col justify-between gap-5 border-b border-[#edf0f4] p-5 sm:flex-row sm:items-center sm:p-7">
              <div>
                <h2 className="text-2xl font-black text-[#002451]">
                  Your Notifications
                </h2>

                <p className="mt-2 text-sm text-[#667085]">
                  Important updates about
                  your Zano journeys.
                </p>
              </div>

              <div className="flex gap-2">
                <FilterButton
                  label="All"
                  count={
                    notifications.length
                  }
                  active={
                    activeFilter === "all"
                  }
                  onClick={() =>
                    setActiveFilter("all")
                  }
                />

                <FilterButton
                  label="Unread"
                  count={
                    unreadNotifications.length
                  }
                  active={
                    activeFilter ===
                    "unread"
                  }
                  onClick={() =>
                    setActiveFilter(
                      "unread"
                    )
                  }
                />
              </div>
            </div>

            {displayedNotifications.length >
            0 ? (
              <div className="divide-y divide-[#edf0f4]">
                {displayedNotifications.map(
                  (notification) => (
                    <NotificationRow
                      key={
                        notification.id
                      }
                      notification={
                        notification
                      }
                      isUpdating={
                        updatingNotificationId ===
                        notification.id
                      }
                      onMarkAsRead={
                        handleMarkAsRead
                      }
                    />
                  )
                )}
              </div>
            ) : (
              <EmptyNotifications
                filter={activeFilter}
              />
            )}
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
   Notification Row
======================================== */

function NotificationRow({
  notification,
  isUpdating,
  onMarkAsRead,
}: {
  notification: PassengerNotification;
  isUpdating: boolean;
  onMarkAsRead: (
    notification: PassengerNotification
  ) => Promise<void>;
}) {
  const isRead =
    notificationIsRead(notification);

  const destination =
    getNotificationDestination(
      notification
    );

  const type =
    normalizeNotificationType(
      notification.type
    );

  return (
    <article
      className={`relative p-5 transition sm:p-6 ${
        isRead
          ? "bg-white"
          : "bg-[#f4fbff]"
      }`}
    >
      {!isRead && (
        <span className="absolute left-0 top-0 h-full w-1 bg-[#39b5f4]" />
      )}

      <div className="flex items-start gap-4">
        <div
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${getNotificationIconStyle(
            type
          )}`}
        >
          {getNotificationIcon(type)}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-start">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-black text-[#002451]">
                  {notification.title ||
                    getDefaultTitle(type)}
                </h3>

                {!isRead && (
                  <span className="rounded-full bg-[#ff7417] px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-white">
                    New
                  </span>
                )}
              </div>

              <p className="mt-2 max-w-2xl text-sm leading-6 text-[#667085]">
                {notification.message ||
                  "You have a new Zano notification."}
              </p>
            </div>

            <time className="shrink-0 text-xs font-semibold text-[#98a2b3]">
              {formatNotificationTime(
                notification.createdAt
              )}
            </time>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            {destination && (
              <Link
                href={destination.href}
                onClick={() => {
                  if (!isRead) {
                    void onMarkAsRead(
                      notification
                    );
                  }
                }}
                className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-[#002451] px-4 text-xs font-black text-white transition hover:bg-[#003a7a]"
              >
                {destination.label}

                <ArrowRightIcon />
              </Link>
            )}

            {!isRead && (
              <button
                type="button"
                disabled={isUpdating}
                onClick={() =>
                  void onMarkAsRead(
                    notification
                  )
                }
                className="inline-flex h-9 items-center justify-center rounded-lg border border-[#d0d5dd] px-4 text-xs font-black text-[#475467] transition hover:border-[#002451] hover:text-[#002451] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isUpdating
                  ? "Updating..."
                  : "Mark as read"}
              </button>
            )}

            {isRead && (
              <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[#98a2b3]">
                <CheckIcon />

                Read
              </span>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

/* ========================================
   Notification Destination
======================================== */

function getNotificationDestination(
  notification: PassengerNotification
): {
  href: string;
  label: string;
} | null {
  const explicitLink =
    notification.href?.trim() ||
    notification.link?.trim();

  if (
    explicitLink &&
    explicitLink.startsWith("/")
  ) {
    return {
      href: explicitLink,
      label: "View details",
    };
  }

  const type =
    normalizeNotificationType(
      notification.type
    );

  /* ========================================
     Trip Tracking Notifications

     A bookingId is required because the
     passenger tracking page is booking-based.
  ======================================== */

  if (
    type === "trip" &&
    notification.bookingId
  ) {
    return {
      href: `/passenger/tracking?bookingId=${encodeURIComponent(
        notification.bookingId
      )}`,
      label: "Track trip",
    };
  }

  /* ========================================
     Ticket Notifications

     Digital tickets use the existing
     booking-based ticket route.
  ======================================== */

  if (
    type === "ticket" &&
    notification.bookingId
  ) {
    return {
      href: `/passenger/bookings/${encodeURIComponent(
        notification.bookingId
      )}/ticket`,
      label: "View ticket",
    };
  }

  if (
    type === "ticket" &&
    (
      notification.ticketId ||
      notification.ticketNumber
    )
  ) {
    return {
      href: "/passenger/tickets",
      label: "View tickets",
    };
  }

  /* ========================================
     Booking / Payment Notifications
  ======================================== */

  if (notification.bookingId) {
    return {
      href: `/passenger/bookings/${encodeURIComponent(
        notification.bookingId
      )}`,
      label:
        type === "payment"
          ? "View booking"
          : "View booking",
    };
  }

  if (
    notification.bookingReference ||
    type === "booking" ||
    type === "payment"
  ) {
    return {
      href: "/passenger/trips",
      label: "View trips",
    };
  }

  /* ========================================
     Trip Without Booking ID

     Do not pass tripId as bookingId.
  ======================================== */

  if (
    notification.tripId ||
    type === "trip"
  ) {
    return {
      href: "/passenger/tracking",
      label: "Track trip",
    };
  }

  return null;
}

/* ========================================
   Read Status
======================================== */

function notificationIsRead(
  notification: PassengerNotification
) {
  return (
    notification.read === true ||
    notification.isRead === true
  );
}

/* ========================================
   Notification Type
======================================== */

function normalizeNotificationType(
  value?: string
): NotificationType {
  const type =
    value
      ?.trim()
      .toLowerCase();

  if (type === "booking") {
    return "booking";
  }

  if (type === "ticket") {
    return "ticket";
  }

  if (type === "trip") {
    return "trip";
  }

  if (type === "payment") {
    return "payment";
  }

  return "general";
}

function getDefaultTitle(
  type: NotificationType
) {
  switch (type) {
    case "booking":
      return "Booking Update";

    case "ticket":
      return "Ticket Update";

    case "trip":
      return "Trip Update";

    case "payment":
      return "Payment Update";

    default:
      return "Zano Update";
  }
}

function getNotificationIconStyle(
  type: NotificationType
) {
  switch (type) {
    case "booking":
      return "bg-[#ecfdf3] text-[#027a48]";

    case "ticket":
      return "bg-[#fff3e8] text-[#ff7417]";

    case "trip":
      return "bg-[#eaf8ff] text-[#0078b8]";

    case "payment":
      return "bg-[#f4f3ff] text-[#6938ef]";

    default:
      return "bg-[#f2f4f7] text-[#475467]";
  }
}

function getNotificationIcon(
  type: NotificationType
) {
  switch (type) {
    case "booking":
      return <CheckCircleIcon />;

    case "ticket":
      return <TicketIcon />;

    case "trip":
      return <BusIcon />;

    case "payment":
      return <PaymentIcon />;

    default:
      return <BellIcon />;
  }
}

/* ========================================
   Date Helpers
======================================== */

function getNotificationTime(
  notification: PassengerNotification
) {
  return (
    getTimeValue(
      notification.createdAt
    ) ?? 0
  );
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
    const time =
      value.getTime();

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

function formatNotificationTime(
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
    return "Recently";
  }

  const difference =
    Date.now() - time;

  const minute =
    60 * 1000;

  const hour =
    60 * minute;

  const day =
    24 * hour;

  if (
    difference >= 0 &&
    difference < minute
  ) {
    return "Just now";
  }

  if (
    difference >= minute &&
    difference < hour
  ) {
    const minutes =
      Math.floor(
        difference / minute
      );

    return `${minutes} ${
      minutes === 1
        ? "minute"
        : "minutes"
    } ago`;
  }

  if (
    difference >= hour &&
    difference < day
  ) {
    const hours =
      Math.floor(
        difference / hour
      );

    return `${hours} ${
      hours === 1
        ? "hour"
        : "hours"
    } ago`;
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
   General Helpers
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
      className={`inline-flex h-10 items-center gap-2 rounded-xl px-4 text-xs font-black transition ${
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
   Empty State
======================================== */

function EmptyNotifications({
  filter,
}: {
  filter: NotificationFilter;
}) {
  return (
    <div className="px-5 py-16 text-center">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[#eaf8ff] text-[#002451]">
        {filter === "unread" ? (
          <CheckCircleIcon />
        ) : (
          <BellIcon />
        )}
      </div>

      <h3 className="mt-5 text-xl font-black text-[#002451]">
        {filter === "unread"
          ? "You're all caught up"
          : "No notifications yet"}
      </h3>

      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#667085]">
        {filter === "unread"
          ? "You have no unread notifications."
          : "Booking confirmations and important trip updates will appear here."}
      </p>

      {filter === "all" && (
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
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className="rounded-xl px-4 py-2.5 text-sm font-bold text-white/85 transition hover:bg-white/10 hover:text-[#ff9a35]"
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
}: {
  href: string;
  icon: ReactNode;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="flex min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 py-2 text-[10px] font-black text-[#667085] transition hover:bg-[#f8fafc] hover:text-[#002451]"
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

function NotificationsLoading() {
  return (
    <main className="min-h-screen bg-[#f7f8fc]">
      <div className="h-[82px] animate-pulse bg-[#002451]" />

      <div className="bg-[#002451] px-5 pb-24 pt-10">
        <div className="mx-auto max-w-[1000px]">
          <div className="h-4 w-32 animate-pulse rounded bg-white/20" />

          <div className="mt-6 h-12 w-72 animate-pulse rounded-xl bg-white/15" />

          <div className="mt-4 h-5 w-96 max-w-full animate-pulse rounded bg-white/10" />
        </div>
      </div>

      <div className="relative -mt-12 mx-auto max-w-[1000px] px-5">
        <div className="grid gap-4 sm:grid-cols-3">
          {[1, 2, 3].map(
            (item) => (
              <div
                key={item}
                className="h-28 animate-pulse rounded-[22px] bg-white shadow-sm"
              />
            )
          )}
        </div>

        <div className="mt-7 h-[450px] animate-pulse rounded-[26px] bg-white shadow-sm" />
      </div>
    </main>
  );
}

/* ========================================
   Icons
======================================== */

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

function CheckIcon() {
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
      <path d="m5 12 4 4L19 6" />
    </svg>
  );
}

function CheckCircleIcon() {
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

function UnreadIcon() {
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
        height="14"
        rx="2"
      />
      <path d="m3 7 9 6 9-6" />
    </svg>
  );
}

function PaymentIcon() {
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
        height="14"
        rx="2"
      />
      <path d="M3 10h18" />
      <path d="M7 15h3" />
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

function ArrowRightIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}