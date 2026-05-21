"use client";

import { useWixClient } from "@/hooks/useWixClient";
import { LoginState } from "@wix/sdk";
import { useRouter, useSearchParams } from "next/navigation";
import Cookies from "js-cookie";
import { Suspense, useEffect, useState } from "react";
import { trackCompleteRegistration } from "@/lib/metaPixel";
import BackButton from "@/components/BackButton";

enum MODE {
  LOGIN = "LOGIN",
  REGISTER = "REGISTER",
  RESET_PASSWORD = "RESET_PASSWORD",
  EMAIL_VERIFICATION = "EMAIL_VERIFICATION",
}

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
        case MODE.LOGIN:
          response = await withTimeout(
            wixClient.auth.login({
              email: identifier,
              password,
            })
          );
          break;
        case MODE.REGISTER:
          response = await withTimeout(
            wixClient.auth.register({
              email: identifier,
              password,
              profile: { nickname: username },
            })
          );
          break;
        case MODE.RESET_PASSWORD:
          response = await withTimeout(
            wixClient.auth.sendPasswordResetEmail(
              identifier,
              window.location.href
            )
          );
          setMessage("Password reset email sent. Please check your e-mail.");
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
            <div className="mt-1.5 flex items-start gap-2 rounded-lg border border-silver-light/35 bg-platinum/40 p-2.5 text-[11px] text-gray-600 font-medium leading-relaxed">
              <svg className="w-4 h-4 text-accent flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>An email address is required for authentication.</span>
            </div>
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
              Check spam/promotions too. If no code arrives, your Wix member email verification settings may need adjustment.
            </p>
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
