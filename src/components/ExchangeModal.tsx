"use client";

import { useState } from "react";
import Image from "next/image";
import { uploadToWixMedia } from "@/lib/wixMediaUpload";

type Props = {
  open: boolean;
  onClose: () => void;
  orderId?: string;
};

const REASONS = [
  "Product damaged",
  "Packaging distorted",
  "Wrong item received",
  "Missing parts",
  "Other",
];

const ExchangeModal = ({ open, onClose, orderId }: Props) => {
  const [reason, setReason] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  if (!open) return null;

  const isOther = reason === "Other";

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] || null;
    setFile(f);
    setPreviewUrl(f ? URL.createObjectURL(f) : null);
  };

  const reset = () => {
    setReason("");
    setDescription("");
    setFile(null);
    setPreviewUrl(null);
    setSubmitted(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason) return;
    if (isOther && !description.trim()) return;

    setIsSubmitting(true);
    try {
      // 1) Upload evidence image to Wix Media Manager (if provided).
      let mediaUrl: string | undefined;
      if (file) {
        const uploaded = await uploadToWixMedia(file);
        mediaUrl = uploaded.url;
      }

      // 2) TODO: persist the exchange request via your backend / Wix data collection.
      //    e.g. wixClient.items.insert("ExchangeRequests", { orderId, reason, description, mediaUrl, status: "PENDING" })
      console.log("Exchange submitted:", { orderId, reason, description, mediaUrl });

      setSubmitted(true);
      setTimeout(() => {
        reset();
        onClose();
      }, 1600);
    } catch (err) {
      console.error("Exchange submit failed:", err);
    }
    setIsSubmitting(false);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 md:p-8 max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-xl font-playfair font-bold text-primary">
              Exchange Request
            </h3>
            {orderId && (
              <p className="text-sm text-gray-500 mt-1">
                Order #{orderId.slice(-8)}
              </p>
            )}
          </div>
          <button
            onClick={() => {
              reset();
              onClose();
            }}
            aria-label="Close"
            className="text-gray-400 hover:text-gray-700"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {submitted ? (
          <div className="py-10 text-center">
            <div className="w-14 h-14 mx-auto rounded-full bg-green-100 flex items-center justify-center mb-3">
              <svg className="w-7 h-7 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="font-medium text-primary">Submitted for approval</p>
            <p className="text-sm text-gray-500 mt-1">
              Our team will reach out within 48 hours.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Reason */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Reason
              </label>
              <select
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                required
                className="w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none cursor-pointer"
              >
                <option value="" disabled>
                  Select a reason…
                </option>
                {REASONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>

            {/* Description — only when reason === "Other" */}
            {isOther && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Tell us what happened
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  required={isOther}
                  rows={4}
                  placeholder="Describe the issue with as much detail as possible…"
                  className="w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none"
                />
              </div>
            )}

            {/* Image upload */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Upload a Photo
              </label>
              <input
                type="file"
                accept="image/*"
                onChange={handleFile}
                className="block w-full text-sm text-gray-600 file:mr-4 file:rounded-md file:border-0 file:bg-primary file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-primary-light cursor-pointer"
              />
              {previewUrl && (
                <div className="mt-3 relative w-24 h-24 rounded-md overflow-hidden border border-gray-200">
                  <Image src={previewUrl} alt="preview" fill className="object-cover" unoptimized />
                </div>
              )}
              <p className="text-xs text-gray-500 mt-2">
                Clear photos help our team approve your request faster.
              </p>
            </div>

            <button
              type="submit"
              disabled={isSubmitting || !reason || (isOther && !description.trim())}
              className="w-full rounded-lg bg-accent py-3 px-6 text-sm font-semibold uppercase tracking-wider text-white transition-colors hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSubmitting ? "Submitting…" : "Submit for Approval"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

export default ExchangeModal;
