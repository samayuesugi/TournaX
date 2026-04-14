import { useState, useEffect } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { GoldCoinIcon } from "@/components/ui/Coins";

interface DailyBonusDialogProps {
  open: boolean;
  onClose: () => void;
  bonus: number;
}

const CONFETTI_COLORS = [
  "#a855f7", "#7c3aed", "#6366f1", "#ec4899",
  "#f59e0b", "#10b981", "#3b82f6", "#f97316",
];

function randomBetween(a: number, b: number) {
  return a + Math.random() * (b - a);
}

const PARTICLES = Array.from({ length: 24 }, (_, i) => ({
  id: i,
  color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
  x: randomBetween(5, 95),
  size: randomBetween(4, 9),
  duration: randomBetween(1.2, 2.4),
  delay: randomBetween(0, 0.6),
  rotate: randomBetween(0, 360),
  shape: i % 3 === 0 ? "circle" : i % 3 === 1 ? "rect" : "circle",
}));

const SPARKLES = Array.from({ length: 8 }, (_, i) => ({
  id: i,
  angle: (360 / 8) * i,
  dist: randomBetween(44, 56),
  delay: randomBetween(0, 0.5),
}));

export function DailyBonusDialog({ open, onClose, bonus }: DailyBonusDialogProps) {
  const [visible, setVisible] = useState(false);
  const [displayBonus, setDisplayBonus] = useState(0);

  useEffect(() => {
    if (open) {
      setDisplayBonus(0);
      setVisible(false);
      const t1 = setTimeout(() => setVisible(true), 80);

      let start: number | null = null;
      const duration = 900;
      const step = (ts: number) => {
        if (!start) start = ts;
        const progress = Math.min((ts - start) / duration, 1);
        const ease = 1 - Math.pow(1 - progress, 3);
        setDisplayBonus(Math.round(ease * bonus));
        if (progress < 1) requestAnimationFrame(step);
      };
      const t2 = setTimeout(() => requestAnimationFrame(step), 300);
      return () => { clearTimeout(t1); clearTimeout(t2); };
    } else {
      setVisible(false);
      setDisplayBonus(0);
    }
  }, [open, bonus]);

  return (
    <>
      <style>{`
        @keyframes coinPop {
          0%   { transform: scale(0.3) rotate(-15deg); opacity: 0; }
          60%  { transform: scale(1.18) rotate(6deg); opacity: 1; }
          80%  { transform: scale(0.94) rotate(-3deg); }
          100% { transform: scale(1) rotate(0deg); }
        }
        @keyframes confettiFall {
          0%   { transform: translateY(-10px) rotate(0deg); opacity: 1; }
          80%  { opacity: 0.8; }
          100% { transform: translateY(120px) rotate(var(--cr)); opacity: 0; }
        }
        @keyframes sparkleIn {
          0%   { transform: translate(var(--sx), var(--sy)) scale(0); opacity: 0; }
          50%  { transform: translate(var(--sx), var(--sy)) scale(1.3); opacity: 1; }
          100% { transform: translate(var(--sx), var(--sy)) scale(0); opacity: 0; }
        }
        @keyframes glowPulse {
          0%, 100% { box-shadow: 0 0 0 0px rgba(167,139,250,0.4), 0 0 24px 4px rgba(124,58,237,0.25); }
          50%       { box-shadow: 0 0 0 10px rgba(167,139,250,0.0), 0 0 40px 12px rgba(124,58,237,0.45); }
        }
        @keyframes slideUp {
          0%   { transform: translateY(28px); opacity: 0; }
          100% { transform: translateY(0); opacity: 1; }
        }
        @keyframes fadeIn {
          0%   { opacity: 0; }
          100% { opacity: 1; }
        }
        @keyframes badgePop {
          0%   { transform: scale(0); opacity: 0; }
          70%  { transform: scale(1.25); }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes shimmerBar {
          0%   { background-position: -200% center; }
          100% { background-position: 200% center; }
        }
      `}</style>

      <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
        <DialogContent className="max-w-xs p-0 overflow-hidden border-0">
          <div className="relative flex flex-col items-center text-center bg-gradient-to-b from-[#1a1040] via-[#130d30] to-background rounded-2xl overflow-hidden px-6 pt-8 pb-6">

            {visible && (
              <div className="absolute inset-0 pointer-events-none overflow-hidden">
                {PARTICLES.map((p) => (
                  <div
                    key={p.id}
                    style={{
                      position: "absolute",
                      left: `${p.x}%`,
                      top: "-8px",
                      width: p.size,
                      height: p.shape === "rect" ? p.size * 0.5 : p.size,
                      borderRadius: p.shape === "circle" ? "50%" : "2px",
                      background: p.color,
                      ["--cr" as any]: `${p.rotate}deg`,
                      animation: `confettiFall ${p.duration}s ease-in ${p.delay}s both`,
                    }}
                  />
                ))}
              </div>
            )}

            <div
              className="relative mb-5"
              style={visible ? { animation: "coinPop 0.65s cubic-bezier(0.34,1.56,0.64,1) 0.1s both" } : { opacity: 0 }}
            >
              <div
                className="w-24 h-24 rounded-full bg-gradient-to-br from-violet-600/50 to-purple-900/60 flex items-center justify-center"
                style={visible ? { animation: "glowPulse 2s ease-in-out 0.7s infinite" } : {}}
              >
                <GoldCoinIcon size="lg" className="w-12 h-12" />
              </div>

              {visible && SPARKLES.map((s) => {
                const rad = (s.angle * Math.PI) / 180;
                const sx = Math.cos(rad) * s.dist;
                const sy = Math.sin(rad) * s.dist;
                return (
                  <div
                    key={s.id}
                    style={{
                      position: "absolute",
                      top: "50%",
                      left: "50%",
                      width: 6,
                      height: 6,
                      marginTop: -3,
                      marginLeft: -3,
                      borderRadius: "50%",
                      background: CONFETTI_COLORS[s.id % CONFETTI_COLORS.length],
                      ["--sx" as any]: `${sx}px`,
                      ["--sy" as any]: `${sy}px`,
                      animation: `sparkleIn 1.2s ease-in-out ${0.4 + s.delay}s infinite`,
                    }}
                  />
                );
              })}

              <div
                className="absolute -top-1 -right-1 bg-green-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-lg"
                style={visible ? { animation: "badgePop 0.5s cubic-bezier(0.34,1.56,0.64,1) 0.55s both" } : { opacity: 0 }}
              >
                +{bonus}
              </div>
            </div>

            <p
              className="text-xs font-semibold text-violet-400 uppercase tracking-widest mb-1"
              style={visible ? { animation: "slideUp 0.45s ease 0.5s both" } : { opacity: 0 }}
            >
              Daily Login Bonus
            </p>

            <h2
              className="text-3xl font-extrabold text-white mb-1 tabular-nums"
              style={visible ? { animation: "slideUp 0.45s ease 0.55s both" } : { opacity: 0 }}
            >
              +{displayBonus}
              <span className="text-lg ml-1 font-semibold text-violet-300">TournaX Coins</span>
            </h2>

            <p
              className="text-xs text-muted-foreground mb-4"
              style={visible ? { animation: "slideUp 0.45s ease 0.62s both" } : { opacity: 0 }}
            >
              Aaj ka bonus claim ho gaya!
            </p>

            <Button
              className="w-full font-semibold relative overflow-hidden"
              onClick={onClose}
              style={visible ? { animation: "slideUp 0.45s ease 0.8s both" } : { opacity: 0 }}
            >
              <span
                className="absolute inset-0 pointer-events-none"
                style={{
                  background: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.18) 50%, transparent 100%)",
                  backgroundSize: "200% auto",
                  animation: "shimmerBar 1.8s linear 1.2s infinite",
                }}
              />
              Claim Karo!
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
