"use client";
import React, { useState } from "react";
import Image from "next/image";
import { trackContact, trackLead } from "@/lib/metaPixel";
import BackButton from "@/components/BackButton";

const CONTACT_EMAIL = "viorajewels6@gmail.com";

const ContactPage = () => {
  const [formData, setFormData] = useState({
    title: "",
    firstName: "",
    lastName: "",
    email: "",
    query: "",
  });
  const [showPopup, setShowPopup] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >
  ) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitError("");
    setSubmitting(true);

    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || "Failed to send your message.");
      }

      trackLead();
      setShowPopup(true);
      setFormData({
        title: "",
        firstName: "",
        lastName: "",
        email: "",
        query: "",
      });
    } catch (err: any) {
      setSubmitError(err?.message || "Failed to send. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-platinum">
      {/* Hero Section */}
      <div className="relative h-[50vh] md:h-[60vh] overflow-hidden">
        <Image
          src="/contact-us-optimized.jpg"
          alt="Contact Viora Jewels"
          fill
          sizes="100vw"
          quality={70}
          className="object-cover"
          priority
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/40 to-transparent" />
        <div className="absolute inset-0 flex items-center justify-center text-center">
          <div className="max-w-3xl px-6">
            <div className="mb-6 flex items-center justify-center gap-2">
              <BackButton className="bg-white/80 shadow-sm backdrop-blur" />
              <span className="text-sm font-medium text-white/80">Back</span>
            </div>
            <h1 className="text-4xl md:text-6xl lg:text-7xl font-playfair font-bold text-white mb-4 animate-fade-in-up">
              Contact Us
            </h1>
            <p className="text-lg md:text-xl text-gray-200 animate-fade-in-up stagger-1">
              We&apos;d love to hear from you
            </p>
          </div>
        </div>
      </div>

      {/* Introduction */}
      <div className="container-responsive py-12 md:py-16">
        <div className="max-w-3xl mx-auto text-center">
          <p className="text-lg text-gray-600 leading-relaxed">
            The Viora Jewels team is here for order support, gift guidance,
            product questions, and custom shopping help.
          </p>
        </div>
      </div>

      {/* Main Content */}
      <div className="container-responsive pb-16 md:pb-24">
        <div className="grid md:grid-cols-2 gap-12 lg:gap-16">
          {/* Contact Form */}
          <div className="bg-platinum rounded-lg p-8 shadow-premium border border-silver-light">
            <h2 className="text-2xl font-playfair font-bold text-primary mb-2">
              Send us a message
            </h2>
            <p className="text-gray-600 mb-8">
              Fill in the form below and our team will get back to you as soon as possible.
            </p>

            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Title */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Title
                </label>
                <select
                  name="title"
                  value={formData.title}
                  onChange={handleChange}
                  required
                  className="input"
                >
                  <option value="" disabled>Select Title</option>
                  <option value="Mr">Mr</option>
                  <option value="Mrs">Mrs</option>
                  <option value="Ms">Ms</option>
                  <option value="Dr">Dr</option>
                </select>
              </div>

              {/* Name Fields */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    First Name
                  </label>
                  <input
                    name="firstName"
                    value={formData.firstName}
                    onChange={handleChange}
                    required
                    className="input"
                    placeholder="John"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Last Name
                  </label>
                  <input
                    name="lastName"
                    value={formData.lastName}
                    onChange={handleChange}
                    required
                    className="input"
                    placeholder="Doe"
                  />
                </div>
              </div>

              {/* Email */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Email Address
                </label>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  required
                  className="input"
                  placeholder="john@example.com"
                />
              </div>

              {/* Query */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Your Message
                </label>
                <textarea
                  name="query"
                  value={formData.query}
                  onChange={handleChange}
                  required
                  className="input min-h-[120px] resize-none"
                  placeholder="How can we help you?"
                  rows={4}
                ></textarea>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={submitting}
                className="w-full btn-primary disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {submitting ? "Sending..." : "Send Message"}
              </button>

              {submitError && (
                <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">
                  {submitError}
                </p>
              )}
            </form>
          </div>

          {/* Contact Info */}
          <div className="space-y-8">
            <div>
              <h2 className="text-2xl font-playfair font-bold text-primary mb-2">
                Get in Touch
              </h2>
              <p className="text-gray-600">
                Connect with us through your preferred channel. We&apos;re always here to help.
              </p>
            </div>

            {/* Contact Cards */}
            <div className="space-y-4">
              {/* Instagram */}
              <a
                href="https://www.instagram.com/_viorajewels_?igsh=bGV3eTFjazIwejNs"
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => trackContact()}
                className="block p-6 bg-viora-gradient rounded-xl hover:shadow-premium transition-all duration-300 group"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-500 mb-1">Follow us on</p>
                    <p className="text-xl font-playfair font-bold text-primary">Instagram</p>
                  </div>
                  <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center shadow-md group-hover:scale-110 transition-transform">
                    <Image
                      src="/instagram.png"
                      width={24}
                      height={24}
                      alt="Instagram"
                    />
                  </div>
                </div>
              </a>

              {/* Facebook */}
              <a
                href="https://www.facebook.com/profile.php?id=61589962820647"
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => trackContact()}
                className="block p-6 bg-viora-gradient rounded-xl hover:shadow-premium transition-all duration-300 group"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-500 mb-1">Like us on</p>
                    <p className="text-xl font-playfair font-bold text-primary">Facebook</p>
                  </div>
                  <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center shadow-md group-hover:scale-110 transition-transform">
                    <svg className="w-6 h-6 text-[#1877F2]" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                    </svg>
                  </div>
                </div>
              </a>

              {/* Email */}
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                onClick={() => trackContact()}
                className="block p-6 bg-viora-gradient rounded-xl hover:shadow-premium transition-all duration-300 group"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-500 mb-1">Send us an email</p>
                    <p className="text-xl font-playfair font-bold text-primary">{CONTACT_EMAIL}</p>
                  </div>
                  <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center shadow-md group-hover:scale-110 transition-transform">
                    <svg className="w-6 h-6 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                  </div>
                </div>
              </a>
            </div>

            {/* Registered Address */}
            <div className="bg-silver-light rounded-lg p-6">
              <h3 className="font-playfair font-bold text-primary mb-4">Registered Address</h3>
              <address className="not-italic text-sm text-gray-700 leading-relaxed">
                <strong className="text-primary">Viora Jewel</strong>
                <br />
                38C B.T. Road (Kalpana Apartment), 1st Floor, Flat 1A
                <br />
                Kolkata &ndash; 700056
                <br />
                West Bengal, India
              </address>
            </div>

            {/* Business Hours */}
            <div className="bg-silver-light rounded-lg p-6">
              <h3 className="font-playfair font-bold text-primary mb-4">Business Hours</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Monday - Friday</span>
                  <span className="text-primary font-medium">9:00 AM - 6:00 PM</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Saturday</span>
                  <span className="text-primary font-medium">10:00 AM - 4:00 PM</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Sunday</span>
                  <span className="text-gray-400">Closed</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Thank-You Popup */}
      {showPopup && (
        <div className="fixed inset-0 flex justify-center items-center bg-black/50 z-50 p-4">
          <div className="bg-white p-8 rounded-2xl shadow-premium-hover text-center max-w-md w-full animate-scale-in">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h3 className="text-2xl font-playfair font-bold text-primary mb-2">Thank You!</h3>
            <p className="text-gray-600 mb-6">
              Your message has been delivered to our team. We&apos;ll get back to you shortly.
            </p>
            <button
              onClick={() => setShowPopup(false)}
              className="btn-primary"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ContactPage;
