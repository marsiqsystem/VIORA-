import { WHATSAPP_BANNER } from "@/data/homeAssets";
import { whatsappLink } from "@/lib/contact";
import AssetImage from "./AssetImage";

const JOIN_MESSAGE = "Hi Viora! Please add me to your WhatsApp updates for new drops and offers.";
const HELP_MESSAGE = "Hi Viora! I'd like help choosing a piece.";

/** WhatsApp, where Indian shoppers actually reply — updates and styling help. */
const WhatsAppClub = () => (
  <section aria-labelledby="whatsapp-club" className="relative overflow-hidden bg-primary text-white">
    <div className="absolute inset-0 md:hidden">
      {WHATSAPP_BANNER.mobile.src && <AssetImage image={WHATSAPP_BANNER.mobile} sizes="100vw" />}
    </div>
    <div className="absolute inset-0 hidden md:block">
      {WHATSAPP_BANNER.desktop.src && <AssetImage image={WHATSAPP_BANNER.desktop} sizes="100vw" />}
    </div>
    <div className="absolute inset-0 bg-gradient-to-r from-primary via-primary/90 to-primary/70" aria-hidden="true" />

    <div className="relative flex flex-col gap-5 px-4 py-10 md:flex-row md:items-center md:justify-between md:px-6 md:py-12 lg:px-8">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-silver">Viora on WhatsApp</p>
        <h2 id="whatsapp-club" className="mt-1 font-playfair text-3xl font-bold md:text-4xl">
          First look at new drops
        </h2>
        <p className="mt-1 max-w-lg text-sm text-white/75">
          Get new designs and offers before anyone else — or send us a message and we&apos;ll help you pick.
        </p>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <a
          href={whatsappLink(JOIN_MESSAGE)}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 bg-[#25D366] px-6 py-3.5 text-sm font-bold uppercase tracking-wider text-white hover:bg-[#1fb857]"
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M12 2a10 10 0 00-8.6 15.1L2 22l5-1.3A10 10 0 1012 2zm0 18.2a8.2 8.2 0 01-4.2-1.1l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1112 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.7.8-.8 1-.3.2-.5.1a6.7 6.7 0 01-3.3-2.9c-.3-.4.3-.4.7-1.3a.5.5 0 000-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 00-.7.3 3 3 0 00-.9 2.2 5.2 5.2 0 001.1 2.7 11.8 11.8 0 004.5 4c1.7.7 2.3.8 3.2.6a2.7 2.7 0 001.8-1.2 2.2 2.2 0 00.1-1.2c0-.1-.2-.2-.4-.3z" />
          </svg>
          Join on WhatsApp
        </a>
        <a
          href={whatsappLink(HELP_MESSAGE)}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center border border-white/40 px-6 py-3.5 text-sm font-bold uppercase tracking-wider text-white hover:bg-white/10"
        >
          Ask us anything
        </a>
      </div>
    </div>
  </section>
);

export default WhatsAppClub;
