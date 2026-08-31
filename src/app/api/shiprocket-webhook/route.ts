// Legacy alias for the Shiprocket status webhook. Prefer /api/courier-webhook
// (Shiprocket's config UI rejects URLs containing "shiprocket"). Both delegate to
// the same handler in @/lib/crm/courierWebhook.

import { NextRequest } from "next/server";
import { handleCourierWebhook, courierWebhookInfo } from "@/lib/crm/courierWebhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export function GET() {
  return courierWebhookInfo();
}

export function POST(req: NextRequest) {
  return handleCourierWebhook(req);
}
