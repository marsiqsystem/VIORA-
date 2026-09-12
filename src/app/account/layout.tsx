import type { Metadata } from "next";

// Private / transactional page — keep it out of Google's index. Account, cart
// and checkout pages carry no landing-page value, render thin/personalised
// content, and (per Google's own guidance) should be noindexed. follow:true so
// link equity still flows through to the public pages they link to.
export const metadata: Metadata = {
  robots: { index: false, follow: true },
};

export default function NoIndexLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
