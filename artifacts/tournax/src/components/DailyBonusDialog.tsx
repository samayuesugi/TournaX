import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { SilverCoinIcon } from "@/components/ui/Coins";

interface DailyBonusDialogProps {
  open: boolean;
  onClose: () => void;
  bonus: number;
  silverCoins: number;
}

export function DailyBonusDialog({ open, onClose, bonus, silverCoins }: DailyBonusDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-xs p-0 overflow-hidden border-0">
        <div className="relative flex flex-col items-center text-center bg-gradient-to-b from-[#1a1040] via-[#130d30] to-background rounded-2xl overflow-hidden px-6 pt-8 pb-6">
          <div className="absolute inset-0 pointer-events-none">
            {[...Array(18)].map((_, i) => (
              <span
                key={i}
                className="absolute w-1 h-1 rounded-full bg-white/20 animate-pulse"
                style={{
                  left: `${Math.random() * 100}%`,
                  top: `${Math.random() * 60}%`,
                  animationDelay: `${(i * 0.3) % 2}s`,
                }}
              />
            ))}
          </div>

          <div className="relative mb-4">
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-violet-600/40 to-purple-900/40 flex items-center justify-center ring-2 ring-violet-500/30">
              <SilverCoinIcon size="lg" className="w-10 h-10" />
            </div>
            <div className="absolute -top-1 -right-1 bg-green-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full shadow">
              +{bonus}
            </div>
          </div>

          <p className="text-xs font-semibold text-violet-400 uppercase tracking-widest mb-1">Daily Login Bonus</p>
          <h2 className="text-2xl font-extrabold text-white mb-1">+{bonus} Silver Coins</h2>
          <p className="text-sm text-muted-foreground mb-5">
            App kholo, coins pao! Aaj ka bonus claim ho gaya.
          </p>

          <div className="w-full bg-white/5 rounded-xl px-4 py-3 flex items-center justify-between mb-5">
            <span className="text-xs text-muted-foreground">Total Silver Coins</span>
            <span className="flex items-center gap-1.5 font-bold text-sm text-white">
              <SilverCoinIcon size="sm" />
              {silverCoins}
            </span>
          </div>

          <Button className="w-full font-semibold" onClick={onClose}>
            Claim Karo!
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
