import { useState } from "react";
import {
  useAdminListAddRequests, useApproveAddRequest, useRejectAddRequest,
  useAdminListWithdrawals, useApproveWithdrawal, useRejectWithdrawal
} from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { GoldCoin } from "@/components/ui/Coins";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import type { FinanceRequest } from "@workspace/api-client-react";

function receiptSrc(receiptUrl: string): string {
  if (!receiptUrl) return "";
  if (receiptUrl.startsWith("data:")) return receiptUrl;
  if (receiptUrl.startsWith("/objects/")) {
    return `/api/storage/objects/${receiptUrl.slice("/objects/".length)}`;
  }
  return receiptUrl;
}

function statusBadge(status: string) {
  if (status === "approved") return "bg-green-500/20 text-green-400 border-green-500/30";
  if (status === "rejected") return "bg-destructive/20 text-destructive border-destructive/30";
  return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
}

function RequestCard({
  req,
  type,
  onAction
}: {
  req: FinanceRequest;
  type: "deposit" | "withdrawal";
  onAction: () => void;
}) {
  const { toast } = useToast();
  const { mutateAsync: approveAdd } = useApproveAddRequest();
  const { mutateAsync: rejectAdd } = useRejectAddRequest();
  const { mutateAsync: approveW } = useApproveWithdrawal();
  const { mutateAsync: rejectW } = useRejectWithdrawal();
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [actionPending, setActionPending] = useState(false);

  const approve = async () => {
    if (actionPending) return;
    setActionPending(true);
    try {
      if (type === "deposit") await approveAdd({ id: req.id });
      else await approveW({ id: req.id });
      toast({ title: "Approved!" });
      onAction();
    } catch (err: any) {
      toast({ title: "Error", description: err?.data?.error || "Something went wrong", variant: "destructive" });
    } finally {
      setActionPending(false);
    }
  };

  const reject = async () => {
    if (actionPending) return;
    setActionPending(true);
    try {
      if (type === "deposit") await rejectAdd({ id: req.id });
      else await rejectW({ id: req.id });
      toast({ title: "Rejected" });
      onAction();
    } catch (err: any) {
      toast({ title: "Error", description: err?.data?.error || "Something went wrong", variant: "destructive" });
    } finally {
      setActionPending(false);
    }
  };

  return (
    <div className="bg-card border border-card-border rounded-xl p-4">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div>
          <div className="font-semibold text-sm">{req.userName || req.userEmail}</div>
          <div className="text-xs text-muted-foreground">{req.userEmail}</div>
        </div>
        <span className={cn("text-xs px-2 py-0.5 rounded-full border capitalize shrink-0", statusBadge(req.status))}>
          {req.status}
        </span>
      </div>

      <div className="flex items-center justify-between text-sm mb-3">
        <span className="font-bold text-lg text-primary"><GoldCoin amount={req.amount} /></span>
        <span className="text-xs text-muted-foreground">{new Date(req.createdAt).toLocaleDateString("en-IN")}</span>
      </div>

      {req.utrNumber && (
        <div className="text-xs text-muted-foreground mb-2">UTR: <span className="font-mono text-foreground">{req.utrNumber}</span></div>
      )}
      {req.upiId && (
        <div className="text-xs text-muted-foreground mb-2">UPI: <span className="font-mono text-foreground">{req.upiId}</span></div>
      )}

      {req.receiptUrl && (
        <>
          <button
            onClick={() => setReceiptOpen(true)}
            className="w-full mb-3 rounded-lg overflow-hidden border border-border hover:border-primary/50 transition-colors"
          >
            <img
              src={receiptSrc(req.receiptUrl!)}
              alt="Payment receipt"
              className="w-full max-h-32 object-cover"
            />
            <div className="text-xs text-muted-foreground py-1 text-center bg-muted/30">Tap to view full receipt</div>
          </button>
          <Dialog open={receiptOpen} onOpenChange={setReceiptOpen}>
            <DialogContent className="max-w-sm p-0 overflow-hidden">
              <DialogHeader className="px-4 pt-4 pb-2">
                <DialogTitle>Payment Receipt</DialogTitle>
              </DialogHeader>
              <div className="px-4 pb-4">
                <img src={receiptSrc(req.receiptUrl!)} alt="Payment receipt" className="w-full rounded-lg" />
              </div>
            </DialogContent>
          </Dialog>
        </>
      )}

      {req.status === "pending" && (
        <div className="flex gap-2">
          <Button size="sm" className="flex-1 h-8 text-xs" onClick={approve} disabled={actionPending}>Approve</Button>
          <Button variant="destructive" size="sm" className="flex-1 h-8 text-xs" onClick={reject} disabled={actionPending}>Reject</Button>
        </div>
      )}
    </div>
  );
}

export default function AdminFinancePage() {
  const [depStatus, setDepStatus] = useState<"all" | "pending" | "approved" | "rejected">("pending");
  const [wdStatus, setWdStatus] = useState<"all" | "pending" | "approved" | "rejected">("pending");

  const { data: deposits, isLoading: depLoading, refetch: refetchDep } = useAdminListAddRequests({ status: depStatus });
  const { data: withdrawals, isLoading: wdLoading, refetch: refetchWd } = useAdminListWithdrawals({ status: wdStatus });

  const STATUS_OPTS = ["all", "pending", "approved", "rejected"] as const;

  return (
    <AppLayout title="Finance">
      <Tabs defaultValue="deposits">
        <TabsList className="w-full mb-4">
          <TabsTrigger value="deposits" className="flex-1">Deposits</TabsTrigger>
          <TabsTrigger value="withdrawals" className="flex-1">Withdrawals</TabsTrigger>
        </TabsList>

        <TabsContent value="deposits">
          <div className="space-y-3">
            <div className="flex gap-2 overflow-x-auto pb-1">
              {STATUS_OPTS.map((s) => (
                <button
                  key={s}
                  onClick={() => setDepStatus(s)}
                  className={cn(
                    "px-3 py-1.5 rounded-full text-xs font-medium shrink-0 border transition-all capitalize",
                    depStatus === s ? "bg-primary text-primary-foreground border-primary" : "bg-secondary text-muted-foreground border-border"
                  )}
                >
                  {s}
                </button>
              ))}
            </div>
            {depLoading ? (
              <div className="space-y-3">{[1, 2].map((i) => <Skeleton key={i} className="h-28 rounded-xl" />)}</div>
            ) : deposits?.length ? (
              <div className="space-y-3">
                {deposits.map((r) => <RequestCard key={r.id} req={r} type="deposit" onAction={refetchDep} />)}
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground text-sm">No {depStatus} deposit requests</div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="withdrawals">
          <div className="space-y-3">
            <div className="flex gap-2 overflow-x-auto pb-1">
              {STATUS_OPTS.map((s) => (
                <button
                  key={s}
                  onClick={() => setWdStatus(s)}
                  className={cn(
                    "px-3 py-1.5 rounded-full text-xs font-medium shrink-0 border transition-all capitalize",
                    wdStatus === s ? "bg-primary text-primary-foreground border-primary" : "bg-secondary text-muted-foreground border-border"
                  )}
                >
                  {s}
                </button>
              ))}
            </div>
            {wdLoading ? (
              <div className="space-y-3">{[1, 2].map((i) => <Skeleton key={i} className="h-28 rounded-xl" />)}</div>
            ) : withdrawals?.length ? (
              <div className="space-y-3">
                {withdrawals.map((r) => <RequestCard key={r.id} req={r} type="withdrawal" onAction={refetchWd} />)}
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground text-sm">No {wdStatus} withdrawals</div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </AppLayout>
  );
}
