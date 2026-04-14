import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Home,
  Compass,
  Swords,
  User,
  Trophy,
  X,
  ChevronRight,
  ChevronLeft,
  Coins,
  Bot,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "tournax_onboarding_done";

const steps = [
  {
    icon: Trophy,
    color: "text-yellow-400",
    bg: "bg-yellow-400/10",
    title: "Welcome to TournaX!",
    description:
      "Compete in gaming tournaments, win real prizes, and rise up the leaderboard. Let's show you around.",
  },
  {
    icon: Home,
    color: "text-violet-400",
    bg: "bg-violet-400/10",
    title: "Home — Find Tournaments",
    description:
      "Browse live and upcoming matches for BGMI, Free Fire, COD Mobile, and more. Filter by game, mode (Solo / Duo / Squad), entry fee, and map to find your perfect match.",
  },
  {
    icon: Coins,
    color: "text-yellow-400",
    bg: "bg-yellow-400/10",
    title: "Wallet — Gold & Silver Coins",
    description:
      "TournaX Coins are used to enter tournaments and the cosmetics store (1₹ = 1 TournaX Coin). Top up via UPI instantly from the wallet tab.",
  },
  {
    icon: Compass,
    color: "text-cyan-400",
    bg: "bg-cyan-400/10",
    title: "Explore — Community & Feed",
    description:
      "Follow top players and hosts, see achievement posts, and discover the best tournament organizers. Your social gaming hub.",
  },
  {
    icon: Swords,
    color: "text-red-400",
    bg: "bg-red-400/10",
    title: "My Matches — Track Your Games",
    description:
      "See all the tournaments you've registered for. When a host goes live, your Room ID and Password appear here — jump in and compete!",
  },
  {
    icon: Bot,
    color: "text-purple-400",
    bg: "bg-purple-400/10",
    title: "AI Coach — Get Better",
    description:
      "Not sure how to improve? The AI Coach gives you personalised tips, strategy advice, and answers any gaming question you have.",
  },
  {
    icon: User,
    color: "text-blue-400",
    bg: "bg-blue-400/10",
    title: "Profile — Your Gaming Identity",
    description:
      "Show off your stats, game IDs, and achievements. Build your reputation and let other players follow your journey.",
  },
];

export function OnboardingTour() {
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    const done = localStorage.getItem(STORAGE_KEY);
    if (!done) {
      const timer = setTimeout(() => setVisible(true), 800);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, []);

  const dismiss = () => {
    localStorage.setItem(STORAGE_KEY, "1");
    setVisible(false);
  };

  const next = () => {
    if (step < steps.length - 1) setStep((s) => s + 1);
    else dismiss();
  };

  const prev = () => setStep((s) => Math.max(0, s - 1));

  const current = steps[step];
  const Icon = current.icon;
  const isLast = step === steps.length - 1;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm px-4 pb-8 sm:pb-0"
        >
          <motion.div
            key={step}
            initial={{ opacity: 0, y: 40, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.97 }}
            transition={{ type: "spring", stiffness: 340, damping: 28 }}
            className="relative w-full max-w-sm bg-card border border-border rounded-2xl shadow-2xl p-6 flex flex-col gap-5"
          >
            <button
              onClick={dismiss}
              className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="w-4 h-4" />
            </button>

            <div className={cn("w-14 h-14 rounded-2xl flex items-center justify-center", current.bg)}>
              <Icon className={cn("w-7 h-7", current.color)} />
            </div>

            <div className="space-y-1.5">
              <h2 className="text-lg font-bold text-foreground leading-snug">{current.title}</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">{current.description}</p>
            </div>

            <div className="flex items-center gap-1.5">
              {steps.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setStep(i)}
                  className={cn(
                    "h-1.5 rounded-full transition-all duration-300",
                    i === step ? "w-6 bg-primary" : "w-1.5 bg-muted-foreground/30"
                  )}
                />
              ))}
            </div>

            <div className="flex items-center gap-2">
              {step > 0 && (
                <Button variant="outline" size="sm" className="gap-1" onClick={prev}>
                  <ChevronLeft className="w-3.5 h-3.5" />
                  Back
                </Button>
              )}
              <Button className="flex-1 gap-1" onClick={next}>
                {isLast ? "Let's Go!" : "Next"}
                {!isLast && <ChevronRight className="w-3.5 h-3.5" />}
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
