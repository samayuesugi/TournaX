import { useState, useEffect } from "react";
import { customFetch } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { GitBranch, CheckCircle, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

interface Referral {
  id: number;
  referrerId: number;
  referrerName: string;
  referrerHandle: string | null;
  referredId: number;
  referredName: string;
  referredHandle: string | null;
  completed: boolean;
  referrerRewarded: boolean;
  createdAt: string;
}

function timeAgo(iso: string) {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  return `${days}d ago`;
}

export default function ReferralTrackerPage() {
  const { toast } = useToast();
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    customFetch<Referral[]>("/api/admin/referrals")
      .then(setReferrals)
      .catch(() => toast({ title: "Failed to load referrals", variant: "destructive" }))
      .finally(() => setLoading(false));
  }, []);

  const completed = referrals.filter(r => r.completed).length;
  const pending = referrals.length - completed;

  return (
    <AppLayout title="Referral Tracker" showBack backHref="/admin">
      <div className="space-y-4 pb-4">
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: "Total", value: referrals.length, color: "text-foreground" },
            { label: "Completed", value: completed, color: "text-green-600" },
            { label: "Pending", value: pending, color: "text-yellow-600" },
          ].map(s => (
            <div key={s.label} className="bg-card border border-card-border rounded-xl p-3 text-center">
              <p className={cn("text-xl font-bold", s.color)}>{s.value}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>

        {loading ? (
          [1,2,3,4].map(i => <Skeleton key={i} className="h-20 rounded-xl" />)
        ) : referrals.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <GitBranch className="w-8 h-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm">No referrals yet</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {referrals.map(r => (
              <div key={r.id} className="bg-card border border-card-border rounded-xl px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 text-sm">
                      <span className="font-semibold truncate">{r.referrerName}</span>
                      {r.referrerHandle && <span className="text-muted-foreground text-xs">@{r.referrerHandle}</span>}
                      <span className="text-muted-foreground text-xs">→</span>
                      <span className="font-medium truncate">{r.referredName}</span>
                      {r.referredHandle && <span className="text-muted-foreground text-xs">@{r.referredHandle}</span>}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      {r.completed ? (
                        <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-green-500/15 text-green-600 font-medium">
                          <CheckCircle className="w-2.5 h-2.5" /> Completed
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-yellow-500/15 text-yellow-600 font-medium">
                          <Clock className="w-2.5 h-2.5" /> Pending
                        </span>
                      )}
                      {r.referrerRewarded && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/15 text-primary font-medium">Rewarded</span>
                      )}
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">{timeAgo(r.createdAt)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
