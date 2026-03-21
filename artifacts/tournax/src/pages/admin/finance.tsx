import { useState } from "react";
import {
  useAdminListAddRequests, useApproveAddRequest, useRejectAddRequest,
  useAdminListWithdrawals, useApproveWithdrawal, useRejectWithdrawal
} from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import type { FinanceRequest } from "@workspace/api-client-react";

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

  const approve = async () => {
    try {
      if (type === "deposit") await approveAdd({ id: req.id });
      else await approveW({ id: req.id });
      toast({ title: "Approved!" });
      onAction();
    } catch (err: any) {
      toast({ title: "Error", description: err?.data?.error, variant: "destructive" });
    }
  };

  const reject = async () => {
    try {
      if (type === "deposit") await rejectAdd({ id: req.id });
      else await rejectW({ id: req.id });
      toast({ title: "Rejected" });
      onAction();
    } catch (err: any) {
      toast({ title: "Error", description: err?.data?.error, variant: "destructive" });
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
        <span className="font-bold text-lg text-primary">₹{req.amount}</span>
        <span className="text-xs text-muted-foreground">{new Date(req.createdAt).toLocaleDateString("en-IN")}</span>
      </div>

      {req.utrNumber && (
        <div className="text-xs text-muted-foreground mb-3">UTR: <span className="font-mono text-foreground">{req.utrNumber}</span></div>
      )}
      {req.upiId && (
        <div className="text-xs text-muted-foreground mb-3">UPI: <span className="font-mono text-foreground">{req.upiId}</span></div>
      )}

      {req.status === "pending" && (
        <div className="flex gap-2">
          <Button size="sm" className="flex-1 h-8 text-xs" onClick={approve}>Approve</Button>
          <Button variant="destructive" size="sm" className="flex-1 h-8 text-xs" onClick={reject}>Reject</Button>
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
