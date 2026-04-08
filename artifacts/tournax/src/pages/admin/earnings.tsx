import { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Skeleton } from "@/components/ui/skeleton";
import { customFetch } from "@workspace/api-client-react";
import { GoldCoin, GoldCoinIcon } from "@/components/ui/Coins";
import { TrendingUp, Calendar, Clock, Swords, BarChart2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from "recharts";

interface EarningsData {
  totalAllTime: number;
  totalLast30: number;
  totalLast7: number;
  totalThisMonth: number;
  dailyBreakdown: { date: string; amount: number }[];
  byGame: { game: string; amount: number }[];
  recentEarnings: { id: number; matchId: number; matchCode: string; amount: number; createdAt: string }[];
}

function StatCard({ icon: Icon, label, value, sub, color }: { icon: any; label: string; value: number; sub?: string; color: string }) {
  return (
    <div className="bg-card border border-card-border rounded-xl p-4">
      <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center mb-2", color)}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="text-xl font-bold flex items-center gap-1">
        <GoldCoinIcon size="sm" />
        {value.toFixed(1)}
      </div>
      <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
      {sub && <div className="text-[10px] text-muted-foreground/60 mt-0.5">{sub}</div>}
    </div>
  );
}

function formatDateShort(iso: string) {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function formatDateTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" });
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-card border border-card-border rounded-xl px-3 py-2 shadow-lg text-xs">
        <p className="text-muted-foreground mb-1">{label}</p>
        <p className="font-bold text-primary flex items-center gap-1">
          <GoldCoinIcon size="sm" /> {payload[0].value.toFixed(2)}
        </p>
      </div>
    );
  }
  return null;
};

export default function AdminEarningsPage() {
  const [data, setData] = useState<EarningsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    customFetch<EarningsData>("/api/admin/earnings")
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const maxAmount = data ? Math.max(...data.dailyBreakdown.map(d => d.amount), 1) : 1;

  const COLORS = ["#8b5cf6", "#6366f1", "#3b82f6", "#0ea5e9", "#06b6d4", "#10b981"];

  return (
    <AppLayout title="Revenue Dashboard" showBack backHref="/admin">
      <div className="space-y-4 pb-6">
        {loading ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}
            </div>
            <Skeleton className="h-48 rounded-xl" />
            <Skeleton className="h-40 rounded-xl" />
          </>
        ) : data ? (
          <>
            {/* Stat cards */}
            <div className="grid grid-cols-2 gap-3">
              <StatCard
                icon={TrendingUp}
                label="All-Time Revenue"
                value={data.totalAllTime}
                color="bg-primary/20 text-primary"
              />
              <StatCard
                icon={Calendar}
                label="This Month"
                value={data.totalThisMonth}
                color="bg-green-500/20 text-green-400"
              />
              <StatCard
                icon={Clock}
                label="Last 7 Days"
                value={data.totalLast7}
                color="bg-primary/20 text-primary"
              />
              <StatCard
                icon={BarChart2}
                label="Last 30 Days"
                value={data.totalLast30}
                color="bg-amber-500/20 text-amber-400"
              />
            </div>

            {/* Daily bar chart */}
            <div className="bg-card border border-card-border rounded-2xl p-4">
              <h3 className="font-semibold text-sm mb-1">Daily Revenue — Last 30 Days</h3>
              <p className="text-xs text-muted-foreground mb-4">Platform fee collected per day</p>
              {data.dailyBreakdown.every(d => d.amount === 0) ? (
                <div className="flex flex-col items-center justify-center h-32 text-muted-foreground text-sm gap-2">
                  <BarChart2 className="w-8 h-8 opacity-30" />
                  <p>No earnings recorded yet</p>
                  <p className="text-xs">Complete a match to see revenue here</p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={data.dailyBreakdown} margin={{ top: 4, right: 4, left: -28, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                    <XAxis
                      dataKey="date"
                      tickFormatter={formatDateShort}
                      tick={{ fontSize: 9, fill: "rgba(255,255,255,0.4)" }}
                      tickLine={false}
                      axisLine={false}
                      interval={6}
                    />
                    <YAxis
                      tick={{ fontSize: 9, fill: "rgba(255,255,255,0.4)" }}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v) => v === 0 ? "0" : `${v}`}
                    />
                    <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(139,92,246,0.08)" }} />
                    <Bar dataKey="amount" radius={[4, 4, 0, 0]} maxBarSize={28}>
                      {data.dailyBreakdown.map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={entry.amount > 0 ? "#8b5cf6" : "rgba(139,92,246,0.15)"}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Per-game breakdown */}
            {data.byGame.length > 0 && (
              <div className="bg-card border border-card-border rounded-2xl p-4">
                <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
                  <Swords className="w-4 h-4 text-primary" />
                  Revenue by Game
                </h3>
                <div className="space-y-2.5">
                  {data.byGame.map((g, i) => {
                    const pct = data.totalAllTime > 0 ? (g.amount / data.totalAllTime) * 100 : 0;
                    return (
                      <div key={g.game}>
                        <div className="flex items-center justify-between text-sm mb-1">
                          <span className="font-medium truncate">{g.game}</span>
                          <span className="text-primary font-bold shrink-0 ml-2 flex items-center gap-1">
                            <GoldCoinIcon size="sm" />{g.amount.toFixed(1)}
                            <span className="text-[10px] text-muted-foreground ml-1">({pct.toFixed(0)}%)</span>
                          </span>
                        </div>
                        <div className="w-full h-2 bg-secondary rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{ width: `${pct}%`, backgroundColor: COLORS[i % COLORS.length] }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Recent transactions */}
            <div className="bg-card border border-card-border rounded-2xl p-4">
              <h3 className="font-semibold text-sm mb-3">Recent Transactions</h3>
              {data.recentEarnings.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">No transactions yet</p>
              ) : (
                <div className="space-y-2">
                  {data.recentEarnings.map((e) => (
                    <div key={e.id} className="flex items-center justify-between py-2 border-b border-border/40 last:border-0">
                      <div>
                        <span className="text-sm font-mono text-accent font-medium">#{e.matchCode}</span>
                        <p className="text-[10px] text-muted-foreground mt-0.5">{formatDateTime(e.createdAt)}</p>
                      </div>
                      <span className="font-bold text-green-400 flex items-center gap-1 text-sm">
                        +<GoldCoinIcon size="sm" />{e.amount.toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="text-center py-10 text-muted-foreground text-sm">Failed to load earnings data</div>
        )}
      </div>
    </AppLayout>
  );
}
