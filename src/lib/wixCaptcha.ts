/**
 * reCAPTCHA Enterprise helpers for Wix Headless authentication.
 *
 * Wix protects member signup/login with reCAPTCHA. The SDK exposes Wix's own
 * Enterprise site keys (`wixClient.auth.captchaVisibleSiteKey` /
 * `captchaInvisibleSiteKey`); we load Google's enterprise script with those
 * keys, obtain a token, and pass it to `auth.register` / `auth.login` via
 * `captchaTokens`. Without this the SDK rejects with `missingCaptchaToken`.
 *
 * - Register → VISIBLE checkbox widget  → token sent as `recaptchaToken`
 * - Login    → INVISIBLE (score) execute → token sent as `invisibleRecaptchaToken`
 */

declare global {
  interface Window {
    grecaptcha?: any;
  }
}

const SCRIPT_ATTR = "data-wix-recaptcha";

let scriptPromise: Promise<void> | null = null;

/** Inject Google's reCAPTCHA Enterprise script exactly once. */
function loadRecaptchaEnterprise(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.grecaptcha?.enterprise) return Promise.resolve();
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[${SCRIPT_ATTR}]`
    );
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () =>
        reject(new Error("RECAPTCHA_LOAD_FAILED"))
      );
      return;
    }
    const script = document.createElement("script");
    // render=explicit so we control both the visible widget and execute().
    script.src = "https://www.google.com/recaptcha/enterprise.js?render=explicit";
    script.async = true;
    script.defer = true;
    script.setAttribute(SCRIPT_ATTR, "true");
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("RECAPTCHA_LOAD_FAILED"));
    document.head.appendChild(script);
  });
  return scriptPromise;
}

/** Resolve once the enterprise API is loaded and ready to use. */
export function recaptchaReady(): Promise<void> {
  return loadRecaptchaEnterprise().then(
    () =>
      new Promise<void>((resolve) =>
        window.grecaptcha.enterprise.ready(() => resolve())
      )
  );
}

/**
 * Run the invisible (score-based) flow and return a fresh token.
 * Used for LOGIN — no user interaction, just a badge.
 */
export async function getInvisibleCaptchaToken(
  siteKey: string,
  action: string
): Promise<string> {
  await recaptchaReady();
  return window.grecaptcha.enterprise.execute(siteKey, { action });
}

/**
 * Render the visible reCAPTCHA checkbox into `container` and return its widget
 * id. Used for REGISTER. Safe to call repeatedly — re-rendering into a widget
 * that already exists is skipped.
 */
export async function renderVisibleCaptcha(
  container: HTMLElement,
  siteKey: string
): Promise<number> {
  await recaptchaReady();
  // grecaptcha throws if the container already hosts a widget; guard on a flag.
  if (container.childElementCount > 0) {
    const existingId = container.getAttribute("data-widget-id");
    if (existingId !== null) return Number(existingId);
  }
  const widgetId = window.grecaptcha.enterprise.render(container, {
    sitekey: siteKey,
  });
  container.setAttribute("data-widget-id", String(widgetId));
  return widgetId;
}

/** Read the token from a visible widget (empty string if not yet solved). */
export function getVisibleCaptchaResponse(widgetId: number): string {
  if (!window.grecaptcha?.enterprise) return "";
  return window.grecaptcha.enterprise.getResponse(widgetId) || "";
}

/** Clear a visible widget so the user can solve it again after a failure. */
export function resetVisibleCaptcha(widgetId: number): void {
  if (!window.grecaptcha?.enterprise) return;
  try {
    window.grecaptcha.enterprise.reset(widgetId);
  } catch {
    // Widget may already be gone (mode switch) — nothing to reset.
  }
}
