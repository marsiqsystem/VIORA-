"use client";

import { useWixClient } from "@/hooks/useWixClient";
import { LoginState } from "@wix/sdk";
import Cookies from "js-cookie";
import { useEffect, useState, useRef } from "react";
import { createPortal } from "react-dom";
import { trackCompleteRegistration } from "@/lib/metaPixel";
import {
  getInvisibleCaptchaToken,
  getVisibleCaptchaResponse,
  renderVisibleCaptcha,
  resetVisibleCaptcha,
} from "@/lib/wixCaptcha";

type Mode = "LOGIN" | "REGISTER" | "VERIFY";

// Helper: detect if running on localhost (where reCAPTCHA keys won't work)
const isLocalhost = (): boolean => {
  if (typeof window === "undefined") return false;
  const h = window.location.hostname;
  return h === "localhost" || h === "127.0.0.1" || h === "[::1]";
};

// Guard Wix auth calls so a hung request can't leave the modal stuck loading.
const withTimeout = <T,>(promise: Promise<T>, ms = 25000): Promise<T> =>
  Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error("AUTH_TIMEOUT")), ms)
    ),
  ]);

interface LoginModalProps {
  open: boolean;
  onClose: () => void;
  onLoggedIn?: () => void;
}

const LoginModal = ({ open, onClose, onLoggedIn }: LoginModalProps) => {
  const wixClient = useWixClient();
  const [mode, setMode] = useState<Mode>("LOGIN");
  const [username, setUsername] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [pendingVerificationState, setPendingVerificationState] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [mounted, setMounted] = useState(false);
  const [isCaptchaRequired, setIsCaptchaRequired] = useState(false);
  // Seconds left before the customer may request a fresh OTP again.
  const [resendCooldown, setResendCooldown] = useState(0);

  const captchaVisibleSiteKey = wixClient.auth.captchaVisibleSiteKey;
  const captchaInvisibleSiteKey = wixClient.auth.captchaInvisibleSiteKey;

  const captchaContainerRef = useRef<HTMLDivElement>(null);
  const captchaWidgetIdRef = useRef<number | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
      setIsCaptchaRequired(false);
    } else {
      document.body.style.overflow = "";
      setError("");
      setMessage("");
      setPassword("");
      setVerificationCode("");
      setPendingVerificationState(null);
      setMode("LOGIN");
      captchaWidgetIdRef.current = null;
      setIsCaptchaRequired(false);
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  useEffect(() => {
    setIsCaptchaRequired(false);
    setError("");
    setMessage("");
  }, [mode]);

  useEffect(() => {
    if (mode !== "REGISTER" || !captchaContainerRef.current || !captchaVisibleSiteKey || !isCaptchaRequired) return;
    let cancelled = false;
    renderVisibleCaptcha(captchaContainerRef.current, captchaVisibleSiteKey)
      .then((id) => {
        if (!cancelled) captchaWidgetIdRef.current = id;
      })
      .catch((err) => {
        console.error("[captcha] Failed to render reCAPTCHA:", err);
      });
    return () => {
      cancelled = true;
    };
  }, [mode, captchaVisibleSiteKey, isCaptchaRequired]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Tick the resend cooldown down to zero, once per second.
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setInterval(
      () => setResendCooldown((s) => (s <= 1 ? 0 : s - 1)),
      1000
    );
    return () => clearInterval(t);
  }, [resendCooldown]);

  if (!mounted || !open) return null;

  // Shared post-success handler — exchanges Wix sessionToken for member tokens,
  // persists the refresh token, and finishes the modal flow. Called both on
  // direct LOGIN success and on successful OTP verification.
  const finalizeLogin = async (sessionToken: string, justRegistered: boolean) => {
    const tokens = await withTimeout(
      wixClient.auth.getMemberTokensForDirectLogin(sessionToken)
    );
    Cookies.set("refreshToken", JSON.stringify(tokens.refreshToken), { expires: 2 });
    wixClient.auth.setTokens(tokens);
    if (justRegistered) trackCompleteRegistration("email");
    onLoggedIn?.();
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");
    setMessage("");

    try {
      // VERIFY mode: user is entering the 6-digit OTP Wix emailed them.
      if (mode === "VERIFY") {
        const code = verificationCode.trim();
        if (!/^\d{4,8}$/.test(code)) {
          setError("Enter the code Wix emailed you (usually 6 digits).");
          setIsLoading(false);
          return;
        }
        const verifyResponse = await withTimeout(
          wixClient.auth.processVerification({
            verificationCode: code,
            code,
          } as any, pendingVerificationState || undefined)
        );
        if (verifyResponse?.loginState === LoginState.SUCCESS) {
          setMessage("Verified! Logging you in...");
          await finalizeLogin(verifyResponse.data.sessionToken!, true);
          return;
        }
        if (verifyResponse?.loginState === LoginState.FAILURE) {
          setError("That code didn't work. Double-check it or request a new one.");
          return;
        }
        setError("Verification didn't complete. Please try again.");
        return;
      }

      // LOGIN or REGISTER mode.
      let response;
      if (mode === "LOGIN") {
        const captchaTokens = (captchaInvisibleSiteKey && !isLocalhost())
          ? { invisibleRecaptchaToken: await getInvisibleCaptchaToken(captchaInvisibleSiteKey, "login") }
          : undefined;
        response = await withTimeout(
          wixClient.auth.login({
            email: identifier,
            password,
            captchaTokens,
          })
        );
      } else {
        let captchaTokens;
        if (captchaVisibleSiteKey && isCaptchaRequired && !isLocalhost()) {
          const recaptchaToken =
            captchaWidgetIdRef.current !== null
              ? getVisibleCaptchaResponse(captchaWidgetIdRef.current)
              : "";
          if (!recaptchaToken) {
            setError("Please complete the “I’m not a robot” check before registering.");
            setIsLoading(false);
            return;
          }
          captchaTokens = { recaptchaToken };
        }
        response = await withTimeout(
          wixClient.auth.register({
            email: identifier,
            password,
            profile: { nickname: username },
            captchaTokens,
          })
        );
      }

      switch (response?.loginState) {
        case LoginState.SUCCESS: {
          setMessage("Success! Logging you in...");
          await finalizeLogin(response.data.sessionToken!, mode === "REGISTER");
          break;
        }
        case LoginState.FAILURE:
          if (
            response.errorCode === "invalidEmail" ||
            response.errorCode === "invalidPassword"
          ) {
            setError("Invalid email or password.");
          } else if (response.errorCode === "emailAlreadyExists") {
            setError("That email is already registered.");
          } else if (response.errorCode === "resetPassword") {
            setError("You need to reset your password.");
          } else if (
            response.errorCode === "missingCaptchaToken" ||
            response.errorCode === "invalidCaptchaToken"
          ) {
            if (isLocalhost()) {
              setError(
                "Wix is still requiring reCAPTCHA even though you may have disabled it. This happens when the site hasn't been re-published after changing the setting. Please go to your Wix Dashboard → (1) Settings → Site Member Settings → Signup & Login Security → make sure reCAPTCHA is OFF, (2) click Save, (3) then click the Publish button at the top of the dashboard. After publishing, come back and try registering again."
              );
            } else if (!isCaptchaRequired) {
              setIsCaptchaRequired(true);
              setError("Security check required. Please complete the checkbox below and click Create Account again.");
            } else {
              setError(
                "Security check failed. Please try again or contact support."
              );
            }
          } else {
            setError("Something went wrong. Please try again.");
          }
          break;
        case LoginState.EMAIL_VERIFICATION_REQUIRED:
          setPendingVerificationState(response);
          setVerificationCode("");
          // Switch the modal into the OTP-entry step so the user can finish
          // signup inline instead of being told "check your email" with no
          // place to type the code.
          setMode("VERIFY");
          setMessage(`We sent a verification code to ${identifier}. Enter it below to finish signing in.`);
          break;
        case LoginState.OWNER_APPROVAL_REQUIRED:
          setMessage("Your account is pending approval.");
          break;
        default:
          break;
      }
    } catch (err: any) {
      console.error("WIX AUTH ERROR:", err);
      const raw = err?.message || "";
      const appDesc = err?.details?.applicationError?.description || "";
      const code = err?.details?.applicationError?.code || "";

      const isCaptchaError =
        code === "missingCaptchaToken" ||
        code === "invalidCaptchaToken" ||
        raw.includes("missingCaptchaToken") ||
        raw.includes("invalidCaptchaToken") ||
        appDesc.includes("missingCaptchaToken") ||
        appDesc.includes("invalidCaptchaToken");

      if (raw === "RECAPTCHA_LOAD_FAILED") {
        setError(
          "Couldn't load the security check. Please disable any ad-blocker for this site and try again."
        );
        return;
      }
      if (isCaptchaError) {
        if (isLocalhost()) {
          setError(
            "Wix is still requiring reCAPTCHA even though you may have disabled it. This happens when the site hasn't been re-published after changing the setting. Please go to your Wix Dashboard → (1) Settings → Site Member Settings → Signup & Login Security → make sure reCAPTCHA is OFF, (2) click Save, (3) then click the Publish button at the top of the dashboard. After publishing, come back and try registering again."
          );
        } else if (!isCaptchaRequired) {
          setIsCaptchaRequired(true);
          setError("Security check required. Please complete the checkbox below and click Create Account again.");
        } else {
          setError(
            "Security check failed. Please try again or contact support."
          );
        }
        return;
      }
      if (raw === "AUTH_TIMEOUT") {
        setError(
          "This is taking longer than expected. Please check your connection and try again."
        );
        return;
      }
      const isUnpublishedSite =
        code === "ASSERTION_FAILED" ||
        /No Public URL Found/i.test(raw) ||
        /No Public URL Found/i.test(appDesc) ||
        /site is published/i.test(raw) ||
        /site is published/i.test(appDesc);
      if (isUnpublishedSite) {
        setError(
          "Login is unavailable — the Wix site needs to be Published from the Wix dashboard before authentication will work."
        );
      } else {
        setError("Something went wrong. Please try again.");
      }
    } finally {
      setIsLoading(false);
      if (mode === "REGISTER" && captchaWidgetIdRef.current !== null) {
        resetVisibleCaptcha(captchaWidgetIdRef.current);
      }
    }
  };

  // Resend the OTP. Wix headless has no standalone "resend" endpoint, so we
  // re-run register() with the same details — Wix re-issues the code and hands
  // back a fresh verification state. Guarded by a 30s cooldown.
  const handleResend = async () => {
    if (isLoading || resendCooldown > 0) return;
    if (!identifier || !password) {
      setError("Your session expired. Tap “Use a different email” and sign up again.");
      return;
    }
    setError("");
    setMessage("");
    setIsLoading(true);
    try {
      let captchaTokens;
      if (captchaVisibleSiteKey && isCaptchaRequired && !isLocalhost()) {
        const recaptchaToken =
          captchaWidgetIdRef.current !== null
            ? getVisibleCaptchaResponse(captchaWidgetIdRef.current)
            : "";
        if (recaptchaToken) captchaTokens = { recaptchaToken };
      }
      const response = await withTimeout(
        wixClient.auth.register({
          email: identifier,
          password,
          profile: { nickname: username },
          captchaTokens,
        })
      );
      if (response?.loginState === LoginState.EMAIL_VERIFICATION_REQUIRED) {
        setPendingVerificationState(response);
        setVerificationCode("");
        setMessage(`A new code was sent to ${identifier}. Check your inbox and spam folder.`);
        setResendCooldown(30);
      } else if (response?.loginState === LoginState.SUCCESS) {
        setMessage("Verified! Logging you in...");
        await finalizeLogin(response.data.sessionToken!, true);
      } else if (
        response?.loginState === LoginState.FAILURE &&
        response.errorCode === "emailAlreadyExists"
      ) {
        setError("This email is already verified. Please log in instead.");
      } else {
        setError("Couldn't resend the code. Please try again in a moment.");
      }
    } catch {
      setError("Couldn't resend the code. Please check your connection and try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const modal = (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/55 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Login or register"
    >
      <div
        className="relative w-full max-w-md rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3 top-3 inline-flex h-9 w-9 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <div className="p-6 md:p-8">
          {/* Catchy Note */}
          <div
            className="mb-6 rounded-xl border-2 bg-gradient-to-br from-[#9B1B30]/5 via-white to-[#9B1B30]/5 p-4 text-sm leading-relaxed text-[#1A1410]"
            style={{ borderColor: "#9B1B30" }}
          >
            <p className="font-playfair text-base font-semibold text-[#9B1B30] mb-1">
              ✨ Save Your Spark! ✨
            </p>
            <p>
              Please log in to add these beautiful pieces to your Wishlist. This
              ensures your curated dream jewels are saved forever, even after
              you close the website. Don&rsquo;t lose your favorites! ❤️
            </p>
          </div>

          <h2 className="font-playfair text-2xl font-bold text-primary mb-1">
            {mode === "LOGIN"
              ? "Welcome Back"
              : mode === "REGISTER"
                ? "Create Your Account"
                : "Verify Your Email"}
          </h2>
          <p className="text-sm text-gray-500 mb-5">
            {mode === "LOGIN"
              ? "Log in to save your favorites and track orders."
              : mode === "REGISTER"
                ? "Join Viora to save your wishlist across devices."
                : "Enter the verification code we just sent to your inbox."}
          </p>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {/* REGISTER-only username */}
            {mode === "REGISTER" && (
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-gray-700">Username</label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Your name"
                  className="rounded-lg border border-gray-300 px-4 py-3 text-sm outline-none focus:border-[#9B1B30] focus:ring-2 focus:ring-[#9B1B30]/20"
                />
              </div>
            )}

            {/* Email + Password for LOGIN/REGISTER */}
            {mode !== "VERIFY" && (
              <>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-gray-700">Email</label>
                  <input
                    type="email"
                    required
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder="you@example.com"
                    className="rounded-lg border border-gray-300 px-4 py-3 text-sm outline-none focus:border-[#9B1B30] focus:ring-2 focus:ring-[#9B1B30]/20"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-gray-700">Password</label>
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter password"
                    className="rounded-lg border border-gray-300 px-4 py-3 text-sm outline-none focus:border-[#9B1B30] focus:ring-2 focus:ring-[#9B1B30]/20"
                  />
                </div>
              </>
            )}

            {/* Visible reCAPTCHA — hidden on localhost since keys are bound to production domain. */}
            {mode === "REGISTER" && captchaVisibleSiteKey && isCaptchaRequired && !isLocalhost() && (
              <div ref={captchaContainerRef} className="flex justify-center my-2" />
            )}

            {/* OTP-only code input */}
            {mode === "VERIFY" && (
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-gray-700">
                  Verification Code
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  required
                  value={verificationCode}
                  onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, ""))}
                  placeholder="6-digit code"
                  maxLength={8}
                  className="rounded-lg border border-gray-300 px-4 py-3 text-center text-lg font-mono tracking-[0.4em] outline-none focus:border-[#9B1B30] focus:ring-2 focus:ring-[#9B1B30]/20"
                />
                <p className="text-xs text-gray-500">
                  Sent to <span className="font-medium">{identifier}</span>. Check your spam folder if you don&apos;t see it.
                </p>
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={isLoading || resendCooldown > 0}
                  className="self-start text-xs font-medium text-[#9B1B30] hover:underline disabled:cursor-not-allowed disabled:text-gray-400 disabled:no-underline"
                >
                  {resendCooldown > 0
                    ? `Resend code in ${resendCooldown}s`
                    : "Didn't get it? Resend code"}
                </button>
              </div>
            )}

            {error && (
              <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            )}
            {message && (
              <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
                {message}
              </p>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="mt-1 rounded-lg bg-[#9B1B30] py-3 text-sm font-semibold uppercase tracking-wider text-white transition-colors hover:bg-[#7d1527] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isLoading
                ? "Please wait..."
                : mode === "LOGIN"
                  ? "Log In"
                  : mode === "REGISTER"
                    ? "Create Account"
                    : "Verify & Continue"}
            </button>
          </form>

          <div className="mt-4 text-center text-sm text-gray-600">
            {mode === "LOGIN" && (
              <>
                Don&apos;t have an account?{" "}
                <button
                  type="button"
                  onClick={() => setMode("REGISTER")}
                  className="font-medium text-[#9B1B30] hover:underline"
                >
                  Sign up
                </button>
              </>
            )}
            {mode === "REGISTER" && (
              <>
                Already have an account?{" "}
                <button
                  type="button"
                  onClick={() => setMode("LOGIN")}
                  className="font-medium text-[#9B1B30] hover:underline"
                >
                  Log in
                </button>
              </>
            )}
            {mode === "VERIFY" && (
              <button
                type="button"
                onClick={() => {
                  setMode("REGISTER");
                  setVerificationCode("");
                  setError("");
                  setMessage("");
                }}
                className="font-medium text-[#9B1B30] hover:underline"
              >
                Use a different email
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
};

export default LoginModal;
