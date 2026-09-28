"use client";

import { useState } from "react";
import { trackLead } from "@/lib/metaPixel";
import { HONEYPOT_FIELD } from "@/lib/apiGuard";
import { whatsappLink } from "@/lib/contact";

const EMPTY_FORM = {
  name: "",
  email: "",
  orderNumber: "",
  query: "",
  // Honeypot: /api/contact rejects any submission where this is non-empty.
  [HONEYPOT_FIELD]: "",
};

const INPUT =
  "w-full rounded-md border border-gray-300 bg-white px-3 py-2.5 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent/20";

/** Short enquiry form → /api/contact (emailed to the owner, reply-to the shopper). */
const ContactForm = () => {
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [sentTo, setSentTo] = useState<{ name: string; email: string } | null>(null);

  const update = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm({ ...form, [e.target.name]: e.target.value });

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (submitting) return;
    setError("");
    setSubmitting(true);
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Failed to send your message.");
      trackLead();
      setSentTo({ name: form.name.trim().split(/\s+/)[0], email: form.email.trim() });
      setForm(EMPTY_FORM);
    } catch (err: any) {
      setError(err?.message || "Failed to send. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (sentTo) {
    return (
      <div className="border border-green-200 bg-green-50 p-6" role="status">
        <p className="font-playfair text-2xl font-bold text-primary">Thanks, {sentTo.name} — message sent</p>
        <p className="mt-2 text-sm text-gray-700">
          We&apos;ll reply to <b>{sentTo.email}</b>. Need an answer sooner?{" "}
          <a
            href={whatsappLink("Hi Viora, I just sent a message from the website")}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-accent underline underline-offset-2"
          >
            WhatsApp us
          </a>
          .
        </p>
        <button
          type="button"
          onClick={() => setSentTo(null)}
          className="mt-4 text-sm font-semibold text-primary underline underline-offset-2"
        >
          Send another message
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {/* Honeypot: off-screen rather than display:none, never focusable or announced. */}
      <input
        type="text"
        name={HONEYPOT_FIELD}
        value={form[HONEYPOT_FIELD]}
        onChange={update}
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        style={{ position: "absolute", left: "-9999px", width: "1px", height: "1px", opacity: 0 }}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-gray-700">Your name</span>
          <input name="name" value={form.name} onChange={update} required maxLength={100} autoComplete="name" className={INPUT} />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-gray-700">Email</span>
          <input
            type="email"
            name="email"
            value={form.email}
            onChange={update}
            required
            maxLength={120}
            autoComplete="email"
            className={INPUT}
          />
        </label>
      </div>
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-gray-700">
          Order number <span className="font-normal text-gray-400">(if it&apos;s about an order)</span>
        </span>
        <input name="orderNumber" value={form.orderNumber} onChange={update} maxLength={30} inputMode="numeric" className={INPUT} />
      </label>
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-gray-700">How can we help?</span>
        <textarea name="query" value={form.query} onChange={update} required rows={5} maxLength={3000} className={`${INPUT} resize-none`} />
      </label>
      {error && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={submitting}
        className="flex h-12 w-full items-center justify-center bg-accent text-sm font-bold uppercase tracking-wider text-white hover:bg-[#7d1527] disabled:opacity-60"
      >
        {submitting ? "Sending…" : "Send message"}
      </button>
    </form>
  );
};

export default ContactForm;
