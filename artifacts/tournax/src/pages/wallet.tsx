import { useState } from "react";
import { useGetWallet, useRequestAddBalance, useRequestWithdrawal } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { ArrowDownCircle, ArrowUpCircle, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

function statusBadgeClass(status: string) {
  if (status === "approved") return "bg-green-500/20 text-green-400 border-green-500/30";
  if (status === "rejected") return "bg-destructive/20 text-destructive border-destructive/30";
  return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
}

export default function WalletPage() {
  const { toast } = useToast();
  const { data: wallet, isLoading, refetch } = useGetWallet();
  const { mutateAsync: addBalance, isPending: isAdding } = useRequestAddBalance();
  const { mutateAsync: withdraw, isPending: isWithdrawing } = useRequestWithdrawal();

  const [addForm, setAddForm] = useState({ amount: "", utrNumber: "" });
  const [withdrawForm, setWithdrawForm] = useState({ amount: "", upiId: "" });
  const [addOpen, setAddOpen] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);

  const handleAddBalance = async () => {
    try {
      await addBalance({ data: { amount: parseFloat(addForm.amount), utrNumber: addForm.utrNumber } });
      toast({ title: "Add balance request submitted!", description: "Await admin approval." });
      setAddForm({ amount: "", utrNumber: "" });
      setAddOpen(false);
      refetch();
    } catch (err: any) {
      toast({ title: "Error", description: err?.data?.error, variant: "destructive" });
    }
  };

  const handleWithdraw = async () => {
    try {
      await withdraw({ data: { amount: parseFloat(withdrawForm.amount), upiId: withdrawForm.upiId } });
      toast({ title: "Withdrawal request submitted!" });
      setWithdrawForm({ amount: "", upiId: "" });
      setWithdrawOpen(false);
      refetch();
    } catch (err: any) {
      toast({ title: "Error", description: err?.data?.error, variant: "destructive" });
    }
  };

  return (
    <AppLayout title="Wallet">
      <div className="space-y-4 pb-4">
        {isLoading ? (
          <Skeleton className="h-32 rounded-2xl" />
        ) : (
          <div className="bg-gradient-to-br from-primary/30 to-accent/20 border border-primary/20 rounded-2xl p-6">
            <p className="text-sm text-muted-foreground mb-1">Available Balance</p>
            <h2 className="text-4xl font-bold mb-4">₹{wallet?.balance.toFixed(2) ?? "0.00"}</h2>
            <div className="flex gap-2">
              <Dialog open={addOpen} onOpenChange={setAddOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" className="gap-1.5 flex-1">
                    <Plus className="w-3.5 h-3.5" /> Add Money
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-sm">
                  <DialogHeader><DialogTitle>Add Balance</DialogTitle></DialogHeader>
                  <div className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                      Transfer money via UPI and enter the UTR number for verification.
                    </p>
                    <div className="space-y-1.5">
                      <Label>Amount (₹)</Label>
                      <Input
                        type="number"
                        placeholder="Enter amount"
                        value={addForm.amount}
                        onChange={(e) => setAddForm(f => ({ ...f, amount: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>UTR Number</Label>
                      <Input
                        placeholder="12-digit UTR"
                        value={addForm.utrNumber}
                        onChange={(e) => setAddForm(f => ({ ...f, utrNumber: e.target.value }))}
                      />
                    </div>
                    <Button
                      className="w-full"
                      onClick={handleAddBalance}
                      disabled={isAdding || !addForm.amount || !addForm.utrNumber}
                    >
                      {isAdding ? "Submitting..." : "Submit Request"}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>

              <Dialog open={withdrawOpen} onOpenChange={setWithdrawOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-1.5 flex-1">
                    <ArrowUpCircle className="w-3.5 h-3.5" /> Withdraw
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-sm">
                  <DialogHeader><DialogTitle>Withdraw Funds</DialogTitle></DialogHeader>
                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <Label>Amount (₹)</Label>
                      <Input
                        type="number"
                        placeholder="Enter amount"
                        value={withdrawForm.amount}
                        onChange={(e) => setWithdrawForm(f => ({ ...f, amount: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>UPI ID</Label>
                      <Input
                        placeholder="yourname@upi"
                        value={withdrawForm.upiId}
                        onChange={(e) => setWithdrawForm(f => ({ ...f, upiId: e.target.value }))}
                      />
                    </div>
                    <Button
                      className="w-full"
                      onClick={handleWithdraw}
                      disabled={isWithdrawing || !withdrawForm.amount || !withdrawForm.upiId}
                    >
                      {isWithdrawing ? "Requesting..." : "Request Withdrawal"}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        )}

        <Tabs defaultValue="deposits">
          <TabsList className="w-full">
            <TabsTrigger value="deposits" className="flex-1">Deposits</TabsTrigger>
            <TabsTrigger value="withdrawals" className="flex-1">Withdrawals</TabsTrigger>
          </TabsList>

          <TabsContent value="deposits">
            {wallet?.addBalanceHistory.length ? (
              <div className="space-y-2 mt-3">
                {wallet.addBalanceHistory.map((tx) => (
                  <div key={tx.id} className="flex items-center justify-between bg-card border border-card-border rounded-xl px-4 py-3">
                    <div className="flex items-center gap-3">
                      <ArrowDownCircle className="w-5 h-5 text-green-400" />
                      <div>
                        <div className="font-medium text-sm">₹{tx.amount}</div>
                        <div className="text-xs text-muted-foreground">{new Date(tx.createdAt).toLocaleDateString("en-IN")}</div>
                      </div>
                    </div>
                    <span className={cn("text-xs px-2 py-0.5 rounded-full border capitalize", statusBadgeClass(tx.status))}>
                      {tx.status}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground text-sm">No deposit history</div>
            )}
          </TabsContent>

          <TabsContent value="withdrawals">
            {wallet?.withdrawalHistory.length ? (
              <div className="space-y-2 mt-3">
                {wallet.withdrawalHistory.map((tx) => (
                  <div key={tx.id} className="flex items-center justify-between bg-card border border-card-border rounded-xl px-4 py-3">
                    <div className="flex items-center gap-3">
                      <ArrowUpCircle className="w-5 h-5 text-destructive" />
                      <div>
                        <div className="font-medium text-sm">₹{tx.amount}</div>
                        <div className="text-xs text-muted-foreground">{new Date(tx.createdAt).toLocaleDateString("en-IN")}</div>
                      </div>
                    </div>
                    <span className={cn("text-xs px-2 py-0.5 rounded-full border capitalize", statusBadgeClass(tx.status))}>
                      {tx.status}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground text-sm">No withdrawal history</div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
