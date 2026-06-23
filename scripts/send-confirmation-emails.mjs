// One-off backfill: send branded confirmation emails for orders that were
// placed BEFORE the prepaid email fix shipped (and before Wix's automatic
// confirmation email was turned off, or after it was off but our path didn't
// fire yet — either way these customers got nothing).
//
// Usage (run from project root):
//   node --env-file=.env.local scripts/send-confirmation-emails.mjs 10025 10026 10027 10028
//
// The email template is intentionally kept in sync with src/lib/orderEmail.ts.
// If you change one, change the other.

import { ApiKeyStrategy, createClient } from "@wix/sdk";
import { orders } from "@wix/ecom";
import nodemailer from "nodemailer";

// --------------------------------------------------------------------------
// Config / env
// --------------------------------------------------------------------------
const {
  WIX_API_KEY,
  WIX_SITE_ID,
  WIX_ACCOUNT_ID,
  GMAIL_USER,
  GMAIL_APP_PASSWORD,
  NEXT_PUBLIC_SITE_URL,
} = process.env;

if (!WIX_API_KEY || (!WIX_SITE_ID && !WIX_ACCOUNT_ID)) {
  console.error("Missing WIX_API_KEY / WIX_SITE_ID (or WIX_ACCOUNT_ID). Did you forget --env-file=.env.local?");
  process.exit(1);
}
if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
  console.error("Missing GMAIL_USER / GMAIL_APP_PASSWORD.");
  process.exit(1);
}

const orderNumbers = process.argv.slice(2).map((s) => String(s).trim()).filter(Boolean);
if (orderNumbers.length === 0) {
  console.error("No order numbers passed. Example: node --env-file=.env.local scripts/send-confirmation-emails.mjs 10025 10026 10027 10028");
  process.exit(1);
}

const BRAND = "#9B1B30";
const SITE_URL = (NEXT_PUBLIC_SITE_URL || "https://viorajewel.in").replace(/\/$/, "");
const LOGO_URL = `${SITE_URL}/email-logo.png`;
const SUPPORT_EMAIL = "viorajewels6@gmail.com";

// --------------------------------------------------------------------------
// Wix client
// --------------------------------------------------------------------------
const wixClient = createClient({
  modules: { orders },
  auth: ApiKeyStrategy({
    apiKey: WIX_API_KEY,
    ...(WIX_SITE_ID ? { siteId: WIX_SITE_ID } : { accountId: WIX_ACCOUNT_ID }),
  }),
});

// --------------------------------------------------------------------------
// Email template (mirrors src/lib/orderEmail.ts — keep in sync)
// --------------------------------------------------------------------------
const escapeHtml = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const fmtINR = (amount) => (amount == null || amount === "" ? "" : `₹${amount}`);

const toEmailImage = (raw) => {
  if (!raw) return undefined;
  if (raw.startsWith("http://") || raw.startsWith("https://")) return raw;
  if (!raw.startsWith("wix:image://")) return undefined;
  const m = raw.match(/^wix:image:\/\/v1\/([^/#?]+)(?:\/([^#?]+))?/);
  if (!m) return undefined;
  const mediaId = m[1];
  const filename = m[2] || "image.jpg";
  return `https://static.wixstatic.com/media/${mediaId}/v1/fill/w_160,h_160,al_c,q_85,enc_auto/${filename}`;
};

const renderOrderEmail = (params) => {
  const isPrepaid = params.paymentMethod === "PREPAID";
  const paymentLine = isPrepaid
    ? `Payment received online — <strong>nothing to pay on delivery.</strong>`
    : `Cash on Delivery — please keep <strong>${fmtINR(params.amount)}</strong> ready to pay the courier on delivery.`;
  const paymentLabel = isPrepaid ? `Paid online (Razorpay)` : `Cash on Delivery`;
  const addressText = [params.address.line1, params.address.city, params.address.state, params.address.postalCode]
    .filter(Boolean)
    .join(", ");

  const itemsRows = params.items
    .map((it) => {
      const img = toEmailImage(it.image);
      const optionsHtml = (it.options || [])
        .filter((o) => o && o.value)
        .map((o) => `<div style="color:#8c8079;font-size:12px;">${escapeHtml(o.name)}: ${escapeHtml(o.value)}</div>`)
        .join("");
      const skuHtml = it.sku ? `<div style="color:#8c8079;font-size:12px;">SKU: ${escapeHtml(it.sku)}</div>` : "";
      const unitHtml = it.unitPrice
        ? `<div style="color:#8c8079;font-size:12px;">${fmtINR(escapeHtml(it.unitPrice))}</div>`
        : "";
      const thumb = img
        ? `<img src="${escapeHtml(img)}" width="64" height="64" alt="" style="display:block;border-radius:8px;border:1px solid #efe8e4;object-fit:cover;" />`
        : `<div style="width:64px;height:64px;border-radius:8px;background:#f3ece8;"></div>`;
      return `
        <tr>
          <td style="padding:14px 0;border-bottom:1px solid #f0eae6;vertical-align:top;width:64px;">${thumb}</td>
          <td style="padding:14px 12px;border-bottom:1px solid #f0eae6;vertical-align:top;">
            <div style="font-weight:bold;color:#1A1410;">${escapeHtml(it.name)}</div>
            ${skuHtml}${optionsHtml}${unitHtml}
          </td>
          <td style="padding:14px 0;border-bottom:1px solid #f0eae6;vertical-align:top;text-align:center;color:#5c534d;white-space:nowrap;">Qty: ${escapeHtml(it.quantity)}</td>
          <td style="padding:14px 0;border-bottom:1px solid #f0eae6;vertical-align:top;text-align:right;white-space:nowrap;font-weight:bold;color:#1A1410;">${it.lineTotal ? fmtINR(escapeHtml(it.lineTotal)) : ""}</td>
        </tr>`;
    })
    .join("");

  const s = params.summary || {};
  const summaryRow = (label, value, opts = {}) =>
    value == null || value === ""
      ? ""
      : `<tr>
          <td style="padding:6px 0;color:${opts.accent ? BRAND : "#5c534d"};font-weight:${opts.bold ? "bold" : "normal"};font-size:${opts.bold ? "16px" : "14px"};">${escapeHtml(label)}</td>
          <td style="padding:6px 0;text-align:right;color:${opts.accent ? BRAND : "#1A1410"};font-weight:${opts.bold ? "bold" : "normal"};font-size:${opts.bold ? "16px" : "14px"};white-space:nowrap;">${fmtINR(escapeHtml(value))}</td>
        </tr>`;

  const summaryRows =
    summaryRow("Subtotal", s.subtotal) +
    summaryRow("Shipping", s.shipping) +
    summaryRow("Tax", s.tax) +
    (s.discount && Number(s.discount) > 0 ? summaryRow("Discount", `-${s.discount}`, { accent: true }) : "") +
    summaryRow(isPrepaid ? "Total paid" : "Total to pay", s.total || params.amount, { bold: true });

  const subject = `Your Viora Jewels order ${params.orderNumber} is confirmed`;

  const html = `
  <div style="background:#f4efec;padding:24px 0;font-family:Arial,Helvetica,sans-serif;">
    <div style="max-width:620px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #eee2dc;color:#1A1410;">
      <div style="padding:28px 24px 8px;text-align:center;">
        <img src="${LOGO_URL}" alt="Viora Jewels" width="120" style="display:inline-block;max-width:160px;height:auto;" />
      </div>
      <div style="padding:8px 32px 32px;">
        <h1 style="margin:18px 0 4px;font-size:24px;color:#1A1410;">Thanks for your order, ${escapeHtml(params.customerName)}!</h1>
        <p style="margin:0 0 18px;color:#5c534d;">We'll be in touch with updates about your order.</p>
        <table style="width:100%;border-collapse:collapse;margin-bottom:18px;">
          <tr>
            <td style="color:#1A1410;font-weight:bold;">Order ${escapeHtml(params.orderNumber)}</td>
            ${params.orderDate ? `<td style="text-align:right;color:#5c534d;">Placed on ${escapeHtml(params.orderDate)}</td>` : ""}
          </tr>
        </table>
        <div style="background:${isPrepaid ? "#eef7ef" : "#fdf6e9"};border:1px solid ${isPrepaid ? "#cfe8d2" : "#f0e2c0"};border-radius:10px;padding:14px 16px;margin-bottom:24px;">
          <p style="margin:0;color:#1A1410;">${paymentLine}</p>
        </div>
        <h2 style="margin:0 0 6px;font-size:15px;color:${BRAND};text-transform:uppercase;letter-spacing:.5px;">Order Summary</h2>
        <table style="width:100%;border-collapse:collapse;">${itemsRows}</table>
        <table style="width:100%;border-collapse:collapse;margin:14px 0 6px;">${summaryRows}</table>
        <table style="width:100%;border-collapse:collapse;margin-top:26px;">
          <tr>
            <td style="vertical-align:top;width:50%;padding-right:12px;">
              <h3 style="margin:0 0 8px;font-size:14px;color:${BRAND};">Customer</h3>
              <div style="color:#5c534d;line-height:1.6;">
                ${escapeHtml(params.customerName)}<br/>
                ${params.phone ? `${escapeHtml(params.phone)}<br/>` : ""}
                ${escapeHtml(params.to)}
              </div>
            </td>
            <td style="vertical-align:top;width:50%;padding-left:12px;">
              <h3 style="margin:0 0 8px;font-size:14px;color:${BRAND};">Delivery address</h3>
              <div style="color:#5c534d;line-height:1.6;">${escapeHtml(addressText)}</div>
            </td>
          </tr>
        </table>
        <h3 style="margin:26px 0 6px;font-size:14px;color:${BRAND};">Payment</h3>
        <p style="margin:0;color:#5c534d;">${paymentLabel}</p>
        ${params.razorpayPaymentId ? `<p style="margin:2px 0 0;color:#9a8f88;font-size:12px;">Payment ID: ${escapeHtml(params.razorpayPaymentId)}</p>` : ""}
        <div style="border-top:1px solid #f0eae6;margin-top:28px;padding-top:20px;">
          <h3 style="margin:0 0 6px;font-size:15px;color:#1A1410;">Need assistance? Contact us.</h3>
          <p style="margin:0 0 6px;color:#5c534d;">We'll do everything we can to make sure you have a great experience with us.</p>
          <p style="margin:0;color:#5c534d;">Email us: <a href="mailto:${SUPPORT_EMAIL}" style="color:${BRAND};">${SUPPORT_EMAIL}</a></p>
        </div>
        <div style="text-align:center;margin-top:24px;">
          <a href="${SITE_URL}" style="display:inline-block;background:${BRAND};color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:999px;font-weight:bold;">Visit our store</a>
        </div>
      </div>
      <div style="background:#faf7f5;padding:16px;text-align:center;color:#9a8f88;font-size:12px;">
        © Viora Jewels · <a href="${SITE_URL}" style="color:#9a8f88;">${SITE_URL.replace(/^https?:\/\//, "")}</a>
      </div>
    </div>
  </div>`;

  const textLines = [
    `Thanks for your order, ${params.customerName}!`,
    `Order ${params.orderNumber}${params.orderDate ? ` — placed on ${params.orderDate}` : ""}`,
    "",
    isPrepaid ? `Payment received online — nothing to pay on delivery.` : `Cash on Delivery — keep ${fmtINR(params.amount)} ready for the courier.`,
    "",
    "Order summary:",
    ...params.items.map((it) => {
      const opts = (it.options || []).filter((o) => o && o.value).map((o) => `${o.name}: ${o.value}`).join(", ");
      return `- ${it.name}${opts ? ` (${opts})` : ""} x${it.quantity}${it.lineTotal ? ` — ${fmtINR(it.lineTotal)}` : ""}`;
    }),
    "",
    s.subtotal ? `Subtotal: ${fmtINR(s.subtotal)}` : "",
    s.shipping ? `Shipping: ${fmtINR(s.shipping)}` : "",
    s.tax ? `Tax: ${fmtINR(s.tax)}` : "",
    s.discount && Number(s.discount) > 0 ? `Discount: -${fmtINR(s.discount)}` : "",
    `${isPrepaid ? "Total paid" : "Total to pay"}: ${fmtINR(s.total || params.amount)}`,
    `Payment method: ${paymentLabel}`,
    params.razorpayPaymentId ? `Payment ID: ${params.razorpayPaymentId}` : "",
    "",
    `Delivery address: ${addressText}`,
    params.phone ? `Phone: ${params.phone}` : "",
    "",
    `Need help? Email ${SUPPORT_EMAIL}`,
    SITE_URL,
  ].filter(Boolean);

  return { subject, html, text: textLines.join("\n") };
};

// --------------------------------------------------------------------------
// Wix order -> email params mapping (mirrors checkout/route.ts)
// --------------------------------------------------------------------------
const findOrderByNumber = async (number) => {
  const res = await wixClient.orders.searchOrders({
    filter: { number: String(number) },
  });
  const list = res?.orders || [];
  return list[0] || null;
};

const wixOrderToEmailParams = (order) => {
  const email = order?.buyerInfo?.email;
  const firstName = order?.billingInfo?.contactDetails?.firstName || "";
  const lastName = order?.billingInfo?.contactDetails?.lastName || "";
  const customerName = [firstName, lastName].filter(Boolean).join(" ") || "Customer";
  const phone = order?.billingInfo?.contactDetails?.phone || "";

  // Detect prepaid via the custom field we set on the checkout.
  const customFields = order?.customFields || [];
  const paymentMethodField = customFields.find((f) => f?.title === "Payment Method")?.value || "";
  const razorpayPaymentId = customFields.find((f) => f?.title === "Razorpay Payment ID")?.value || undefined;
  const paymentMethod = /prepaid|razorpay/i.test(paymentMethodField) ? "PREPAID" : "COD";

  const ps = order?.priceSummary || {};
  const total = ps?.total?.amount;
  const summary = {
    subtotal: ps?.subtotal?.amount || undefined,
    shipping: ps?.shipping?.amount || undefined,
    tax: ps?.tax?.amount || undefined,
    discount: ps?.discount?.amount || undefined,
    total: total || undefined,
  };

  const items = (order?.lineItems || []).map((li) => ({
    name: li?.productName?.original || li?.productName?.translated || "Item",
    quantity: Number(li?.quantity) || 1,
    sku: li?.physicalProperties?.sku || li?.catalogReference?.options?.sku || undefined,
    options: (li?.descriptionLines || [])
      .map((dl) => ({
        name: dl?.name?.original || dl?.name?.translated || "",
        value:
          dl?.colorInfo?.original ||
          dl?.colorInfo?.translated ||
          dl?.plainText?.original ||
          dl?.plainText?.translated ||
          "",
      }))
      .filter((o) => o.name && o.value),
    unitPrice: li?.price?.amount || undefined,
    lineTotal:
      li?.totalPriceAfterTax?.amount ||
      li?.totalPriceBeforeTax?.amount ||
      li?.price?.amount ||
      undefined,
    image: li?.image || undefined,
  }));

  const addr = order?.billingInfo?.address || order?.shippingInfo?.shippingDestination?.address || {};
  const createdDate = order?._createdDate || order?.createdDate || Date.now();
  const orderDate = new Date(createdDate).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

  return {
    to: email,
    customerName,
    orderNumber: `#${order.number}`,
    orderDate,
    paymentMethod,
    amount: total || "0",
    razorpayPaymentId,
    items,
    summary,
    address: {
      line1: addr.addressLine1,
      city: addr.city,
      state: addr.subdivision,
      postalCode: addr.postalCode,
    },
    phone,
  };
};

// --------------------------------------------------------------------------
// Send
// --------------------------------------------------------------------------
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
});

const DRY_RUN = process.env.DRY_RUN === "1";

const results = [];
for (const num of orderNumbers) {
  try {
    const order = await findOrderByNumber(num);
    if (!order) {
      console.log(`[${num}] NOT FOUND`);
      results.push({ num, status: "not-found" });
      continue;
    }
    const params = wixOrderToEmailParams(order);
    if (!params.to) {
      console.log(`[${num}] no buyer email on order — skipping`);
      results.push({ num, status: "no-email" });
      continue;
    }
    const { subject, html, text } = renderOrderEmail(params);

    if (DRY_RUN) {
      console.log(`[${num}] DRY_RUN — would send to ${params.to} (${params.paymentMethod}, ₹${params.amount})`);
      results.push({ num, status: "dry-run", to: params.to });
      continue;
    }

    await transporter.sendMail({
      from: `"Viora Jewels" <${GMAIL_USER}>`,
      to: params.to,
      subject,
      text,
      html,
    });
    console.log(`[${num}] SENT to ${params.to} (${params.paymentMethod}, ₹${params.amount})`);
    results.push({ num, status: "sent", to: params.to });
  } catch (err) {
    console.error(`[${num}] FAILED:`, err?.message || err);
    results.push({ num, status: "error", error: err?.message || String(err) });
  }
}

console.log("\nSummary:");
console.table(results);
