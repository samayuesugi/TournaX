import { cn } from "@/lib/utils";

interface CoinProps {
  amount: number | string;
  className?: string;
  size?: "sm" | "md" | "lg";
}

export function GoldCoin({ amount, className, size = "md" }: CoinProps) {
  const iconSize = size === "sm" ? "w-3.5 h-3.5 text-[11px]" : size === "lg" ? "w-5 h-5 text-base" : "w-4 h-4 text-sm";
  return (
    <span className={cn("inline-flex items-center gap-0.5", className)}>
      <span className={cn("inline-flex items-center justify-center rounded-full bg-gradient-to-br from-yellow-300 via-yellow-400 to-amber-500 font-black text-black shrink-0 shadow-sm", iconSize)}>
        G
      </span>
      <span>{amount}</span>
    </span>
  );
}

export function SilverCoin({ amount, className, size = "md" }: CoinProps) {
  const iconSize = size === "sm" ? "w-3.5 h-3.5 text-[11px]" : size === "lg" ? "w-5 h-5 text-base" : "w-4 h-4 text-sm";
  return (
    <span className={cn("inline-flex items-center gap-0.5", className)}>
      <span className={cn("inline-flex items-center justify-center rounded-full bg-gradient-to-br from-slate-200 via-slate-300 to-slate-500 font-black text-slate-800 shrink-0 shadow-sm", iconSize)}>
        S
      </span>
      <span>{amount}</span>
    </span>
  );
}

export function GoldCoinIcon({ className, size = "md" }: { className?: string; size?: "sm" | "md" | "lg" }) {
  const iconSize = size === "sm" ? "w-3.5 h-3.5 text-[11px]" : size === "lg" ? "w-5 h-5 text-base" : "w-4 h-4 text-sm";
  return (
    <span className={cn("inline-flex items-center justify-center rounded-full bg-gradient-to-br from-yellow-300 via-yellow-400 to-amber-500 font-black text-black shrink-0 shadow-sm", iconSize, className)}>
      G
    </span>
  );
}

export function SilverCoinIcon({ className, size = "md" }: { className?: string; size?: "sm" | "md" | "lg" }) {
  const iconSize = size === "sm" ? "w-3.5 h-3.5 text-[11px]" : size === "lg" ? "w-5 h-5 text-base" : "w-4 h-4 text-sm";
  return (
    <span className={cn("inline-flex items-center justify-center rounded-full bg-gradient-to-br from-slate-200 via-slate-300 to-slate-500 font-black text-slate-800 shrink-0 shadow-sm", iconSize, className)}>
      S
    </span>
  );
}
