import { wixAdminClientServer } from "./wixAdminClientServer";

const NEWSLETTER_LABEL_KEY = "custom.newsletter-subscriber";
const NEWSLETTER_LABEL_NAME = "Newsletter Subscriber";

const ensureNewsletterLabel = async (
  client: ReturnType<typeof wixAdminClientServer>
): Promise<string> => {
  const res = await client.labels.findOrCreateLabel(NEWSLETTER_LABEL_NAME);
  return res.label?.key || NEWSLETTER_LABEL_KEY;
};

/**
 * Adds an email to Wix Contacts and tags it with the Newsletter label.
 * Idempotent: if the contact already exists, we still ensure the label is
 * applied. Never throws — this must not block the subscribe request.
 */
export const upsertNewsletterSubscriber = async (
  email: string
): Promise<{ ok: boolean; contactId?: string; reason?: string }> => {
  try {
    const client = wixAdminClientServer();
    const labelKey = await ensureNewsletterLabel(client);

    let contactId: string | undefined;

    try {
      const created = await client.contacts.createContact({
        emails: { items: [{ email }] },
      });
      contactId = created?.contact?._id;
    } catch {
      // Likely duplicate — fall through and query.
    }

    if (!contactId) {
      const q = await client.contacts
        .queryContacts()
        .eq("primaryInfo.email", email)
        .limit(1)
        .find();
      contactId = q.items?.[0]?._id;
    }

    if (!contactId) {
      return { ok: false, reason: "Could not resolve contact id after create/query." };
    }

    await client.contacts.labelContact(contactId, [labelKey]);
    return { ok: true, contactId };
  } catch (err: any) {
    console.error("Wix contact upsert failed:", err?.message || err);
    return { ok: false, reason: err?.message || "unknown" };
  }
};
