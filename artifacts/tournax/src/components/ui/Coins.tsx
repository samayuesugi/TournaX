import { cn } from "@/lib/utils";

const GOLD_COIN_SRC = "/tournax-coin.png";
const SILVER_COIN_SRC = "/silver-coin.png";

interface CoinProps {
  amount: number | string;
  className?: string;
  size?: "sm" | "md" | "lg";
}

function iconSize(size: "sm" | "md" | "lg") {
  if (size === "sm") return "w-3.5 h-3.5";
  if (size === "lg") return "w-5 h-5";
  return "w-4 h-4";
}

export function GoldCoin({ amount, className, size = "md" }: CoinProps) {
  return (
    <span className={cn("inline-flex items-center gap-1", className)}>
      <span>{amount}</span>
      <img src={GOLD_COIN_SRC} alt="TournaX Coin" className={cn("shrink-0 object-contain", iconSize(size))} />
    </span>
  );
}

export function SilverCoin({ amount, className, size = "md" }: CoinProps) {
  return (
    <span className={cn("inline-flex items-center gap-0.5", className)}>
      <img src={SILVER_COIN_SRC} alt="Silver" className={cn("shrink-0 object-contain", iconSize(size))} />
      <span>{amount}</span>
    </span>
  );
}

export function GoldCoinIcon({ className, size = "md" }: { className?: string; size?: "sm" | "md" | "lg" }) {
  return (
    <img src={GOLD_COIN_SRC} alt="TournaX Coin" className={cn("shrink-0 object-contain", iconSize(size), className)} />
  );
}

export function SilverCoinIcon({ className, size = "md" }: { className?: string; size?: "sm" | "md" | "lg" }) {
  return (
    <img src={SILVER_COIN_SRC} alt="Silver" className={cn("shrink-0 object-contain", iconSize(size), className)} />
  );
}
