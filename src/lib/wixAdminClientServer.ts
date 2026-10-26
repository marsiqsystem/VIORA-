import { ApiKeyStrategy, createClient } from "@wix/sdk";
import { checkout, orders, orderTransactions, draftOrders, orderFulfillments } from "@wix/ecom";
import { contacts, labels } from "@wix/crm";
import { reviews } from "@wix/reviews";
import { files } from "@wix/media";

export const wixAdminClientServer = () => {
  const apiKey = process.env.WIX_API_KEY;
  const siteId = process.env.WIX_SITE_ID;
  const accountId = process.env.WIX_ACCOUNT_ID;

  if (!apiKey || (!siteId && !accountId)) {
    throw new Error(
      "Wix API key authentication is not configured. Set WIX_API_KEY and WIX_SITE_ID or WIX_ACCOUNT_ID."
    );
  }

  // `reviews` + `files` let the server post a product review and upload its photo
  // as ADMIN — used by the WhatsApp-native review capture (no customer login). The
  // API key must carry "Wix Reviews — Manage Reviews" + Media Manager permissions.
  return createClient({
    modules: { checkout, orders, orderTransactions, draftOrders, orderFulfillments, contacts, labels, reviews, files },
    auth: ApiKeyStrategy({
      apiKey,
      ...(siteId ? { siteId } : { accountId: accountId! }),
    }),
  });
};
