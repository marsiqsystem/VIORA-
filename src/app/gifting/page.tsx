import { permanentRedirect } from "next/navigation";

// The gift shop was retired (Sept 2026) because gift wrap is no longer offered.
// Old links from ads, WhatsApp and search go to the shop instead.
export default function GiftingPage() {
  permanentRedirect("/list");
}
