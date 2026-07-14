// Wix's "Duplicate" action clones a product into a new one whose slug is
// prefixed `copy-of-`. Those clones carry the original's name, images, price and
// description, so anything that advertises them is publishing a second URL that
// sells the identical item:
//
//   /copy-of-ethnic-jewellery-set-red   ~=  /ethnic-jewellery-set-red
//   /copy-of-celestial-bloom-set-purple ~=  /celestial-bloom-set-purple
//
// Left alone they cost us three ways: Google and Bing see duplicate content and
// have to guess which URL is canonical, Merchant Center ingests two items for one
// product, and any authority the real product earns gets split across two URLs.
//
// The permanent fix is deleting or renaming them in the Wix admin — this module
// cannot do that. Until someone does, treat a `copy-of-` slug as non-canonical
// everywhere we would otherwise advertise it: the sitemap, the Shopping feed, and
// the product page's own robots meta.
//
// The pages still render and still sell. This suppresses discovery, not access —
// so a customer holding a link is never blocked.

export const isDuplicateSlug = (slug: string | null | undefined): boolean =>
  typeof slug === "string" && /^copy-of-/i.test(slug.trim());
