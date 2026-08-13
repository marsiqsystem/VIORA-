// node --env-file=.env.local scripts/diag-product-image.mjs [slug]
import { ApiKeyStrategy, createClient } from "@wix/sdk";
import { products } from "@wix/stores";
const { WIX_API_KEY, WIX_SITE_ID, WIX_ACCOUNT_ID } = process.env;
const client = createClient({
  modules: { products },
  auth: ApiKeyStrategy({ apiKey: WIX_API_KEY, ...(WIX_SITE_ID ? { siteId: WIX_SITE_ID } : { accountId: WIX_ACCOUNT_ID }) }),
});
const slug = process.argv[2];
if (slug) {
  const res = await client.products.queryProducts().eq("slug", slug).find();
  const p = res.items?.[0];
  console.log(p ? `FOUND: ${p.name}\n  slug=${p.slug}\n  image=${p.media?.mainMedia?.image?.url || p.media?.items?.[0]?.image?.url}` : "NOT FOUND");
} else {
  const res = await client.products.queryProducts().limit(6).find();
  for (const p of res.items || []) console.log(`slug=${p.slug}\n  name=${p.name}\n  image=${p.media?.mainMedia?.image?.url}\n`);
}
