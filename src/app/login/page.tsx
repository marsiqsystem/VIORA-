"use client";

import { useWixClient } from "@/hooks/useWixClient";
import { LoginState } from "@wix/sdk";
import { useRouter, useSearchParams } from "next/navigation";
import Cookies from "js-cookie";
import { Suspense, useEffect, useRef, useState } from "react";
import { trackCompleteRegistration } from "@/lib/metaPixel";
import BackButton from "@/components/BackButton";
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
      setError(
        "An email address is required for authentication. Please enter your email instead of a phone number."
      );
      setIsLoading(false);
      return;
    }

    try {
      let response;

      switch (mode) {
        case MODE.LOGIN: {
          // Skip invisible reCAPTCHA on localhost — keys are bound to production domain
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
          Cookies.set("refreshToken", JSON.stringify(tokens.refreshToken), {
            expires: 2,
          });
          wixClient.auth.setTokens(tokens);
          if (mode === MODE.REGISTER) {
            trackCompleteRegistration("email");
          }
          setMessage("Successful! You are being redirected.");
          router.push(redirectTo);
          break;
        }
        case LoginState.FAILURE:
          // TASK 4 FIX: Log the full error object for debugging
          console.log("WIX AUTH ERROR:", response);
          console.log("Error Code:", response.errorCode);
          console.log("Error Details:", JSON.stringify(response, null, 2));

          if (
            response.errorCode === "invalidEmail" ||
            response.errorCode === "invalidPassword"
          ) {
            setError("Invalid email or password!");
          } else if (response.errorCode === "emailAlreadyExists") {
            setError("Email already exists!");
          } else if (response.errorCode === "resetPassword") {
            setError("You need to reset your password!");
          } else if (
            response.errorCode === "missingCaptchaToken" ||
            response.errorCode === "invalidCaptchaToken"
          ) {
            if (isLocalhost()) {
              // On localhost, Wix still demands a token but Google will reject it.
              // Tell the user to disable CAPTCHA in the Wix dashboard.
              setError(
                "Wix is still requiring reCAPTCHA even though you may have disabled it. This happens when the site hasn't been re-published after changing the setting. Please go to your Wix Dashboard → (1) Settings → Site Member Settings → Signup & Login Security → make sure reCAPTCHA is OFF, (2) click Save, (3) then click the Publish button at the top of the dashboard. After publishing, come back and try registering again."
              );
            } else if (!isCaptchaRequired) {
              setIsCaptchaRequired(true);
              setError("Security check required. Please complete the checkbox below and click Register again.");
            } else {
              setError(
                "Security check failed. Please try again or contact support."
              );
            }
          } else {
            // Show the actual error code in the UI for better debugging
            setError(
              `Authentication failed: ${response.errorCode || "Unknown error"}. Check the browser console for details.`
            );
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
        if (isLocalhost()) {
          setError(
            "Wix is still requiring reCAPTCHA even though you may have disabled it. This happens when the site hasn't been re-published after changing the setting. Please go to your Wix Dashboard → (1) Settings → Site Member Settings → Signup & Login Security → make sure reCAPTCHA is OFF, (2) click Save, (3) then click the Publish button at the top of the dashboard. After publishing, come back and try registering again."
          );
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
        setError(
          "This is taking longer than expected. Please check your internet connection and try again. If it keeps happening, the Wix site may need to be republished."
        );
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
        setError(
          "Authentication is unavailable because the Wix site backing this client has not been published yet. Open the Wix dashboard and click Publish, then try again."
        );
      } else {
        const errMessage = raw || appDesc || "Unknown error";
        setError(`Authentication error: ${errMessage}.`);
      }
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
        Cookies.set("refreshToken", JSON.stringify(tokens.refreshToken), { expires: 2 });
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
    <div className="min-h-[calc(100vh-64px)] bg-platinum px-4 md:px-8 lg:px-16 xl:px-32 2xl:px-64 flex items-center justify-center relative">
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
            <label className="text-sm font-medium text-gray-700">Username</label>
            <input
              type="text"
              name="username"
              placeholder="john"
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
              placeholder="john@example.com"
              className="input"
              onChange={(e) => setIdentifier(e.target.value)}
            />
            {mode !== MODE.RESET_PASSWORD && (
              <div className="mt-1.5 flex items-start gap-2 rounded-lg border border-silver-light/35 bg-platinum/40 p-2.5 text-[11px] text-gray-600 font-medium leading-relaxed">
                <svg className="w-4 h-4 text-accent flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>An email address is required for authentication.</span>
              </div>
            )}
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
