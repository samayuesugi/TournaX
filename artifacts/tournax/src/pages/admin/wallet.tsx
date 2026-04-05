import { useState } from "react";
import { Wallet, Trash2, IndianRupee, TrendingUp, ChevronRight } from "lucide-react";
import { customFetch } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { GoldCoin } from "@/components/ui/Coins";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useQuery, useQueryClient } from "@tanstack/react-query";

type EarningEntry = {
  id: number;
  matchCode: string;
  amount: string;
  createdAt: string;
  hostName: string;
  hostHandle: string | null;
};

type WalletData = {
  earnings: EarningEntry[];
  total: string;
};

function useAdminWallet() {
  return useQuery<WalletData>({
    queryKey: ["admin-platform-earnings"],
    queryFn: () => customFetch<WalletData>("/api/admin/platform-earnings", { responseType: "json" }),
    staleTime: 15000,
  });
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric", month: "short", year: "numeric",
  });
}

export default function AdminWalletPage() {
  const { data, isLoading } = useAdminWallet();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [clearing, setClearing] = useState(false);
  const [, setLocation] = useLocation();

  const clearHistory = async () => {
    setClearing(true);
    try {
      await customFetch("/api/admin/platform-earnings", { method: "DELETE", responseType: "json" });
      queryClient.invalidateQueries({ queryKey: ["admin-platform-earnings"] });
      toast({ title: "History cleared" });
    } catch {
      toast({ title: "Failed to clear", variant: "destructive" });
    } finally {
      setClearing(false);
    }
  };

  return (
    <AppLayout>
      <div className="space-y-4">
        <div>
          <h1 className="text-xl font-bold">Platform Wallet</h1>
          <p className="text-muted-foreground text-sm">Platform fees collected from completed matches</p>
        </div>

        {/* Revenue analysis CTA */}
        <button
          onClick={() => setLocation("/admin/earnings")}
          className="w-full flex items-center gap-3 bg-primary/10 border border-primary/25 rounded-2xl px-4 py-3 text-left hover:bg-primary/15 transition-colors"
        >
          <div className="w-9 h-9 rounded-xl bg-primary/20 flex items-center justify-center shrink-0">
            <TrendingUp className="w-4 h-4 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-primary">Revenue Analysis</p>
            <p className="text-xs text-muted-foreground">Charts, daily breakdown & game revenue</p>
          </div>
          <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
        </button>

        {/* Total balance card */}
        <div className="bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20 rounded-2xl p-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center shrink-0">
            <Wallet className="w-6 h-6 text-primary" />
          </div>
          <div className="flex-1">
            <p className="text-xs text-muted-foreground mb-0.5">Total Collected</p>
            {isLoading ? (
              <Skeleton className="h-8 w-28" />
            ) : (
              <div className="flex items-baseline gap-1">
                <IndianRupee className="w-5 h-5 text-foreground" />
                <span className="text-3xl font-bold tracking-tight">
                  {parseFloat(data?.total ?? "0").toFixed(2)}
                </span>
              </div>
            )}
          </div>
          <div className="text-right text-xs text-muted-foreground">
            {!isLoading && (
              <span>{data?.earnings.length ?? 0} entries</span>
            )}
          </div>
        </div>

        {/* Transaction history */}
        <div className="bg-card border border-card-border rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <h2 className="text-sm font-semibold">Fee History</h2>
            {data && data.earnings.length > 0 && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-7 text-xs text-destructive hover:text-destructive gap-1.5 px-2">
                    <Trash2 className="w-3.5 h-3.5" />
                    Clear History
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Clear all history?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will permanently delete all platform fee records. The collected balance is not affected.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={clearHistory}
                      disabled={clearing}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      Yes, Clear
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>

          {isLoading ? (
            <div className="p-4 space-y-3">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-14 rounded-lg" />)}
            </div>
          ) : data && data.earnings.length > 0 ? (
            <div className="divide-y divide-border">
              {[...data.earnings].reverse().map((entry) => (
                <div key={entry.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="w-9 h-9 rounded-xl bg-green-500/10 flex items-center justify-center shrink-0">
                    <IndianRupee className="w-4 h-4 text-green-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-sm font-medium">{entry.hostName}</span>
                      {entry.hostHandle && (
                        <span className="text-xs text-muted-foreground">{entry.hostHandle}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-xs bg-secondary/80 text-muted-foreground px-1.5 py-0.5 rounded font-mono">
                        #{entry.matchCode}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {formatDate(entry.createdAt)}
                      </span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-sm font-semibold text-green-400">
                      +<GoldCoin amount={parseFloat(entry.amount).toFixed(2)} />
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-14">
              <div className="text-4xl mb-2">💰</div>
              <p className="text-sm font-medium">No fees collected yet</p>
              <p className="text-xs text-muted-foreground mt-1">
                Platform fees (5%) appear here after matches complete
              </p>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
