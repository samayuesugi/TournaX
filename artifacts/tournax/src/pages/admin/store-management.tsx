import { useState, useEffect } from "react";
import { customFetch } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { ShoppingBag, Edit2, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface StoreItem {
  id: string;
  category: string;
  name: string;
  description: string;
  emoji: string;
  cost: number;
  originalCost: number;
}

const CATEGORY_LABELS: Record<string, string> = {
  frame: "Avatar Frames",
  badge: "Profile Badges",
  handle_color: "Handle Colors",
};

export default function StoreManagementPage() {
  const { toast } = useToast();
  const [items, setItems] = useState<StoreItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    customFetch<StoreItem[]>("/api/admin/store")
      .then(setItems)
      .catch(() => toast({ title: "Failed to load store items", variant: "destructive" }))
      .finally(() => setLoading(false));
  }, []);

  const startEdit = (item: StoreItem) => {
    setEditing(prev => ({ ...prev, [item.id]: String(item.cost) }));
  };

  const cancelEdit = (itemId: string) => {
    setEditing(prev => { const n = { ...prev }; delete n[itemId]; return n; });
  };

  const savePrice = async (item: StoreItem) => {
    const price = parseInt(editing[item.id] || "0");
    if (isNaN(price) || price < 0) { toast({ title: "Invalid price", variant: "destructive" }); return; }
    setSaving(item.id);
    try {
      await customFetch(`/api/admin/store/${item.id}/price`, {
        method: "PATCH",
        body: JSON.stringify({ price }),
        responseType: "json",
      });
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, cost: price } : i));
      cancelEdit(item.id);
      toast({ title: "Price updated" });
    } catch (err: any) {
      toast({ title: "Error", description: err?.data?.error || "Failed", variant: "destructive" });
    }
    setSaving(null);
  };

  const grouped = items.reduce<Record<string, StoreItem[]>>((acc, item) => {
    if (!acc[item.category]) acc[item.category] = [];
    acc[item.category].push(item);
    return acc;
  }, {});

  return (
    <AppLayout title="Store Management" showBack backHref="/admin">
      <div className="space-y-5 pb-4">
        {loading ? (
          [1,2,3].map(i => <Skeleton key={i} className="h-32 rounded-xl" />)
        ) : (
          Object.entries(grouped).map(([cat, catItems]) => (
            <div key={cat}>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                {CATEGORY_LABELS[cat] || cat}
              </h3>
              <div className="flex flex-col gap-2">
                {catItems.map(item => {
                  const isEditing = item.id in editing;
                  const priceChanged = item.cost !== item.originalCost;
                  return (
                    <div key={item.id} className="bg-card border border-card-border rounded-xl px-4 py-3">
                      <div className="flex items-center gap-3">
                        <span className="text-2xl shrink-0">{item.emoji}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm font-medium">{item.name}</span>
                            {priceChanged && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/15 text-primary font-medium">Modified</span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground truncate">{item.description}</p>
                        </div>
                        {isEditing ? (
                          <div className="flex items-center gap-1.5 shrink-0">
                            <Input
                              type="number"
                              value={editing[item.id]}
                              onChange={e => setEditing(prev => ({ ...prev, [item.id]: e.target.value }))}
                              className="w-20 h-8 text-sm text-center"
                              min={0}
                            />
                            <button onClick={() => savePrice(item)} disabled={saving === item.id}
                              className="w-8 h-8 flex items-center justify-center rounded-lg bg-primary/15 text-primary hover:bg-primary/25 transition-colors">
                              <Check className="w-4 h-4" />
                            </button>
                            <button onClick={() => cancelEdit(item.id)}
                              className="w-8 h-8 flex items-center justify-center rounded-lg bg-secondary text-muted-foreground hover:text-foreground transition-colors">
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 shrink-0">
                            <div className="text-right">
                              <span className="text-sm font-bold text-primary">{item.cost}</span>
                              <span className="text-xs text-muted-foreground"> SC</span>
                              {priceChanged && (
                                <p className="text-[10px] text-muted-foreground line-through">{item.originalCost} SC</p>
                              )}
                            </div>
                            <button onClick={() => startEdit(item)}
                              className="w-8 h-8 flex items-center justify-center rounded-lg bg-secondary text-muted-foreground hover:text-foreground transition-colors">
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>
    </AppLayout>
  );
}
