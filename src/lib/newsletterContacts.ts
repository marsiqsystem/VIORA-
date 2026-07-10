import { wixAdminClientServer } from "./wixAdminClientServer";

const NEWSLETTER_LABEL_KEY = "custom.newsletter-subscriber";
const NEWSLETTER_LABEL_NAME = "Newsletter Subscriber";

// A contact carrying this label has already received the welcome email. It is
// the single source of truth shared by /api/subscribe and the blast script, so
// nobody can ever be welcomed twice — duplicate identical mail to one address
// is what gets a sender marked as spam.
export const WELCOME_SENT_LABEL_KEY = "custom.welcome-email-sent";
export const WELCOME_SENT_LABEL_NAME = "Welcome Email Sent";

const ensureLabel = async (
  client: ReturnType<typeof wixAdminClientServer>,
  name: string,
  fallbackKey: string
): Promise<string> => {
  const res = await client.labels.findOrCreateLabel(name);
  return res.label?.key || fallbackKey;
};

/**
 * Adds an email to Wix Contacts and tags it with the Newsletter label.
 * Idempotent: if the contact already exists, we still ensure the label is
 * applied. Never throws — this must not block the subscribe request.
 *
 * `alreadyWelcomed` reports whether this contact has previously received the
 * welcome email; the caller must not send another one when it is true.
 */
export const upsertNewsletterSubscriber = async (
  email: string
): Promise<{
  ok: boolean;
  contactId?: string;
  alreadyWelcomed?: boolean;
  reason?: string;
}> => {
  try {
    const client = wixAdminClientServer();
    const labelKey = await ensureLabel(client, NEWSLETTER_LABEL_NAME, NEWSLETTER_LABEL_KEY);
    const welcomeKey = await ensureLabel(client, WELCOME_SENT_LABEL_NAME, WELCOME_SENT_LABEL_KEY);

    let contactId: string | undefined;
    let alreadyWelcomed = false;

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
      const existing = q.items?.[0];
      contactId = existing?._id;
      // Pre-existing contact: it may already have been welcomed on an earlier
      // subscribe or by a blast run.
      alreadyWelcomed = (existing?.info?.labelKeys?.items || []).includes(welcomeKey);
    }

    if (!contactId) {
      return { ok: false, reason: "Could not resolve contact id after create/query." };
    }

    await client.contacts.labelContact(contactId, [labelKey]);
    return { ok: true, contactId, alreadyWelcomed };
  } catch (err: any) {
    console.error("Wix contact upsert failed:", err?.message || err);
    return { ok: false, reason: err?.message || "unknown" };
  }
};

/**
 * Records that `contactId` has received the welcome email. Never throws — a
 * failure here only risks a future duplicate, which the caller logs.
 */
export const markWelcomeSent = async (contactId: string): Promise<boolean> => {
  try {
    const client = wixAdminClientServer();
    const welcomeKey = await ensureLabel(client, WELCOME_SENT_LABEL_NAME, WELCOME_SENT_LABEL_KEY);
    await client.contacts.labelContact(contactId, [welcomeKey]);
    return true;
  } catch (err: any) {
    console.error("Could not mark welcome-sent:", err?.message || err);
    return false;
  }
};
