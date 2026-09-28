"use client";

import { useWixClient } from "@/hooks/useWixClient";
import { LoginState } from "@wix/sdk";
import { useRouter, useSearchParams } from "next/navigation";
import Cookies from "js-cookie";
import { Suspense, useEffect, useRef, useState } from "react";
import { trackCompleteRegistration } from "@/lib/metaPixel";
import BackButton from "@/components/BackButton";
import Link from "next/link";
import { REVIEW_REWARD } from "@/lib/checkoutPricing";
import {
  getInvisibleCaptchaToken,
  getVisibleCaptchaResponse,
  renderVisibleCaptcha,
  resetVisibleCaptcha,
} from "@/lib/wixCaptcha";

enum MODE {
  LOGIN = "LOGIN",
  REGISTER = "REGISTER",
  RESET_PASSWORD = "RESET_PASSWORD",
  EMAIL_VERIFICATION = "EMAIL_VERIFICATION",
}

const FRIENDLY_FAILURE =
  "We couldn't log you in right now. Please try again in a minute, or WhatsApp us and we'll help. You can always check out without an account.";

// Helper: detect if running on localhost (where reCAPTCHA keys won't work)
const isLocalhost = (): boolean => {
  if (typeof window === "undefined") return false;
  const h = window.location.hostname;
  return h === "localhost" || h === "127.0.0.1" || h === "[::1]";
};

// Helper: detect if the identifier looks like a phone number
const isPhoneNumber = (value: string): boolean => {
  const cleaned = value.replace(/[\s\-()]/g, "");
  return /^\+?\d{10,15}$/.test(cleaned);
};

// Guard every Wix auth network call so a hung request can never leave the
// button stuck on "Loading...". If the call doesn't settle in time we reject
// with a TIMEOUT error that the catch block turns into a friendly message.
const withTimeout = <T,>(promise: Promise<T>, ms = 25000): Promise<T> =>
  Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error("AUTH_TIMEOUT")), ms)
    ),
  ]);

const LoginContent = () => {
  const wixClient = useWixClient();
  const router = useRouter();
  const searchParams = useSearchParams();

  const isLoggedIn = wixClient.auth.loggedIn();
  const redirectParam = searchParams.get("redirectTo") || "/";
  const redirectTo =
    redirectParam.startsWith("/") && !redirectParam.startsWith("//")
      ? redirectParam
      : "/";

  useEffect(() => {
    if (isLoggedIn) {
      router.replace(redirectTo);
    }
  }, [isLoggedIn, redirectTo, router]);

  const [mode, setMode] = useState(MODE.LOGIN);

  const [username, setUsername] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [emailCode, setEmailCode] = useState("");
  const [pendingVerificationState, setPendingVerificationState] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [isCaptchaRequired, setIsCaptchaRequired] = useState(false);
  // Seconds left before the customer may request a fresh OTP again.
  const [resendCooldown, setResendCooldown] = useState(0);

  // Wix's reCAPTCHA Enterprise site keys, exposed by the SDK.
  const captchaVisibleSiteKey = wixClient.auth.captchaVisibleSiteKey;
  const captchaInvisibleSiteKey = wixClient.auth.captchaInvisibleSiteKey;

  // Visible reCAPTCHA widget (register only).
  const captchaContainerRef = useRef<HTMLDivElement>(null);
  const captchaWidgetIdRef = useRef<number | null>(null);

  useEffect(() => {
    setIsCaptchaRequired(false);
  }, [mode]);

  // Tick the resend cooldown down to zero, once per second.
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setInterval(
      () => setResendCooldown((s) => (s <= 1 ? 0 : s - 1)),
      1000
    );
    return () => clearInterval(t);
  }, [resendCooldown]);

  // Render the visible reCAPTCHA checkbox whenever the user is on the Register
  // screen. The container only exists in REGISTER mode, so re-render on switch.
  useEffect(() => {
    if (mode !== MODE.REGISTER || !captchaContainerRef.current || !captchaVisibleSiteKey || !isCaptchaRequired) return;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, captchaVisibleSiteKey, isCaptchaRequired]);

  const formTitle =
    mode === MODE.LOGIN
      ? "Log in"
      : mode === MODE.REGISTER
      ? "Register"
      : mode === MODE.RESET_PASSWORD
      ? "Reset Your Password"
      : "Verify Your Email";

  const buttonTitle =
    mode === MODE.LOGIN
      ? "Login"
      : mode === MODE.REGISTER
      ? "Register"
      : mode === MODE.RESET_PASSWORD
      ? "Reset"
      : "Verify";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");
    setMessage("");

    // TASK 4 FIX: Validate phone number vs email
    // Wix Headless auth requires an email address for login/register.
    // If user enters a phone number, show a helpful message.
    if (
      (mode === MODE.LOGIN || mode === MODE.REGISTER || mode === MODE.RESET_PASSWORD) &&
      isPhoneNumber(identifier)
    ) {
      setError("Accounts use your email address — please enter your email instead of a phone number.");
      setIsLoading(false);
      return;
    }

    try {
      let response;

      switch (mode) {
        case MODE.LOGIN: {
          // Skip invisible reCAPTCHA on localhost — keys are bound to production domain
          let captchaTokens;
          if (captchaInvisibleSiteKey && !isLocalhost()) {
            try {
              captchaTokens = {
                invisibleRecaptchaToken: await getInvisibleCaptchaToken(
                  captchaInvisibleSiteKey,
                  "login"
                ),
              };
            } catch (captchaErr) {
              // reCAPTCHA Enterprise rejected the site key or failed to load
              // ("Invalid site key or not loaded in api.js"). Don't hard-fail
              // the login — attempt without a token. If Wix actually enforces
              // CAPTCHA it returns `missingCaptchaToken`, which the handlers
              // below turn into actionable guidance.
              console.warn(
                "[captcha] invisible token unavailable, attempting login without it:",
                captchaErr
              );
              captchaTokens = undefined;
            }
          }
          response = await withTimeout(
            wixClient.auth.login({
              email: identifier,
              password,
              captchaTokens,
            })
          );
          break;
        }
        case MODE.REGISTER: {
          let captchaTokens;
          // Skip CAPTCHA entirely on localhost — keys are bound to production domain
          if (captchaVisibleSiteKey && isCaptchaRequired && !isLocalhost()) {
            const recaptchaToken =
              captchaWidgetIdRef.current !== null
                ? getVisibleCaptchaResponse(captchaWidgetIdRef.current)
                : "";
            if (!recaptchaToken) {
              setError(
                "Please complete the “I’m not a robot” check before registering."
              );
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
          break;
        }
        case MODE.RESET_PASSWORD:
          response = await withTimeout(
            wixClient.auth.sendPasswordResetEmail(
              identifier,
              `${window.location.origin}/login`
            )
          );
          setMessage(
            `If an account exists for ${identifier}, we've emailed a link to set a new password. Check your inbox and spam folder, then come back here to log in.`
          );
          break;
        case MODE.EMAIL_VERIFICATION:
          const code = emailCode.trim();
          if (!/^\d{4,8}$/.test(code)) {
            setError("Enter the verification code Wix emailed you. It is usually 6 digits.");
            setIsLoading(false);
            return;
          }
          response = await withTimeout(
            wixClient.auth.processVerification({
              verificationCode: code,
              code,
            } as any, pendingVerificationState || undefined)
          );
          break;
        default:
          break;
      }

      // TASK 4 FIX: Detailed response state handling
      switch (response?.loginState) {
        case LoginState.SUCCESS: {
          const tokens = await withTimeout(
            wixClient.auth.getMemberTokensForDirectLogin(
              response.data.sessionToken!
            )
          );
          // 30 days, like the visitor session the middleware issues — at 2 days
          // members were silently logged out before most repeat visits.
          Cookies.set("refreshToken", JSON.stringify(tokens.refreshToken), { expires: 30, sameSite: "lax" });
          wixClient.auth.setTokens(tokens);
          if (mode === MODE.REGISTER) {
            trackCompleteRegistration("email");
          }
          setMessage("Successful! You are being redirected.");
          router.push(redirectTo);
          break;
        }
        case LoginState.FAILURE:
          console.error("[login] Wix auth failure:", response.errorCode);

          if (
            response.errorCode === "invalidEmail" ||
            response.errorCode === "invalidPassword"
          ) {
            setError("That email and password don't match. Try again, or tap Forgot password.");
          } else if (response.errorCode === "emailAlreadyExists") {
            setError("You already have an account with this email — log in instead.");
          } else if (response.errorCode === "resetPassword") {
            setError("Please reset your password to continue (tap Forgot password).");
          } else if (
            response.errorCode === "missingCaptchaToken" ||
            response.errorCode === "invalidCaptchaToken"
          ) {
            if (isLocalhost() || mode === MODE.LOGIN) {
              // Login uses INVISIBLE reCAPTCHA (no checkbox the user can solve),
              // so if Wix still demands a token but the key won't validate, the
              // only fix is in the Wix dashboard. Same guidance on localhost.
              console.error("[login] reCAPTCHA rejected — check Wix Site Members → Signup & Login Security.");
              setError(FRIENDLY_FAILURE);
            } else if (!isCaptchaRequired) {
              setIsCaptchaRequired(true);
              setError("Security check required. Please complete the checkbox below and click Register again.");
            } else {
              setError(
                "Security check failed. Please try again or contact support."
              );
            }
          } else {
            setError(FRIENDLY_FAILURE);
          }
          break; // TASK 4 FIX: Added missing break (was falling through to EMAIL_VERIFICATION)
        case LoginState.EMAIL_VERIFICATION_REQUIRED:
          setPendingVerificationState(response);
          setEmailCode("");
          setMode(MODE.EMAIL_VERIFICATION);
          setMessage(`We sent a verification code to ${identifier}. Check your inbox and spam folder, then enter it here.`);
          break;
        case LoginState.OWNER_APPROVAL_REQUIRED:
          setMessage("Your account is pending approval");
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

      // Google's reCAPTCHA script couldn't load (network/ad-blocker).
      if (raw === "RECAPTCHA_LOAD_FAILED") {
        setError(
          "Couldn't load the security check. Please disable any ad-blocker for this site and try again."
        );
        return;
      }

      if (isCaptchaError) {
        if (isLocalhost() || mode === MODE.LOGIN) {
          console.error("[login] reCAPTCHA rejected — check Wix Site Members → Signup & Login Security.");
          setError(FRIENDLY_FAILURE);
        } else if (!isCaptchaRequired) {
          setIsCaptchaRequired(true);
          setError("Security check required. Please complete the checkbox below and click Register again.");
        } else {
          setError(
            "Security check failed. Please try again or contact support."
          );
        }
        return;
      }

      // The auth request never settled within the timeout window.
      if (raw === "AUTH_TIMEOUT") {
        setError("This is taking longer than expected. Please check your internet connection and try again.");
        return;
      }

      // Wix returns this when the headless client's underlying site is not
      // published yet. The fix is in the Wix dashboard, not in the code.
      const isUnpublishedSite =
        code === "ASSERTION_FAILED" ||
        /No Public URL Found/i.test(raw) ||
        /No Public URL Found/i.test(appDesc) ||
        /site is published/i.test(raw) ||
        /site is published/i.test(appDesc);

      if (isUnpublishedSite) {
        console.error("[login] Wix site not published — auth unavailable.");
      }
      setError(FRIENDLY_FAILURE);
    } finally {
      setIsLoading(false);
      // reCAPTCHA tokens are single-use — clear the checkbox so a retry after
      // an error (e.g. "email already exists") can obtain a fresh token.
      if (mode === MODE.REGISTER && captchaWidgetIdRef.current !== null) {
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
      setError("Your session expired. Please go back and sign up again.");
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
        setEmailCode("");
        setMessage(`A new code was sent to ${identifier}. Check your inbox and spam folder.`);
        setResendCooldown(30);
      } else if (response?.loginState === LoginState.SUCCESS) {
        const tokens = await withTimeout(
          wixClient.auth.getMemberTokensForDirectLogin(response.data.sessionToken!)
        );
        Cookies.set("refreshToken", JSON.stringify(tokens.refreshToken), { expires: 30, sameSite: "lax" });
        wixClient.auth.setTokens(tokens);
        trackCompleteRegistration("email");
        setMessage("Successful! You are being redirected.");
        router.push(redirectTo);
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

  return (
    <div className="min-h-[calc(100vh-64px)] bg-platinum px-4 md:px-6 lg:px-8 flex items-center justify-center relative">
      {/* TASK 1 FIX: Back arrow button at top-left */}
      <div className="absolute top-4 left-4 md:left-8 lg:left-16 xl:left-32 2xl:left-64">
        <BackButton className="bg-white shadow-md hover:shadow-lg" />
      </div>

      <form
        className="flex flex-col gap-6 w-full max-w-md bg-white rounded-xl p-8 shadow-premium"
        onSubmit={handleSubmit}
      >
        <h1 className="text-2xl font-playfair font-bold text-primary">{formTitle}</h1>

        {mode === MODE.RESET_PASSWORD && (
          <p className="-mt-3 text-sm text-gray-600 leading-relaxed">
            Enter the email address for your account and we&apos;ll send you a
            secure link to set a new password.
          </p>
        )}

        {mode === MODE.REGISTER ? (
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-gray-700">Your name</label>
            <input
              type="text"
              name="username"
              placeholder="Priya Sharma"
              autoComplete="name"
              className="input"
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>
        ) : null}

        {mode !== MODE.EMAIL_VERIFICATION ? (
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-gray-700">Email</label>
            <input
              type="email"
              name="identifier"
              placeholder="you@example.com"
              autoComplete="email"
              inputMode="email"
              className="input"
              onChange={(e) => setIdentifier(e.target.value)}
            />
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-gray-700">Verification Code</label>
            <input
              type="text"
              name="emailCode"
              placeholder="Code"
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              value={emailCode}
              className="input"
              onChange={(e) => setEmailCode(e.target.value.replace(/\D/g, "").slice(0, 8))}
            />
            <p className="text-xs text-gray-400">
              Check spam/promotions too. If no code arrives, tap Resend below.
            </p>
            <button
              type="button"
              onClick={handleResend}
              disabled={isLoading || resendCooldown > 0}
              className="self-start text-xs font-medium text-accent hover:text-primary hover:underline disabled:cursor-not-allowed disabled:text-gray-400 disabled:no-underline"
            >
              {resendCooldown > 0
                ? `Resend code in ${resendCooldown}s`
                : "Didn't get it? Resend code"}
            </button>
          </div>
        )}

        {mode === MODE.LOGIN || mode === MODE.REGISTER ? (
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-gray-700">Password</label>
            <input
              type="password"
              name="password"
              placeholder="Enter your password"
              autoComplete={mode === MODE.REGISTER ? "new-password" : "current-password"}
              className="input"
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
        ) : null}

        {/* Visible reCAPTCHA — required by Wix for member registration if backend demands it.
            Hidden on localhost since keys are bound to the production domain. */}
        {mode === MODE.REGISTER && captchaVisibleSiteKey && isCaptchaRequired && !isLocalhost() && (
          <div ref={captchaContainerRef} className="flex justify-center" />
        )}

        {mode === MODE.LOGIN && (
          <div
            className="text-sm underline cursor-pointer text-accent hover:text-primary transition-colors"
            onClick={() => setMode(MODE.RESET_PASSWORD)}
          >
            Forgot Password?
          </div>
        )}

        <button
          className="bg-accent text-white py-3 px-6 rounded-lg font-semibold uppercase tracking-wider text-sm transition-all duration-300 hover:bg-primary disabled:bg-accent/40 disabled:cursor-not-allowed"
          disabled={isLoading}
        >
          {isLoading ? "Loading..." : buttonTitle}
        </button>

        {error && (
          <div className="text-red-600 text-sm bg-red-50 p-3 rounded-lg border border-red-200">
            {error}
          </div>
        )}

        {mode === MODE.LOGIN && (
          <p className="text-sm text-center text-gray-600">
            Don&apos;t have an account?{" "}
            <button
              type="button"
              onClick={() => setMode(MODE.REGISTER)}
              className="font-semibold text-accent underline hover:text-primary transition-colors"
            >
              Create Account
            </button>
          </p>
        )}
        {mode === MODE.REGISTER && (
          <p className="text-sm text-center text-gray-600">
            Already have an account?{" "}
            <button
              type="button"
              onClick={() => setMode(MODE.LOGIN)}
              className="font-semibold text-accent underline hover:text-primary transition-colors"
            >
              Log In
            </button>
          </p>
        )}
        {mode === MODE.RESET_PASSWORD && (
          <div
            className="text-sm underline cursor-pointer text-center text-gray-600 hover:text-primary transition-colors"
            onClick={() => setMode(MODE.LOGIN)}
          >
            Go back to Login
          </div>
        )}
        {message && <div className="text-green-600 text-sm bg-green-50 p-3 rounded-lg border border-green-200">{message}</div>}

        {(mode === MODE.LOGIN || mode === MODE.REGISTER) && (
          <div className="-mx-8 -mb-8 border-t border-silver-light bg-platinum/60 px-8 py-5 text-sm text-gray-600">
            <p className="font-semibold text-primary">With an account you can</p>
            <ul className="mt-2 space-y-1">
              <li>✓ See and track all your orders in one place</li>
              <li>✓ Get ₹{REVIEW_REWARD.amount} off by posting a photo review</li>
              <li>✓ Check out faster with saved details</li>
            </ul>
            <p className="mt-3">
              Just want to track an order?{" "}
              <Link href="/track" className="font-semibold text-accent hover:underline">
                No account needed
              </Link>
            </p>
          </div>
        )}
      </form>
    </div>
  );
};

const LoginPage = () => {
  return (
    <Suspense fallback={<div className="min-h-[calc(100vh-64px)] bg-platinum" />}>
      <LoginContent />
    </Suspense>
  );
};

export default LoginPage;
