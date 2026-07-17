import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Contact Us",
  description:
    "Get in touch with Viora Jewel for order help, exchanges or product questions. We're happy to assist you.",
  alternates: { canonical: "/contact" },
  openGraph: {
    title: "Contact Viora Jewel",
    description:
      "Reach the Viora Jewel team for order help, exchanges and product questions.",
    url: "/contact",
  },
};

export default function ContactLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
