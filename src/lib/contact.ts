// Public business contact details used across the storefront.

/** Business WhatsApp, country code included (+91 89103 50623) — the format wa.me expects. */
export const WHATSAPP_NUMBER = "918910350623";

export const whatsappLink = (text?: string) =>
  `https://wa.me/${WHATSAPP_NUMBER}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
