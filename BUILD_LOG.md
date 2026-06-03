# VIORA — Build Log

## 2026-05-26 — Razorpay go-live + prepaid order amount fix

### 1. Razorpay switched from TEST to LIVE
- The checkout popup showed the red **"TEST MODE"** ribbon because test keys (`rzp_test_...`) were in use. The mode is driven entirely by `RAZORPAY_KEY_ID` (server) which the client checkout uses — no code change needed to flip it.
- Updated `VIORA/.env.local` with **live** keys: `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `NEXT_PUBLIC_RAZORPAY_KEY_ID` (all `rzp_live_...`). `.env.local` is gitignored.
- **TODO:** confirm the same 3 live values are set on **Vercel (Production)** and that the site was **redeployed** (`NEXT_PUBLIC_` is baked at build time).

### 2. Prepaid orders showed the wrong amount everywhere (MAIN FIX)
**Problem:** The flat ₹50 "pay online" discount was only subtracted from the Razorpay charge (customer paid ₹479), but the Wix order total stayed at the pre-discount amount (₹529). So Wix admin, the confirmation email, and the website "My Orders" all showed ₹529 — breaking sales totals. The email also said "pay cash to courier" on already-paid orders.

**Why it wasn't a one-liner:** the installed `@wix/ecom` checkout SDK can't apply a free-form discount that stacks on a coupon (negative custom-line-item price blocked; `MerchantDiscountInput` not wired in; coupons are one-per-cart).

**Solution (commit `9761879`, 4 files):**
- `src/lib/wixAdminClientServer.ts` — registered the `draftOrders` module.
- `src/app/api/wix/checkout/route.ts` — after the normal order is created (checkout → createOrder → APPROVED), for **prepaid** orders: create a draft of that order (`createDraftOrder({ sourceOrderId })`), apply the difference (`wixOrderTotal − amountPaid`) as a GLOBAL custom discount (`createCustomDiscounts`), commit it back (`commitDraftOrder`, buyer/business notifications off), then record the payment for the final total. The whole block is try-catch best-effort: a failure leaves the order intact and just records the real amount paid — it **never blocks an order**.
- `src/lib/orderEmail.ts` (new) — sends our own branded confirmation email via Gmail/nodemailer with the correct amount and correct payment status (for both COD and prepaid).
- `src/app/orders/[id]/page.tsx` — order-detail now shows the order **total (amount paid)** instead of the pre-discount subtotal. (The list page already used the total.)
- `npx tsc --noEmit` passes clean.

**TODO before trusting it:**
- Turn OFF Wix's automatic order-confirmation email (Wix dashboard → Settings → Notifications/Automations → "Order confirmation") so customers don't get two emails.
- **Test one real small prepaid order** — the draft-order flow is UNTESTED against the live Wix API. Verify: Wix total = amount paid, order = fully PAID (no balance), branded email correct.

### 3. Forgot-password (investigated, left as-is by user's choice)
- The reset email works, but its link opens the **Wix template site** (`marsiqsystem.wixsite.com`) — that reset page is hosted/controlled by Wix. Making it use our own site needs a full custom reset flow (new page + token handling + Wix dashboard config). Deferred.

### ⚠️ Deploy / git BLOCKER (open)
- `git push` fails: remote `github.com/marsiqsystem/VIORA.git` → **"Repository not found"** (even from the user's own machine). The repo doesn't exist / was renamed / is under another account.
- This local git committed only ~half the app; ~19 source files (incl. the whole Razorpay/Wix checkout integration) were **never committed**. No `.vercel/` link present. Vercel CLI is installed (v54.4.1).
- So the live site is **not** deploying from this remote. Commit `9761879` is **local only**.
- **Next step:** clarify with the user how they actually deploy, then get the commit live. Simplest reliable fallback: `vercel link` + `vercel --prod` from the `VIORA/` folder.
