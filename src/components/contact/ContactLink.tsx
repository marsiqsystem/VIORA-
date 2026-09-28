"use client";

import { trackContact } from "@/lib/metaPixel";

type Props = {
  href: string;
  className?: string;
  /** Opens in a new tab (WhatsApp, Instagram, Facebook). */
  external?: boolean;
  children: React.ReactNode;
};

/** A contact-channel link that records a Meta "Contact" event when tapped. */
const ContactLink = ({ href, className, external, children }: Props) => (
  <a
    href={href}
    className={className}
    onClick={() => trackContact()}
    {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
  >
    {children}
  </a>
);

export default ContactLink;
