import { OAuthStrategy, createClient } from "@wix/sdk";
import { NextRequest, NextResponse } from "next/server";

export const middleware = async (request: NextRequest) => {
  const cookies = request.cookies;
  const res = NextResponse.next();

  if (cookies.get("refreshToken")) {
    return res;
  }

  // Generate a visitor token so anonymous browsing (cart, etc.) works. This
  // MUST NOT block or break page rendering: if Wix is slow or erroring, we
  // still serve the page — the client falls back to its own token handling.
  try {
    const wixClient = createClient({
      auth: OAuthStrategy({ clientId: process.env.NEXT_PUBLIC_WIX_CLIENT_ID! }),
    });

    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("VISITOR_TOKEN_TIMEOUT")), 4000)
    );
    const tokens = await Promise.race([
      wixClient.auth.generateVisitorTokens(),
      timeout,
    ]);

    res.cookies.set("refreshToken", JSON.stringify(tokens.refreshToken), {
      maxAge: 60 * 60 * 24 * 30,
    });
  } catch (err) {
    console.error("Middleware visitor-token generation failed:", err);
    // Serve the page anyway; do not set a cookie.
  }

  return res;
};

// Only run on real page routes. Skip static assets, images, and API routes so
// a visitor-token call never sits in the path of every asset request.
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api|.*\\..*).*)"],
};
