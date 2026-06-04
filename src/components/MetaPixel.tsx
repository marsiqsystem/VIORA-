"use client";

import Script from "next/script";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef } from "react";

declare global {
  interface Window {
    fbq?: (...args: any[]) => void;
    _fbq?: any;
  }
}

const PageViewTracker = () => {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const hasTrackedInitialView = useRef(false);

  useEffect(() => {
    if (!hasTrackedInitialView.current) {
      hasTrackedInitialView.current = true;
      return;
    }
    if (typeof window !== "undefined" && window.fbq) {
      window.fbq("track", "PageView");
    }
  }, [pathname, searchParams]);

  return null;
};

const MetaPixel = () => {
  const pixelId = process.env.NEXT_PUBLIC_META_PIXEL_ID;
  if (!pixelId) return null;

  return (
    <>
      <Script
        id="meta-pixel-base"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{
          __html: `
            !function(f,b,e,v,n,t,s)
            {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
            n.callMethod.apply(n,arguments):n.queue.push(arguments)};
            if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
            n.queue=[];t=b.createElement(e);t.async=!0;
            t.src=v;s=b.getElementsByTagName(e)[0];
            s.parentNode.insertBefore(t,s)}(window, document,'script',
            'https://connect.facebook.net/en_US/fbevents.js');
            
            var userData = null;
            try {
              var stored = window.sessionStorage.getItem("viora_meta_user_data");
              if (stored) {
                var raw = JSON.parse(stored);
                userData = {};
                if (raw.email) userData.em = raw.email.trim().toLowerCase();
                if (raw.phone) {
                  var ph = raw.phone.replace(/[^0-9]/g, "");
                  if (ph.length === 10) ph = "91" + ph;
                  userData.ph = ph;
                }
                if (raw.firstName) userData.fn = raw.firstName.trim().toLowerCase();
                if (raw.lastName) userData.ln = raw.lastName.trim().toLowerCase();
                if (raw.city) userData.ct = raw.city.trim().toLowerCase();
                if (raw.state) userData.st = raw.state.trim().toLowerCase();
                if (raw.zip) userData.zp = raw.zip.trim().toLowerCase();
                if (raw.country) userData.country = raw.country.trim().toLowerCase();
              }
            } catch (e) {}

            if (userData) {
              fbq('init', '${pixelId}', userData);
            } else {
              fbq('init', '${pixelId}');
            }
            fbq('track', 'PageView');
          `,
        }}
      />
      <noscript>
        <img
          height="1"
          width="1"
          style={{ display: "none" }}
          alt=""
          src={`https://www.facebook.com/tr?id=${pixelId}&ev=PageView&noscript=1`}
        />
      </noscript>
      <Suspense fallback={null}>
        <PageViewTracker />
      </Suspense>
    </>
  );
};

export default MetaPixel;
