import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/useAuth";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { customFetch } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";
import { ShoppingBag, Sparkles, Check, Shield, Frame, Award, Palette, Eye } from "lucide-react";
import { isImageAvatar, resolveAvatarSrc } from "@/lib/host-avatars";

interface CosmeticItem {
  id: string;
  category: "frame" | "badge" | "handle_color";
  name: string;
  description: string;
  emoji: string;
  cost: number;
  cssValue: string;
}

interface StoreData {
  items: CosmeticItem[];
  owned: string[];
  equipped: { frame: string | null; badge: string | null; handle_color: string | null };
}

function SilverIcon({ className }: { className?: string }) {
  return (
    <img src="/silver-coin.png" alt="Silver" className={cn("w-4 h-4 shrink-0 object-contain", className)} />
  );
}

function AvatarWithFrame({ avatar, frameClass, size = "lg" }: { avatar?: string | null; frameClass?: string; size?: "sm" | "lg" }) {
  const dim = size === "lg" ? "w-14 h-14 text-3xl" : "w-10 h-10 text-xl";
  const rounded = "rounded-2xl";
  if (isImageAvatar(avatar)) {
    return (
      <img
        src={resolveAvatarSrc(avatar!)}
        alt="avatar"
        className={cn(dim, rounded, "object-cover", frameClass)}
      />
    );
  }
  return (
    <div className={cn(dim, rounded, "bg-primary/20 flex items-center justify-center", frameClass)}>
      {avatar || "🎮"}
    </div>
  );
}

function PreviewDialog({ item, userAvatar, userHandle, userName, owned, equipped, silver, onBuy, onEquip, onUnequip, onClose }: {
  item: CosmeticItem;
  userAvatar?: string | null;
  userHandle?: string;
  userName?: string;
  owned: boolean;
  equipped: boolean;
  silver: number;
  onBuy: (id: string) => Promise<void>;
  onEquip: (id: string) => Promise<void>;
  onUnequip: (cat: string) => Promise<void>;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const handle = userHandle ?? "yourhandle";
  const name = userName ?? "Player";

  const handleAction = async () => {
    setLoading(true);
    try {
      if (!owned) await onBuy(item.id);
      else if (!equipped) await onEquip(item.id);
      else await onUnequip(item.category);
      onClose();
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-xs p-0 overflow-hidden">
        <DialogHeader className="px-4 pt-4 pb-2">
          <DialogTitle className="text-sm flex items-center gap-2">
            <Eye className="w-4 h-4 text-primary" /> Preview · {item.name}
          </DialogTitle>
        </DialogHeader>
        <div className="px-4 pb-5 space-y-4">
          <div className="bg-secondary/40 border border-border rounded-2xl p-5 flex flex-col items-center gap-3">
            {item.category === "frame" && (
              <>
                <AvatarWithFrame avatar={userAvatar} frameClass={item.cssValue} size="lg" />
                <div className="text-center">
                  <div className="font-semibold text-sm">{name}</div>
                  <div className="text-xs text-muted-foreground">@{handle}</div>
                </div>
              </>
            )}
            {item.category === "badge" && (
              <>
                <AvatarWithFrame avatar={userAvatar} size="lg" />
                <div className="text-center">
                  <div className="font-semibold text-sm flex items-center justify-center gap-1.5">
                    {name} <span className="text-lg">{item.emoji}</span>
                  </div>
                  <div className="text-xs text-muted-foreground">@{handle}</div>
                </div>
              </>
            )}
            {item.category === "handle_color" && (
              <>
                <AvatarWithFrame avatar={userAvatar} size="lg" />
                <div className="text-center">
                  <div className="font-semibold text-sm">{name}</div>
                  <div className={cn("text-sm font-bold font-mono", item.cssValue)}>@{handle}</div>
                </div>
              </>
            )}
            <p className="text-xs text-muted-foreground text-center">{item.description}</p>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1 text-sm font-semibold text-slate-300">
              <SilverIcon /> {item.cost}
            </div>
            <Button
              size="sm"
              variant={equipped ? "outline" : "default"}
              className={cn("h-8 px-5 text-sm", equipped && "border-primary/40 text-primary hover:bg-destructive/10 hover:text-destructive hover:border-destructive/40")}
              onClick={handleAction}
              disabled={loading || (!owned && silver < item.cost)}
            >
              {loading ? "..." : equipped ? "Unequip" : owned ? "Equip" : "Buy"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function FrameCard({ item, owned, equipped, onBuy, onEquip, onUnequip, silver, onPreview }: {
  item: CosmeticItem;
  owned: boolean;
  equipped: boolean;
  onBuy: (id: string) => Promise<void>;
  onEquip: (id: string) => Promise<void>;
  onUnequip: (cat: string) => Promise<void>;
  silver: number;
  onPreview: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const canAfford = silver >= item.cost;

  const handleAction = async () => {
    setLoading(true);
    try {
      if (!owned) await onBuy(item.id);
      else if (!equipped) await onEquip(item.id);
      else await onUnequip(item.category);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={cn(
      "bg-card border rounded-2xl p-4 flex flex-col gap-3 transition-all",
      equipped ? "border-primary/60 bg-primary/5" : "border-border"
    )}>
      <button type="button" onClick={onPreview} className="flex items-center gap-3 text-left w-full">
        <AvatarWithFrame avatar="🎮" frameClass={owned ? item.cssValue : undefined} size="sm" />
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm flex items-center gap-1.5">
            {item.emoji} {item.name}
            {equipped && <Check className="w-3 h-3 text-primary" />}
          </div>
          <div className="text-xs text-muted-foreground leading-tight mt-0.5">{item.description}</div>
        </div>
        <Eye className="w-4 h-4 text-muted-foreground shrink-0" />
      </button>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1 text-sm font-semibold text-slate-300">
          <SilverIcon /> {item.cost}
        </div>
        <Button
          size="sm"
          variant={equipped ? "outline" : owned ? "default" : canAfford ? "default" : "secondary"}
          className={cn("h-7 text-xs px-3", equipped && "border-primary/40 text-primary hover:bg-destructive/10 hover:text-destructive hover:border-destructive/40")}
          onClick={handleAction}
          disabled={loading || (!owned && !canAfford)}
        >
          {loading ? "..." : equipped ? "Unequip" : owned ? "Equip" : "Buy"}
        </Button>
      </div>
    </div>
  );
}

function BadgeCard({ item, owned, equipped, onBuy, onEquip, onUnequip, silver, onPreview }: {
  item: CosmeticItem;
  owned: boolean;
  equipped: boolean;
  onBuy: (id: string) => Promise<void>;
  onEquip: (id: string) => Promise<void>;
  onUnequip: (cat: string) => Promise<void>;
  silver: number;
  onPreview: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const canAfford = silver >= item.cost;

  const handleAction = async () => {
    setLoading(true);
    try {
      if (!owned) await onBuy(item.id);
      else if (!equipped) await onEquip(item.id);
      else await onUnequip(item.category);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={cn(
      "bg-card border rounded-2xl p-4 flex flex-col gap-3 transition-all",
      equipped ? "border-primary/60 bg-primary/5" : "border-border"
    )}>
      <button type="button" onClick={onPreview} className="flex items-center gap-3 text-left w-full">
        <div className="w-10 h-10 rounded-2xl bg-secondary flex items-center justify-center text-2xl shrink-0">
          {item.emoji}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm flex items-center gap-1.5">
            {item.name}
            {equipped && <Check className="w-3 h-3 text-primary" />}
          </div>
          <div className="text-xs text-muted-foreground leading-tight mt-0.5">{item.description}</div>
        </div>
        <Eye className="w-4 h-4 text-muted-foreground shrink-0" />
      </button>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1 text-sm font-semibold text-slate-300">
          <SilverIcon /> {item.cost}
        </div>
        <Button
          size="sm"
          variant={equipped ? "outline" : owned ? "default" : canAfford ? "default" : "secondary"}
          className={cn("h-7 text-xs px-3", equipped && "border-primary/40 text-primary hover:bg-destructive/10 hover:text-destructive hover:border-destructive/40")}
          onClick={handleAction}
          disabled={loading || (!owned && !canAfford)}
        >
          {loading ? "..." : equipped ? "Unequip" : owned ? "Equip" : "Buy"}
        </Button>
      </div>
    </div>
  );
}

function HandleColorCard({ item, owned, equipped, onBuy, onEquip, onUnequip, silver, handle, onPreview }: {
  item: CosmeticItem;
  owned: boolean;
  equipped: boolean;
  onBuy: (id: string) => Promise<void>;
  onEquip: (id: string) => Promise<void>;
  onUnequip: (cat: string) => Promise<void>;
  silver: number;
  handle?: string;
  onPreview: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const canAfford = silver >= item.cost;

  const handleAction = async () => {
    setLoading(true);
    try {
      if (!owned) await onBuy(item.id);
      else if (!equipped) await onEquip(item.id);
      else await onUnequip(item.category);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={cn(
      "bg-card border rounded-2xl p-4 flex flex-col gap-3 transition-all",
      equipped ? "border-primary/60 bg-primary/5" : "border-border"
    )}>
      <button type="button" onClick={onPreview} className="flex items-center gap-3 text-left w-full">
        <div className="w-10 h-10 rounded-2xl bg-secondary flex items-center justify-center text-xl shrink-0">
          {item.emoji}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm flex items-center gap-1.5">
            {item.name}
            {equipped && <Check className="w-3 h-3 text-primary" />}
          </div>
          <div className={cn("text-sm font-bold font-mono mt-0.5", item.cssValue)}>
            @{handle || "yourhandle"}
          </div>
        </div>
        <Eye className="w-4 h-4 text-muted-foreground shrink-0" />
      </button>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1 text-sm font-semibold text-slate-300">
          <SilverIcon /> {item.cost}
        </div>
        <Button
          size="sm"
          variant={equipped ? "outline" : owned ? "default" : canAfford ? "default" : "secondary"}
          className={cn("h-7 text-xs px-3", equipped && "border-primary/40 text-primary hover:bg-destructive/10 hover:text-destructive hover:border-destructive/40")}
          onClick={handleAction}
          disabled={loading || (!owned && !canAfford)}
        >
          {loading ? "..." : equipped ? "Unequip" : owned ? "Equip" : "Buy"}
        </Button>
      </div>
    </div>
  );
}

export default function StorePage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [storeData, setStoreData] = useState<StoreData | null>(null);
  const [loading, setLoading] = useState(true);
  const [previewItem, setPreviewItem] = useState<CosmeticItem | null>(null);

  const silverCoins = user?.silverCoins ?? 0;

  const fetchStore = useCallback(async () => {
    try {
      const data = await customFetch<StoreData>("/api/store/items");
      setStoreData(data);
    } catch {
      toast({ title: "Failed to load store", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { fetchStore(); }, [fetchStore]);

  const handleBuy = async (itemId: string) => {
    try {
      const res = await customFetch<{ message: string }>(`/api/store/buy/${itemId}`, { method: "POST" });
      toast({ title: "Purchased!", description: res.message });
      await fetchStore();
    } catch (err: any) {
      toast({ title: "Purchase failed", description: err?.data?.error || "Something went wrong", variant: "destructive" });
    }
  };

  const handleEquip = async (itemId: string) => {
    try {
      const res = await customFetch<{ message: string }>(`/api/store/equip/${itemId}`, { method: "POST" });
      toast({ title: "Equipped!", description: res.message });
      await fetchStore();
    } catch (err: any) {
      toast({ title: "Failed to equip", description: err?.data?.error || "Something went wrong", variant: "destructive" });
    }
  };

  const handleUnequip = async (category: string) => {
    try {
      await customFetch(`/api/store/unequip/${category}`, { method: "POST" });
      toast({ title: "Unequipped" });
      await fetchStore();
    } catch (err: any) {
      toast({ title: "Failed", description: err?.data?.error || "Something went wrong", variant: "destructive" });
    }
  };

  const frames = storeData?.items.filter(i => i.category === "frame") ?? [];
  const badges = storeData?.items.filter(i => i.category === "badge") ?? [];
  const colors = storeData?.items.filter(i => i.category === "handle_color") ?? [];
  const owned = new Set(storeData?.owned ?? []);
  const equipped = storeData?.equipped ?? { frame: null, badge: null, handle_color: null };

  return (
    <AppLayout title="Cosmetics Store">
      <div className="max-w-lg mx-auto px-4 py-4 space-y-4 pb-24">
        <div className="bg-gradient-to-r from-primary/20 via-purple-500/10 to-transparent border border-primary/20 rounded-2xl p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center shrink-0">
            <ShoppingBag className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1">
            <div className="font-semibold text-sm">Cosmetics Store</div>
            <div className="text-xs text-muted-foreground">Spend Silver Coins on exclusive cosmetics</div>
          </div>
          <div className="flex items-center gap-1.5 bg-slate-400/10 border border-slate-400/25 rounded-xl px-3 py-1.5">
            <SilverIcon />
            <span className="font-bold text-slate-200 text-sm">{silverCoins}</span>
          </div>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1,2,3].map(i => <div key={i} className="bg-card border border-border rounded-2xl h-24 animate-pulse" />)}
          </div>
        ) : (
          <Tabs defaultValue="frames">
            <TabsList className="w-full grid grid-cols-3 mb-4">
              <TabsTrigger value="frames" className="gap-1.5"><Frame className="w-3.5 h-3.5" /> Frames</TabsTrigger>
              <TabsTrigger value="badges" className="gap-1.5"><Award className="w-3.5 h-3.5" /> Badges</TabsTrigger>
              <TabsTrigger value="colors" className="gap-1.5"><Palette className="w-3.5 h-3.5" /> Handle</TabsTrigger>
            </TabsList>

            <TabsContent value="frames" className="space-y-3 mt-0">
              <p className="text-xs text-muted-foreground px-1">Avatar frames show up on your profile and on all your match cards.</p>
              {frames.map(item => (
                <FrameCard
                  key={item.id}
                  item={item}
                  owned={owned.has(item.id)}
                  equipped={equipped.frame === item.id}
                  onBuy={handleBuy}
                  onEquip={handleEquip}
                  onUnequip={handleUnequip}
                  silver={silverCoins}
                  onPreview={() => setPreviewItem(item)}
                />
              ))}
            </TabsContent>

            <TabsContent value="badges" className="space-y-3 mt-0">
              <p className="text-xs text-muted-foreground px-1">Badges appear next to your handle on your profile and leaderboard.</p>
              {badges.map(item => (
                <BadgeCard
                  key={item.id}
                  item={item}
                  owned={owned.has(item.id)}
                  equipped={equipped.badge === item.id}
                  onBuy={handleBuy}
                  onEquip={handleEquip}
                  onUnequip={handleUnequip}
                  silver={silverCoins}
                  onPreview={() => setPreviewItem(item)}
                />
              ))}
            </TabsContent>

            <TabsContent value="colors" className="space-y-3 mt-0">
              <p className="text-xs text-muted-foreground px-1">Custom handle colors replace the default white handle text on your profile.</p>
              {colors.map(item => (
                <HandleColorCard
                  key={item.id}
                  item={item}
                  owned={owned.has(item.id)}
                  equipped={equipped.handle_color === item.id}
                  onBuy={handleBuy}
                  onEquip={handleEquip}
                  onUnequip={handleUnequip}
                  silver={silverCoins}
                  handle={user?.handle ?? "yourhandle"}
                  onPreview={() => setPreviewItem(item)}
                />
              ))}
            </TabsContent>
          </Tabs>
        )}

        {!loading && storeData && owned.size > 0 && (
          <div className="bg-secondary/30 border border-border rounded-2xl p-3 flex items-center gap-2">
            <Shield className="w-4 h-4 text-primary shrink-0" />
            <div className="text-xs text-muted-foreground">
              You own <span className="font-semibold text-foreground">{owned.size}</span> item{owned.size !== 1 ? "s" : ""}. Equipped: 
              <span className="font-semibold text-foreground ml-1">
                {[equipped.frame && "Frame", equipped.badge && "Badge", equipped.handle_color && "Color"].filter(Boolean).join(", ") || "none"}
              </span>
            </div>
          </div>
        )}
      </div>

      {previewItem && (
        <PreviewDialog
          item={previewItem}
          userAvatar={user?.avatar}
          userHandle={user?.handle}
          userName={user?.name}
          owned={owned.has(previewItem.id)}
          equipped={
            previewItem.category === "frame" ? equipped.frame === previewItem.id :
            previewItem.category === "badge" ? equipped.badge === previewItem.id :
            equipped.handle_color === previewItem.id
          }
          silver={silverCoins}
          onBuy={handleBuy}
          onEquip={handleEquip}
          onUnequip={handleUnequip}
          onClose={() => setPreviewItem(null)}
        />
      )}
    </AppLayout>
  );
}
