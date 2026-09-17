import { NextRequest, NextResponse } from "next/server";
import { OAuth2Client } from "google-auth-library";
import { OAuthStrategy, ApiKeyStrategy, createClient } from "@wix/sdk";
import { members } from "@wix/members";

// google-auth-library needs the Node runtime (not edge).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
const WIX_API_KEY = process.env.WIX_API_KEY;
const WIX_SITE_ID = process.env.WIX_SITE_ID;
const WIX_CLIENT_ID = process.env.NEXT_PUBLIC_WIX_CLIENT_ID;

/**
 * Google One-Tap → Wix member session.
 *
 * The browser sends the Google ID token (JWT). We:
 *   1. Verify it with Google (signature + audience = our client id).
 *   2. Find the Wix member by email, or create one (admin API key).
 *   3. Mint a member session for that member via the headless external-login
 *      flow, and hand the tokens back so the client can set its cookie.
 *
 * No Google client SECRET is involved — one-tap only needs the client id on the
 * browser and signature verification here.
 */
export async function POST(req: NextRequest) {
  if (!GOOGLE_CLIENT_ID || !WIX_API_KEY || !WIX_SITE_ID || !WIX_CLIENT_ID) {
    console.warn(
      "[google-auth] not configured — need NEXT_PUBLIC_GOOGLE_CLIENT_ID, WIX_API_KEY, WIX_SITE_ID, NEXT_PUBLIC_WIX_CLIENT_ID."
    );
    return NextResponse.json(
      { error: "Google sign-in is not available right now." },
      { status: 503 }
    );
  }

  try {
    const { credential } = await req.json();
    if (!credential || typeof credential !== "string") {
      return NextResponse.json({ error: "Missing Google credential." }, { status: 400 });
    }

    // 1) Verify the Google ID token.
    const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    if (!payload?.email || payload.email_verified === false) {
      return NextResponse.json(
        { error: "Your Google email could not be verified." },
        { status: 401 }
      );
    }
    const email = payload.email.toLowerCase();
    const name =
      payload.name ||
      [payload.given_name, payload.family_name].filter(Boolean).join(" ") ||
      email.split("@")[0];

    // 2) Find or create the Wix member (admin API key).
    const admin = createClient({
      modules: { members },
      auth: ApiKeyStrategy({ apiKey: WIX_API_KEY, siteId: WIX_SITE_ID }),
    });

    let memberId: string | undefined;
    try {
      const found = await admin.members
        .queryMembers()
        .eq("loginEmail", email)
        .find();
      memberId = found.items?.[0]?._id ?? undefined;
    } catch (qErr) {
      console.warn("[google-auth] member query failed (will try create):", qErr);
    }

    if (!memberId) {
      const created = await admin.members.createMember({
        member: {
          loginEmail: email,
          profile: { nickname: name },
          contact: { firstName: name },
        },
      });
      memberId = created?._id ?? undefined;
    }

    if (!memberId) {
      throw new Error("Could not resolve a Wix member id for " + email);
    }

    // 3) Mint a member session for this member.
    const oauthClient = createClient({
      auth: OAuthStrategy({ clientId: WIX_CLIENT_ID }),
    });
    const visitorTokens = await oauthClient.auth.generateVisitorTokens();
    oauthClient.auth.setTokens(visitorTokens);
    const memberTokens = await oauthClient.auth.getMemberTokensForExternalLogin(
      memberId,
      WIX_API_KEY
    );

    return NextResponse.json({ tokens: memberTokens });
  } catch (err) {
    console.error("[google-auth] sign-in failed:", err);
    return NextResponse.json(
      { error: "Google sign-in failed. Please try again, or use email." },
      { status: 500 }
    );
  }
}
