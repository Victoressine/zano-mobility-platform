"use client";

// ========================================
// Imports
// ========================================

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

import { FirebaseError } from "firebase/app";

import {
  createUserWithEmailAndPassword,
  deleteUser,
  GoogleAuthProvider,
  signInWithPopup,
  updateProfile,
} from "firebase/auth";

import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";

import { auth, db } from "@/lib/firebase/client";

// ========================================
// Constants
// ========================================

const MIN_PASSWORD_LENGTH = 8;

// ========================================
// Signup Page
// ========================================

export default function SignupPage() {
  const router = useRouter();

  // ========================================
  // Form State
  // ========================================

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [email, setEmail] = useState("");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [acceptedTerms, setAcceptedTerms] = useState(false);

  // ========================================
  // UI State
  // ========================================

  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGoogleSubmitting, setIsGoogleSubmitting] = useState(false);

  const isBusy = isSubmitting || isGoogleSubmitting;

  // ========================================
  // Email And Password Signup
  // ========================================

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");

    // ========================================
    // Normalize Input
    // ========================================

    const normalizedFirstName = firstName.trim();
    const normalizedLastName = lastName.trim();
    const normalizedPhoneNumber = phoneNumber.trim();
    const normalizedEmail = email.trim().toLowerCase();

    // ========================================
    // Client Validation
    // ========================================

    if (!normalizedFirstName || !normalizedLastName) {
      setMessage("Please enter your first and last name.");
      return;
    }

    if (!isValidPhoneNumber(normalizedPhoneNumber)) {
      setMessage("Please enter a valid phone number.");
      return;
    }

    if (!normalizedEmail) {
      setMessage("Please enter your email address.");
      return;
    }

    if (password.length < MIN_PASSWORD_LENGTH) {
      setMessage(
        `Your password must contain at least ${MIN_PASSWORD_LENGTH} characters.`
      );
      return;
    }

    if (!isStrongEnoughPassword(password)) {
      setMessage(
        "Use a password containing at least one letter and one number."
      );
      return;
    }

    if (password !== confirmPassword) {
      setMessage("Passwords do not match.");
      return;
    }

    if (!acceptedTerms) {
      setMessage(
        "Please accept the Terms of Service and Privacy Policy."
      );
      return;
    }

    try {
      setIsSubmitting(true);

      // ========================================
      // Create Firebase Authentication User
      // ========================================

      const userCredential = await createUserWithEmailAndPassword(
        auth,
        normalizedEmail,
        password
      );

      const user = userCredential.user;

      try {
        // ========================================
        // Set Firebase Display Name
        // ========================================

        await updateProfile(user, {
          displayName: `${normalizedFirstName} ${normalizedLastName}`,
        });

        // ========================================
        // Create Passenger Firestore Profile
        // ========================================

        await setDoc(doc(db, "users", user.uid), {
          firstName: normalizedFirstName,
          lastName: normalizedLastName,
          phoneNumber: normalizedPhoneNumber,
          email: user.email ?? normalizedEmail,

          role: "passenger",
          authProvider: "password",

          photoURL: "",
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (profileError) {
        // ========================================
        // Roll Back Partial Registration
        // ========================================
        //
        // If Auth succeeds but Firestore profile
        // creation fails, remove the newly created
        // Auth user so the customer can retry.
        // ========================================

        try {
          await deleteUser(user);
        } catch (rollbackError) {
          console.error(
            "Unable to roll back Firebase Auth user:",
            rollbackError
          );
        }

        throw profileError;
      }

      // ========================================
      // Redirect To Passenger Dashboard
      // ========================================

      router.replace("/passenger/dashboard");
    } catch (error) {
      console.error("Signup error:", error);

      setMessage(getSignupErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  // ========================================
  // Google Signup
  // ========================================

  async function handleGoogleSignup() {
    setMessage("");

    if (!acceptedTerms) {
      setMessage(
        "Please accept the Terms of Service and Privacy Policy before continuing."
      );
      return;
    }

    try {
      setIsGoogleSubmitting(true);

      // ========================================
      // Google Provider
      // ========================================

      const provider = new GoogleAuthProvider();

      provider.setCustomParameters({
        prompt: "select_account",
      });

      // ========================================
      // Authenticate With Google
      // ========================================

      const userCredential = await signInWithPopup(auth, provider);
      const user = userCredential.user;

      // ========================================
      // Check Existing Passenger Profile
      // ========================================

      const userReference = doc(db, "users", user.uid);
      const existingProfile = await getDoc(userReference);

      // ========================================
      // Create Profile For New Google User
      // ========================================

      if (!existingProfile.exists()) {
        const displayNameParts =
          user.displayName?.trim().split(/\s+/) ?? [];

        const googleFirstName =
          displayNameParts[0] ?? "";

        const googleLastName =
          displayNameParts.length > 1
            ? displayNameParts.slice(1).join(" ")
            : "";

        await setDoc(userReference, {
          firstName: googleFirstName,
          lastName: googleLastName,

          phoneNumber: user.phoneNumber ?? "",
          email: user.email?.toLowerCase() ?? "",

          role: "passenger",
          authProvider: "google",

          photoURL: user.photoURL ?? "",

          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } else {
        // ========================================
        // Prevent Wrong Role From Passenger Area
        // ========================================

        const profileData = existingProfile.data();

        if (profileData.role !== "passenger") {
          setMessage(
            "This account is not registered as a passenger account."
          );
          return;
        }
      }

      // ========================================
      // Redirect To Passenger Dashboard
      // ========================================

      router.replace("/passenger/dashboard");
    } catch (error) {
      console.error("Google signup error:", error);

      setMessage(getSignupErrorMessage(error));
    } finally {
      setIsGoogleSubmitting(false);
    }
  }

  // ========================================
  // Page UI
  // ========================================

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f9f7ff] px-5 py-10">
      <div className="w-full max-w-lg rounded-[28px] border border-[#e2e1e8] bg-white p-7 shadow-[0_12px_35px_rgba(0,36,81,0.06)] sm:p-9">

        {/* ========================================
            Zano Logo
        ======================================== */}

        <div className="flex justify-center">
          <Image
            src="/zano.webp"
            alt="Zano - Ride. Connect. Go."
            width={220}
            height={220}
            priority
            className="h-auto w-40 object-contain sm:w-44"
          />
        </div>

        {/* ========================================
            Page Heading
        ======================================== */}

        <div className="mt-3 text-center">
          <h1 className="text-3xl font-extrabold tracking-tight text-[var(--zano-navy)]">
            Create account
          </h1>

          <p className="mt-2 text-sm leading-6 text-[var(--zano-muted)]">
            Create your Zano passenger account and start your journey.
          </p>
        </div>

        {/* ========================================
            Signup Form
        ======================================== */}

        <form onSubmit={handleSubmit} className="mt-8 space-y-5">

          {/* ========================================
              Passenger Name
          ======================================== */}

          <div className="grid gap-5 sm:grid-cols-2">
            <FormField
              id="firstName"
              label="First name"
              type="text"
              value={firstName}
              onChange={setFirstName}
              placeholder="First name"
              autoComplete="given-name"
              disabled={isBusy}
            />

            <FormField
              id="lastName"
              label="Last name"
              type="text"
              value={lastName}
              onChange={setLastName}
              placeholder="Last name"
              autoComplete="family-name"
              disabled={isBusy}
            />
          </div>

          {/* ========================================
              Phone Number
          ======================================== */}

          <FormField
            id="phoneNumber"
            label="Phone number"
            type="tel"
            value={phoneNumber}
            onChange={setPhoneNumber}
            placeholder="+233..."
            autoComplete="tel"
            disabled={isBusy}
          />

          {/* ========================================
              Email
          ======================================== */}

          <FormField
            id="email"
            label="Email address"
            type="email"
            value={email}
            onChange={setEmail}
            placeholder="you@example.com"
            autoComplete="email"
            disabled={isBusy}
          />

          {/* ========================================
              Password
          ======================================== */}

          <div>
            <FormField
              id="password"
              label="Password"
              type="password"
              value={password}
              onChange={setPassword}
              placeholder="Create a password"
              autoComplete="new-password"
              disabled={isBusy}
              minLength={MIN_PASSWORD_LENGTH}
            />

            <p className="mt-2 text-xs leading-5 text-[var(--zano-muted)]">
              Minimum 8 characters with at least one letter and one number.
            </p>
          </div>

          {/* ========================================
              Confirm Password
          ======================================== */}

          <FormField
            id="confirmPassword"
            label="Confirm password"
            type="password"
            value={confirmPassword}
            onChange={setConfirmPassword}
            placeholder="Confirm your password"
            autoComplete="new-password"
            disabled={isBusy}
            minLength={MIN_PASSWORD_LENGTH}
          />

          {/* ========================================
              Terms And Privacy
          ======================================== */}

          <label className="flex cursor-pointer items-start gap-3 text-sm leading-6 text-[var(--zano-muted)]">
            <input
              type="checkbox"
              checked={acceptedTerms}
              disabled={isBusy}
              onChange={(event) =>
                setAcceptedTerms(event.target.checked)
              }
              className="mt-1 h-4 w-4 shrink-0 accent-[var(--zano-orange)]"
            />

            <span>
              I agree to the{" "}
              <Link
                href="/terms"
                className="font-semibold text-[var(--zano-blue)] hover:underline"
              >
                Terms of Service
              </Link>{" "}
              and{" "}
              <Link
                href="/privacy"
                className="font-semibold text-[var(--zano-blue)] hover:underline"
              >
                Privacy Policy
              </Link>
              .
            </span>
          </label>

          {/* ========================================
              Create Account Button
          ======================================== */}

          <button
            type="submit"
            disabled={isBusy}
            className="flex w-full items-center justify-center rounded-2xl bg-[var(--zano-orange)] px-4 py-3.5 font-bold text-white shadow-[0_8px_18px_rgba(255,116,23,0.18)] transition hover:opacity-95 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting
              ? "Creating account..."
              : "Create account"}
          </button>
        </form>

        {/* ========================================
            Divider
        ======================================== */}

        <div className="my-7 flex items-center gap-4">
          <div className="h-px flex-1 bg-[var(--zano-border)]" />

          <span className="whitespace-nowrap text-sm text-[var(--zano-muted)]">
            or continue with
          </span>

          <div className="h-px flex-1 bg-[var(--zano-border)]" />
        </div>

        {/* ========================================
            Google Signup
        ======================================== */}

        <button
          type="button"
          onClick={handleGoogleSignup}
          disabled={isBusy}
          className="flex w-full items-center justify-center gap-3 rounded-2xl border border-[var(--zano-border)] bg-white px-4 py-3.5 font-semibold text-[var(--zano-navy)] transition hover:bg-[#fafafa] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
        >
          <GoogleIcon />

          {isGoogleSubmitting
            ? "Connecting to Google..."
            : "Continue with Google"}
        </button>

        {/* ========================================
            Status / Error Message
        ======================================== */}

        {message && (
          <div
            role="alert"
            aria-live="polite"
            className="mt-5 rounded-xl bg-[#fff5ef] px-4 py-3 text-center text-sm font-medium text-[#9a3f0b]"
          >
            {message}
          </div>
        )}

        {/* ========================================
            Login Link
        ======================================== */}

        <p className="mt-7 text-center text-sm text-[var(--zano-muted)]">
          Already have an account?{" "}
          <Link
            href="/login"
            className="font-bold text-[var(--zano-orange)] transition hover:opacity-80"
          >
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}

// ========================================
// Reusable Form Field
// ========================================

type FormFieldProps = {
  id: string;
  label: string;
  type: string;
  value: string;
  placeholder: string;
  autoComplete: string;
  disabled: boolean;
  minLength?: number;
  onChange: (value: string) => void;
};

function FormField({
  id,
  label,
  type,
  value,
  placeholder,
  autoComplete,
  disabled,
  minLength,
  onChange,
}: FormFieldProps) {
  return (
    <div>
      <label
        htmlFor={id}
        className="mb-2 block text-sm font-semibold text-[#333947]"
      >
        {label}
      </label>

      <input
        id={id}
        name={id}
        type={type}
        value={value}
        required
        minLength={minLength}
        autoComplete={autoComplete}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-2xl border border-[var(--zano-border)] bg-white px-4 py-3.5 text-[#141b31] outline-none transition placeholder:text-[#a2a4ad] focus:border-[var(--zano-blue)] focus:ring-2 focus:ring-[var(--zano-blue)]/15 disabled:cursor-not-allowed disabled:bg-gray-50"
      />
    </div>
  );
}

// ========================================
// Validation Helpers
// ========================================

function isValidPhoneNumber(phoneNumber: string) {
  const cleanedPhoneNumber = phoneNumber.replace(/[\s()-]/g, "");

  return /^\+?[0-9]{9,15}$/.test(cleanedPhoneNumber);
}

function isStrongEnoughPassword(password: string) {
  return /[A-Za-z]/.test(password) && /[0-9]/.test(password);
}

// ========================================
// Firebase Error Handler
// ========================================

function getSignupErrorMessage(error: unknown) {
  if (!(error instanceof FirebaseError)) {
    return "Unable to create your account. Please try again.";
  }

  switch (error.code) {
    case "auth/email-already-in-use":
      return "An account already exists with this email address.";

    case "auth/invalid-email":
      return "Please enter a valid email address.";

    case "auth/weak-password":
      return "Your password is too weak.";

    case "auth/operation-not-allowed":
      return "This sign-up method is currently unavailable.";

    case "auth/network-request-failed":
      return "Unable to connect to the authentication service.";

    case "auth/popup-closed-by-user":
      return "Google sign-up was cancelled.";

    case "auth/popup-blocked":
      return "Your browser blocked the Google sign-up window.";

    case "auth/cancelled-popup-request":
      return "Another sign-in window is already open.";

    case "permission-denied":
    case "firestore/permission-denied":
      return "Your account could not be completed. Please try again.";

    default:
      return "Unable to create your account. Please try again.";
  }
}

// ========================================
// Google Icon
// ========================================

function GoogleIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        fill="#4285F4"
        d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.8h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.8 3-4.3 3-7.3Z"
      />

      <path
        fill="#34A853"
        d="M12 22c2.7 0 5-.9 6.6-2.5l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.2H3.1v2.6A10 10 0 0 0 12 22Z"
      />

      <path
        fill="#FBBC05"
        d="M6.4 13.8A6 6 0 0 1 6.1 12c0-.6.1-1.2.3-1.8V7.6H3.1A10 10 0 0 0 2 12c0 1.6.4 3.1 1.1 4.4l3.3-2.6Z"
      />

      <path
        fill="#EA4335"
        d="M12 6c1.5 0 2.9.5 3.9 1.5l2.9-2.9A9.8 9.8 0 0 0 12 2 10 10 0 0 0 3.1 7.6l3.3 2.6C7.2 7.8 9.4 6 12 6Z"
      />
    </svg>
  );
}