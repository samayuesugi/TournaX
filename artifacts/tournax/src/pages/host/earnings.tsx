import { useLocation } from "wouter";
import { useListMatches } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/useAuth";
import { AppLayout } from "@/components/layout/AppLayout";
import { GoldCoin } from "@/components/ui/Coins";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  ArrowLeft, Trophy, Download, TrendingUp, Users, Percent, CircleDollarSign,
  BarChart3, Calendar, Gamepad2
} from "lucide-react";

function fmt(n: number) { return n.toFixed(0); }
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { dateStyle: "medium" });
}

export default function HostEarningsPage() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const { data: allMatches, isLoading } = useListMatches({});

  const myCompleted = (allMatches?.filter(
    (m: any) => m.hostId === user?.id && m.status === "completed"
  ) ?? []).sort((a: any, b: any) =>
    new Date(b.startTime || b.createdAt).getTime() - new Date(a.startTime || a.createdAt).getTime()
  );

  const totalGross = myCompleted.reduce(
    (sum: number, m: any) => sum + (m.filledSlots || 0) * parseFloat(String(m.entryFee || 0)), 0
  );
  const totalPlatformFee = myCompleted.reduce(
    (sum: number, m: any) => sum + parseFloat(String(m.platformCut || 0)), 0
  );
  const totalPrizePool = myCompleted.reduce(
    (sum: number, m: any) => sum + parseFloat(String(m.livePrizePool || 0)), 0
  );
  const totalHostEarnings = myCompleted.reduce(
    (sum: number, m: any) => sum + parseFloat(String(m.hostCut || 0)), 0
  );

  const handleExport = () => {
    const rows = [
      ["Match Code", "Game", "Mode", "Map", "Date", "Players", "Entry Fee", "Gross", "Prize Pool", "Platform Fee", "Host Earnings"],
      ...myCompleted.map((m: any) => [
        m.code,
        m.game,
        m.mode,
        m.map || "",
        fmtDate(m.startTime || m.createdAt),
        m.filledSlots,
        parseFloat(String(m.entryFee || 0)).toFixed(2),
        ((m.filledSlots || 0) * parseFloat(String(m.entryFee || 0))).toFixed(2),
        parseFloat(String(m.livePrizePool || 0)).toFixed(2),
        parseFloat(String(m.platformCut || 0)).toFixed(2),
        parseFloat(String(m.hostCut || 0)).toFixed(2),
      ]),
      ["", "", "", "", "TOTAL", "", "", totalGross.toFixed(2), totalPrizePool.toFixed(2), totalPlatformFee.toFixed(2), totalHostEarnings.toFixed(2)],
    ];
    const csv = rows.map(r => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "tournax_earnings_history.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <AppLayout title="Earnings History">
      <div className="space-y-4 pb-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => navigate("/host")}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <h1 className="font-bold text-base">Earnings History</h1>
            <p className="text-xs text-muted-foreground">Per-match profit breakdown</p>
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-24 rounded-2xl" />)}
          </div>
        ) : (
          <>
            <div className="bg-gradient-to-br from-amber-500/10 via-card to-green-500/10 border border-amber-500/20 rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <BarChart3 className="w-4 h-4 text-amber-400" />
                <span className="text-xs font-semibold text-amber-400 uppercase tracking-wide">All-Time Summary</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-secondary/60 rounded-xl p-3">
                  <div className="text-[10px] text-muted-foreground mb-0.5">Total Gross</div>
                  <GoldCoin amount={fmt(totalGross)} className="font-bold text-base" />
                </div>
                <div className="bg-secondary/60 rounded-xl p-3">
                  <div className="text-[10px] text-muted-foreground mb-0.5">Prize Paid Out</div>
                  <GoldCoin amount={fmt(totalPrizePool)} className="font-bold text-base text-blue-400" />
                </div>
                <div className="bg-secondary/60 rounded-xl p-3">
                  <div className="text-[10px] text-muted-foreground mb-0.5">Platform Fee</div>
                  <GoldCoin amount={fmt(totalPlatformFee)} className="font-bold text-base text-muted-foreground" />
                </div>
                <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-3">
                  <div className="text-[10px] text-green-400 mb-0.5 font-semibold">Net Profit</div>
                  <GoldCoin amount={fmt(totalHostEarnings)} className="font-bold text-base text-green-400" />
                </div>
              </div>
            </div>

            {myCompleted.length > 0 && (
              <Button variant="outline" size="sm" className="w-full gap-2 text-xs h-9" onClick={handleExport}>
                <Download className="w-3.5 h-3.5" /> Export as CSV
              </Button>
            )}

            {myCompleted.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">
                <Trophy className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p className="font-semibold">No completed matches yet</p>
                <p className="text-sm mt-1">Earnings will appear here after your matches complete.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {myCompleted.map((m: any) => {
                  const gross = (m.filledSlots || 0) * parseFloat(String(m.entryFee || 0));
                  const prizePool = parseFloat(String(m.livePrizePool || 0));
                  const platformFee = parseFloat(String(m.platformCut || 0));
                  const hostEarnings = parseFloat(String(m.hostCut || 0));
                  const hostPct = gross > 0 ? ((hostEarnings / gross) * 100).toFixed(0) : "0";

                  return (
                    <div key={m.id} className="bg-card border border-card-border rounded-2xl overflow-hidden">
                      <div className="px-4 pt-3 pb-2 flex items-center justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <Gamepad2 className="w-3.5 h-3.5 text-primary" />
                            <span className="font-bold text-sm">{m.game} · {m.mode}</span>
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="font-mono text-xs text-accent">{m.code}</span>
                            <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                              <Calendar className="w-3 h-3" />{fmtDate(m.startTime || m.createdAt)}
                            </span>
                          </div>
                        </div>
                        <div className="text-right">
                          <GoldCoin amount={fmt(hostEarnings)} className="font-bold text-green-400 text-base" />
                          <div className="text-[10px] text-muted-foreground">net profit</div>
                        </div>
                      </div>

                      <div className="bg-secondary/30 px-4 py-2.5 grid grid-cols-4 gap-2 text-center border-t border-card-border">
                        <div>
                          <div className="flex items-center justify-center gap-0.5 text-[10px] text-muted-foreground mb-0.5">
                            <Users className="w-2.5 h-2.5" /> Players
                          </div>
                          <div className="text-xs font-semibold">{m.filledSlots}</div>
                        </div>
                        <div>
                          <div className="flex items-center justify-center gap-0.5 text-[10px] text-muted-foreground mb-0.5">
                            <CircleDollarSign className="w-2.5 h-2.5" /> Gross
                          </div>
                          <GoldCoin amount={fmt(gross)} className="text-xs font-semibold" />
                        </div>
                        <div>
                          <div className="flex items-center justify-center gap-0.5 text-[10px] text-muted-foreground mb-0.5">
                            <Trophy className="w-2.5 h-2.5" /> Prize
                          </div>
                          <GoldCoin amount={fmt(prizePool)} className="text-xs font-semibold text-blue-400" />
                        </div>
                        <div>
                          <div className="flex items-center justify-center gap-0.5 text-[10px] text-muted-foreground mb-0.5">
                            <Percent className="w-2.5 h-2.5" /> Plat.
                          </div>
                          <GoldCoin amount={fmt(platformFee)} className="text-xs font-semibold text-muted-foreground" />
                        </div>
                      </div>

                      <div className="px-4 py-2 bg-green-500/5 border-t border-green-500/10">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] text-green-400 font-medium">Your Cut ({hostPct}%)</span>
                          <div className="flex items-center gap-1">
                            <div className="h-1 bg-green-500/20 rounded-full overflow-hidden w-20">
                              <div className="h-full bg-green-500 rounded-full" style={{ width: `${hostPct}%` }} />
                            </div>
                            <GoldCoin amount={fmt(hostEarnings)} className="text-xs font-bold text-green-400" />
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </AppLayout>
  );
}
