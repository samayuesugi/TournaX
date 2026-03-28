import { useState, useEffect, useRef, useCallback } from "react";
import { useParams } from "wouter";
import { useGetConversation, useMarkConversationRead, useSendMessage, useGetConversations } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/useAuth";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Send } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

function timeLabel(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function dateSeparator(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

interface OptimisticMessage {
  id: number;
  fromUserId: number;
  toUserId: number;
  content: string;
  createdAt: string;
  read: boolean;
  optimistic?: boolean;
}

export default function ConversationPage() {
  const { userId } = useParams<{ userId: string }>();
  const partnerId = Number(userId);
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [text, setText] = useState("");
  const [optimisticMessages, setOptimisticMessages] = useState<OptimisticMessage[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const prevLengthRef = useRef(0);
  const isFirstLoad = useRef(true);

  const { data: conversations } = useGetConversations();
  const partner = conversations?.find((c) => c.userId === partnerId);

  const { data: serverMessages, isLoading } = useGetConversation(partnerId, {
    query: {
      refetchInterval: 3000,
    },
  });

  const { mutate: markRead } = useMarkConversationRead();
  const { mutate: sendMsg, isPending } = useSendMessage();

  const messages: OptimisticMessage[] = [
    ...(serverMessages ?? []).map((m) => ({ ...m, optimistic: false })),
    ...optimisticMessages.filter(
      (o) => !(serverMessages ?? []).some((s) => s.content === o.content && s.fromUserId === o.fromUserId)
    ),
  ].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  useEffect(() => {
    if (serverMessages && serverMessages.length > 0) {
      markRead(
        { userId: partnerId },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
          },
        }
      );
    }
  }, [serverMessages?.length]);

  useEffect(() => {
    const currentLength = messages.length;
    if (currentLength > prevLengthRef.current || isFirstLoad.current) {
      bottomRef.current?.scrollIntoView({ behavior: isFirstLoad.current ? "instant" : "smooth" });
      isFirstLoad.current = false;
    }
    prevLengthRef.current = currentLength;
  }, [messages.length]);

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed || isPending) return;
    setText("");

    const optimistic: OptimisticMessage = {
      id: Date.now(),
      fromUserId: user!.id,
      toUserId: partnerId,
      content: trimmed,
      createdAt: new Date().toISOString(),
      read: false,
      optimistic: true,
    };
    setOptimisticMessages((prev) => [...prev, optimistic]);

    setTimeout(() => inputRef.current?.focus(), 0);

    sendMsg(
      { data: { toUserId: partnerId, content: trimmed } },
      {
        onSuccess: () => {
          setOptimisticMessages([]);
          queryClient.invalidateQueries({ queryKey: [`/api/conversations/${partnerId}`] });
          queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
        },
        onError: () => {
          setOptimisticMessages((prev) => prev.filter((m) => m.content !== trimmed));
        },
      }
    );
  }, [text, isPending, partnerId, user, sendMsg, queryClient]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  let lastDate = "";

  const partnerHeaderContent = partner ? (
    <div className="flex items-center gap-2.5 min-w-0">
      <div className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center text-lg shrink-0 overflow-hidden">
        {partner.avatar && (partner.avatar.startsWith("/") || partner.avatar.startsWith("http") || partner.avatar.startsWith("data:"))
          ? <img src={partner.avatar} alt={partner.name || "avatar"} className="w-full h-full object-cover" />
          : partner.avatar || "🔥"}
      </div>
      <div className="min-w-0">
        <p className="font-semibold text-sm truncate leading-tight">{partner.name || partner.handle || `User ${partnerId}`}</p>
        {partner.handle && (
          <p className="text-xs text-muted-foreground truncate leading-tight">@{partner.handle}</p>
        )}
      </div>
    </div>
  ) : (
    <p className="font-semibold text-sm truncate">{`User ${partnerId}`}</p>
  );

  return (
    <AppLayout showBack backHref="/chat" hideNav headerContent={partnerHeaderContent}>
      <div className="flex flex-col h-[calc(100vh-8rem)]">
        <div className="flex-1 overflow-y-auto space-y-1 pb-2">
          {isLoading ? (
            <div className="space-y-3 py-4">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className={cn("h-10 w-2/3 rounded-2xl", i % 2 === 0 && "ml-auto")} />
              ))}
            </div>
          ) : messages.length > 0 ? (
            messages.map((msg) => {
              const isMine = msg.fromUserId === user?.id;
              const dateLabel = dateSeparator(msg.createdAt);
              const showDate = dateLabel !== lastDate;
              lastDate = dateLabel;
              return (
                <div key={msg.id}>
                  {showDate && (
                    <div className="text-center my-3">
                      <span className="text-[10px] text-muted-foreground bg-secondary px-2 py-0.5 rounded-full">
                        {dateLabel}
                      </span>
                    </div>
                  )}
                  <div className={cn("flex", isMine ? "justify-end" : "justify-start")}>
                    <div
                      className={cn(
                        "max-w-[75%] px-3 py-2 rounded-2xl text-sm transition-opacity duration-150",
                        isMine
                          ? "bg-primary text-primary-foreground rounded-br-sm"
                          : "bg-card border border-card-border rounded-bl-sm",
                        msg.optimistic && "opacity-70"
                      )}
                    >
                      <p className="break-words">{msg.content}</p>
                      <p className={cn(
                        "text-[10px] mt-0.5",
                        isMine ? "text-primary-foreground/70 text-right" : "text-muted-foreground"
                      )}>
                        {msg.optimistic ? "Sending…" : timeLabel(msg.createdAt)}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="flex items-center justify-center h-full">
              <p className="text-muted-foreground text-sm">No messages yet. Say hi!</p>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <div className="flex items-center gap-2 pt-2 pb-safe border-t border-border">
          <Input
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            className="flex-1 bg-card border-card-border"
            autoFocus
          />
          <Button
            size="icon"
            onClick={handleSend}
            disabled={!text.trim()}
            className="shrink-0"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </AppLayout>
  );
}
