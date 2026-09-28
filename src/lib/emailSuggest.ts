// "Did you mean …@gmail.com?" — catches the common typos that make an order
// confirmation email bounce.
const COMMON_DOMAINS = [
  "gmail.com",
  "yahoo.com",
  "yahoo.in",
  "hotmail.com",
  "outlook.com",
  "icloud.com",
  "rediffmail.com",
  "live.com",
];

const editDistance = (a: string, b: string) => {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
  }
  return dp[a.length][b.length];
};

/** A corrected address when the domain is one or two keystrokes off a common one, else null. */
export const suggestEmail = (email: string): string | null => {
  const match = email.trim().toLowerCase().match(/^([^@\s]+)@([^@\s]+)$/);
  if (!match) return null;
  const [, local, domain] = match;
  if (COMMON_DOMAINS.includes(domain)) return null;
  let best: string | null = null;
  let bestDistance = 3;
  for (const candidate of COMMON_DOMAINS) {
    const distance = editDistance(domain, candidate);
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best ? `${local}@${best}` : null;
};
