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
  useState,
} from "react";

import {
  onAuthStateChanged,
  sendPasswordResetEmail,
  signOut,
  type User,
} from "firebase/auth";

import {
  doc,
  getDoc,
  serverTimestamp,
  updateDoc,
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

type ProfileForm = {
  firstName: string;
  lastName: string;
  phoneNumber: string;
};

/* ========================================
   Passenger Profile Page
======================================== */

export default function PassengerProfilePage() {
  const router = useRouter();

  /* ========================================
     Authentication State
  ======================================== */

  const [firebaseUser, setFirebaseUser] =
    useState<User | null>(null);

  const [profile, setProfile] =
    useState<UserProfile | null>(null);

  /* ========================================
     Form State
  ======================================== */

  const [form, setForm] =
    useState<ProfileForm>({
      firstName: "",
      lastName: "",
      phoneNumber: "",
    });

  /* ========================================
     UI State
  ======================================== */

  const [isLoading, setIsLoading] =
    useState(true);

  const [isEditing, setIsEditing] =
    useState(false);

  const [isSaving, setIsSaving] =
    useState(false);

  const [isSigningOut, setIsSigningOut] =
    useState(false);

  const [
    isSendingPasswordReset,
    setIsSendingPasswordReset,
  ] = useState(false);

  const [errorMessage, setErrorMessage] =
    useState("");

  const [successMessage, setSuccessMessage] =
    useState("");

  /* ========================================
     Authentication + Profile Loading
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

          const normalizedProfile: UserProfile = {
            firstName:
              profileData.firstName ?? "",
            lastName:
              profileData.lastName ?? "",
            phoneNumber:
              profileData.phoneNumber ?? "",
            email:
              profileData.email ||
              user.email ||
              "",
            role: "passenger",
            photoURL:
              profileData.photoURL ||
              user.photoURL ||
              "",
          };

          setFirebaseUser(user);

          setProfile(normalizedProfile);

          setForm({
            firstName:
              normalizedProfile.firstName,
            lastName:
              normalizedProfile.lastName,
            phoneNumber:
              normalizedProfile.phoneNumber ??
              "",
          });
        } catch (error) {
          console.error(
            "Passenger profile loading error:",
            error
          );

          setErrorMessage(
            "We could not load your profile. Please refresh and try again."
          );
        } finally {
          setIsLoading(false);
        }
      }
    );

    return unsubscribe;
  }, [router]);

  /* ========================================
     Form Change
  ======================================== */

  function handleChange(
    field: keyof ProfileForm,
    value: string
  ) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));

    setErrorMessage("");
    setSuccessMessage("");
  }

  /* ========================================
     Cancel Editing
  ======================================== */

  function handleCancelEdit() {
    if (!profile) {
      return;
    }

    setForm({
      firstName: profile.firstName,
      lastName: profile.lastName,
      phoneNumber:
        profile.phoneNumber ?? "",
    });

    setIsEditing(false);
    setErrorMessage("");
    setSuccessMessage("");
  }

  /* ========================================
     Save Profile
  ======================================== */

  async function handleSaveProfile(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (!firebaseUser || !profile) {
      return;
    }

    setErrorMessage("");
    setSuccessMessage("");

    const firstName =
      form.firstName.trim();

    const lastName =
      form.lastName.trim();

    const phoneNumber =
      form.phoneNumber.trim();

    /* ========================================
       Validation
    ======================================== */

    if (!firstName) {
      setErrorMessage(
        "Enter your first name."
      );

      return;
    }

    if (!lastName) {
      setErrorMessage(
        "Enter your last name."
      );

      return;
    }

    if (
      firstName.length > 50 ||
      lastName.length > 50
    ) {
      setErrorMessage(
        "First name and last name must each be 50 characters or fewer."
      );

      return;
    }

    if (
      phoneNumber &&
      !isValidGhanaPhoneNumber(
        phoneNumber
      )
    ) {
      setErrorMessage(
        "Enter a valid Ghana phone number."
      );

      return;
    }

    try {
      setIsSaving(true);

      const profileReference = doc(
        db,
        "users",
        firebaseUser.uid
      );

      await updateDoc(
        profileReference,
        {
          firstName,
          lastName,
          phoneNumber,
          updatedAt: serverTimestamp(),
        }
      );

      const updatedProfile: UserProfile = {
        ...profile,
        firstName,
        lastName,
        phoneNumber,
      };

      setProfile(updatedProfile);

      setForm({
        firstName,
        lastName,
        phoneNumber,
      });

      setIsEditing(false);

      setSuccessMessage(
        "Your profile has been updated successfully."
      );
    } catch (error) {
      console.error(
        "Passenger profile update error:",
        error
      );

      setErrorMessage(
        "We could not update your profile. Please try again."
      );
    } finally {
      setIsSaving(false);
    }
  }

  /* ========================================
     Password Reset
  ======================================== */

  async function handlePasswordReset() {
    const email =
      firebaseUser?.email ||
      profile?.email;

    if (!email) {
      setErrorMessage(
        "No email address is available for this account."
      );

      return;
    }

    try {
      setIsSendingPasswordReset(true);
      setErrorMessage("");
      setSuccessMessage("");

      await sendPasswordResetEmail(
        auth,
        email
      );

      setSuccessMessage(
        `Password reset instructions have been sent to ${email}.`
      );
    } catch (error) {
      console.error(
        "Password reset error:",
        error
      );

      setErrorMessage(
        "We could not send the password reset email. Please try again."
      );
    } finally {
      setIsSendingPasswordReset(false);
    }
  }

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
    return <ProfileLoading />;
  }

  /* ========================================
     Profile Not Available
  ======================================== */

  if (!profile) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f7f8fc] px-5">
        <div className="w-full max-w-lg rounded-[24px] border border-[#e7eaf0] bg-white p-8 text-center shadow-lg">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50 text-red-600">
            <AlertIcon />
          </div>

          <h1 className="mt-5 text-2xl font-black text-[#002451]">
            Profile unavailable
          </h1>

          <p className="mt-3 text-sm leading-6 text-[#667085]">
            {errorMessage ||
              "We could not load your passenger profile."}
          </p>

          <Link
            href="/passenger/dashboard"
            className="mt-6 inline-flex h-12 items-center justify-center rounded-xl bg-[#002451] px-6 text-sm font-black text-white transition hover:bg-[#06396c]"
          >
            Return to dashboard
          </Link>
        </div>
      </main>
    );
  }

  const fullName =
    `${profile.firstName} ${profile.lastName}`.trim();

  /* ========================================
     Main Page
  ======================================== */

  return (
    <main className="min-h-screen bg-[#f7f8fc] pb-24 text-[#101828] lg:pb-12">
      {/* ========================================
          Header
      ======================================== */}

      <header className="border-b border-white/10 bg-[#002451]">
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

          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-black text-white">
                {profile.firstName ||
                  "Passenger"}
              </p>

              <p className="text-xs text-white/65">
                Passenger account
              </p>
            </div>

            <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-full border-2 border-[#ff7417] bg-white font-black text-[#002451]">
              {profile.photoURL ? (
                <Image
                  src={profile.photoURL}
                  alt={`${fullName} profile`}
                  width={44}
                  height={44}
                  className="h-full w-full object-cover"
                />
              ) : (
                getInitial(
                  profile.firstName
                )
              )}
            </div>
          </div>
        </div>
      </header>

      {/* ========================================
          Page Heading
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

          <div className="mt-7 max-w-2xl">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-[#73d6ff]">
              Your Zano
            </p>

            <h1 className="mt-3 text-4xl font-black tracking-tight sm:text-5xl">
              Passenger Profile
            </h1>

            <p className="mt-4 max-w-xl text-sm leading-7 text-white/75 sm:text-base">
              Manage your personal information
              and account security.
            </p>
          </div>
        </div>
      </section>

      {/* ========================================
          Profile Content
      ======================================== */}

      <section className="relative -mt-12 px-5 sm:px-7 lg:px-10">
        <div className="mx-auto grid max-w-[1200px] gap-6 lg:grid-cols-[340px_1fr]">
          {/* ========================================
              Profile Summary
          ======================================== */}

          <aside className="h-fit rounded-[26px] border border-[#e6eaf0] bg-white p-6 shadow-[0_18px_50px_rgba(0,36,81,0.09)]">
            <div className="flex flex-col items-center text-center">
              <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-full bg-[#eaf8ff] text-3xl font-black text-[#002451] ring-4 ring-[#f0f9ff]">
                {profile.photoURL ? (
                  <Image
                    src={profile.photoURL}
                    alt={`${fullName} profile`}
                    width={96}
                    height={96}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  getInitial(
                    profile.firstName
                  )
                )}
              </div>

              <h2 className="mt-5 text-xl font-black text-[#002451]">
                {fullName || "Zano Passenger"}
              </h2>

              <p className="mt-1 break-all text-sm text-[#667085]">
                {profile.email}
              </p>

              <span className="mt-4 inline-flex rounded-full bg-[#eaf8ff] px-3 py-1.5 text-xs font-black text-[#006d95]">
                Passenger
              </span>
            </div>

            <div className="my-6 border-t border-[#edf0f4]" />

            <div className="space-y-4">
              <SummaryRow
                icon={<PersonIcon />}
                label="Name"
                value={
                  fullName ||
                  "Not provided"
                }
              />

              <SummaryRow
                icon={<PhoneIcon />}
                label="Phone"
                value={
                  profile.phoneNumber ||
                  "Not provided"
                }
              />

              <SummaryRow
                icon={<EmailIcon />}
                label="Email"
                value={
                  profile.email ||
                  "Not available"
                }
              />
            </div>
          </aside>

          {/* ========================================
              Main Settings
          ======================================== */}

          <div className="space-y-6">
            {/* ========================================
                Messages
            ======================================== */}

            {errorMessage && (
              <MessageBox type="error">
                {errorMessage}
              </MessageBox>
            )}

            {successMessage && (
              <MessageBox type="success">
                {successMessage}
              </MessageBox>
            )}

            {/* ========================================
                Personal Information
            ======================================== */}

            <section className="rounded-[26px] border border-[#e6eaf0] bg-white p-6 shadow-sm sm:p-8">
              <div className="flex flex-col justify-between gap-4 border-b border-[#edf0f4] pb-6 sm:flex-row sm:items-center">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-[#ff7417]">
                    Profile
                  </p>

                  <h2 className="mt-2 text-2xl font-black text-[#002451]">
                    Personal Information
                  </h2>

                  <p className="mt-2 text-sm leading-6 text-[#667085]">
                    Keep your passenger details
                    accurate for bookings and
                    communication.
                  </p>
                </div>

                {!isEditing && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsEditing(true);
                      setErrorMessage("");
                      setSuccessMessage("");
                    }}
                    className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-[#002451] px-5 text-sm font-black text-white transition hover:bg-[#06396c]"
                  >
                    <EditIcon />

                    Edit Profile
                  </button>
                )}
              </div>

              <form
                onSubmit={handleSaveProfile}
                className="mt-7"
              >
                <div className="grid gap-5 sm:grid-cols-2">
                  <ProfileInput
                    id="firstName"
                    label="First Name"
                    value={form.firstName}
                    disabled={!isEditing}
                    autoComplete="given-name"
                    onChange={(value) =>
                      handleChange(
                        "firstName",
                        value
                      )
                    }
                  />

                  <ProfileInput
                    id="lastName"
                    label="Last Name"
                    value={form.lastName}
                    disabled={!isEditing}
                    autoComplete="family-name"
                    onChange={(value) =>
                      handleChange(
                        "lastName",
                        value
                      )
                    }
                  />

                  <ProfileInput
                    id="phoneNumber"
                    label="Phone Number"
                    value={form.phoneNumber}
                    disabled={!isEditing}
                    autoComplete="tel"
                    inputMode="tel"
                    placeholder="e.g. 0241234567"
                    onChange={(value) =>
                      handleChange(
                        "phoneNumber",
                        value
                      )
                    }
                  />

                  <ProfileInput
                    id="email"
                    label="Email Address"
                    value={profile.email}
                    disabled
                    autoComplete="email"
                    onChange={() => undefined}
                  />
                </div>

                <div className="mt-4 flex items-start gap-2 rounded-xl bg-[#f8fafc] p-4 text-xs leading-5 text-[#667085]">
                  <LockIcon />

                  <p>
                    Your email address is linked
                    to your sign-in account and
                    cannot be changed from this
                    profile page.
                  </p>
                </div>

                {isEditing && (
                  <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                    <button
                      type="button"
                      onClick={handleCancelEdit}
                      disabled={isSaving}
                      className="h-12 rounded-xl border border-[#d8dee8] px-6 text-sm font-black text-[#344054] transition hover:bg-[#f8fafc] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Cancel
                    </button>

                    <button
                      type="submit"
                      disabled={isSaving}
                      className="h-12 rounded-xl bg-[#ff7417] px-7 text-sm font-black text-white transition hover:bg-[#e96208] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isSaving
                        ? "Saving..."
                        : "Save Changes"}
                    </button>
                  </div>
                )}
              </form>
            </section>

            {/* ========================================
                Account Security
            ======================================== */}

            <section className="rounded-[26px] border border-[#e6eaf0] bg-white p-6 shadow-sm sm:p-8">
              <div className="border-b border-[#edf0f4] pb-6">
                <p className="text-xs font-black uppercase tracking-[0.16em] text-[#39b5f4]">
                  Account
                </p>

                <h2 className="mt-2 text-2xl font-black text-[#002451]">
                  Account & Security
                </h2>

                <p className="mt-2 text-sm leading-6 text-[#667085]">
                  Manage access to your Zano
                  passenger account.
                </p>
              </div>

              <div className="divide-y divide-[#edf0f4]">
                <AccountRow
                  icon={<EmailIcon />}
                  title="Email Address"
                  description={
                    profile.email ||
                    "No email available"
                  }
                  action={
                    <span className="rounded-full bg-[#ecfdf3] px-3 py-1.5 text-xs font-black text-[#027a48]">
                      Verified account
                    </span>
                  }
                />

                <AccountRow
                  icon={<LockIcon />}
                  title="Password"
                  description="Send password reset instructions to your account email."
                  action={
                    <button
                      type="button"
                      onClick={
                        handlePasswordReset
                      }
                      disabled={
                        isSendingPasswordReset
                      }
                      className="rounded-xl border border-[#d8dee8] px-4 py-2.5 text-xs font-black text-[#002451] transition hover:border-[#002451] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isSendingPasswordReset
                        ? "Sending..."
                        : "Change Password"}
                    </button>
                  }
                />

                <AccountRow
                  icon={<ShieldIcon />}
                  title="Account Type"
                  description="Your Zano account is registered for passenger travel."
                  action={
                    <span className="rounded-full bg-[#eaf8ff] px-3 py-1.5 text-xs font-black text-[#006d95]">
                      Passenger
                    </span>
                  }
                />
              </div>
            </section>

            {/* ========================================
                Sign Out
            ======================================== */}

            <section className="rounded-[26px] border border-[#fed7d7] bg-white p-6 shadow-sm sm:p-8">
              <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
                <div>
                  <h2 className="text-lg font-black text-[#101828]">
                    Sign out of Zano
                  </h2>

                  <p className="mt-2 max-w-xl text-sm leading-6 text-[#667085]">
                    You will need to sign in
                    again to access your trips,
                    tickets and passenger
                    profile.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleSignOut}
                  disabled={isSigningOut}
                  className="inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 px-6 text-sm font-black text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <SignOutIcon />

                  {isSigningOut
                    ? "Signing out..."
                    : "Sign Out"}
                </button>
              </div>
            </section>
          </div>
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
            active
          />
        </div>
      </nav>
    </main>
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
      className="rounded-xl px-4 py-2.5 text-sm font-bold text-white/80 transition hover:bg-white/10 hover:text-[#ff9a35]"
    >
      {children}
    </Link>
  );
}

/* ========================================
   Profile Input
======================================== */

function ProfileInput({
  id,
  label,
  value,
  disabled,
  placeholder,
  autoComplete,
  inputMode,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  disabled: boolean;
  placeholder?: string;
  autoComplete?: string;
  inputMode?:
    | "none"
    | "text"
    | "tel"
    | "url"
    | "email"
    | "numeric"
    | "decimal"
    | "search";
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className="mb-2 block text-xs font-black text-[#344054]"
      >
        {label}
      </label>

      <input
        id={id}
        type="text"
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        autoComplete={autoComplete}
        inputMode={inputMode}
        onChange={(event) =>
          onChange(event.target.value)
        }
        className={`h-13 w-full rounded-xl border px-4 text-sm font-semibold outline-none transition ${
          disabled
            ? "cursor-not-allowed border-[#eaecf0] bg-[#f8fafc] text-[#667085]"
            : "border-[#d8dee8] bg-white text-[#101828] focus:border-[#39b5f4] focus:ring-2 focus:ring-[#39b5f4]/10"
        }`}
      />
    </div>
  );
}

/* ========================================
   Profile Summary Row
======================================== */

function SummaryRow({
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

        <p className="mt-1 break-words text-sm font-black text-[#344054]">
          {value}
        </p>
      </div>
    </div>
  );
}

/* ========================================
   Account Row
======================================== */

function AccountRow({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  action: ReactNode;
}) {
  return (
    <div className="flex flex-col justify-between gap-4 py-5 sm:flex-row sm:items-center">
      <div className="flex items-start gap-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#f0f8ff] text-[#002451]">
          {icon}
        </div>

        <div>
          <p className="text-sm font-black text-[#101828]">
            {title}
          </p>

          <p className="mt-1 max-w-lg text-xs leading-5 text-[#667085]">
            {description}
          </p>
        </div>
      </div>

      <div className="shrink-0 sm:pl-5">
        {action}
      </div>
    </div>
  );
}

/* ========================================
   Message Box
======================================== */

function MessageBox({
  type,
  children,
}: {
  type: "success" | "error";
  children: ReactNode;
}) {
  return (
    <div
      role={
        type === "error"
          ? "alert"
          : "status"
      }
      className={`rounded-2xl border p-4 text-sm font-semibold ${
        type === "success"
          ? "border-green-200 bg-green-50 text-green-700"
          : "border-red-200 bg-red-50 text-red-700"
      }`}
    >
      {children}
    </div>
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

function ProfileLoading() {
  return (
    <main className="min-h-screen bg-[#f7f8fc]">
      <div className="h-[82px] animate-pulse bg-[#002451]" />

      <div className="bg-[#002451] px-5 pb-24 pt-10">
        <div className="mx-auto max-w-[1200px]">
          <div className="h-4 w-36 animate-pulse rounded bg-white/20" />

          <div className="mt-6 h-12 w-72 max-w-full animate-pulse rounded-xl bg-white/15" />

          <div className="mt-4 h-5 w-96 max-w-full animate-pulse rounded bg-white/10" />
        </div>
      </div>

      <div className="relative -mt-12 mx-auto grid max-w-[1200px] gap-6 px-5 lg:grid-cols-[340px_1fr]">
        <div className="h-[420px] animate-pulse rounded-[26px] bg-white shadow-sm" />

        <div className="space-y-6">
          <div className="h-[430px] animate-pulse rounded-[26px] bg-white shadow-sm" />

          <div className="h-[300px] animate-pulse rounded-[26px] bg-white shadow-sm" />
        </div>
      </div>
    </main>
  );
}

/* ========================================
   Validation Helpers
======================================== */

function isValidGhanaPhoneNumber(
  value: string
) {
  const normalized =
    value.replace(/[\s()-]/g, "");

  return (
    /^0\d{9}$/.test(normalized) ||
    /^\+233\d{9}$/.test(normalized) ||
    /^233\d{9}$/.test(normalized)
  );
}

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

function PhoneIcon() {
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
      <path d="M5 4h4l2 5-3 2c1.5 3 3.5 5 6 6l2-3 5 2v4c0 1-1 2-2 2C10 22 2 14 2 5c0-1 1-1 3-1Z" />
    </svg>
  );
}

function EmailIcon() {
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
      <path d="m4 7 8 6 8-6" />
    </svg>
  );
}

function LockIcon() {
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
        y="10"
        width="14"
        height="11"
        rx="2"
      />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

function ShieldIcon() {
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
      <path d="M12 3 5 6v5c0 5 3 8 7 10 4-2 7-5 7-10V6l-7-3Z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

function EditIcon() {
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
      <path d="M4 20h4L19 9l-4-4L4 16v4Z" />
      <path d="m13 7 4 4" />
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

function SignOutIcon() {
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
      <path d="M10 4H5v16h5" />
      <path d="m15 8 4 4-4 4" />
      <path d="M9 12h10" />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="24"
      height="24"
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
      <path d="M12 8v5" />
      <path d="M12 17h.01" />
    </svg>
  );
}