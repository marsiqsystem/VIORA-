// Approved-template list for the broadcast composer.
//
//   GET /api/templates?key=<INBOX_SECRET>  ->  { ok, templates: [...] }
//
// Proxies the WABA's /message_templates, keeps only APPROVED ones, and parses
// each into the shape the composer needs: how many body variables to map, the
// header format (so we can ask for an image URL), and whether there's a dynamic
// URL button. Protected by INBOX_SECRET (reuses the inbox passcode).

import { NextRequest, NextResponse } from "next/server";
import { listTemplates } from "@/lib/crm/whatsapp";
import { authOk, authConfigured, keyFromRequest } from "@/lib/crm/inbox-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Count distinct {{1}},{{2}}… placeholders in a template string. */
function countVars(text: string): number {
  const nums = new Set<number>();
  const re = /\{\{\s*(\d+)\s*\}\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(String(text || "")))) nums.add(Number(m[1]));
  return nums.size;
}

type ParsedTemplate = {
  name: string;
  language: string;
  category: string;
  bodyText: string;
  bodyVars: number;
  headerFormat: string; // NONE | TEXT | IMAGE | VIDEO | DOCUMENT
  headerVars: number;
  hasUrlButton: boolean;
  urlButtonIndex: number | null;
};

// Known-approved templates that Meta's UI has activated but whose APPROVED status
// the Graph /message_templates list can lag on for a while (common for MARKETING).
// If such a template is missing from the live approved list, fall back to this
// hard-coded metadata so the broadcast composer can still select it. Metadata here
// MUST mirror what the template was actually created with (see the matching admin
// create-* route), because it drives how the composer builds each send.
const FALLBACK_TEMPLATES: ParsedTemplate[] = [
  {
    name: "rakhi_luxe_gift_v1",
    language: "en_US",
    category: "MARKETING",
    bodyText:
      "Hi {{1}}, Raksha Bandhan is almost here — surprise your sister with the " +
      "Viora Rakhi Luxe Gift Set: Necklace, Earrings, Ring & Bracelet in a premium " +
      "gift box. Order before 22nd for on-time delivery. Pay online/prepaid for FLAT ₹50 OFF!",
    bodyVars: 1, // {{1}} = customer name
    headerFormat: "IMAGE", // operator supplies the photo at send time
    headerVars: 0,
    hasUrlButton: false, // 2 STATIC URL buttons — no dynamic {{n}} param
    urlButtonIndex: null,
  },
];

function parseTemplate(t: any): ParsedTemplate {
  const comps: any[] = Array.isArray(t?.components) ? t.components : [];
  const body = comps.find((c) => c?.type === "BODY");
  const header = comps.find((c) => c?.type === "HEADER");
  const buttonsComp = comps.find((c) => c?.type === "BUTTONS");

  const headerFormat = header ? String(header.format || "TEXT") : "NONE";
  let urlButtonIndex: number | null = null;
  const buttons: any[] = Array.isArray(buttonsComp?.buttons) ? buttonsComp.buttons : [];
  buttons.forEach((b, i) => {
    if (b?.type === "URL" && /\{\{\s*\d+\s*\}\}/.test(String(b?.url || ""))) {
      if (urlButtonIndex === null) urlButtonIndex = i;
    }
  });

  return {
    name: String(t?.name || ""),
    language: String(t?.language || ""),
    category: String(t?.category || ""),
    bodyText: String(body?.text || ""),
    bodyVars: countVars(body?.text || ""),
    headerFormat,
    headerVars: headerFormat === "TEXT" ? countVars(header?.text || "") : 0,
    hasUrlButton: urlButtonIndex !== null,
    urlButtonIndex,
  };
}

export async function GET(req: NextRequest) {
  if (!authConfigured()) {
    return NextResponse.json({ ok: false, error: "INBOX_SECRET not configured." }, { status: 503 });
  }
  if (!authOk(keyFromRequest(req))) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const res = await listTemplates();
  if (!res.ok) {
    return NextResponse.json(
      { ok: false, error: typeof res.error === "string" ? res.error : "Could not load templates." },
      { status: 502 }
    );
  }

  const raw = res.templates || [];

  // Diagnostic: ?debug=1 dumps every template's raw status so we can see why an
  // approved-in-UI template isn't showing (e.g. Graph list still reports PENDING).
  if (req.nextUrl.searchParams.get("debug") === "1") {
    return NextResponse.json({
      ok: true,
      count: raw.length,
      raw: raw.map((t: any) => ({
        name: t?.name,
        status: t?.status,
        language: t?.language,
        category: t?.category,
      })),
    });
  }

  const templates = raw
    .filter((t: any) => String(t?.status).toUpperCase() === "APPROVED")
    .map(parseTemplate);

  // Add any known-approved fallback the live list dropped, keyed by name+language.
  const have = new Set(templates.map((t) => `${t.name}::${t.language}`));
  for (const fb of FALLBACK_TEMPLATES) {
    if (!have.has(`${fb.name}::${fb.language}`)) templates.push(fb);
  }

  templates.sort((a, b) => a.name.localeCompare(b.name));

  return NextResponse.json({ ok: true, templates });
}
