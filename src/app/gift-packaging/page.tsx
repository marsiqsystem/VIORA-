import { permanentRedirect } from "next/navigation";

// Gift wrap is no longer offered, so old links go to the shop.
export default function GiftPackagingPage() {
  permanentRedirect("/list");
}
