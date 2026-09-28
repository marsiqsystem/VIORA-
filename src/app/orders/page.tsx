import { permanentRedirect } from "next/navigation";

// The old order-history page; everything now lives on /account/orders.
export default function OrdersPage() {
  permanentRedirect("/account/orders");
}
