import { useState, useRef, useEffect } from "react";
import { useGetWallet, useRequestAddBalance, useRequestWithdrawal, useConvertSilverCoins, customFetch } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/useAuth";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { ArrowDownCircle, ArrowUpCircle, Plus, Copy, Check, ImagePlus, AlertTriangle, X, Trophy, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { GoldCoin, GoldCoinIcon, SilverCoin, SilverCoinIcon } from "@/components/ui/Coins";

function statusBadgeClass(status: string) {
  if (status === "approved") return "bg-green-500/20 text-green-400 border-green-500/30";
  if (status === "rejected") return "bg-destructive/20 text-destructive border-destructive/30";
  return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
}

const UPI_ID = "9971040244@ptaxis";

const ADD_BALANCE_RULES = [
  { icon: "⚠️", text: "Submitting a false or already used UTR will result in a 2 Gold Coin penalty." },
  { icon: "🧾", text: "Attach a clear and readable receipt — blurry or cropped receipts will be rejected." },
  { icon: "✅", text: "Enter the UTR number exactly as shown in the receipt." },
  { icon: "⏱️", text: "Request approval can take up to 2 hours." },
  { icon: "🔁", text: "Minimum add amount is 10 Gold Coins." },
  { icon: "💰", text: "1₹ = 1 Gold Coin" },
  { icon: "📵", text: "Do not submit a request with the same UTR twice." },
];

type DailyTasksData = {
  loginClaimed: boolean;
  winsToday: number;
  winsClaimed: boolean;
  paidMatchesToday: number;
  paidMatchesClaimed: boolean;
};

function DailyTask({ icon, title, desc, progress, total, claimed }: {
  icon: string;
  title: string;
  desc: string;
  progress: number;
  total: number;
  claimed: boolean;
}) {
  return (
    <div className="flex items-center gap-3 bg-card/40 rounded-xl px-3 py-2.5">
      <span className="text-lg shrink-0">{icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-foreground leading-tight">{title}</p>
        <p className="text-[10px] text-muted-foreground">{desc}</p>
        {!claimed && total > 1 && (
          <div className="mt-1 h-1 bg-slate-700/60 rounded-full overflow-hidden">
            <div
              className="h-full bg-slate-400 rounded-full transition-all duration-500"
              style={{ width: `${Math.min(100, (progress / total) * 100)}%` }}
            />
          </div>
        )}
      </div>
      <div className="shrink-0">
        {claimed ? (
          <span className="text-[10px] font-semibold bg-green-500/20 text-green-400 border border-green-500/30 rounded-full px-2 py-0.5">Claimed</span>
        ) : (
          <span className="text-[10px] text-muted-foreground font-medium">{progress}/{total}</span>
        )}
      </div>
    </div>
  );
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export default function WalletPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const { data: wallet, isLoading, refetch } = useGetWallet();
  const { mutateAsync: addBalance, isPending: isAdding } = useRequestAddBalance();
  const { mutateAsync: withdraw, isPending: isWithdrawing } = useRequestWithdrawal();
  const { mutateAsync: convertSilver, isPending: isConverting } = useConvertSilverCoins();

  const [addForm, setAddForm] = useState({ amount: "", utrNumber: "" });
  const [withdrawForm, setWithdrawForm] = useState({ amount: "", upiId: "" });
  const [addOpen, setAddOpen] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dailyTasks, setDailyTasks] = useState<DailyTasksData | null>(null);

  useEffect(() => {
    customFetch<DailyTasksData>("/api/auth/daily-tasks")
      .then(setDailyTasks)
      .catch(() => {});
  }, []);

  const isHost = user?.role === "host";
  const silverCoins = (wallet as any)?.silverCoins ?? 0;
  const canConvert = silverCoins >= 100;

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
    const parsedAmount = parseFloat(addForm.amount);
    if (isNaN(parsedAmount) || parsedAmount < 10) {
      toast({ title: "Invalid amount", description: "Please enter a valid amount of at least 10 Gold Coins.", variant: "destructive" });
      return;
    }
    try {
      const receiptUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(receiptFile);
      });
      await addBalance({ data: { amount: parsedAmount, utrNumber: addForm.utrNumber, receiptUrl } });
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
    const parsedWithdrawAmount = parseFloat(withdrawForm.amount);
    if (isNaN(parsedWithdrawAmount) || parsedWithdrawAmount <= 0) {
      toast({ title: "Invalid amount", description: "Please enter a valid withdrawal amount.", variant: "destructive" });
      return;
    }
    try {
      await withdraw({ data: { amount: parsedWithdrawAmount, upiId: withdrawForm.upiId } });
      toast({ title: "Withdrawal request submitted!" });
      setWithdrawForm({ amount: "", upiId: "" });
      setWithdrawOpen(false);
      refetch();
    } catch (err: any) {
      toast({ title: "Error", description: err?.data?.error, variant: "destructive" });
    }
  };

  const handleConvertSilver = async () => {
    try {
      const result = await convertSilver();
      toast({ title: "Converted!", description: (result as any)?.message });
      refetch();
    } catch (err: any) {
      toast({ title: "Error", description: err?.data?.error, variant: "destructive" });
    }
  };

  const withdrawDialog = (
    <Dialog open={withdrawOpen} onOpenChange={setWithdrawOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5 flex-1">
          <ArrowUpCircle className="w-3.5 h-3.5" /> Withdraw
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Withdraw</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="bg-secondary/50 rounded-xl p-3 text-sm text-muted-foreground">
            Available: <span className="font-bold text-foreground"><GoldCoin amount={wallet?.balance?.toFixed(2) ?? "0.00"} /></span>
            <span className="mx-1 text-muted-foreground">=</span>
            <span className="font-bold text-green-400">₹{wallet?.balance?.toFixed(2) ?? "0.00"}</span>
          </div>
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
  );

  return (
    <AppLayout title="Wallet">
      <div className="space-y-4 pb-4">
        {isLoading ? (
          <Skeleton className="h-32 rounded-2xl" />
        ) : (
          <div className="space-y-3">
            <div className="bg-gradient-to-br from-amber-500/20 to-yellow-400/10 border border-amber-500/20 rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-1">
                <GoldCoinIcon size="md" />
                <p className="text-sm text-muted-foreground">Gold Coins</p>
              </div>
              <h2 className="text-4xl font-bold mb-1">{wallet?.balance?.toFixed(2) ?? "0.00"}</h2>
              <p className="text-xs text-muted-foreground mb-4">1₹ = 1 Gold Coin</p>
              <div className="flex gap-2">
                {!isHost && (
                  <Dialog open={addOpen} onOpenChange={setAddOpen}>
                    <DialogTrigger asChild>
                      <Button size="sm" className="gap-1.5 flex-1">
                        <Plus className="w-3.5 h-3.5" /> Add Coins
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-sm p-0 overflow-hidden flex flex-col max-h-[90vh]">
                      <DialogHeader className="px-4 pt-4 pb-2 shrink-0">
                        <DialogTitle>Add Coins</DialogTitle>
                      </DialogHeader>

                      <div className="overflow-y-auto flex-1 px-4 pb-4 space-y-4">
                        <div className="flex flex-col items-center">
                          <img
                            src={`${import.meta.env.BASE_URL}upi-qr.jpg`}
                            alt="UPI QR Code"
                            className="w-56 h-56 object-contain rounded-xl border border-primary/20"
                          />
                        </div>

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

                        <div className="space-y-1.5">
                          <Label>Amount (₹)</Label>
                          <Input
                            type="number"
                            placeholder="Enter amount (min ₹10)"
                            value={addForm.amount}
                            onChange={(e) => setAddForm(f => ({ ...f, amount: e.target.value }))}
                          />
                        </div>

                        <div className="space-y-1.5">
                          <Label>UTR Number</Label>
                          <Input
                            placeholder="12-digit UTR from receipt"
                            value={addForm.utrNumber}
                            onChange={(e) => setAddForm(f => ({ ...f, utrNumber: e.target.value }))}
                          />
                        </div>

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
                              <span className="text-sm text-muted-foreground">Select receipt from gallery</span>
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
                )}
                {withdrawDialog}
              </div>
            </div>

            {!isHost && (
            <div className="bg-gradient-to-br from-slate-500/20 to-slate-400/10 border border-slate-500/20 rounded-2xl p-5">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <SilverCoinIcon size="md" />
                  <p className="text-sm text-muted-foreground">Silver Coins</p>
                </div>
                {canConvert && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 h-7 text-xs border-slate-500/40 text-slate-300"
                    onClick={handleConvertSilver}
                    disabled={isConverting}
                  >
                    <RefreshCw className="w-3 h-3" />
                    {isConverting ? "Converting..." : "Convert"}
                  </Button>
                )}
              </div>
              <h3 className="text-3xl font-bold mb-1">{silverCoins}</h3>
              {canConvert ? (
                <p className="text-xs text-amber-400">Ready to convert! 100 Silver = 10 Gold Coins</p>
              ) : (
                <p className="text-xs text-muted-foreground">{100 - (silverCoins % 100)} more needed to convert (100 Silver = 10 Gold)</p>
              )}

              <div className="mt-3 border-t border-slate-500/20 pt-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2.5">Earn with Tasks</p>
                <div className="space-y-1.5">
                  <DailyTask
                    icon="📅"
                    title="Daily Login"
                    desc="+2 Silver Coins"
                    progress={dailyTasks?.loginClaimed ? 1 : 0}
                    total={1}
                    claimed={dailyTasks?.loginClaimed ?? false}
                  />
                  <DailyTask
                    icon="🏆"
                    title="Win 3 Matches"
                    desc="+3 Silver Coins each win"
                    progress={dailyTasks?.winsToday ?? 0}
                    total={3}
                    claimed={dailyTasks?.winsClaimed ?? false}
                  />
                  <DailyTask
                    icon="🎮"
                    title="Play 5 Paid Matches"
                    desc="+5 Silver Coins"
                    progress={dailyTasks?.paidMatchesToday ?? 0}
                    total={5}
                    claimed={dailyTasks?.paidMatchesClaimed ?? false}
                  />
                </div>
                <p className="text-[10px] text-muted-foreground/60 mt-2 text-center">Tasks reset daily · 100 Silver = 10 Gold Coins</p>
              </div>
            </div>
            )}
          </div>
        )}

        {isHost ? (
          <Tabs defaultValue="earnings">
            <TabsList className="w-full">
              <TabsTrigger value="earnings" className="flex-1">Earnings</TabsTrigger>
              <TabsTrigger value="withdrawals" className="flex-1">Withdrawals</TabsTrigger>
            </TabsList>

            <TabsContent value="earnings">
              {(wallet as any)?.earningsHistory?.length ? (
                <div className="space-y-2 mt-3">
                  {(wallet as any).earningsHistory.map((tx: any) => (
                    <div key={tx.id} className="flex items-center justify-between bg-card border border-card-border rounded-xl px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-amber-500/15 flex items-center justify-center shrink-0">
                          <Trophy className="w-4 h-4 text-amber-400" />
                        </div>
                        <div>
                          <div className="font-semibold text-sm">Match #{tx.matchCode}</div>
                          <div className="text-xs text-muted-foreground">{formatDate(tx.createdAt)}</div>
                        </div>
                      </div>
                      <div className="text-sm font-bold text-green-400 flex items-center gap-0.5">
                        +<GoldCoin amount={tx.amount?.toFixed(2) ?? "0.00"} />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12 text-muted-foreground text-sm">
                  <Trophy className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  No earnings yet. Submit match results to earn your host fee.
                </div>
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
                          <div className="font-medium text-sm flex items-center gap-0.5">
                            <GoldCoin amount={tx.amount} />
                          </div>
                          <div className="text-xs text-muted-foreground">{formatDate(tx.createdAt!)}</div>
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
        ) : (
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
                          <div className="font-medium text-sm flex items-center gap-0.5">
                            <GoldCoin amount={tx.amount} />
                          </div>
                          <div className="text-xs text-muted-foreground">{formatDate(tx.createdAt!)}</div>
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
                          <div className="font-medium text-sm flex items-center gap-0.5">
                            <GoldCoin amount={tx.amount} />
                          </div>
                          <div className="text-xs text-muted-foreground">{formatDate(tx.createdAt!)}</div>
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
        )}
      </div>
    </AppLayout>
  );
}
