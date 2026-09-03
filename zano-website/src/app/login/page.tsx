"use client";

// ========================================
// Imports
// ========================================

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

import {
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  signInWithPopup,
} from "firebase/auth";

import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";

import { FirebaseError } from "firebase/app";

import { auth, db } from "@/lib/firebase/client";

// ========================================
// Login Page
// ========================================

export default function LoginPage() {
  const router = useRouter();

  // ========================================
  // Form State
  // ========================================

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // ========================================
  // UI State
  // ========================================

  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGoogleSubmitting, setIsGoogleSubmitting] = useState(false);

  // ========================================
  // Email And Password Login
  // ========================================

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");

    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail || !password) {
      setMessage("Please enter your email and password.");
      return;
    }

    try {
      setIsSubmitting(true);

      const userCredential = await signInWithEmailAndPassword(
        auth,
        normalizedEmail,
        password
      );

      const user = userCredential.user;

      // ========================================
      // Verify Passenger Profile Exists
      // ========================================

      const userReference = doc(db, "users", user.uid);
      const userProfile = await getDoc(userReference);

      if (!userProfile.exists()) {
        setMessage(
          "Your account exists, but your passenger profile could not be found."
        );
        return;
      }

      const profileData = userProfile.data();

      // ========================================
      // Role Protection
      // ========================================

      if (profileData.role !== "passenger") {
        setMessage(
          "This sign-in page is currently for passenger accounts only."
        );
        return;
      }

      // ========================================
      // Redirect
      // ========================================

      router.replace("/passenger/dashboard");
    } catch (error) {
      setMessage(getLoginErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  // ========================================
  // Google Login
  // ========================================

  async function handleGoogleLogin() {
    setMessage("");

    try {
      setIsGoogleSubmitting(true);

      const provider = new GoogleAuthProvider();

      provider.setCustomParameters({
        prompt: "select_account",
      });

      const userCredential = await signInWithPopup(auth, provider);
      const user = userCredential.user;

      // ========================================
      // Check Passenger Profile
      // ========================================

      const userReference = doc(db, "users", user.uid);
      const userProfile = await getDoc(userReference);

      // ========================================
      // Create Profile For New Google User
      // ========================================

      if (!userProfile.exists()) {
        const nameParts = user.displayName?.trim().split(/\s+/) ?? [];

        const firstName = nameParts[0] ?? "";

        const lastName =
          nameParts.length > 1
            ? nameParts.slice(1).join(" ")
            : "";

        await setDoc(userReference, {
          firstName,
          lastName,
          phoneNumber: user.phoneNumber ?? "",
          email: user.email?.toLowerCase() ?? "",
          role: "passenger",
          authProvider: "google",
          photoURL: user.photoURL ?? "",
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } else {
        const profileData = userProfile.data();

        if (profileData.role !== "passenger") {
          setMessage(
            "This sign-in page is currently for passenger accounts only."
          );
          return;
        }
      }

      // ========================================
      // Redirect
      // ========================================

      router.replace("/passenger/dashboard");
    } catch (error) {
      setMessage(getLoginErrorMessage(error));
    } finally {
      setIsGoogleSubmitting(false);
    }
  }

  // ========================================
  // Page UI
  // ========================================

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f9f7ff] px-5 py-10">
      <div className="w-full max-w-md rounded-[28px] border border-[#e2e1e8] bg-white p-7 shadow-[0_12px_35px_rgba(0,36,81,0.06)] sm:p-9">

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
            Heading
        ======================================== */}

        <div className="mt-3 text-center">
          <h1 className="text-3xl font-extrabold tracking-tight text-[var(--zano-navy)]">
            Welcome back
          </h1>

          <p className="mt-2 text-sm leading-6 text-[var(--zano-muted)]">
            Sign in to continue your journey with Zano.
          </p>
        </div>

        {/* ========================================
            Login Form
        ======================================== */}

        <form onSubmit={handleSubmit} className="mt-8 space-y-5">
          <div>
            <label
              htmlFor="email"
              className="mb-2 block text-sm font-semibold text-[#333947]"
            >
              Email address
            </label>

            <input
              id="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              autoComplete="email"
              inputMode="email"
              placeholder="you@example.com"
              disabled={isSubmitting || isGoogleSubmitting}
              className="w-full rounded-2xl border border-[var(--zano-border)] bg-white px-4 py-3.5 text-[#141b31] outline-none transition placeholder:text-[#a2a4ad] focus:border-[var(--zano-blue)] focus:ring-2 focus:ring-[var(--zano-blue)]/15 disabled:cursor-not-allowed disabled:bg-gray-50"
            />
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <label
                htmlFor="password"
                className="block text-sm font-semibold text-[#333947]"
              >
                Password
              </label>

              <Link
                href="/forgot-password"
                className="text-sm font-semibold text-[var(--zano-blue)] transition hover:opacity-80"
              >
                Forgot password?
              </Link>
            </div>

            <input
              id="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              minLength={6}
              autoComplete="current-password"
              placeholder="Enter your password"
              disabled={isSubmitting || isGoogleSubmitting}
              className="w-full rounded-2xl border border-[var(--zano-border)] bg-white px-4 py-3.5 text-[#141b31] outline-none transition placeholder:text-[#a2a4ad] focus:border-[var(--zano-blue)] focus:ring-2 focus:ring-[var(--zano-blue)]/15 disabled:cursor-not-allowed disabled:bg-gray-50"
            />
          </div>

          {/* ========================================
              Sign In Button
          ======================================== */}

          <button
            type="submit"
            disabled={isSubmitting || isGoogleSubmitting}
            className="flex w-full items-center justify-center rounded-2xl bg-[var(--zano-orange)] px-4 py-3.5 font-bold text-white shadow-[0_8px_18px_rgba(255,116,23,0.18)] transition hover:opacity-95 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? "Signing in..." : "Sign in"}
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
            Google Login
        ======================================== */}

        <button
          type="button"
          onClick={handleGoogleLogin}
          disabled={isSubmitting || isGoogleSubmitting}
          className="flex w-full items-center justify-center gap-3 rounded-2xl border border-[var(--zano-border)] bg-white px-4 py-3.5 font-semibold text-[var(--zano-navy)] transition hover:bg-[#fafafa] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
        >
          <GoogleIcon />

          {isGoogleSubmitting
            ? "Connecting to Google..."
            : "Continue with Google"}
        </button>

        {/* ========================================
            Status Message
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
            Signup Link
        ======================================== */}

        <p className="mt-7 text-center text-sm text-[var(--zano-muted)]">
          Don&apos;t have an account?{" "}
          <Link
            href="/signup"
            className="font-bold text-[var(--zano-orange)] transition hover:opacity-80"
          >
            Create account
          </Link>
        </p>
      </div>
    </main>
  );
}

// ========================================
// Firebase Error Handler
// ========================================

function getLoginErrorMessage(error: unknown) {
  if (!(error instanceof FirebaseError)) {
    return "Unable to sign in. Please try again.";
  }

  switch (error.code) {
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "Incorrect email or password.";

    case "auth/invalid-email":
      return "Please enter a valid email address.";

    case "auth/user-disabled":
      return "This account has been disabled.";

    case "auth/too-many-requests":
      return "Too many sign-in attempts. Please try again later.";

    case "auth/network-request-failed":
      return "Unable to connect to the authentication service.";

    case "auth/popup-closed-by-user":
      return "Google sign-in was cancelled.";

    case "auth/popup-blocked":
      return "Your browser blocked the Google sign-in window.";

    case "auth/cancelled-popup-request":
      return "Another sign-in window is already open.";

    default:
      console.error("Firebase login error:", error);
      return "Unable to sign in. Please try again.";
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