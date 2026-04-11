import { useState, useEffect } from "react";
import { customFetch } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Percent, Info } from "lucide-react";

interface PlatformSettings {
  platformFeePercent: number;
}

export default function FeeSettingsPage() {
  const { toast } = useToast();
  const [settings, setSettings] = useState<PlatformSettings | null>(null);
  const [feeInput, setFeeInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    customFetch<PlatformSettings>("/api/admin/settings")
      .then(data => { setSettings(data); setFeeInput(String(data.platformFeePercent)); })
      .catch(() => toast({ title: "Failed to load settings", variant: "destructive" }))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    const fee = parseFloat(feeInput);
    if (isNaN(fee) || fee < 0 || fee > 50) {
      toast({ title: "Fee must be between 0% and 50%", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const res = await customFetch<{ success: boolean; settings: PlatformSettings }>("/api/admin/settings", {
        method: "POST",
        body: JSON.stringify({ platformFeePercent: fee }),
        responseType: "json",
      });
      setSettings(res.settings);
      toast({ title: "Fee updated successfully" });
    } catch (err: any) {
      toast({ title: "Error", description: err?.data?.error || "Failed to save", variant: "destructive" });
    }
    setSaving(false);
  };

  const currentFee = settings?.platformFeePercent ?? 5;
  const examplePrize = 1000;
  const platformTake = (examplePrize * currentFee) / 100;
  const playerTake = examplePrize - platformTake;

  return (
    <AppLayout title="Fee Settings" showBack backHref="/admin">
      <div className="space-y-5 pb-4">
        {loading ? (
          <Skeleton className="h-40 rounded-xl" />
        ) : (
          <>
            <div className="bg-card border border-card-border rounded-xl p-4 space-y-4">
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5">
                  <Percent className="w-3.5 h-3.5" />
                  Platform Fee Percentage
                </Label>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    value={feeInput}
                    onChange={e => setFeeInput(e.target.value)}
                    min={0}
                    max={50}
                    step={0.5}
                    className="text-center font-bold text-lg"
                  />
                  <span className="flex items-center text-muted-foreground font-medium">%</span>
                </div>
                <p className="text-xs text-muted-foreground">Current: {currentFee}% · Range: 0–50%</p>
              </div>
              <Button className="w-full" onClick={handleSave} disabled={saving}>
                {saving ? "Saving..." : "Save Fee"}
              </Button>
            </div>

            <div className="bg-secondary/50 border border-border rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Info className="w-4 h-4 text-primary" />
                Fee Preview (₹{examplePrize} prize pool)
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Prize Pool</span>
                  <span className="font-medium">₹{examplePrize.toFixed(0)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Platform Fee ({currentFee}%)</span>
                  <span className="font-medium text-destructive">−₹{platformTake.toFixed(0)}</span>
                </div>
                <div className="border-t border-border pt-2 flex justify-between">
                  <span className="font-semibold">Players Receive</span>
                  <span className="font-bold text-green-600">₹{playerTake.toFixed(0)}</span>
                </div>
              </div>
            </div>

            <div className="bg-yellow-500/8 border border-yellow-500/20 rounded-xl p-3 text-xs text-yellow-700">
              Changes apply to new matches only. Ongoing matches use the fee set at the time of creation.
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
}
