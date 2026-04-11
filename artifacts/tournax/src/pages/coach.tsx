import { useState } from "react";
import { Bot, Send, ShieldCheck, Sparkles, Users } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/useAuth";
import { useCoachAi } from "@workspace/api-client-react";

type ChatMessage = {
  role: "user" | "coach";
  text: string;
};

export default function CoachPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "coach",
      text: "Yo bro, main TX Coach hoon. Match strategy, Trust Score improve karna, host choose karna ya Free Fire result tips chahiye toh seedha pooch.",
    },
  ]);
  const { mutateAsync: askCoach, isPending } = useCoachAi();

  const sendMessage = async () => {
    const message = input.trim();
    if (!message || isPending) return;
    setInput("");
    setMessages((prev) => [...prev, { role: "user", text: message }]);
    try {
      const response = await askCoach({
        data: {
          message,
          context: {
            page: "tx-coach",
            trustScore: user?.trustScore,
            trustTier: user?.trustTier,
            role: user?.role,
            game: user?.game,
            isLFT: (user as any)?.isLFT ?? false,
            lftRole: (user as any)?.lftRole ?? null,
          },
        },
      } as any);
      setMessages((prev) => [...prev, { role: "coach", text: response.reply }]);
    } catch (error: any) {
      toast({
        title: "TX Coach unavailable",
        description: error?.message || "AI setup is not ready yet.",
        variant: "destructive",
      });
      setMessages((prev) => [...prev, { role: "coach", text: "Bro, coach AI abhi connect nahi ho pa raha. Thodi der baad try karo." }]);
    }
  };

  return (
    <AppLayout title="TX Coach" showBack>
      <div className="space-y-4">
        <div className="rounded-2xl bg-gradient-to-br from-primary/20 via-card to-card border border-primary/20 p-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-11 h-11 rounded-2xl bg-primary/20 flex items-center justify-center">
              <Bot className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="font-bold text-lg">TX Coach AI</h1>
              <p className="text-xs text-muted-foreground">Hinglish gaming buddy for smarter tournaments</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-secondary/70 border border-border p-3">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                <ShieldCheck className="w-3.5 h-3.5" /> Trust Score
              </div>
              <div className="font-bold text-primary">{user?.trustScore ?? 500}/1000</div>
              <div className="text-[11px] text-muted-foreground">{user?.trustTier ?? "Trusted"}</div>
            </div>
            <div className="rounded-xl bg-secondary/70 border border-border p-3">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                <Sparkles className="w-3.5 h-3.5" /> Best for
              </div>
              <div className="font-bold text-sm">Strategy</div>
              <div className="text-[11px] text-muted-foreground">Free Fire, BGMI, hosting</div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 mt-3">
            {[
              { label: "🤝 Find a Teammate", msg: `Mujhe ${user?.game ?? "mere game"} ke liye ek accha teammate chahiye, kaun LFT hai?` },
              { label: "📈 Score improve", msg: "Mera Trust Score kaise improve karu?" },
              { label: "🏆 Match strategy", msg: "Next match ke liye best strategy kya hogi?" },
              { label: "🎯 Host choose", msg: "Accha host kaise choose karu?" },
            ].map(({ label, msg }) => (
              <button key={label} type="button"
                onClick={() => { setInput(msg); }}
                className="text-xs px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary hover:bg-primary/20 transition-colors">
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          {messages.map((message, index) => (
            <div key={index} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[82%] rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap ${
                message.role === "user"
                  ? "bg-primary text-primary-foreground"
                  : "bg-card border border-card-border text-foreground"
              }`}>
                {message.text}
              </div>
            </div>
          ))}
          {isPending && (
            <div className="flex justify-start">
              <div className="rounded-2xl px-4 py-3 bg-card border border-card-border text-sm text-muted-foreground">
                Soch raha hoon...
              </div>
            </div>
          )}
        </div>

        <div className="sticky bottom-20 bg-background/95 backdrop-blur pt-2">
          <form
            className="flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              sendMessage();
            }}
          >
            <Input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Ask: score kaise improve karu?"
              className="rounded-xl"
            />
            <Button type="submit" size="icon" disabled={isPending || !input.trim()} className="rounded-xl shrink-0">
              <Send className="w-4 h-4" />
            </Button>
          </form>
        </div>
      </div>
    </AppLayout>
  );
}