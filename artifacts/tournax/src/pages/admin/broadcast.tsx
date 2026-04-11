import { useState } from "react";
import { customFetch } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Megaphone, Users, Gamepad2, Send } from "lucide-react";
import { cn } from "@/lib/utils";

const TARGETS = [
  { id: "all", label: "Everyone", description: "All players and hosts", icon: Users },
  { id: "players", label: "Players Only", description: "All registered players", icon: Gamepad2 },
  { id: "hosts", label: "Hosts Only", description: "All tournament hosts", icon: Megaphone },
];

export default function BroadcastPage() {
  const { toast } = useToast();
  const [target, setTarget] = useState("all");
  const [message, setMessage] = useState("");
  const [link, setLink] = useState("/");
  const [sending, setSending] = useState(false);
  const [lastResult, setLastResult] = useState<{ sent: number } | null>(null);

  const handleSend = async () => {
    if (!message.trim()) { toast({ title: "Message is required", variant: "destructive" }); return; }
    setSending(true);
    try {
      const res = await customFetch<{ success: boolean; sent: number }>("/api/admin/broadcast", {
        method: "POST",
        body: JSON.stringify({ message: message.trim(), target, link: link.trim() || "/" }),
        responseType: "json",
      });
      setLastResult({ sent: res.sent });
      setMessage("");
      toast({ title: `Broadcast sent to ${res.sent} users` });
    } catch (err: any) {
      toast({ title: "Error", description: err?.data?.error || "Failed to send", variant: "destructive" });
    }
    setSending(false);
  };

  return (
    <AppLayout title="Broadcast" showBack backHref="/admin">
      <div className="space-y-5 pb-4">
        <div className="bg-primary/8 border border-primary/20 rounded-xl p-4 flex items-start gap-3">
          <Megaphone className="w-5 h-5 text-primary shrink-0 mt-0.5" />
          <p className="text-sm text-primary">Send an in-app notification to all users or a specific group instantly.</p>
        </div>

        <div className="space-y-2">
          <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Target Audience</Label>
          <div className="flex flex-col gap-2">
            {TARGETS.map(t => (
              <button key={t.id} onClick={() => setTarget(t.id)}
                className={cn("flex items-center gap-3 p-3 rounded-xl border text-left transition-all",
                  target === t.id ? "border-primary bg-primary/8" : "border-border bg-card hover:border-border/80")}>
                <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center shrink-0",
                  target === t.id ? "bg-primary/20" : "bg-secondary")}>
                  <t.icon className={cn("w-4 h-4", target === t.id ? "text-primary" : "text-muted-foreground")} />
                </div>
                <div>
                  <p className={cn("text-sm font-medium", target === t.id ? "text-primary" : "text-foreground")}>{t.label}</p>
                  <p className="text-xs text-muted-foreground">{t.description}</p>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Message</Label>
          <Textarea
            value={message}
            onChange={e => setMessage(e.target.value)}
            placeholder="Write your announcement here..."
            rows={4}
            className="resize-none"
            maxLength={300}
          />
          <p className="text-xs text-muted-foreground text-right">{message.length}/300</p>
        </div>

        <div className="space-y-1.5">
          <Label>Link (optional)</Label>
          <Input value={link} onChange={e => setLink(e.target.value)} placeholder="e.g. /explore or /wallet" />
          <p className="text-xs text-muted-foreground">Users will be taken to this path when they tap the notification.</p>
        </div>

        {lastResult && (
          <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-3 text-sm text-green-600 font-medium">
            Last broadcast sent to {lastResult.sent} users successfully.
          </div>
        )}

        <Button className="w-full gap-2" onClick={handleSend} disabled={sending || !message.trim()}>
          <Send className="w-4 h-4" />
          {sending ? "Sending..." : "Send Broadcast"}
        </Button>
      </div>
    </AppLayout>
  );
}
