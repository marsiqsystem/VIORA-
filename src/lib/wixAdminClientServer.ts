import { ApiKeyStrategy, createClient } from "@wix/sdk";
import { checkout, orders, orderTransactions, draftOrders } from "@wix/ecom";

export const wixAdminClientServer = () => {
  const apiKey = process.env.WIX_API_KEY;
  const siteId = process.env.WIX_SITE_ID;
  const accountId = process.env.WIX_ACCOUNT_ID;

  if (!apiKey || (!siteId && !accountId)) {
    throw new Error(
      "Wix API key authentication is not configured. Set WIX_API_KEY and WIX_SITE_ID or WIX_ACCOUNT_ID."
    );
  }

  return createClient({
    modules: { checkout, orders, orderTransactions, draftOrders },
    auth: ApiKeyStrategy({
      apiKey,
      ...(siteId ? { siteId } : { accountId: accountId! }),
    }),
  });
};
