import type { Metadata } from "next";
import Link from "next/link";
import { whatsappLink } from "@/lib/contact";
import TrackForm from "./TrackForm";

export const metadata: Metadata = {
  title: "Track Your Order",
  description: "Track your Viora Jewel order with your order number and mobile number — no account needed.",
  alternates: { canonical: "/track" },
};

/** Order tracking without an account: order number + the mobile number on the order. */
const TrackPage = ({ searchParams }: { searchParams: { order?: string } }) => {
  const initialOrder = String(searchParams.order || "").replace(/\D/g, "").slice(0, 12) || undefined;

  return (
    <div className="min-h-[calc(100vh-180px)] bg-platinum px-4 py-8 md:py-14">
      <div className="mx-auto max-w-md">
        <div className="bg-white p-6 shadow-sm md:p-8">
          <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-accent">No account needed</p>
          <h1 className="mt-1 font-playfair text-3xl font-bold text-primary">Track your order</h1>
          <p className="mt-2 text-sm text-gray-600">
            Your order number is in the WhatsApp message and email we sent when you ordered.
          </p>
          <div className="mt-6">
            <TrackForm initialOrder={initialOrder} />
          </div>
        </div>

        <div className="mt-4 space-y-2 text-center text-sm text-gray-600">
          <p>
            Have an account?{" "}
            <Link href="/login?redirectTo=/account/orders" className="font-semibold text-accent hover:underline">
              Log in to see all your orders
            </Link>
          </p>
          <p>
            Can&apos;t find your order number?{" "}
            <a
              href={whatsappLink("Hi Viora, I'd like to track my order.")}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-green-700 hover:underline"
            >
              WhatsApp us
            </a>
          </p>
        </div>
      </div>
    </div>
  );
};

export default TrackPage;
