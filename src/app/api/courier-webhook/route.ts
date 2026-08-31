// Courier status webhook (Shiprocket). Neutral URL because Shiprocket's webhook
// config UI rejects URLs containing "shiprocket"/"kartrocket"/"sr"/"kr".
//
// Give Shiprocket this URL (Settings -> API -> Configure -> Webhooks):
//   https://www.viorajewel.in/api/courier-webhook
// Auth Token Type: x-api-key. Token: the value of SHIPROCKET_WEBHOOK_SECRET.
//
// The implementation lives in @/lib/crm/courierWebhook so the legacy
// /api/shiprocket-webhook alias can share it.

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
