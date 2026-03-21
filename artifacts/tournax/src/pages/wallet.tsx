import { useState, useRef } from "react";
import { useGetWallet, useRequestAddBalance, useRequestWithdrawal } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { ArrowDownCircle, ArrowUpCircle, Plus, Copy, Check, ImagePlus, AlertTriangle, X } from "lucide-react";
import { cn } from "@/lib/utils";

function statusBadgeClass(status: string) {
  if (status === "approved") return "bg-green-500/20 text-green-400 border-green-500/30";
  if (status === "rejected") return "bg-destructive/20 text-destructive border-destructive/30";
  return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
}

const UPI_ID = "9971040244@ptaxis";

const ADD_BALANCE_RULES = [
  { icon: "⚠️", text: "False या already used UTR submit करने पर ₹2 penalty लगेगी।" },
  { icon: "🧾", text: "Clear और readable receipt attach करें — blurry या cropped receipts reject होंगी।" },
  { icon: "✅", text: "UTR number exactly वही enter करें जो receipt में दिखे।" },
  { icon: "⏱️", text: "Request approve होने में 30 minutes तक लग सकते हैं।" },
  { icon: "🔁", text: "Minimum add amount ₹10 है।" },
  { icon: "📵", text: "एक ही UTR से दो बार request मत करें।" },
];

export default function WalletPage() {
  const { toast } = useToast();
  const { data: wallet, isLoading, refetch } = useGetWallet();
  const { mutateAsync: addBalance, isPending: isAdding } = useRequestAddBalance();
  const { mutateAsync: withdraw, isPending: isWithdrawing } = useRequestWithdrawal();

  const [addForm, setAddForm] = useState({ amount: "", utrNumber: "" });
  const [withdrawForm, setWithdrawForm] = useState({ amount: "", upiId: "" });
  const [addOpen, setAddOpen] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleCopyUpi = () => {
    navigator.clipboard.writeText(UPI_ID);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleReceiptSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setReceiptFile(file);
    const url = URL.createObjectURL(file);
    setReceiptPreview(url);
  };

  const handleRemoveReceipt = () => {
    setReceiptFile(null);
    if (receiptPreview) URL.revokeObjectURL(receiptPreview);
    setReceiptPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleAddBalance = async () => {
    if (!receiptFile) {
      toast({ title: "Receipt required", description: "Please attach your payment receipt.", variant: "destructive" });
      return;
    }
    try {
      await addBalance({ data: { amount: parseFloat(addForm.amount), utrNumber: addForm.utrNumber } });
      toast({ title: "Request submitted!", description: "Await admin approval. Usually within 30 mins." });
      setAddForm({ amount: "", utrNumber: "" });
      handleRemoveReceipt();
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
                <DialogContent className="max-w-sm p-0 overflow-hidden flex flex-col max-h-[90vh]">
                  <DialogHeader className="px-4 pt-4 pb-2 shrink-0">
                    <DialogTitle>Add Balance</DialogTitle>
                  </DialogHeader>

                  <div className="overflow-y-auto flex-1 px-4 pb-4 space-y-4">
                    {/* QR Code */}
                    <div className="flex flex-col items-center">
                      <img
                        src={`${import.meta.env.BASE_URL}upi-qr.jpg`}
                        alt="UPI QR Code"
                        className="w-56 h-56 object-contain rounded-xl border border-primary/20"
                      />
                    </div>

                    {/* UPI ID with copy */}
                    <button
                      onClick={handleCopyUpi}
                      className="w-full flex items-center justify-between bg-muted/50 border border-border rounded-xl px-4 py-3 hover:bg-muted transition-colors"
                    >
                      <div className="text-left">
                        <p className="text-xs text-muted-foreground mb-0.5">UPI ID</p>
                        <p className="font-mono font-semibold text-sm text-primary">{UPI_ID}</p>
                      </div>
                      {copied ? (
                        <Check className="w-4 h-4 text-green-400 shrink-0" />
                      ) : (
                        <Copy className="w-4 h-4 text-muted-foreground shrink-0" />
                      )}
                    </button>

                    {/* Rules */}
                    <div className="bg-yellow-500/10 border border-yellow-500/25 rounded-xl p-3 space-y-2">
                      <div className="flex items-center gap-1.5 mb-1">
                        <AlertTriangle className="w-3.5 h-3.5 text-yellow-400" />
                        <span className="text-xs font-semibold text-yellow-400 uppercase tracking-wide">Important Rules</span>
                      </div>
                      {ADD_BALANCE_RULES.map((rule, i) => (
                        <div key={i} className="flex items-start gap-2">
                          <span className="text-sm leading-tight shrink-0">{rule.icon}</span>
                          <p className="text-xs text-muted-foreground leading-snug">{rule.text}</p>
                        </div>
                      ))}
                    </div>

                    {/* Amount */}
                    <div className="space-y-1.5">
                      <Label>Amount (₹)</Label>
                      <Input
                        type="number"
                        placeholder="Enter amount (min ₹10)"
                        value={addForm.amount}
                        onChange={(e) => setAddForm(f => ({ ...f, amount: e.target.value }))}
                      />
                    </div>

                    {/* UTR */}
                    <div className="space-y-1.5">
                      <Label>UTR Number</Label>
                      <Input
                        placeholder="12-digit UTR from receipt"
                        value={addForm.utrNumber}
                        onChange={(e) => setAddForm(f => ({ ...f, utrNumber: e.target.value }))}
                      />
                    </div>

                    {/* Receipt Image */}
                    <div className="space-y-1.5">
                      <Label>Payment Receipt</Label>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleReceiptSelect}
                      />
                      {receiptPreview ? (
                        <div className="relative rounded-xl overflow-hidden border border-border">
                          <img src={receiptPreview} alt="Receipt" className="w-full max-h-48 object-contain bg-black" />
                          <button
                            onClick={handleRemoveReceipt}
                            className="absolute top-2 right-2 bg-black/70 rounded-full p-1 hover:bg-black transition-colors"
                          >
                            <X className="w-4 h-4 text-white" />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => fileInputRef.current?.click()}
                          className="w-full flex flex-col items-center gap-2 border-2 border-dashed border-border rounded-xl py-6 hover:border-primary/50 hover:bg-primary/5 transition-colors"
                        >
                          <ImagePlus className="w-7 h-7 text-muted-foreground" />
                          <span className="text-sm text-muted-foreground">Gallery से Receipt चुनें</span>
                        </button>
                      )}
                    </div>

                    <Button
                      className="w-full"
                      onClick={handleAddBalance}
                      disabled={isAdding || !addForm.amount || !addForm.utrNumber || !receiptFile}
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
