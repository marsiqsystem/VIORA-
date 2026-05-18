"use client";

import { useWixClient } from "@/hooks/useWixClient";
import { LoginState } from "@wix/sdk";
import { useRouter } from "next/navigation";
import Cookies from "js-cookie";
import { useState } from "react";
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

const LoginPage = () => {
  const wixClient = useWixClient();
  const router = useRouter();

  const isLoggedIn = wixClient.auth.loggedIn();

  if (isLoggedIn) {
    router.push("/");
  }

  const [mode, setMode] = useState(MODE.LOGIN);

  const [username, setUsername] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [emailCode, setEmailCode] = useState("");
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
        "Wix authentication requires an email address. Please enter your email instead of a phone number."
      );
      setIsLoading(false);
      return;
    }

    try {
      let response;

      switch (mode) {
        case MODE.LOGIN:
          response = await wixClient.auth.login({
            email: identifier,
            password,
          });
          break;
        case MODE.REGISTER:
          response = await wixClient.auth.register({
            email: identifier,
            password,
            profile: { nickname: username },
          });
          break;
        case MODE.RESET_PASSWORD:
          response = await wixClient.auth.sendPasswordResetEmail(
            identifier,
            window.location.href
          );
          setMessage("Password reset email sent. Please check your e-mail.");
          break;
        case MODE.EMAIL_VERIFICATION:
          response = await wixClient.auth.processVerification({
            verificationCode: emailCode,
          });
          break;
        default:
          break;
      }

      // TASK 4 FIX: Detailed response state handling
      switch (response?.loginState) {
        case LoginState.SUCCESS:
          setMessage("Successful! You are being redirected.");
          if (mode === MODE.REGISTER) {
            trackCompleteRegistration("email");
          }
          const tokens = await wixClient.auth.getMemberTokensForDirectLogin(
            response.data.sessionToken!
          );

          Cookies.set("refreshToken", JSON.stringify(tokens.refreshToken), {
            expires: 2,
          });
          wixClient.auth.setTokens(tokens);
          router.push("/");
          break;
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
          setMode(MODE.EMAIL_VERIFICATION);
          break;
        case LoginState.OWNER_APPROVAL_REQUIRED:
          setMessage("Your account is pending approval");
          break;
        default:
          break;
      }
    } catch (err: any) {
      // TASK 4 FIX: Verbose console logging for debugging
      console.log("WIX AUTH ERROR:", err);
      console.log("Error message:", err?.message);
      console.log("Error details:", err?.details);
      console.log("Full error object:", JSON.stringify(err, Object.getOwnPropertyNames(err), 2));

      // Show more descriptive error to user
      const errMessage =
        err?.message || err?.details?.applicationError?.description || "Unknown error";
      setError(`Authentication error: ${errMessage}. Check the browser console for full details.`);
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
            <p className="text-xs text-gray-400">
              Wix authentication requires an email address.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-gray-700">Verification Code</label>
            <input
              type="text"
              name="emailCode"
              placeholder="Code"
              className="input"
              onChange={(e) => setEmailCode(e.target.value)}
            />
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
          <div
            className="text-sm underline cursor-pointer text-center text-gray-600 hover:text-primary transition-colors"
            onClick={() => setMode(MODE.REGISTER)}
          >
            {"Don't"} have an account?
          </div>
        )}
        {mode === MODE.REGISTER && (
          <div
            className="text-sm underline cursor-pointer text-center text-gray-600 hover:text-primary transition-colors"
            onClick={() => setMode(MODE.LOGIN)}
          >
            Have an account?
          </div>
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

export default LoginPage;
