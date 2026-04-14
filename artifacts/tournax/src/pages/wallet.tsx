import React, { useState, useRef } from "react";
import { useGetWallet, useRequestAddBalance, useRequestWithdrawal, customFetch } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/useAuth";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { ArrowDownCircle, ArrowUpCircle, Plus, Copy, Check, ImagePlus, AlertTriangle, X, Trophy, Swords, Wallet, Package, FileText, CheckCircle2, Clock, RefreshCw, Coins, Ban, Ticket, ShieldCheck, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { GoldCoin, GoldCoinIcon } from "@/components/ui/Coins";

function statusBadgeClass(status: string) {
  if (status === "approved") return "bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/30";
  if (status === "rejected") return "bg-destructive/15 text-destructive border-destructive/30";
  return "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 border-yellow-500/30";
}

const ADD_BALANCE_RULES = [
  { icon: AlertTriangle, color: "text-destructive", text: "Submitting a false or already used UTR will result in a 2 TournaX Coin penalty." },
  { icon: FileText, color: "text-blue-400", text: "Attach a clear and readable receipt — blurry or cropped receipts will be rejected." },
  { icon: CheckCircle2, color: "text-green-400", text: "Enter the UTR number exactly as shown in the receipt." },
  { icon: Clock, color: "text-yellow-400", text: "Request approval can take up to 2 hours." },
  { icon: RefreshCw, color: "text-primary", text: "Minimum add amount is 10 ₹ (TournaX Coins)." },
  { icon: Coins, color: "text-primary", text: "1₹ = 1 TournaX Coin" },
  { icon: Ban, color: "text-orange-400", text: "Do not submit a request with the same UTR twice." },
];

const COIN_PACKS = [
  { id: "starter", label: "Starter", coins: 10, price: 10, colorCard: "bg-secondary border-border", colorAccent: "bg-secondary-foreground/10", colorBadge: "", colorLabel: "text-foreground", colorSub: "text-muted-foreground", badge: "" },
  { id: "pro", label: "Popular", coins: 50, price: 50, colorCard: "bg-violet-500/10 border-violet-500/30 dark:bg-violet-900/40 dark:border-violet-500/40", colorAccent: "bg-violet-500/20", colorBadge: "bg-violet-500/20 text-violet-700 dark:text-violet-300", colorLabel: "text-violet-700 dark:text-violet-200", colorSub: "text-violet-600/70 dark:text-violet-300/60", badge: "Most Popular" },
  { id: "elite", label: "Best Value", coins: 100, price: 100, colorCard: "bg-amber-500/10 border-amber-500/30 dark:bg-amber-900/40 dark:border-amber-500/40", colorAccent: "bg-amber-500/20", colorBadge: "bg-amber-500/20 text-amber-700 dark:text-amber-300", colorLabel: "text-amber-700 dark:text-amber-200", colorSub: "text-amber-600/70 dark:text-amber-300/60", badge: "Best Value" },
  { id: "custom", label: "Custom", coins: 0, price: 0, colorCard: "bg-primary/8 border-primary/25 dark:bg-primary/15", colorAccent: "bg-primary/20", colorBadge: "", colorLabel: "text-foreground", colorSub: "text-muted-foreground", badge: "" },
];

const RECEIPT_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
const RECEIPT_MAX_BYTES = 5 * 1024 * 1024;


function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

type BuyStep = "select" | "qr" | "receipt";

function CoinsPackDialog() {
  const { toast } = useToast();
  const { mutateAsync: addBalance, isPending: isAdding } = useRequestAddBalance();
  const { data: wallet, refetch, isLoading: isWalletLoading } = useGetWallet();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<BuyStep>("select");
  const [selectedPack, setSelectedPack] = useState<typeof COIN_PACKS[0] | null>(null);
  const [customAmount, setCustomAmount] = useState("");
  const [copied, setCopied] = useState(false);
  const [utrNumber, setUtrNumber] = useState("");
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);

  const reset = () => {
    setStep("select");
    setSelectedPack(null);
    setCustomAmount("");
    setCopied(false);
    setUtrNumber("");
    setReceiptFile(null);
    if (receiptPreview) URL.revokeObjectURL(receiptPreview);
    setReceiptPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const finalCoins = selectedPack?.id === "custom" ? parseInt(customAmount) || 0 : selectedPack?.coins ?? 0;
  const finalPrice = selectedPack?.id === "custom" ? parseInt(customAmount) || 0 : selectedPack?.price ?? 0;
  const upiId = wallet?.upiId?.trim() ?? "";

  const handlePackSelect = (pack: typeof COIN_PACKS[0]) => {
    if (!isWalletLoading && !upiId) {
      toast({ title: "UPI unavailable", description: "Admin UPI ID is not configured yet. Please contact support.", variant: "destructive" });
      return;
    }
    setSelectedPack(pack);
    if (pack.id !== "custom") setStep("qr");
  };

  const handleCustomNext = () => {
    const amount = parseInt(customAmount);
    if (!amount || amount < 10) {
      toast({ title: "Minimum 10 coins", variant: "destructive" });
      return;
    }
    if (!upiId) {
      toast({ title: "UPI unavailable", description: "Admin UPI ID is not configured yet. Please contact support.", variant: "destructive" });
      return;
    }
    setStep("qr");
  };

  const handleCopyUpi = () => {
    if (!upiId) return;
    navigator.clipboard.writeText(upiId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleReceiptSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!RECEIPT_MIME_TYPES.includes(file.type)) {
      toast({ title: "Unsupported receipt", description: "Upload a JPG, PNG, WebP, or PDF receipt.", variant: "destructive" });
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    if (file.size > RECEIPT_MAX_BYTES) {
      toast({ title: "Receipt too large", description: "Maximum receipt size is 5MB.", variant: "destructive" });
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
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

  const handleSubmit = async () => {
    if (!receiptFile) {
      toast({ title: "Receipt required", description: "Please attach your payment receipt.", variant: "destructive" });
      return;
    }
    const normalizedUtr = utrNumber.trim().replace(/\s+/g, "").toUpperCase();
    if (!normalizedUtr) {
      toast({ title: "UTR required", description: "Please enter the UTR number from your receipt.", variant: "destructive" });
      return;
    }
    if (!/^[A-Z0-9-]{6,30}$/.test(normalizedUtr)) {
      toast({ title: "Invalid UTR", description: "Enter a valid UTR/reference number from your receipt.", variant: "destructive" });
      return;
    }
    if (finalCoins < 10) {
      toast({ title: "Invalid amount", variant: "destructive" });
      return;
    }
    try {
      const formData = new FormData();
      formData.append("file", receiptFile);
      formData.append("context", "receipt");
      const uploadRes = await customFetch<{ objectPath: string }>(
        "/api/storage/uploads/file",
        { method: "POST", body: formData }
      );
      const objectPath = uploadRes.objectPath;

      await addBalance({ data: { amount: finalCoins, utrNumber: normalizedUtr, receiptUrl: objectPath } });
      toast({ title: "Request submitted!", description: "Await admin approval. Usually within 30 mins." });
      reset();
      setOpen(false);
      refetch();
    } catch (err: any) {
      toast({ title: "Error", description: err?.data?.error || err?.message || "Something went wrong", variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5 flex-1">
          <Plus className="w-3.5 h-3.5" /> Add Coins
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm p-0 overflow-hidden flex flex-col max-h-[90vh]">
        <DialogHeader className="px-4 pt-4 pb-2 shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Package className="w-4 h-4 text-violet-400" />
            {step === "select" ? "Choose a Pack" : step === "qr" ? "Scan & Pay" : "Submit Proof"}
          </DialogTitle>
          {step !== "select" && (
            <div className="flex items-center gap-1.5 mt-1">
              <div className={cn("w-2 h-2 rounded-full", step === "qr" || step === "receipt" ? "bg-primary" : "bg-muted")} />
              <div className={cn("w-2 h-2 rounded-full", step === "receipt" ? "bg-primary" : "bg-muted")} />
            </div>
          )}
        </DialogHeader>

        <div className="overflow-y-auto flex-1 px-4 pb-4">
          {step === "select" && (
            <div className="space-y-3 pt-1">
              <p className="text-xs text-muted-foreground">Select a coins pack to buy. 1₹ = 1 TournaX Coin.</p>
              <div className="grid grid-cols-2 gap-2.5">
                {COIN_PACKS.map((pack) => (
                  <button
                    key={pack.id}
                    type="button"
                    onClick={() => handlePackSelect(pack)}
                    className={cn(
                      "relative overflow-hidden flex flex-col items-center justify-center gap-1.5 p-4 rounded-2xl border text-center transition-all hover:scale-[1.02] active:scale-[0.98]",
                      pack.colorCard
                    )}
                  >
                    {pack.badge && (
                      <span className={cn("absolute top-2 right-2 text-[8px] font-bold px-1.5 py-0.5 rounded-full whitespace-nowrap", pack.colorBadge)}>
                        {pack.badge}
                      </span>
                    )}
                    <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center", pack.colorAccent)}>
                      <GoldCoinIcon size="md" />
                    </div>
                    <div className={cn("font-bold text-xl leading-none", pack.colorLabel)}>
                      {pack.id === "custom" ? "∞" : pack.coins}
                    </div>
                    <div className={cn("text-[10px] font-medium -mt-0.5", pack.colorSub)}>TournaX Coins</div>
                    <div className={cn("text-xs font-semibold mt-0.5", pack.colorSub)}>
                      {pack.id === "custom" ? "Any Amount" : `₹${pack.price}`}
                    </div>
                  </button>
                ))}
              </div>
              {selectedPack?.id === "custom" && (
                <div className="space-y-3 pt-1">
                  <div className="space-y-1.5">
                    <Label>Amount (₹ / TournaX Coins)</Label>
                    <Input
                      type="number"
                      placeholder="Enter amount (min ₹10)"
                      value={customAmount}
                      onChange={(e) => setCustomAmount(e.target.value)}
                      min={10}
                      autoFocus
                    />
                  </div>
                  <Button className="w-full" onClick={handleCustomNext}>
                    Continue
                  </Button>
                </div>
              )}
            </div>
          )}

          {step === "qr" && (
            <div className="space-y-4 pt-1">
              <div className="bg-primary/10 border border-primary/20 rounded-xl p-3 flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">You are buying</p>
                  <div className="flex items-center gap-1 font-bold text-base">
                    <GoldCoinIcon size="sm" /> {finalCoins} TournaX Coins
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">Pay</p>
                  <p className="font-bold text-lg text-green-400">₹{finalPrice}</p>
                </div>
              </div>

              <div className="flex flex-col items-center">
                <img
                  src={`${import.meta.env.BASE_URL}upi-qr.jpg`}
                  alt="UPI QR Code"
                  className="w-52 h-52 object-contain rounded-xl border border-primary/20"
                />
              </div>

              <button
                onClick={handleCopyUpi}
                className="w-full flex items-center justify-between bg-muted/50 border border-border rounded-xl px-4 py-3 hover:bg-muted transition-colors"
              >
                <div className="text-left">
                  <p className="text-xs text-muted-foreground mb-0.5">UPI ID</p>
                  <p className="font-mono font-semibold text-sm text-primary">{upiId || "UPI ID not configured"}</p>
                </div>
                {copied ? (
                  <Check className="w-4 h-4 text-green-400 shrink-0" />
                ) : (
                  <Copy className="w-4 h-4 text-muted-foreground shrink-0" />
                )}
              </button>

              <div className="bg-yellow-500/10 border border-yellow-500/25 rounded-xl p-3 space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-yellow-400 shrink-0" />
                  <span className="text-xs font-semibold text-yellow-400 uppercase tracking-wide">Important</span>
                </div>
                <p className="text-xs text-muted-foreground">Pay exactly ₹{finalPrice} and save your receipt with UTR number before proceeding.</p>
              </div>

              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setStep("select")}>Back</Button>
                <Button className="flex-1" onClick={() => setStep("receipt")} disabled={!upiId}>I Paid → Submit Proof</Button>
              </div>
            </div>
          )}

          {step === "receipt" && (
            <div className="space-y-4 pt-1">
              <div className="bg-primary/10 border border-primary/20 rounded-xl p-3 flex items-center justify-between">
                <div className="flex items-center gap-1 font-bold">
                  <GoldCoinIcon size="sm" /> {finalCoins} TournaX Coins
                </div>
                <span className="text-green-400 font-bold">₹{finalPrice}</span>
              </div>

              {ADD_BALANCE_RULES.map((rule, i) => (
                <div key={i} className="flex items-start gap-2">
                  <rule.icon className={cn("w-3.5 h-3.5 mt-0.5 shrink-0", rule.color)} />
                  <p className="text-xs text-muted-foreground leading-snug">{rule.text}</p>
                </div>
              ))}

              <div className="space-y-1.5">
                <Label>UTR Number <span className="text-destructive">*</span></Label>
                <Input
                  placeholder="12-digit UTR from receipt"
                  value={utrNumber}
                  onChange={(e) => setUtrNumber(e.target.value.toUpperCase())}
                />
              </div>

              <div className="space-y-1.5">
                <Label>Payment Receipt <span className="text-destructive">*</span></Label>
                <input
                  ref={fileInputRef}
                  type="file"
                          accept="image/jpeg,image/png,image/webp,application/pdf"
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

              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setStep("qr")}>Back</Button>
                <Button
                  className="flex-1"
                  onClick={handleSubmit}
                  disabled={isAdding || !utrNumber.trim() || !receiptFile}
                >
                  {isAdding ? "Submitting..." : "Submit Request"}
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

type TxFilter = "all" | "won" | "spent" | "deposited";

function UserWalletHistory({ wallet }: { wallet: any }) {
  const [filter, setFilter] = useState<TxFilter>("all");

  const deposited: { id: number; amount: number; createdAt: string; status: string; label?: string }[] =
    (wallet?.addBalanceHistory ?? []).map((t: any) => ({ ...t, _type: "deposited" }));
  const withdrawn: { id: number; amount: number; createdAt: string; status: string; label?: string }[] =
    (wallet?.withdrawalHistory ?? []).map((t: any) => ({ ...t, _type: "withdrawn" }));
  const won: { id: number; amount: number; createdAt: string; matchCode?: string }[] =
    (wallet?.wonHistory ?? []).map((t: any) => ({ ...t, _type: "won" }));
  const spent: { id: number; amount: number; createdAt: string; matchCode?: string }[] =
    (wallet?.spentHistory ?? []).map((t: any) => ({ ...t, _type: "spent" }));

  const allTxs = [...deposited, ...withdrawn, ...won, ...spent]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const filtered = filter === "all" ? allTxs
    : filter === "deposited" ? allTxs.filter((t: any) => t._type === "deposited")
    : filter === "won" ? allTxs.filter((t: any) => t._type === "won")
    : allTxs.filter((t: any) => t._type === "spent" || t._type === "withdrawn");

  const filters: { key: TxFilter; label: string; color: string; activeColor: string }[] = [
    { key: "all", label: "All", color: "border-border text-muted-foreground", activeColor: "border-primary bg-primary/15 text-primary" },
    { key: "won", label: "Won", color: "border-border text-muted-foreground", activeColor: "border-green-500 bg-green-500/15 text-green-600 dark:text-green-400" },
    { key: "spent", label: "Spent", color: "border-border text-muted-foreground", activeColor: "border-destructive bg-destructive/15 text-destructive" },
    { key: "deposited", label: "Deposited", color: "border-border text-muted-foreground", activeColor: "border-violet-500 bg-violet-500/15 text-violet-600 dark:text-violet-400" },
  ];

  return (
    <div className="space-y-3 mt-1">
      <div className="flex gap-2 flex-wrap">
        {filters.map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={cn(
              "px-3 py-1 text-xs font-semibold rounded-full border transition-all",
              filter === f.key ? f.activeColor : f.color
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm">
          No transactions found
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((tx: any) => {
            const isWon = tx._type === "won";
            const isDeposited = tx._type === "deposited";
            const isSpent = tx._type === "spent";
            const isWithdrawn = tx._type === "withdrawn";

            return (
              <div key={`${tx._type}-${tx.id}`} className="flex items-center justify-between bg-card border border-card-border rounded-xl px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "w-9 h-9 rounded-xl flex items-center justify-center shrink-0",
                    isWon ? "bg-green-500/15" : isDeposited ? "bg-violet-400/15" : "bg-destructive/15"
                  )}>
                    {isWon && <Trophy className="w-4 h-4 text-green-600 dark:text-green-400" />}
                    {isDeposited && <ArrowDownCircle className="w-4 h-4 text-violet-600 dark:text-violet-400" />}
                    {isSpent && <Swords className="w-4 h-4 text-destructive" />}
                    {isWithdrawn && <ArrowUpCircle className="w-4 h-4 text-destructive" />}
                  </div>
                  <div>
                    <div className="font-medium text-sm">
                      {isWon && `Won — Match #${tx.matchCode}`}
                      {isDeposited && "Deposited"}
                      {isSpent && `Entry Fee — Match #${tx.matchCode}`}
                      {isWithdrawn && "Withdrawal"}
                    </div>
                    <div className="text-xs text-muted-foreground">{formatDate(tx.createdAt!)}</div>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className={cn(
                    "font-bold text-sm flex items-center gap-0.5",
                    isWon ? "text-green-600 dark:text-green-400" : isDeposited ? "text-violet-600 dark:text-violet-400" : "text-destructive"
                  )}>
                    {isWon || isDeposited ? "+" : "-"}
                    <GoldCoin amount={typeof tx.amount === "number" ? tx.amount.toFixed(2) : tx.amount} />
                  </span>
                  {(isDeposited || isWithdrawn) && tx.status && (
                    <span className={cn("text-[10px] px-2 py-0.5 rounded-full border capitalize", statusBadgeClass(tx.status))}>
                      {tx.status}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function WalletPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const { data: wallet, isLoading, refetch } = useGetWallet();
  const { mutateAsync: withdraw, isPending: isWithdrawing } = useRequestWithdrawal();

  const [withdrawForm, setWithdrawForm] = useState({ amount: "", upiId: "" });
  const [withdrawOpen, setWithdrawOpen] = useState(false);

  const isHost = user?.role === "host";
  const isEsportsPlayer = user?.role === "player" && Boolean((user as any)?.isEsportsPlayer);

  const handleWithdraw = async () => {
    const parsedWithdrawAmount = parseFloat(withdrawForm.amount);
    if (isNaN(parsedWithdrawAmount) || parsedWithdrawAmount <= 0) {
      toast({ title: "Invalid amount", description: "Please enter a valid withdrawal amount.", variant: "destructive" });
      return;
    }
    if (parsedWithdrawAmount < 10) {
      toast({ title: "Minimum 10 coins required", description: "You need at least 10 TournaX Coins to withdraw.", variant: "destructive" });
      return;
    }
    try {
      await withdraw({ data: { amount: parsedWithdrawAmount, upiId: withdrawForm.upiId } });
      toast({ title: "Withdrawal request submitted!" });
      setWithdrawForm({ amount: "", upiId: "" });
      setWithdrawOpen(false);
      refetch();
    } catch (err: any) {
      toast({ title: "Error", description: err?.data?.error || "Something went wrong", variant: "destructive" });
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
            <span className="font-bold text-green-600 dark:text-green-400">₹{wallet?.balance?.toFixed(2) ?? "0.00"}</span>
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
            <div className="relative overflow-hidden rounded-2xl p-5 border border-violet-400/30 dark:border-violet-500/30 bg-gradient-to-br from-violet-50 via-purple-50 to-violet-100 dark:from-violet-950/60 dark:via-purple-900/30 dark:to-violet-950/60">
              <div className="absolute inset-0 bg-gradient-to-tr from-violet-200/30 via-purple-200/10 to-transparent dark:from-violet-500/10 dark:via-purple-400/5 pointer-events-none" />
              <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-violet-400/60 to-transparent" />
              <div className="relative">
                <div className="flex items-center gap-2 mb-1">
                  <GoldCoinIcon size="md" />
                  <p className="text-sm text-violet-700/80 dark:text-violet-200/70 font-medium tracking-wide">TournaX Coins</p>
                </div>
                <h2 className="text-4xl font-bold mb-1 text-violet-900 dark:text-violet-50">{wallet?.balance?.toFixed(2) ?? "0.00"}</h2>
                <p className="text-xs text-violet-700/60 dark:text-violet-200/50 mb-4">1₹ = 1 TournaX Coin</p>
                <div className="flex gap-2">
                  <CoinsPackDialog />
                  {withdrawDialog}
                </div>
              </div>
            </div>

            {isEsportsPlayer && (
              <div className="relative overflow-hidden rounded-2xl border border-violet-500/40 bg-gradient-to-br from-violet-950/60 via-purple-900/30 to-violet-950/60">
                <div className="absolute inset-0 bg-gradient-to-tr from-violet-500/10 via-purple-400/5 to-transparent pointer-events-none" />
                <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-violet-500/60 to-transparent" />
                <div className="relative p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-xl bg-violet-500/20 flex items-center justify-center">
                        <Ticket className="w-4 h-4 text-violet-400" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-violet-300">TournaX Tickets</p>
                        <p className="text-[10px] text-violet-400/60">For Esports matches only</p>
                      </div>
                    </div>
                    <span className="flex items-center gap-1 text-[10px] font-bold bg-violet-500/20 text-violet-300 border border-violet-500/30 px-2 py-0.5 rounded-full">
                      <ShieldCheck className="w-3 h-3" /> Esports
                    </span>
                  </div>

                  <div className="relative rounded-xl border border-violet-500/25 bg-violet-500/5 p-4 flex items-center justify-between gap-4">
                    <div className="absolute top-2 right-2">
                      <span className="text-[9px] font-bold bg-violet-500/25 text-violet-300 border border-violet-500/30 px-2 py-0.5 rounded-full tracking-wide uppercase">Coming Soon</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-xl bg-violet-500/15 border border-violet-500/20 flex flex-col items-center justify-center">
                        <Ticket className="w-5 h-5 text-violet-400 mb-0.5" />
                        <span className="text-[10px] font-bold text-violet-300 leading-none">×50</span>
                      </div>
                      <div>
                        <p className="font-bold text-base text-violet-100">50 Tickets</p>
                        <p className="text-xs text-violet-400/70">Entry pass for Esports tournaments</p>
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-lg font-bold text-violet-300">₹99</p>
                      <button
                        disabled
                        className="mt-1 flex items-center gap-1 text-[10px] font-semibold bg-violet-500/10 text-violet-500/50 border border-violet-500/20 px-3 py-1.5 rounded-lg cursor-not-allowed"
                      >
                        <Lock className="w-3 h-3" /> Buy
                      </button>
                    </div>
                  </div>

                  <p className="text-[10px] text-violet-500/50 mt-2 text-center">Ticket packs will be available once Esports matches go live</p>
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
                        <div className="w-9 h-9 rounded-xl bg-violet-500/15 flex items-center justify-center shrink-0">
                          <Trophy className="w-4 h-4 text-violet-600 dark:text-violet-400" />
                        </div>
                        <div>
                          <div className="font-semibold text-sm">Match #{tx.matchCode}</div>
                          <div className="text-xs text-muted-foreground">{formatDate(tx.createdAt)}</div>
                        </div>
                      </div>
                      <div className="text-sm font-bold text-green-600 dark:text-green-400 flex items-center gap-0.5">
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
          <UserWalletHistory wallet={wallet as any} />
        )}
      </div>
    </AppLayout>
  );
}
