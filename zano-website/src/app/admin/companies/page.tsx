"use client";

// ========================================
// Imports
// ========================================

import Link from "next/link";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { FormEvent, useEffect, useMemo, useState } from "react";

import { auth, db } from "@/lib/firebase/client";

// ========================================
// Types
// ========================================

type CompanyStatus = "active" | "inactive";

type Company = {
  id: string;
  name: string;
  email: string;
  phoneNumber: string;
  address: string;
  status: CompanyStatus;
  operators: number;
  activeOperators: number;
  vehicles: number;
  activeVehicles: number;
  trips: number;
  bookings: number;
  revenue: number;
  createdAt: string | null;
  updatedAt: string | null;
};

type CompanySummary = {
  total: number;
  active: number;
  inactive: number;
};

type CompaniesResponse = {
  success: boolean;
  companies?: Company[];
  summary?: CompanySummary;
  error?: string;
};

type CompanyMutationResponse = {
  success: boolean;
  company?: Company;
  error?: string;
};

type CompanyForm = {
  name: string;
  companyId: string;
  email: string;
  phoneNumber: string;
  address: string;
  status: CompanyStatus;
};

const EMPTY_FORM: CompanyForm = {
  name: "",
  companyId: "",
  email: "",
  phoneNumber: "",
  address: "",
  status: "active",
};

// ========================================
// Companies Page
// ========================================

export default function AdminCompaniesPage() {
  const router = useRouter();

  // ========================================
  // State
  // ========================================

  const [currentUser, setCurrentUser] = useState<User | null>(null);

  const [companies, setCompanies] = useState<Company[]>([]);

  const [summary, setSummary] = useState<CompanySummary>({
    total: 0,
    active: 0,
    inactive: 0,
  });

  const [search, setSearch] = useState("");

  const [statusFilter, setStatusFilter] = useState<"all" | CompanyStatus>(
    "all",
  );

  const [loading, setLoading] = useState(true);

  const [error, setError] = useState("");

  const [showForm, setShowForm] = useState(false);

  const [editingCompany, setEditingCompany] = useState<Company | null>(null);

  const [form, setForm] = useState<CompanyForm>(EMPTY_FORM);

  const [saving, setSaving] = useState(false);

  const [formError, setFormError] = useState("");

  const [successMessage, setSuccessMessage] = useState("");

  // ========================================
  // Authenticate + Load Companies
  // ========================================

  useEffect(() => {
    let cancelled = false;

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.replace("/admin/login");

        return;
      }

      try {
        setLoading(true);
        setError("");

        // ========================================
        // Client Admin Check
        // ========================================

        const userSnapshot = await getDoc(doc(db, "users", user.uid));

        if (!userSnapshot.exists()) {
          throw new Error("Your administrator profile could not be found.");
        }

        if (userSnapshot.data().role !== "admin") {
          await signOut(auth);

          router.replace("/admin/login");

          return;
        }

        const idToken = await user.getIdToken();

        const response = await fetch("/api/admin/companies", {
          method: "GET",

          headers: {
            Authorization: `Bearer ${idToken}`,
          },

          cache: "no-store",
        });

        const result = (await response.json()) as CompaniesResponse;

        if (!response.ok || !result.success) {
          throw new Error(result.error || "Unable to load companies.");
        }

        if (cancelled) {
          return;
        }

        setCurrentUser(user);

        setCompanies(Array.isArray(result.companies) ? result.companies : []);

        setSummary(
          result.summary ?? {
            total: 0,
            active: 0,
            inactive: 0,
          },
        );
      } catch (loadError) {
        console.error("Admin companies load error:", loadError);

        if (!cancelled) {
          setCurrentUser(user);

          setError(
            loadError instanceof Error
              ? loadError.message
              : "Unable to load companies.",
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [router]);

  // ========================================
  // Filter Companies
  // ========================================

  const filteredCompanies = useMemo(() => {
    const query = search.trim().toLowerCase();

    return companies.filter((company) => {
      const matchesStatus =
        statusFilter === "all" || company.status === statusFilter;

      const matchesSearch =
        !query ||
        company.name.toLowerCase().includes(query) ||
        company.id.toLowerCase().includes(query) ||
        company.email.toLowerCase().includes(query) ||
        company.phoneNumber.toLowerCase().includes(query);

      return matchesStatus && matchesSearch;
    });
  }, [companies, search, statusFilter]);

  // ========================================
  // Refresh Companies
  // ========================================

  async function refreshCompanies(user = currentUser) {
    if (!user) {
      return;
    }

    const idToken = await user.getIdToken();

    const response = await fetch("/api/admin/companies", {
      method: "GET",

      headers: {
        Authorization: `Bearer ${idToken}`,
      },

      cache: "no-store",
    });

    const result = (await response.json()) as CompaniesResponse;

    if (!response.ok || !result.success) {
      throw new Error(result.error || "Unable to refresh companies.");
    }

    setCompanies(Array.isArray(result.companies) ? result.companies : []);

    setSummary(
      result.summary ?? {
        total: 0,
        active: 0,
        inactive: 0,
      },
    );
  }

  // ========================================
  // Open Add Company
  // ========================================

  function openAddCompany() {
    setEditingCompany(null);

    setForm({
      ...EMPTY_FORM,
    });

    setFormError("");
    setSuccessMessage("");
    setShowForm(true);
  }

  // ========================================
  // Open Edit Company
  // ========================================

  function openEditCompany(company: Company) {
    setEditingCompany(company);

    setForm({
      name: company.name,
      companyId: company.id,
      email: company.email,
      phoneNumber: company.phoneNumber,
      address: company.address,
      status: company.status,
    });

    setFormError("");
    setSuccessMessage("");
    setShowForm(true);
  }

  // ========================================
  // Close Form
  // ========================================

  function closeForm() {
    if (saving) {
      return;
    }

    setShowForm(false);
    setEditingCompany(null);
    setFormError("");

    setForm({
      ...EMPTY_FORM,
    });
  }

  // ========================================
  // Save Company
  // ========================================

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!currentUser || saving) {
      return;
    }

    try {
      setSaving(true);
      setFormError("");
      setSuccessMessage("");

      const idToken = await currentUser.getIdToken();

      const isEditing = Boolean(editingCompany);

      const payload = isEditing
        ? {
            companyId: editingCompany!.id,

            name: form.name.trim(),

            email: form.email.trim(),

            phoneNumber: form.phoneNumber.trim(),

            address: form.address.trim(),

            status: form.status,
          }
        : {
            name: form.name.trim(),

            companyId: form.companyId.trim(),

            email: form.email.trim(),

            phoneNumber: form.phoneNumber.trim(),

            address: form.address.trim(),

            status: form.status,
          };

      const response = await fetch("/api/admin/companies", {
        method: isEditing ? "PATCH" : "POST",

        headers: {
          Authorization: `Bearer ${idToken}`,

          "Content-Type": "application/json",
        },

        body: JSON.stringify(payload),
      });

      const result = (await response.json()) as CompanyMutationResponse;

      if (!response.ok || !result.success) {
        throw new Error(result.error || "Unable to save company.");
      }

      await refreshCompanies();

      setSuccessMessage(
        isEditing
          ? "Company updated successfully."
          : "Company added successfully.",
      );

      setShowForm(false);
      setEditingCompany(null);

      setForm({
        ...EMPTY_FORM,
      });
    } catch (saveError) {
      console.error("Company save error:", saveError);

      setFormError(
        saveError instanceof Error
          ? saveError.message
          : "Unable to save company.",
      );
    } finally {
      setSaving(false);
    }
  }

  // ========================================
  // Toggle Company Status
  // ========================================

  async function toggleCompanyStatus(company: Company) {
    if (!currentUser || saving) {
      return;
    }

    const nextStatus: CompanyStatus =
      company.status === "active" ? "inactive" : "active";

    try {
      setSaving(true);
      setError("");
      setSuccessMessage("");

      const idToken = await currentUser.getIdToken();

      const response = await fetch("/api/admin/companies", {
        method: "PATCH",

        headers: {
          Authorization: `Bearer ${idToken}`,

          "Content-Type": "application/json",
        },

        body: JSON.stringify({
          companyId: company.id,

          status: nextStatus,
        }),
      });

      const result = (await response.json()) as CompanyMutationResponse;

      if (!response.ok || !result.success) {
        throw new Error(result.error || "Unable to update company status.");
      }

      await refreshCompanies();

      setSuccessMessage(`${company.name} is now ${nextStatus}.`);
    } catch (statusError) {
      console.error("Company status error:", statusError);

      setError(
        statusError instanceof Error
          ? statusError.message
          : "Unable to update company status.",
      );
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
      router.replace("/admin/login");
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

          <p className="mt-4 font-bold text-[#002451]">Loading companies...</p>
        </div>
      </main>
    );
  }

  // ========================================
  // Main Page
  // ========================================

  return (
    <main className="min-h-screen bg-[#f8f7ff]">
      <div className="flex min-h-screen">
        {/* ========================================
            Desktop Sidebar
        ======================================== */}

        <aside className="hidden w-64 shrink-0 flex-col bg-[#002451] px-5 py-7 text-white lg:flex">
          <Link href="/" className="px-3 text-3xl font-black tracking-tight">
            Zano
          </Link>

          <div className="mt-7 px-3">
            <p className="text-xs font-black uppercase tracking-[0.15em] text-[#39b5f4]">
              Platform Admin
            </p>

            <p className="mt-2 text-sm leading-5 text-white/60">
              Simple platform management
            </p>
          </div>

          <nav className="mt-8 space-y-2">
            <Link
              href="/admin/dashboard"
              className="block rounded-xl px-4 py-3 text-sm font-bold text-white/70 transition hover:bg-white/10 hover:text-white"
            >
              Overview
            </Link>

            <Link
              href="/admin/companies"
              className="block rounded-xl bg-[#ff7417] px-4 py-3 text-sm font-black text-white"
            >
              Companies
            </Link>

            <Link
              href="/admin/bookings"
              className="block rounded-xl px-4 py-3 text-sm font-bold text-white/70 transition hover:bg-white/10 hover:text-white"
            >
              Bookings
            </Link>
          </nav>

          <div className="mt-auto border-t border-white/10 pt-5">
            <button
              type="button"
              onClick={handleSignOut}
              className="w-full rounded-xl border border-white/15 px-4 py-3 text-left text-sm font-bold text-white/75 transition hover:bg-white/10 hover:text-white"
            >
              Sign Out
            </button>
          </div>
        </aside>

        {/* ========================================
            Main Content
        ======================================== */}

        <section className="min-w-0 flex-1">
          {/* Header */}

          <header className="border-b border-[#c8cad4]/60 bg-white px-5 py-5 sm:px-8">
            <div className="mx-auto flex max-w-7xl items-center justify-between gap-5">
              <div>
                <p className="text-sm font-bold text-[#747680]">Admin</p>

                <h1 className="text-2xl font-black text-[#002451]">
                  Companies
                </h1>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={openAddCompany}
                  className="rounded-xl bg-[#ff7417] px-4 py-2.5 text-sm font-black text-white transition hover:opacity-90"
                >
                  + Add Company
                </button>

                <button
                  type="button"
                  onClick={handleSignOut}
                  className="rounded-xl border border-[#c8cad4] px-4 py-2.5 text-sm font-bold text-[#002451] lg:hidden"
                >
                  Sign Out
                </button>
              </div>
            </div>
          </header>

          {/* Mobile Navigation */}

          <nav className="border-b border-[#c8cad4]/60 bg-white px-5 py-3 lg:hidden">
            <div className="mx-auto flex max-w-7xl gap-2 overflow-x-auto">
              <Link
                href="/admin/dashboard"
                className="shrink-0 rounded-xl bg-[#f8f7ff] px-4 py-2.5 text-sm font-black text-[#747680]"
              >
                Overview
              </Link>

              <Link
                href="/admin/companies"
                className="shrink-0 rounded-xl bg-[#ff7417] px-4 py-2.5 text-sm font-black text-white"
              >
                Companies
              </Link>

              <Link
                href="/admin/bookings"
                className="shrink-0 rounded-xl bg-[#f8f7ff] px-4 py-2.5 text-sm font-black text-[#747680] transition hover:bg-[#002451] hover:text-white"
              >
                Bookings
              </Link>
            </div>
          </nav>

          <div className="mx-auto max-w-7xl px-5 py-8 sm:px-8">
            {/* ========================================
                Page Introduction
            ======================================== */}

            <section>
              <p className="text-sm font-bold text-[#747680]">
                Transport network
              </p>

              <div className="mt-1 flex flex-wrap items-end justify-between gap-4">
                <div>
                  <h2 className="text-3xl font-black text-[#002451]">
                    Transport Companies
                  </h2>

                  <p className="mt-2 max-w-2xl text-sm leading-6 text-[#747680]">
                    Manage companies operating on Zano and monitor their
                    operators, buses, trips and bookings.
                  </p>
                </div>
              </div>
            </section>

            {/* ========================================
                Messages
            ======================================== */}

            {successMessage ? (
              <div className="mt-6 rounded-2xl border border-green-200 bg-green-50 px-5 py-4 text-sm font-bold text-green-700">
                {successMessage}
              </div>
            ) : null}

            {error ? (
              <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-bold text-red-700">
                {error}
              </div>
            ) : null}

            {/* ========================================
                Summary
            ======================================== */}

            <section className="mt-7 grid gap-4 sm:grid-cols-3">
              <SummaryCard label="Total Companies" value={summary.total} />

              <SummaryCard label="Active" value={summary.active} />

              <SummaryCard label="Inactive" value={summary.inactive} />
            </section>

            {/* ========================================
                Search + Filters
            ======================================== */}

            <section className="mt-7 rounded-3xl border border-[#c8cad4]/50 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div className="w-full md:max-w-md">
                  <label htmlFor="company-search" className="sr-only">
                    Search companies
                  </label>

                  <input
                    id="company-search"
                    type="search"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search companies..."
                    className="w-full rounded-xl border border-[#c8cad4] bg-white px-4 py-3 text-sm text-[#002451] outline-none transition placeholder:text-[#747680] focus:border-[#39b5f4] focus:ring-2 focus:ring-[#39b5f4]/15"
                  />
                </div>

                <div className="flex gap-2">
                  {(["all", "active", "inactive"] as const).map((status) => (
                    <button
                      key={status}
                      type="button"
                      onClick={() => setStatusFilter(status)}
                      className={`rounded-xl px-4 py-2.5 text-sm font-black capitalize transition ${
                        statusFilter === status
                          ? "bg-[#002451] text-white"
                          : "bg-[#f8f7ff] text-[#747680] hover:text-[#002451]"
                      }`}
                    >
                      {status}
                    </button>
                  ))}
                </div>
              </div>
            </section>

            {/* ========================================
                Companies
            ======================================== */}

            <section className="mt-7">
              <div className="mb-4 flex items-center justify-between gap-4">
                <h2 className="text-xl font-black text-[#002451]">Companies</h2>

                <p className="text-sm font-bold text-[#747680]">
                  {filteredCompanies.length} shown
                </p>
              </div>

              {filteredCompanies.length > 0 ? (
                <div className="grid gap-5 xl:grid-cols-2">
                  {filteredCompanies.map((company) => (
                    <CompanyCard
                      key={company.id}
                      company={company}
                      saving={saving}
                      onEdit={() => openEditCompany(company)}
                      onToggleStatus={() => toggleCompanyStatus(company)}
                    />
                  ))}
                </div>
              ) : (
                <div className="rounded-3xl border border-[#c8cad4]/50 bg-white px-6 py-16 text-center shadow-sm">
                  <p className="text-lg font-black text-[#002451]">
                    No companies found
                  </p>

                  <p className="mt-2 text-sm text-[#747680]">
                    Try another search or status filter.
                  </p>
                </div>
              )}
            </section>
          </div>
        </section>
      </div>

      {/* ========================================
          Add / Edit Company Modal
      ======================================== */}

      {showForm ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#002451]/60 p-4"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeForm();
            }
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="company-form-title"
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4 border-b border-[#c8cad4]/50 p-6">
              <div>
                <p className="text-sm font-bold text-[#747680]">
                  Company Management
                </p>

                <h2
                  id="company-form-title"
                  className="mt-1 text-2xl font-black text-[#002451]"
                >
                  {editingCompany ? "Edit Company" : "Add Company"}
                </h2>
              </div>

              <button
                type="button"
                onClick={closeForm}
                disabled={saving}
                aria-label="Close"
                className="flex h-10 w-10 items-center justify-center rounded-full bg-[#f8f7ff] text-xl font-black text-[#002451] disabled:opacity-50"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6">
              {formError ? (
                <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
                  {formError}
                </div>
              ) : null}

              <div className="grid gap-5 sm:grid-cols-2">
                <FormField label="Company Name" required>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        name: event.target.value,
                      }))
                    }
                    required
                    maxLength={120}
                    placeholder="VIP Jeoun Transport"
                    className={inputClasses}
                  />
                </FormField>

                <FormField label="Company ID" required={!editingCompany}>
                  <input
                    type="text"
                    value={form.companyId}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        companyId: event.target.value,
                      }))
                    }
                    disabled={Boolean(editingCompany)}
                    placeholder="vip-jeoun"
                    className={`${inputClasses} disabled:cursor-not-allowed disabled:bg-[#f8f7ff] disabled:text-[#747680]`}
                  />

                  {!editingCompany ? (
                    <p className="mt-2 text-xs text-[#747680]">
                      Leave blank to generate it from the company name.
                    </p>
                  ) : (
                    <p className="mt-2 text-xs text-[#747680]">
                      Company IDs cannot be changed after creation.
                    </p>
                  )}
                </FormField>

                <FormField label="Email">
                  <input
                    type="email"
                    value={form.email}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        email: event.target.value,
                      }))
                    }
                    placeholder="operations@company.com"
                    className={inputClasses}
                  />
                </FormField>

                <FormField label="Phone Number">
                  <input
                    type="tel"
                    value={form.phoneNumber}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        phoneNumber: event.target.value,
                      }))
                    }
                    placeholder="+233..."
                    className={inputClasses}
                  />
                </FormField>

                <div className="sm:col-span-2">
                  <FormField label="Address">
                    <input
                      type="text"
                      value={form.address}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          address: event.target.value,
                        }))
                      }
                      placeholder="Company or terminal address"
                      className={inputClasses}
                    />
                  </FormField>
                </div>

                <FormField label="Status" required>
                  <select
                    value={form.status}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        status: event.target.value as CompanyStatus,
                      }))
                    }
                    className={inputClasses}
                  >
                    <option value="active">Active</option>

                    <option value="inactive">Inactive</option>
                  </select>
                </FormField>
              </div>

              <div className="mt-7 flex flex-col-reverse gap-3 border-t border-[#c8cad4]/50 pt-5 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={closeForm}
                  disabled={saving}
                  className="rounded-xl border border-[#c8cad4] px-5 py-3 text-sm font-black text-[#002451] transition hover:bg-[#f8f7ff] disabled:opacity-50"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-xl bg-[#ff7417] px-5 py-3 text-sm font-black text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saving
                    ? "Saving..."
                    : editingCompany
                      ? "Save Changes"
                      : "Add Company"}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </main>
  );
}

// ========================================
// Company Card
// ========================================

function CompanyCard({
  company,
  saving,
  onEdit,
  onToggleStatus,
}: {
  company: Company;
  saving: boolean;
  onEdit: () => void;
  onToggleStatus: () => void;
}) {
  return (
    <article className="rounded-3xl border border-[#c8cad4]/50 bg-white p-6 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-xl font-black text-[#002451]">
              {company.name}
            </h3>

            <StatusBadge status={company.status} />
          </div>

          <p className="mt-1 text-xs font-bold text-[#747680]">{company.id}</p>
        </div>

        <button
          type="button"
          onClick={onEdit}
          className="shrink-0 rounded-xl border border-[#c8cad4] px-3 py-2 text-xs font-black text-[#002451] transition hover:bg-[#f8f7ff]"
        >
          Edit
        </button>
      </div>

      {/* Contact */}

      {company.email || company.phoneNumber || company.address ? (
        <div className="mt-5 rounded-2xl bg-[#f8f7ff] p-4">
          {company.email ? (
            <p className="break-all text-sm font-bold text-[#002451]">
              {company.email}
            </p>
          ) : null}

          {company.phoneNumber ? (
            <p className="mt-1 text-sm text-[#747680]">{company.phoneNumber}</p>
          ) : null}

          {company.address ? (
            <p className="mt-1 text-sm text-[#747680]">{company.address}</p>
          ) : null}
        </div>
      ) : null}

      {/* Company Operations */}

      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MiniMetric label="Operators" value={company.operators} />

        <MiniMetric label="Vehicles" value={company.vehicles} />

        <MiniMetric label="Trips" value={company.trips} />

        <MiniMetric label="Bookings" value={company.bookings} />
      </div>

      {/* Revenue */}

      <div className="mt-5 flex flex-wrap items-end justify-between gap-4 border-t border-[#c8cad4]/40 pt-5">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-[#747680]">
            Booking Revenue
          </p>

          <p className="mt-1 text-xl font-black text-[#002451]">
            {formatMoney(company.revenue)}
          </p>
        </div>

        <button
          type="button"
          disabled={saving}
          onClick={onToggleStatus}
          className={`rounded-xl px-4 py-2.5 text-sm font-black transition disabled:cursor-not-allowed disabled:opacity-50 ${
            company.status === "active"
              ? "bg-red-50 text-red-700 hover:bg-red-100"
              : "bg-green-50 text-green-700 hover:bg-green-100"
          }`}
        >
          {company.status === "active" ? "Set Inactive" : "Activate"}
        </button>
      </div>
    </article>
  );
}

// ========================================
// Summary Card
// ========================================

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-[#c8cad4]/50 bg-white p-5 shadow-sm">
      <p className="text-sm font-bold text-[#747680]">{label}</p>

      <p className="mt-2 text-3xl font-black text-[#002451]">
        {formatNumber(value)}
      </p>
    </div>
  );
}

// ========================================
// Mini Metric
// ========================================

function MiniMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-[#c8cad4]/40 p-3">
      <p className="text-xs font-bold text-[#747680]">{label}</p>

      <p className="mt-1 text-lg font-black text-[#002451]">
        {formatNumber(value)}
      </p>
    </div>
  );
}

// ========================================
// Status Badge
// ========================================

function StatusBadge({ status }: { status: CompanyStatus }) {
  return (
    <span
      className={`inline-flex rounded-full px-3 py-1 text-xs font-black capitalize ${
        status === "active"
          ? "bg-green-50 text-green-700"
          : "bg-[#f8f7ff] text-[#747680]"
      }`}
    >
      {status}
    </span>
  );
}

// ========================================
// Form Field
// ========================================

function FormField({
  label,
  required = false,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-black text-[#002451]">
        {label}

        {required ? <span className="ml-1 text-[#ff7417]">*</span> : null}
      </span>

      {children}
    </label>
  );
}

// ========================================
// Input Classes
// ========================================

const inputClasses =
  "w-full rounded-xl border border-[#c8cad4] bg-white px-4 py-3 text-sm text-[#002451] outline-none transition placeholder:text-[#747680] focus:border-[#39b5f4] focus:ring-2 focus:ring-[#39b5f4]/15";

// ========================================
// Formatters
// ========================================

function formatNumber(value: number) {
  if (!Number.isFinite(value)) {
    return "0";
  }

  return new Intl.NumberFormat("en-GH").format(value);
}

function formatMoney(value: number) {
  const safeValue = Number.isFinite(value) ? value : 0;

  return new Intl.NumberFormat("en-GH", {
    style: "currency",
    currency: "GHS",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(safeValue);
}
