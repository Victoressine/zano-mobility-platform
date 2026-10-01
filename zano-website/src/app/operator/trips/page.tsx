"use client";

// ========================================
// Imports
// ========================================

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  onAuthStateChanged,
  signOut,
  User,
} from "firebase/auth";
import {
  FormEvent,
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import { auth } from "@/lib/firebase/client";

// ========================================
// Constants
// ========================================

const DAYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;

const AMENITIES = [
  "Air Conditioning",
  "Wi-Fi",
  "USB Charging",
  "Power Outlets",
  "Reclining Seats",
  "Entertainment",
  "Luggage Storage",
  "Restroom",
] as const;

// ========================================
// Types
// ========================================

type Company = {
  id: string;
  name: string;
};

type Trip = {
  id: string;

  companyId: string;
  companyName?: string;

  vehicleId?: string;
  routeId?: string;

  vehicleName?: string;
  registrationNumber?: string;

  busType?: string;

  seatCapacity?: number;
  seatLayout?: string;

  amenities?: string[];

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

  totalSeats?: number;
  availableSeats?: number;

  bookingEnabled?: boolean;

  status?: string;
};

type TripsApiResponse = {
  success: boolean;

  company?: Company;

  trips?: Trip[];

  trip?: Trip;

  message?: string;
  error?: string;
};

type TripForm = {
  vehicleName: string;
  registrationNumber: string;

  busType: string;

  seatCapacity: string;
  seatLayout: string;

  vehicleStatus: string;

  amenities: string[];

  origin: string;
  destination: string;

  boardingPoints: string[];
  boardingPointInput: string;

  dropOffPoint: string;

  scheduleType: string;
  operatingDays: string[];

  departureTime: string;
  arrivalTime: string;

  bookingWindowDays: string;

  fare: string;

  bookingEnabled: boolean;

  status: string;
};

// ========================================
// Default Form
// ========================================

function createDefaultForm(): TripForm {
  return {
    vehicleName: "",
    registrationNumber: "",

    busType:
      "Executive Coach",

    seatCapacity: "30",
    seatLayout: "2+1",

    vehicleStatus: "active",

    amenities: [],

    origin: "",
    destination: "",

    boardingPoints: [],
    boardingPointInput: "",

    dropOffPoint: "",

    scheduleType: "daily",

    operatingDays: [
      ...DAYS,
    ],

    departureTime: "",
    arrivalTime: "",

    bookingWindowDays: "90",

    fare: "",

    bookingEnabled: true,

    status: "scheduled",
  };
}

// ========================================
// Helpers
// ========================================

function money(
  value?: number,
) {
  const amount =
    Number(value ?? 0);

  return `GH₵${Number.isFinite(amount)
    ? amount.toFixed(2)
    : "0.00"}`;
}

function displayStatus(
  value?: string,
) {
  if (!value) {
    return "Unknown";
  }

  return value
    .replace(/-/g, " ")
    .replace(/\b\w/g, (letter) =>
      letter.toUpperCase(),
    );
}

function getStatusClasses(
  status?: string,
) {
  switch (
    status?.toLowerCase()
  ) {
    case "scheduled":
      return "bg-green-50 text-green-700";

    case "draft":
      return "bg-amber-50 text-amber-700";

    case "cancelled":
      return "bg-red-50 text-red-700";

    case "completed":
      return "bg-blue-50 text-blue-700";

    default:
      return "bg-[#f8f7ff] text-[#002451]";
  }
}

// ========================================
// Page
// ========================================

export default function OperatorTripsPage() {
  const router =
    useRouter();

  const [
    currentUser,
    setCurrentUser,
  ] =
    useState<User | null>(
      null,
    );

  const [
    company,
    setCompany,
  ] =
    useState<Company | null>(
      null,
    );

  const [
    trips,
    setTrips,
  ] =
    useState<Trip[]>([]);

  const [
    form,
    setForm,
  ] =
    useState<TripForm>(
      createDefaultForm,
    );

  const [
    loading,
    setLoading,
  ] =
    useState(true);

  const [
    saving,
    setSaving,
  ] =
    useState(false);

  const [
    error,
    setError,
  ] =
    useState("");

  const [
    success,
    setSuccess,
  ] =
    useState("");

  // ========================================
  // Secure API Request
  // ========================================

  const requestTripsApi =
    useCallback(
      async (
        user: User,
        options?: {
          method?: "GET" | "POST";
          body?: unknown;
        },
      ) => {
        const token =
          await user.getIdToken();

        const response =
          await fetch(
            "/api/operator/trips",
            {
              method:
                options?.method ??
                "GET",

              headers: {
                Authorization:
                  `Bearer ${token}`,

                ...(options?.body
                  ? {
                      "Content-Type":
                        "application/json",
                    }
                  : {}),
              },

              body:
                options?.body
                  ? JSON.stringify(
                      options.body,
                    )
                  : undefined,

              cache: "no-store",
            },
          );

        let data:
          TripsApiResponse;

        try {
          data =
            (await response.json()) as
              TripsApiResponse;
        } catch {
          throw new Error(
            "The trip service returned an invalid response.",
          );
        }

        if (
          !response.ok ||
          !data.success
        ) {
          throw new Error(
            data.error ||
              "Unable to process the trip request.",
          );
        }

        return data;
      },
      [],
    );

  // ========================================
  // Authentication + Load Trips
  // ========================================

  useEffect(() => {
    let cancelled = false;

    const unsubscribe =
      onAuthStateChanged(
        auth,
        async (user) => {
          if (!user) {
            if (!cancelled) {
              setLoading(false);
            }

            router.replace(
              "/operator/login",
            );

            return;
          }

          try {
            if (!cancelled) {
              setLoading(true);
              setError("");
            }

            const data =
              await requestTripsApi(
                user,
              );

            if (
              cancelled
            ) {
              return;
            }

            if (
              !data.company
            ) {
              throw new Error(
                "Your transport company could not be loaded.",
              );
            }

            setCurrentUser(user);

            setCompany(
              data.company,
            );

            setTrips(
              Array.isArray(
                data.trips,
              )
                ? data.trips
                : [],
            );
          } catch (
            loadError
          ) {
            console.error(
              "Manage Trips load error:",
              loadError,
            );

            if (!cancelled) {
              setError(
                loadError instanceof
                  Error
                  ? loadError.message
                  : "Unable to load Manage Trips.",
              );
            }
          } finally {
            if (!cancelled) {
              setLoading(false);
            }
          }
        },
      );

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [
    router,
    requestTripsApi,
  ]);

  // ========================================
  // Derived Statistics
  // ========================================

  const fleetSummary =
    useMemo(() => {
      const scheduled =
        trips.filter(
          (trip) =>
            trip.status ===
            "scheduled",
        ).length;

      const drafts =
        trips.filter(
          (trip) =>
            trip.status ===
            "draft",
        ).length;

      const bookingEnabled =
        trips.filter(
          (trip) =>
            trip.bookingEnabled !==
            false,
        ).length;

      const seats =
        trips.reduce(
          (
            total,
            trip,
          ) =>
            total +
            Number(
              trip.totalSeats ??
                trip.seatCapacity ??
                0,
            ),
          0,
        );

      return {
        total:
          trips.length,

        scheduled,

        drafts,

        bookingEnabled,

        seats,
      };
    }, [trips]);

  // ========================================
  // Generic Form Update
  // ========================================

  function updateForm<
    K extends keyof TripForm,
  >(
    field: K,
    value: TripForm[K],
  ) {
    setForm(
      (current) => ({
        ...current,
        [field]: value,
      }),
    );
  }

  // ========================================
  // Operating Day Toggle
  // ========================================

  function toggleDay(
    day: string,
  ) {
    if (
      form.scheduleType ===
      "daily"
    ) {
      return;
    }

    setForm(
      (current) => {
        const exists =
          current.operatingDays.includes(
            day,
          );

        return {
          ...current,

          operatingDays:
            exists
              ? current.operatingDays.filter(
                  (item) =>
                    item !== day,
                )
              : [
                  ...current.operatingDays,
                  day,
                ],
        };
      },
    );
  }

  // ========================================
  // Amenity Toggle
  // ========================================

  function toggleAmenity(
    amenity: string,
  ) {
    setForm(
      (current) => {
        const exists =
          current.amenities.includes(
            amenity,
          );

        return {
          ...current,

          amenities:
            exists
              ? current.amenities.filter(
                  (item) =>
                    item !==
                    amenity,
                )
              : [
                  ...current.amenities,
                  amenity,
                ],
        };
      },
    );
  }

  // ========================================
  // Boarding Points
  // ========================================

  function addBoardingPoint() {
    const point =
      form.boardingPointInput
        .trim()
        .replace(
          /\s+/g,
          " ",
        );

    if (!point) {
      return;
    }

    if (
      form.boardingPoints.some(
        (existingPoint) =>
          existingPoint.toLowerCase() ===
          point.toLowerCase(),
      )
    ) {
      setError(
        "This boarding point has already been added.",
      );

      return;
    }

    setError("");

    setForm(
      (current) => ({
        ...current,

        boardingPoints: [
          ...current.boardingPoints,
          point,
        ],

        boardingPointInput:
          "",
      }),
    );
  }

  function removeBoardingPoint(
    point: string,
  ) {
    setForm(
      (current) => ({
        ...current,

        boardingPoints:
          current.boardingPoints.filter(
            (item) =>
              item !== point,
          ),
      }),
    );
  }

  // ========================================
  // Schedule Type
  // ========================================

  function handleScheduleType(
    value: string,
  ) {
    setForm(
      (current) => ({
        ...current,

        scheduleType:
          value,

        operatingDays:
          value === "daily"
            ? [...DAYS]
            : [],
      }),
    );
  }

  // ========================================
  // Validate Frontend
  // ========================================

  function validateForm() {
    if (
      !form.vehicleName.trim()
    ) {
      return "Enter the bus name or fleet number.";
    }

    if (
      !form.registrationNumber.trim()
    ) {
      return "Enter the bus registration number.";
    }

    const seatCapacity =
      Number(
        form.seatCapacity,
      );

    if (
      !Number.isInteger(
        seatCapacity,
      ) ||
      seatCapacity < 1 ||
      seatCapacity > 80
    ) {
      return "Seat capacity must be between 1 and 80.";
    }

    if (
      !form.origin.trim() ||
      !form.destination.trim()
    ) {
      return "Enter the trip origin and destination.";
    }

    if (
      form.origin
        .trim()
        .toLowerCase() ===
      form.destination
        .trim()
        .toLowerCase()
    ) {
      return "Origin and destination must be different.";
    }

    if (
      form.boardingPoints.length ===
      0
    ) {
      return "Add at least one passenger boarding point.";
    }

    if (
      form.scheduleType !==
        "daily" &&
      form.operatingDays.length ===
        0
    ) {
      return "Select at least one operating day.";
    }

    if (
      !form.departureTime ||
      !form.arrivalTime
    ) {
      return "Enter the departure and arrival times.";
    }

    const fare =
      Number(form.fare);

    if (
      !Number.isFinite(fare) ||
      fare < 0
    ) {
      return "Enter a valid ticket price.";
    }

    const bookingWindow =
      Number(
        form.bookingWindowDays,
      );

    if (
      !Number.isInteger(
        bookingWindow,
      ) ||
      bookingWindow < 1 ||
      bookingWindow > 365
    ) {
      return "Booking window must be between 1 and 365 days.";
    }

    return "";
  }

  // ========================================
  // Publish / Save Draft
  // ========================================

  async function submitTrip(
    event:
      FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (
      saving ||
      !currentUser
    ) {
      return;
    }

    setError("");
    setSuccess("");

    const validationError =
      validateForm();

    if (validationError) {
      setError(
        validationError,
      );

      window.scrollTo({
        top: 0,
        behavior: "smooth",
      });

      return;
    }

    try {
      setSaving(true);

      const payload = {
        vehicleName:
          form.vehicleName.trim(),

        registrationNumber:
          form.registrationNumber
            .trim()
            .toUpperCase(),

        busType:
          form.busType,

        seatCapacity:
          Number(
            form.seatCapacity,
          ),

        seatLayout:
          form.seatLayout,

        vehicleStatus:
          form.vehicleStatus,

        amenities:
          form.amenities,

        origin:
          form.origin.trim(),

        destination:
          form.destination.trim(),

        boardingPoints:
          form.boardingPoints,

        dropOffPoint:
          form.dropOffPoint.trim(),

        scheduleType:
          form.scheduleType,

        operatingDays:
          form.operatingDays,

        departureTime:
          form.departureTime,

        arrivalTime:
          form.arrivalTime,

        bookingWindowDays:
          Number(
            form.bookingWindowDays,
          ),

        fare:
          Number(
            form.fare,
          ),

        bookingEnabled:
          form.bookingEnabled,

        status:
          form.status,
      };

      const data =
        await requestTripsApi(
          currentUser,
          {
            method: "POST",
            body: payload,
          },
        );

      if (!data.trip) {
        throw new Error(
          "The trip was created but could not be returned by the server.",
        );
      }

      setTrips(
        (current) => [
          data.trip!,
          ...current,
        ],
      );

      setForm(
        createDefaultForm(),
      );

      setSuccess(
        data.message ||
          "Bus onboarded and trip published successfully.",
      );

      window.scrollTo({
        top: 0,
        behavior: "smooth",
      });
    } catch (
      submitError
    ) {
      console.error(
        "Trip onboarding error:",
        submitError,
      );

      setError(
        submitError instanceof
          Error
          ? submitError.message
          : "Unable to onboard this bus.",
      );

      window.scrollTo({
        top: 0,
        behavior: "smooth",
      });
    } finally {
      setSaving(false);
    }
  }

  // ========================================
  // Sign Out
  // ========================================

  async function handleSignOut() {
    try {
      await signOut(auth);
    } finally {
      router.replace(
        "/operator/login",
      );
    }
  }

  // ========================================
  // Loading
  // ========================================

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f8f7ff]">
        <div className="text-center">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-[#002451]/15 border-t-[#ff7417]" />

          <p className="mt-4 font-bold text-[#002451]">
            Loading bus and trip
            management...
          </p>
        </div>
      </main>
    );
  }

  // ========================================
  // Page
  // ========================================

  return (
    <main className="min-h-screen bg-[#f8f7ff]">
      <div className="flex min-h-screen">
        {/* ========================================
            Desktop Sidebar
        ======================================== */}

        <aside className="hidden w-72 shrink-0 bg-[#002451] px-6 py-8 text-white lg:block">
          <Link
            href="/"
            className="text-3xl font-black"
          >
            Zano
          </Link>

          <div className="mt-8 rounded-2xl bg-white/10 p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-[#39b5f4]">
              Transport Company
            </p>

            <h2 className="mt-2 text-lg font-black">
              {company?.name ??
                "Operator"}
            </h2>
          </div>

          <nav className="mt-8 space-y-2">
            <Link
              href="/operator/dashboard"
              className="block rounded-xl px-4 py-3 text-sm font-bold text-white/70 transition hover:bg-white/10 hover:text-white"
            >
              Overview
            </Link>

            <Link
              href="/operator/trips"
              className="block rounded-xl bg-[#ff7417] px-4 py-3 text-sm font-bold text-white"
            >
              Manage Trips
            </Link>
          </nav>
        </aside>

        {/* ========================================
            Main Content
        ======================================== */}

        <section className="min-w-0 flex-1">
          {/* ========================================
              Header
          ======================================== */}

          <header className="border-b border-[#c8cad4]/60 bg-white px-5 py-5 sm:px-8">
            <div className="mx-auto flex max-w-7xl items-center justify-between gap-5">
              <div>
                <p className="text-sm font-bold text-[#747680]">
                  Bus & Trip
                  Management
                </p>

                <h1 className="text-2xl font-black text-[#002451]">
                  {company?.name ??
                    "Transport Company"}
                </h1>
              </div>

              <div className="flex items-center gap-4">
                <div className="hidden text-right sm:block">
                  <p className="text-sm font-bold text-[#002451]">
                    {
                      currentUser?.email
                    }
                  </p>

                  <p className="text-xs text-[#747680]">
                    Operator
                  </p>
                </div>

                <button
                  type="button"
                  onClick={
                    handleSignOut
                  }
                  className="rounded-xl border border-[#c8cad4] px-4 py-2.5 text-sm font-bold text-[#002451]"
                >
                  Sign out
                </button>
              </div>
            </div>
          </header>

          {/* ========================================
              Mobile Navigation
          ======================================== */}

          <div className="border-b border-[#c8cad4]/60 bg-white px-5 py-3 lg:hidden">
            <div className="mx-auto flex max-w-7xl gap-2">
              <Link
                href="/operator/dashboard"
                className="rounded-xl bg-[#f8f7ff] px-4 py-2.5 text-sm font-black text-[#002451]"
              >
                Overview
              </Link>

              <Link
                href="/operator/trips"
                className="rounded-xl bg-[#ff7417] px-4 py-2.5 text-sm font-black text-white"
              >
                Manage Trips
              </Link>
            </div>
          </div>

          <div className="mx-auto max-w-7xl px-5 py-8 sm:px-8">
            {/* ========================================
                Hero
            ======================================== */}

            <section className="rounded-3xl bg-[#002451] p-7 text-white sm:p-9">
              <p className="text-sm font-black uppercase tracking-[0.18em] text-[#39b5f4]">
                Bus Onboarding
              </p>

              <h2 className="mt-3 text-3xl font-black">
                Onboard a Bus &
                Publish a Trip
              </h2>

              <p className="mt-3 max-w-3xl text-sm leading-6 text-white/70">
                Add the bus, route,
                passenger boarding
                points, schedule, seats
                and ticket price in one
                place. Zano will create
                the required trip
                configuration for
                passengers.
              </p>
            </section>

            {/* ========================================
                Messages
            ======================================== */}

            {error ? (
              <div
                role="alert"
                className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-bold text-red-700"
              >
                {error}
              </div>
            ) : null}

            {success ? (
              <div
                role="status"
                className="mt-6 rounded-2xl border border-green-200 bg-green-50 px-5 py-4 text-sm font-bold text-green-700"
              >
                {success}
              </div>
            ) : null}

            {/* ========================================
                Fleet Summary
            ======================================== */}

            <section className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
              <SummaryCard
                label="Configured Trips"
                value={String(
                  fleetSummary.total,
                )}
              />

              <SummaryCard
                label="Scheduled"
                value={String(
                  fleetSummary.scheduled,
                )}
              />

              <SummaryCard
                label="Drafts"
                value={String(
                  fleetSummary.drafts,
                )}
              />

              <SummaryCard
                label="Booking Enabled"
                value={String(
                  fleetSummary.bookingEnabled,
                )}
              />

              <SummaryCard
                label="Configured Seats"
                value={String(
                  fleetSummary.seats,
                )}
              />
            </section>

            {/* ========================================
                Onboarding Form
            ======================================== */}

            <form
              onSubmit={
                submitTrip
              }
              className="mt-8 space-y-7"
            >
              {/* ========================================
                  Bus Details
              ======================================== */}

              <FormSection
                number="01"
                title="Bus Details"
                description="Identify the physical vehicle and configure its passenger seating."
              >
                <div className="grid gap-5 md:grid-cols-2">
                  <FormField
                    label="Bus Name / Fleet Number"
                    required
                  >
                    <input
                      type="text"
                      maxLength={80}
                      required
                      placeholder="e.g. VIP 001"
                      value={
                        form.vehicleName
                      }
                      onChange={(
                        event,
                      ) =>
                        updateForm(
                          "vehicleName",
                          event.target
                            .value,
                        )
                      }
                      className={inputClass}
                    />
                  </FormField>

                  <FormField
                    label="Registration Number"
                    required
                  >
                    <input
                      type="text"
                      maxLength={30}
                      required
                      placeholder="e.g. GT 1234-26"
                      value={
                        form.registrationNumber
                      }
                      onChange={(
                        event,
                      ) =>
                        updateForm(
                          "registrationNumber",
                          event.target
                            .value.toUpperCase(),
                        )
                      }
                      className={inputClass}
                    />
                  </FormField>

                  <FormField
                    label="Bus Type"
                    required
                  >
                    <select
                      value={
                        form.busType
                      }
                      onChange={(
                        event,
                      ) =>
                        updateForm(
                          "busType",
                          event.target
                            .value,
                        )
                      }
                      className={inputClass}
                    >
                      <option value="Standard Coach">
                        Standard Coach
                      </option>

                      <option value="Executive Coach">
                        Executive Coach
                      </option>

                      <option value="Luxury Coach">
                        Luxury Coach
                      </option>

                      <option value="Mini Bus">
                        Mini Bus
                      </option>
                    </select>
                  </FormField>

                  <FormField
                    label="Operational Status"
                    required
                  >
                    <select
                      value={
                        form.vehicleStatus
                      }
                      onChange={(
                        event,
                      ) =>
                        updateForm(
                          "vehicleStatus",
                          event.target
                            .value,
                        )
                      }
                      className={inputClass}
                    >
                      <option value="active">
                        Active
                      </option>

                      <option value="maintenance">
                        Maintenance
                      </option>

                      <option value="inactive">
                        Inactive
                      </option>
                    </select>
                  </FormField>

                  <FormField
                    label="Seat Capacity"
                    required
                  >
                    <input
                      type="number"
                      min={1}
                      max={80}
                      required
                      value={
                        form.seatCapacity
                      }
                      onChange={(
                        event,
                      ) =>
                        updateForm(
                          "seatCapacity",
                          event.target
                            .value,
                        )
                      }
                      className={inputClass}
                    />
                  </FormField>

                  <FormField
                    label="Seat Layout"
                    required
                  >
                    <select
                      value={
                        form.seatLayout
                      }
                      onChange={(
                        event,
                      ) =>
                        updateForm(
                          "seatLayout",
                          event.target
                            .value,
                        )
                      }
                      className={inputClass}
                    >
                      <option value="2+1">
                        2 + 1
                      </option>

                      <option value="2+2">
                        2 + 2
                      </option>
                    </select>
                  </FormField>
                </div>

                <div className="mt-6">
                  <p className="text-sm font-black text-[#002451]">
                    Amenities
                  </p>

                  <p className="mt-1 text-xs text-[#747680]">
                    Select the facilities
                    available to
                    passengers on this
                    bus.
                  </p>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    {AMENITIES.map(
                      (amenity) => (
                        <label
                          key={
                            amenity
                          }
                          className="flex cursor-pointer items-center gap-3 rounded-xl border border-[#c8cad4]/70 bg-white px-4 py-3"
                        >
                          <input
                            type="checkbox"
                            checked={form.amenities.includes(
                              amenity,
                            )}
                            onChange={() =>
                              toggleAmenity(
                                amenity,
                              )
                            }
                            className="h-4 w-4"
                          />

                          <span className="text-sm font-bold text-[#002451]">
                            {amenity}
                          </span>
                        </label>
                      ),
                    )}
                  </div>
                </div>
              </FormSection>

              {/* ========================================
                  Route
              ======================================== */}

              <FormSection
                number="02"
                title="Route & Boarding"
                description="Define where the trip starts, ends and where passengers can join the bus."
              >
                <div className="grid gap-5 md:grid-cols-2">
                  <FormField
                    label="Origin"
                    required
                  >
                    <input
                      type="text"
                      maxLength={80}
                      required
                      placeholder="e.g. Accra"
                      value={
                        form.origin
                      }
                      onChange={(
                        event,
                      ) =>
                        updateForm(
                          "origin",
                          event.target
                            .value,
                        )
                      }
                      className={inputClass}
                    />
                  </FormField>

                  <FormField
                    label="Destination"
                    required
                  >
                    <input
                      type="text"
                      maxLength={80}
                      required
                      placeholder="e.g. Kumasi"
                      value={
                        form.destination
                      }
                      onChange={(
                        event,
                      ) =>
                        updateForm(
                          "destination",
                          event.target
                            .value,
                        )
                      }
                      className={inputClass}
                    />
                  </FormField>
                </div>

                <div className="mt-5">
                  <FormField
                    label="Passenger Boarding Points"
                    required
                    help="Add the terminal and any approved pickup points where passengers can join this trip."
                  >
                    <div className="flex flex-col gap-3 sm:flex-row">
                      <input
                        type="text"
                        maxLength={120}
                        placeholder="e.g. Circle VIP Terminal"
                        value={
                          form.boardingPointInput
                        }
                        onChange={(
                          event,
                        ) =>
                          updateForm(
                            "boardingPointInput",
                            event.target
                              .value,
                          )
                        }
                        onKeyDown={(
                          event,
                        ) => {
                          if (
                            event.key ===
                            "Enter"
                          ) {
                            event.preventDefault();
                            addBoardingPoint();
                          }
                        }}
                        className={`${inputClass} flex-1`}
                      />

                      <button
                        type="button"
                        onClick={
                          addBoardingPoint
                        }
                        className="rounded-xl bg-[#002451] px-5 py-3 text-sm font-black text-white"
                      >
                        Add Point
                      </button>
                    </div>
                  </FormField>

                  {form.boardingPoints
                    .length > 0 ? (
                    <div className="mt-4 flex flex-wrap gap-2">
                      {form.boardingPoints.map(
                        (
                          point,
                          index,
                        ) => (
                          <div
                            key={`${point}-${index}`}
                            className="flex items-center gap-2 rounded-full bg-[#39b5f4]/10 px-4 py-2 text-sm font-bold text-[#002451]"
                          >
                            <span>
                              {index + 1}.{" "}
                              {point}
                            </span>

                            <button
                              type="button"
                              aria-label={`Remove ${point}`}
                              onClick={() =>
                                removeBoardingPoint(
                                  point,
                                )
                              }
                              className="font-black text-red-600"
                            >
                              ×
                            </button>
                          </div>
                        ),
                      )}
                    </div>
                  ) : null}
                </div>

                <div className="mt-5">
                  <FormField
                    label="Drop-off Point"
                    help="Optional specific terminal or final passenger drop-off location."
                  >
                    <input
                      type="text"
                      maxLength={120}
                      placeholder="e.g. Asafo VIP Terminal"
                      value={
                        form.dropOffPoint
                      }
                      onChange={(
                        event,
                      ) =>
                        updateForm(
                          "dropOffPoint",
                          event.target
                            .value,
                        )
                      }
                      className={inputClass}
                    />
                  </FormField>
                </div>
              </FormSection>

              {/* ========================================
                  Schedule
              ======================================== */}

              <FormSection
                number="03"
                title="Schedule"
                description="Configure when this bus operates and how far ahead passengers can book."
              >
                <div className="grid gap-5 md:grid-cols-2">
                  <FormField
                    label="Schedule Type"
                    required
                  >
                    <select
                      value={
                        form.scheduleType
                      }
                      onChange={(
                        event,
                      ) =>
                        handleScheduleType(
                          event.target
                            .value,
                        )
                      }
                      className={inputClass}
                    >
                      <option value="daily">
                        Daily
                      </option>

                      <option value="weekly">
                        Weekly
                      </option>

                      <option value="selected-days">
                        Selected Days
                      </option>
                    </select>
                  </FormField>

                  <FormField
                    label="Booking Window"
                    required
                    help="How many days ahead passengers can reserve this trip."
                  >
                    <div className="relative">
                      <input
                        type="number"
                        min={1}
                        max={365}
                        required
                        value={
                          form.bookingWindowDays
                        }
                        onChange={(
                          event,
                        ) =>
                          updateForm(
                            "bookingWindowDays",
                            event.target
                              .value,
                          )
                        }
                        className={`${inputClass} pr-16`}
                      />

                      <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm font-bold text-[#747680]">
                        days
                      </span>
                    </div>
                  </FormField>

                  <FormField
                    label="Departure Time"
                    required
                  >
                    <input
                      type="time"
                      required
                      value={
                        form.departureTime
                      }
                      onChange={(
                        event,
                      ) =>
                        updateForm(
                          "departureTime",
                          event.target
                            .value,
                        )
                      }
                      className={inputClass}
                    />
                  </FormField>

                  <FormField
                    label="Arrival Time"
                    required
                  >
                    <input
                      type="time"
                      required
                      value={
                        form.arrivalTime
                      }
                      onChange={(
                        event,
                      ) =>
                        updateForm(
                          "arrivalTime",
                          event.target
                            .value,
                        )
                      }
                      className={inputClass}
                    />
                  </FormField>
                </div>

                <div className="mt-6">
                  <p className="text-sm font-black text-[#002451]">
                    Operating Days
                  </p>

                  <p className="mt-1 text-xs text-[#747680]">
                    {form.scheduleType ===
                    "daily"
                      ? "Daily trips automatically operate every day."
                      : "Select every day this trip operates."}
                  </p>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {DAYS.map(
                      (day) => {
                        const active =
                          form.operatingDays.includes(
                            day,
                          );

                        return (
                          <button
                            key={
                              day
                            }
                            type="button"
                            disabled={
                              form.scheduleType ===
                              "daily"
                            }
                            onClick={() =>
                              toggleDay(
                                day,
                              )
                            }
                            className={`rounded-xl px-4 py-2.5 text-sm font-black capitalize transition ${
                              active
                                ? "bg-[#002451] text-white"
                                : "border border-[#c8cad4] bg-white text-[#747680]"
                            } disabled:cursor-default disabled:opacity-80`}
                          >
                            {day.slice(
                              0,
                              3,
                            )}
                          </button>
                        );
                      },
                    )}
                  </div>
                </div>
              </FormSection>

              {/* ========================================
                  Pricing
              ======================================== */}

              <FormSection
                number="04"
                title="Pricing & Booking"
                description="Set the passenger fare and control whether the trip can be booked through Zano."
              >
                <div className="grid gap-5 md:grid-cols-2">
                  <FormField
                    label="Ticket Price (GH₵)"
                    required
                  >
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      required
                      placeholder="128.00"
                      value={
                        form.fare
                      }
                      onChange={(
                        event,
                      ) =>
                        updateForm(
                          "fare",
                          event.target
                            .value,
                        )
                      }
                      className={inputClass}
                    />
                  </FormField>

                  <FormField
                    label="Trip Status"
                    required
                  >
                    <select
                      value={
                        form.status
                      }
                      onChange={(
                        event,
                      ) =>
                        updateForm(
                          "status",
                          event.target
                            .value,
                        )
                      }
                      className={inputClass}
                    >
                      <option value="scheduled">
                        Scheduled / Published
                      </option>

                      <option value="draft">
                        Draft
                      </option>

                      <option value="cancelled">
                        Cancelled
                      </option>
                    </select>
                  </FormField>
                </div>

                <label className="mt-6 flex cursor-pointer items-start gap-4 rounded-2xl border border-[#c8cad4]/70 bg-[#f8f7ff] p-5">
                  <input
                    type="checkbox"
                    checked={
                      form.bookingEnabled
                    }
                    onChange={(
                      event,
                    ) =>
                      updateForm(
                        "bookingEnabled",
                        event.target
                          .checked,
                      )
                    }
                    className="mt-0.5 h-5 w-5"
                  />

                  <div>
                    <p className="font-black text-[#002451]">
                      Enable Passenger
                      Booking
                    </p>

                    <p className="mt-1 text-sm leading-6 text-[#747680]">
                      Allow passengers
                      to find this trip,
                      choose available
                      seats and continue
                      to booking.
                    </p>
                  </div>
                </label>
              </FormSection>

              {/* ========================================
                  Submit
              ======================================== */}

              <section className="rounded-3xl bg-[#002451] p-6 text-white">
                <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-center">
                  <div>
                    <h3 className="text-xl font-black">
                      Ready to onboard
                      this bus?
                    </h3>

                    <p className="mt-2 max-w-2xl text-sm leading-6 text-white/70">
                      Zano will create
                      the vehicle,
                      company route,
                      passenger trip and
                      seat configuration
                      from this form.
                    </p>
                  </div>

                  <button
                    type="submit"
                    disabled={
                      saving
                    }
                    className="shrink-0 rounded-xl bg-[#ff7417] px-7 py-3.5 text-sm font-black text-white transition hover:bg-[#e96308] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {saving
                      ? "Publishing..."
                      : form.status ===
                          "draft"
                        ? "Save Draft"
                        : "Onboard & Publish"}
                  </button>
                </div>
              </section>
            </form>

            {/* ========================================
                Existing Onboarded Trips
            ======================================== */}

            <section className="mt-10">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <p className="text-sm font-bold text-[#747680]">
                    Fleet &
                    Operations
                  </p>

                  <h2 className="mt-1 text-2xl font-black text-[#002451]">
                    Onboarded Buses &
                    Trips
                  </h2>
                </div>

                <span className="rounded-xl bg-white px-4 py-2 text-sm font-black text-[#002451] shadow-sm">
                  {trips.length}{" "}
                  {trips.length ===
                  1
                    ? "trip"
                    : "trips"}
                </span>
              </div>

              <div className="mt-5 space-y-4">
                {trips.map(
                  (trip) => (
                    <article
                      key={
                        trip.id
                      }
                      className="rounded-3xl border border-[#c8cad4]/50 bg-white p-6 shadow-sm"
                    >
                      <div className="flex flex-col justify-between gap-5 xl:flex-row xl:items-start">
                        <div>
                          <div className="flex flex-wrap items-center gap-3">
                            <h3 className="text-xl font-black text-[#002451]">
                              {trip.origin ||
                                "Origin"}{" "}
                              →{" "}
                              {trip.destination ||
                                "Destination"}
                            </h3>

                            <span
                              className={`rounded-full px-3 py-1 text-xs font-black ${getStatusClasses(
                                trip.status,
                              )}`}
                            >
                              {displayStatus(
                                trip.status,
                              )}
                            </span>
                          </div>

                          <p className="mt-2 text-sm font-bold text-[#747680]">
                            {trip.vehicleName ||
                              "Bus"}{" "}
                            {trip.registrationNumber
                              ? `• ${trip.registrationNumber}`
                              : ""}
                          </p>
                        </div>

                        <div className="text-left xl:text-right">
                          <p className="text-2xl font-black text-[#002451]">
                            {money(
                              trip.fare,
                            )}
                          </p>

                          <p className="mt-1 text-xs font-bold text-[#747680]">
                            per passenger
                          </p>
                        </div>
                      </div>

                      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                        <TripValue
                          label="Bus Type"
                          value={
                            trip.busType ||
                            "—"
                          }
                        />

                        <TripValue
                          label="Schedule"
                          value={`${displayStatus(
                            trip.scheduleType,
                          )} • ${
                            trip.departureTime ||
                            "—"
                          }`}
                        />

                        <TripValue
                          label="Seats"
                          value={`${Number(
                            trip.availableSeats ??
                              trip.totalSeats ??
                              0,
                          )}/${Number(
                            trip.totalSeats ??
                              trip.seatCapacity ??
                              0,
                          )}`}
                        />

                        <TripValue
                          label="Booking"
                          value={
                            trip.bookingEnabled !==
                            false
                              ? "Enabled"
                              : "Disabled"
                          }
                        />
                      </div>

                      {trip.boardingPoints &&
                      trip.boardingPoints
                        .length > 0 ? (
                        <div className="mt-5 border-t border-[#c8cad4]/50 pt-5">
                          <p className="text-xs font-black uppercase tracking-wider text-[#747680]">
                            Boarding
                            Points
                          </p>

                          <div className="mt-3 flex flex-wrap gap-2">
                            {trip.boardingPoints.map(
                              (
                                point,
                                index,
                              ) => (
                                <span
                                  key={`${trip.id}-${point}-${index}`}
                                  className="rounded-full bg-[#39b5f4]/10 px-3 py-1.5 text-xs font-bold text-[#002451]"
                                >
                                  {point}
                                </span>
                              ),
                            )}
                          </div>
                        </div>
                      ) : null}

                      <div className="mt-5 border-t border-[#c8cad4]/50 pt-4">
                        <p className="text-xs text-[#747680]">
                          Trip ID:{" "}
                          <span className="font-bold text-[#002451]">
                            {trip.id}
                          </span>
                        </p>
                      </div>
                    </article>
                  ),
                )}

                {trips.length ===
                0 ? (
                  <div className="rounded-3xl border border-dashed border-[#c8cad4] bg-white p-10 text-center">
                    <h3 className="text-xl font-black text-[#002451]">
                      No buses
                      onboarded yet
                    </h3>

                    <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-[#747680]">
                      Complete the form
                      above to add your
                      first bus, route,
                      schedule and
                      passenger booking
                      configuration.
                    </p>
                  </div>
                ) : null}
              </div>
            </section>
          </div>
        </section>
      </div>
    </main>
  );
}

// ========================================
// Shared Styles
// ========================================

const inputClass =
  "h-12 w-full rounded-xl border border-[#c8cad4] bg-white px-4 text-[#002451] outline-none transition placeholder:text-[#747680]/60 focus:border-[#39b5f4] focus:ring-2 focus:ring-[#39b5f4]/10";

// ========================================
// Form Section
// ========================================

function FormSection({
  number,
  title,
  description,
  children,
}: {
  number: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-3xl border border-[#c8cad4]/50 bg-white p-6 shadow-sm sm:p-7">
      <div className="mb-6 flex items-start gap-4 border-b border-[#c8cad4]/50 pb-5">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#002451] text-sm font-black text-white">
          {number}
        </div>

        <div>
          <h3 className="text-xl font-black text-[#002451]">
            {title}
          </h3>

          <p className="mt-1 text-sm leading-6 text-[#747680]">
            {description}
          </p>
        </div>
      </div>

      {children}
    </section>
  );
}

// ========================================
// Form Field
// ========================================

function FormField({
  label,
  required = false,
  help,
  children,
}: {
  label: string;
  required?: boolean;
  help?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label className="mb-2 block text-sm font-black text-[#002451]">
        {label}

        {required ? (
          <span className="ml-1 text-[#ff7417]">
            *
          </span>
        ) : null}
      </label>

      {children}

      {help ? (
        <p className="mt-2 text-xs leading-5 text-[#747680]">
          {help}
        </p>
      ) : null}
    </div>
  );
}

// ========================================
// Summary Card
// ========================================

function SummaryCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-[#c8cad4]/40 bg-white p-5 shadow-sm">
      <p className="text-xs font-black uppercase tracking-wider text-[#747680]">
        {label}
      </p>

      <p className="mt-2 text-2xl font-black text-[#002451]">
        {value}
      </p>
    </div>
  );
}

// ========================================
// Trip Value
// ========================================

function TripValue({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl bg-[#f8f7ff] p-4">
      <p className="text-xs font-black uppercase tracking-wider text-[#747680]">
        {label}
      </p>

      <p className="mt-2 font-black text-[#002451]">
        {value}
      </p>
    </div>
  );
}