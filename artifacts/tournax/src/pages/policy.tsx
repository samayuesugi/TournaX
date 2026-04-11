import { Link } from "wouter";
import { Button } from "@/components/ui/button";

const SUPPORT_EMAIL = "support@tournax.com";
const POLICIES: Record<string, { title: string; intro: string; sections: { heading: string; body: string }[] }> = {
  terms: {
    title: "Terms",
    intro: "Use TournaX fairly, follow tournament rules, and keep your account details accurate.",
    sections: [
      { heading: "Account responsibility", body: "You are responsible for your login, profile details, game ID, and all activity from your account." },
      { heading: "Tournament rules", body: "Players and hosts must follow room rules, result submission rules, and fair-play requirements for every match." },
      { heading: "Wallet use", body: "Wallet balance is used for tournament entry, rewards, withdrawals, and approved platform features." },
      { heading: "Fair play", body: "Cheating, fake screenshots, false payment claims, abuse, or repeated disputes can lead to penalties or account restrictions." },
    ],
  },
  privacy: {
    title: "Privacy",
    intro: "TournaX uses your information to run tournaments, wallet requests, support, safety checks, and account features.",
    sections: [
      { heading: "Information collected", body: "We may collect your email, profile name, handle, game details, wallet requests, uploaded receipts, screenshots, and support messages." },
      { heading: "How it is used", body: "Your data is used for login, matchmaking, tournament participation, payments, withdrawals, fraud checks, notifications, and support." },
      { heading: "Sensitive uploads", body: "Payment receipts and result screenshots should only be uploaded for verification and support purposes." },
      { heading: "Contact", body: `For privacy questions, contact ${SUPPORT_EMAIL}.` },
    ],
  },
  "refund-policy": {
    title: "Refund/Withdrawal Policy",
    intro: "Wallet and match-related requests are reviewed based on tournament status, payment proof, and fair-play checks.",
    sections: [
      { heading: "Add balance requests", body: "Gold Coin additions require a valid payment receipt and UTR. False, duplicate, or unclear submissions may be rejected." },
      { heading: "Match refunds", body: "Refunds may apply when a match is cancelled before completion according to platform and host rules." },
      { heading: "Prize distribution", body: "Prizes are released after results are submitted and verified. Suspicious results may require manual review." },
      { heading: "Withdrawals", body: "Withdrawal requests require accurate UPI details and enough wallet balance. Processing time may vary during review." },
      { heading: "Support", body: `For refund or withdrawal help, contact ${SUPPORT_EMAIL}.` },
    ],
  },
};

export default function PolicyPage({ type }: { type: "terms" | "privacy" | "refund-policy" }) {
  const policy = POLICIES[type];

  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="mx-auto w-full max-w-lg">
        <Link href="/auth">
          <Button variant="ghost" className="mb-4 px-0 text-muted-foreground hover:text-foreground">
            ← Back to login
          </Button>
        </Link>
        <div className="rounded-2xl border border-card-border bg-card p-6 shadow-lg">
          <div className="mb-5">
            <img src={`${import.meta.env.BASE_URL}logo.png`} alt="TournaX" className="mb-3 h-10 w-10 rounded-xl object-contain" />
            <h1 className="text-2xl font-bold">{policy.title}</h1>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{policy.intro}</p>
          </div>
          <div className="space-y-4">
            {policy.sections.map((section) => (
              <section key={section.heading} className="rounded-xl border border-border/70 bg-secondary/20 p-4">
                <h2 className="text-sm font-semibold">{section.heading}</h2>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{section.body}</p>
              </section>
            ))}
          </div>
          <p className="mt-5 text-xs text-muted-foreground">Last updated: April 2026</p>
        </div>
      </div>
    </div>
  );
}