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

  const templates = (res.templates || [])
    .filter((t: any) => String(t?.status).toUpperCase() === "APPROVED")
    .map(parseTemplate)
    .sort((a, b) => a.name.localeCompare(b.name));

  return NextResponse.json({ ok: true, templates });
}
