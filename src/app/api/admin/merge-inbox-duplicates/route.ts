// TEMP admin route — consolidate duplicate inbox conversations.
//
// The same customer used to appear as 2–3 separate chats because the phone was
// keyed by raw digits (e.g. inbound "919876543210" vs a broadcast send's bare
// "9876543210"). normPhone now canonicalises every shape to one key; this route
// merges the EXISTING duplicates into that single conversation.
//
//   DRY RUN (shows what would merge, writes nothing):
//     GET /api/admin/merge-inbox-duplicates?key=<INBOX_SECRET>
//   APPLY (actually merges + removes the stale duplicates):
//     GET /api/admin/merge-inbox-duplicates?key=<INBOX_SECRET>&apply=1
//
// -> { ok, apply, indexMembers, groupsToMerge, conversationsRemoved, details }
// Delete this file after the merge is confirmed.

import { NextRequest, NextResponse } from "next/server";
import { mergeDuplicates, authOk, authConfigured, keyFromRequest } from "@/lib/crm/inbox-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!authConfigured()) return NextResponse.json({ ok: false, error: "INBOX_SECRET not set" }, { status: 503 });
  if (!authOk(keyFromRequest(req))) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const apply = ["1", "true", "yes"].includes((req.nextUrl.searchParams.get("apply") || "").toLowerCase());
  const result = await mergeDuplicates({ apply });
  return NextResponse.json(result, { status: result?.ok ? 200 : 500 });
}
