"use client";

import { useEffect, useState } from "react";
import { EMPTY_SOCIAL_PROOF, type SocialProof } from "@/lib/socialProof";

// One fetch per page load, shared by every component that shows social proof.
let proofPromise: Promise<SocialProof> | null = null;

const loadSocialProof = () => {
  if (!proofPromise) {
    proofPromise = fetch("/api/social-proof")
      .then((res) => (res.ok ? res.json() : EMPTY_SOCIAL_PROOF))
      .catch(() => {
        proofPromise = null;
        return EMPTY_SOCIAL_PROOF;
      });
  }
  return proofPromise;
};

/** Real weekly order counts (already filtered to the display thresholds). */
export function useSocialProof(): SocialProof {
  const [proof, setProof] = useState<SocialProof>(EMPTY_SOCIAL_PROOF);
  useEffect(() => {
    let alive = true;
    loadSocialProof().then((data) => {
      if (alive) setProof(data);
    });
    return () => {
      alive = false;
    };
  }, []);
  return proof;
}
