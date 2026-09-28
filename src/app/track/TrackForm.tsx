"use client";

import { useState } from "react";

const TrackForm = ({ initialOrder }: { initialOrder?: string }) => {
  const [order, setOrder] = useState(initialOrder || "");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order, phone }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.orderId) throw new Error(data?.error || "Something went wrong. Please try again.");
      window.location.assign(`/orders/${data.orderId}`);
    } catch (err: any) {
      setError(err?.message || "Something went wrong. Please try again.");
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <label className="block">
        <span className="text-sm font-medium text-gray-700">Order number</span>
        <input
          name="order"
          inputMode="numeric"
          autoComplete="off"
          placeholder="e.g. 10354"
          value={order}
          onChange={(e) => setOrder(e.target.value)}
          className="mt-1 h-12 w-full border border-gray-300 bg-white px-3 text-base outline-none focus:border-accent"
          required
        />
      </label>
      <label className="block">
        <span className="text-sm font-medium text-gray-700">Mobile number used for the order</span>
        <span className="mt-1 flex h-12 items-center border border-gray-300 bg-white focus-within:border-accent">
          <span className="border-r border-gray-300 px-3 text-base text-gray-500">+91</span>
          <input
            name="phone"
            type="tel"
            inputMode="numeric"
            autoComplete="tel-national"
            placeholder="98765 43210"
            maxLength={14}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="h-full w-full bg-transparent px-3 text-base outline-none"
            required
          />
        </span>
      </label>
      {error && (
        <p className="bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={busy}
        className="min-h-[48px] w-full bg-accent text-sm font-bold uppercase tracking-wider text-white hover:bg-primary disabled:opacity-60"
      >
        {busy ? "Finding your order…" : "Track my order"}
      </button>
    </form>
  );
};

export default TrackForm;
