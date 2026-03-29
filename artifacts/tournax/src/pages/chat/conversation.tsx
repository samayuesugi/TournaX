import { useState, useEffect, useRef, useCallback } from "react";
import { useParams } from "wouter";
import { useGetConversation, useMarkConversationRead, useSendMessage, useGetConversations } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/useAuth";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Send, Check, CheckCheck } from "lucide-react";
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

function MessageTick({ optimistic, read }: { optimistic?: boolean; read: boolean }) {
  if (optimistic) {
    return <Check className="w-3 h-3 inline-block ml-1 opacity-60 shrink-0" />;
  }
  if (read) {
    return <CheckCheck className="w-3 h-3 inline-block ml-1 text-blue-300 shrink-0" />;
  }
  return <CheckCheck className="w-3 h-3 inline-block ml-1 opacity-60 shrink-0" />;
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
      refetchInterval: 2000,
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
        <div className="flex-1 overflow-y-auto pb-2 px-0.5" style={{ overscrollBehavior: "contain" }}>
          {isLoading ? (
            <div className="space-y-3 py-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className={cn("flex", i % 2 === 0 ? "justify-end" : "justify-start")}>
                  <Skeleton className={cn("h-10 rounded-2xl", i % 2 === 0 ? "w-40" : "w-52")} />
                </div>
              ))}
            </div>
          ) : messages.length > 0 ? (
            <div className="flex flex-col gap-0.5 py-2">
              {messages.map((msg, idx) => {
                const isMine = msg.fromUserId === user?.id;
                const dateLabel = dateSeparator(msg.createdAt);
                const showDate = dateLabel !== lastDate;
                lastDate = dateLabel;

                const prevMsg = messages[idx - 1];
                const nextMsg = messages[idx + 1];
                const isFirst = !prevMsg || prevMsg.fromUserId !== msg.fromUserId;
                const isLast = !nextMsg || nextMsg.fromUserId !== msg.fromUserId;

                return (
                  <div key={msg.id} className={cn("animate-in fade-in slide-in-from-bottom-1 duration-200")}>
                    {showDate && (
                      <div className="flex justify-center my-3">
                        <span className="text-[10px] text-muted-foreground bg-secondary/80 px-3 py-0.5 rounded-full">
                          {dateLabel}
                        </span>
                      </div>
                    )}
                    <div className={cn(
                      "flex items-end gap-1.5",
                      isMine ? "justify-end" : "justify-start",
                      isLast ? "mb-1.5" : "mb-0.5"
                    )}>
                      {/* Partner avatar on last bubble of their group */}
                      {!isMine && (
                        <div className={cn("w-6 h-6 rounded-full shrink-0 overflow-hidden bg-secondary flex items-center justify-center text-xs", !isLast && "invisible")}>
                          {partner?.avatar && (partner.avatar.startsWith("/") || partner.avatar.startsWith("http"))
                            ? <img src={partner.avatar} alt="" className="w-full h-full object-cover" />
                            : partner?.avatar || "🔥"}
                        </div>
                      )}

                      <div
                        className={cn(
                          "max-w-[72%] px-3.5 py-2 text-sm",
                          isMine
                            ? "bg-primary text-primary-foreground"
                            : "bg-card border border-card-border text-foreground",
                          // Bubble shape: rounded except the corner near the avatar group
                          isMine
                            ? isFirst && isLast
                              ? "rounded-2xl"
                              : isFirst
                                ? "rounded-2xl rounded-br-md"
                                : isLast
                                  ? "rounded-2xl rounded-tr-md"
                                  : "rounded-2xl rounded-r-md"
                            : isFirst && isLast
                              ? "rounded-2xl"
                              : isFirst
                                ? "rounded-2xl rounded-bl-md"
                                : isLast
                                  ? "rounded-2xl rounded-tl-md"
                                  : "rounded-2xl rounded-l-md",
                          msg.optimistic && "opacity-75"
                        )}
                      >
                        <p className="break-words leading-relaxed">{msg.content}</p>
                        <div className={cn(
                          "flex items-center gap-0.5 mt-0.5",
                          isMine ? "justify-end" : "justify-start"
                        )}>
                          <span className={cn(
                            "text-[10px]",
                            isMine ? "text-primary-foreground/60" : "text-muted-foreground"
                          )}>
                            {msg.optimistic ? "Sending…" : timeLabel(msg.createdAt)}
                          </span>
                          {isMine && (
                            <MessageTick optimistic={msg.optimistic} read={msg.read} />
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
              <div className="w-14 h-14 rounded-full bg-secondary flex items-center justify-center text-2xl">
                {partner?.avatar || "💬"}
              </div>
              <div>
                <p className="font-semibold text-sm">{partner?.name || `User ${partnerId}`}</p>
                <p className="text-muted-foreground text-xs mt-0.5">No messages yet. Say hi! 👋</p>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <div className="flex items-center gap-2 pt-2 pb-safe border-t border-border bg-background">
          <Input
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Message..."
            className="flex-1 bg-card border-card-border rounded-full px-4"
            autoFocus
          />
          <Button
            size="icon"
            onClick={handleSend}
            disabled={!text.trim()}
            className="shrink-0 rounded-full"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </AppLayout>
  );
}
