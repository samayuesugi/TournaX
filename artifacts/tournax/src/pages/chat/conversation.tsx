import { useState, useEffect, useRef, useCallback } from "react";
import { useParams } from "wouter";
import { useGetConversation, useMarkConversationRead, useSendMessage, useGetConversations } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/useAuth";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Send, Check, CheckCheck, Smile, Copy, X, Inbox } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { customFetch } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { useSocket } from "@/contexts/SocketContext";

const QUICK_EMOJIS = ["❤️","😂","😍","🔥","👍","😮","😢","😡","🎮","🏆","💪","✅"];
const REACTION_EMOJIS = ["❤️","😂","😍","🔥","👍","😮","😢","😡","🎉","💯"];

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
  clientId?: string;
  fromUserId: number;
  toUserId: number;
  content: string;
  createdAt: string;
  read: boolean;
  optimistic?: boolean;
  reactions?: Record<string, number[]>;
}

function MessageTick({ optimistic, read }: { optimistic?: boolean; read: boolean }) {
  if (optimistic) return <Check className="w-3 h-3 inline-block ml-1 opacity-60 shrink-0" />;
  if (read) return <CheckCheck className="w-3 h-3 inline-block ml-1 text-violet-300 shrink-0" />;
  return <CheckCheck className="w-3 h-3 inline-block ml-1 opacity-60 shrink-0" />;
}

export default function ConversationPage() {
  const { userId } = useParams<{ userId: string }>();
  const partnerId = Number(userId);
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [text, setText] = useState("");
  const [optimisticMessages, setOptimisticMessages] = useState<OptimisticMessage[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const prevLengthRef = useRef(0);
  const isFirstLoad = useRef(true);

  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ msgId: number; x: number; y: number; content: string } | null>(null);
  const [reactionPicker, setReactionPicker] = useState<{ msgId: number } | null>(null);
  const [heartAnim, setHeartAnim] = useState<{ msgId: number; key: number } | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTapRef = useRef<Map<number, number>>(new Map());
  const [requestStatus, setRequestStatus] = useState<{ sent?: boolean; received?: boolean; firstMessage?: string } | null>(null);

  const { data: conversations } = useGetConversations();
  const partner = conversations?.find((c) => c.userId === partnerId);

  const socket = useSocket();

  const { data: serverMessages, isLoading } = useGetConversation(partnerId, {
    query: { refetchInterval: socket ? false : 2000 } as any,
  });

  useEffect(() => {
    if (!socket) return;
    const handleDmMessage = (msg: OptimisticMessage) => {
      if (
        (msg.fromUserId === partnerId && msg.toUserId === user?.id) ||
        (msg.fromUserId === user?.id && msg.toUserId === partnerId)
      ) {
        queryClient.invalidateQueries({ queryKey: [`/api/conversations/${partnerId}`] });
        queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
      }
    };
    socket.on("dm:message", handleDmMessage);
    return () => { socket.off("dm:message", handleDmMessage); };
  }, [socket, partnerId, user?.id, queryClient]);

  const { mutate: markRead } = useMarkConversationRead();
  const { mutate: sendMsg, isPending } = useSendMessage();

  const messages: OptimisticMessage[] = [
    ...(serverMessages ?? []).map((m: any) => ({ ...m, optimistic: false })),
    ...optimisticMessages.filter(
      (o) => !(serverMessages ?? []).some((s: any) => s.content === o.content && s.fromUserId === o.fromUserId)
    ),
  ].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  useEffect(() => {
    if (serverMessages && serverMessages.length > 0) {
      markRead(
        { userId: partnerId },
        { onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/conversations"] }); } }
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

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const handleVVResize = () => {
      bottomRef.current?.scrollIntoView({ behavior: "instant" });
    };
    vv.addEventListener("resize", handleVVResize);
    return () => vv.removeEventListener("resize", handleVVResize);
  }, []);

  useEffect(() => {
    const checkRequest = async () => {
      try {
        const [sent, received] = await Promise.all([
          customFetch<any[]>("/api/message-requests/sent"),
          customFetch<any[]>("/api/message-requests"),
        ]);
        const sentReq = sent.find((r: any) => r.toUserId === partnerId && r.status === "pending");
        const receivedReq = received.find((r: any) => r.fromUserId === partnerId);
        if (sentReq) setRequestStatus({ sent: true, firstMessage: sentReq.firstMessage });
        else if (receivedReq) setRequestStatus({ received: true, firstMessage: receivedReq.firstMessage });
        else setRequestStatus(null);
      } catch {}
    };
    checkRequest();
  }, [partnerId]);

  const adjustTextareaHeight = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 120) + "px";
  };

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed || isPending) return;
    setText("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
    setShowEmojiPicker(false);

    const clientId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const optimistic: OptimisticMessage = {
      id: Date.now(),
      clientId,
      fromUserId: user!.id,
      toUserId: partnerId,
      content: trimmed,
      createdAt: new Date().toISOString(),
      read: false,
      optimistic: true,
      reactions: {},
    };
    setOptimisticMessages((prev) => [...prev, optimistic]);
    setTimeout(() => textareaRef.current?.focus(), 0);

    sendMsg(
      { data: { toUserId: partnerId, content: trimmed } },
      {
        onSuccess: () => {
          setOptimisticMessages((prev) => prev.filter((m) => m.clientId !== clientId));
          queryClient.invalidateQueries({ queryKey: [`/api/conversations/${partnerId}`] });
          queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
        },
        onError: () => {
          setOptimisticMessages((prev) => prev.filter((m) => m.clientId !== clientId));
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

  const handleReact = async (msgId: number, emoji: string) => {
    setReactionPicker(null);
    setContextMenu(null);
    try {
      await customFetch(`/api/messages/${msgId}/react`, { method: "POST", body: JSON.stringify({ emoji }) });
      queryClient.invalidateQueries({ queryKey: [`/api/conversations/${partnerId}`] });
    } catch {}
  };

  const handleCopy = (content: string) => {
    navigator.clipboard.writeText(content).then(() => {
      toast({ title: "Copied", description: "Message copied to clipboard" });
    });
    setContextMenu(null);
  };

  const handleLongPressStart = (e: React.TouchEvent | React.MouseEvent, msg: OptimisticMessage) => {
    if (msg.optimistic) return;
    const touch = "touches" in e ? e.touches[0] : (e as unknown as MouseEvent);
    longPressTimer.current = setTimeout(() => {
      setContextMenu({ msgId: msg.id, x: touch.clientX, y: touch.clientY, content: msg.content });
    }, 500);
  };

  const handleLongPressEnd = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const handleMessageTap = (msg: OptimisticMessage) => {
    if (msg.optimistic) return;
    const now = Date.now();
    const lastTap = lastTapRef.current.get(msg.id) ?? 0;
    lastTapRef.current.set(msg.id, now);
    if (now - lastTap < 300) {
      if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
      handleReact(msg.id, "👍");
      setHeartAnim({ msgId: msg.id, key: now });
      setTimeout(() => setHeartAnim((prev) => (prev?.key === now ? null : prev)), 800);
    }
  };

  const handleContextMenu = (e: React.MouseEvent, msg: OptimisticMessage) => {
    if (msg.optimistic) return;
    e.preventDefault();
    setContextMenu({ msgId: msg.id, x: e.clientX, y: e.clientY, content: msg.content });
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
        {partner.handle && <p className="text-xs text-muted-foreground truncate leading-tight">@{partner.handle}</p>}
      </div>
    </div>
  ) : (
    <p className="font-semibold text-sm truncate">{`User ${partnerId}`}</p>
  );

  return (
    <AppLayout showBack backHref="/chat" hideNav headerContent={partnerHeaderContent}>
      <style>{`
        @keyframes heartPop {
          0%   { transform: scale(0) rotate(-15deg); opacity: 0; }
          30%  { transform: scale(1.5) rotate(5deg);  opacity: 1; }
          55%  { transform: scale(1.1) rotate(-3deg); opacity: 1; }
          80%  { transform: scale(1.25); opacity: 1; }
          100% { transform: scale(1.1); opacity: 0; }
        }
        @keyframes firstChatFloat {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-8px); }
        }
        @keyframes firstChatFadeUp {
          0% { opacity: 0; transform: translateY(20px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes firstChatRing {
          0% { transform: scale(1); opacity: 0.6; }
          100% { transform: scale(1.8); opacity: 0; }
        }
        .first-chat-avatar {
          animation: firstChatFloat 3s ease-in-out infinite;
        }
        .first-chat-ring {
          animation: firstChatRing 2s ease-out infinite;
        }
        .first-chat-ring-2 {
          animation: firstChatRing 2s ease-out 0.7s infinite;
        }
        .first-chat-text {
          animation: firstChatFadeUp 0.6s ease-out 0.3s both;
        }
        .first-chat-hint {
          animation: firstChatFadeUp 0.6s ease-out 0.6s both;
        }
      `}</style>
      <div className="flex flex-col h-[calc(100dvh-8rem)]">
        <div
          className="flex-1 overflow-y-auto pb-2 px-0.5"
          style={{ overscrollBehavior: "contain" }}
          onClick={() => { setContextMenu(null); setReactionPicker(null); setShowEmojiPicker(false); }}
        >
          {requestStatus?.sent && (
            <div className="flex items-start gap-2.5 bg-amber-500/10 border border-amber-500/25 rounded-xl px-3.5 py-3 mx-0.5 mt-2 mb-1">
              <Inbox className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
              <div className="min-w-0">
                <p className="text-xs font-semibold text-amber-400 mb-0.5">Message Request Sent</p>
                <p className="text-xs text-muted-foreground">Waiting for them to accept your request before you can continue chatting.</p>
              </div>
            </div>
          )}
          {requestStatus?.received && (
            <div className="flex flex-col gap-2 bg-primary/10 border border-primary/25 rounded-xl px-3.5 py-3 mx-0.5 mt-2 mb-1">
              <div className="flex items-start gap-2.5">
                <Inbox className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-primary mb-0.5">Message Request</p>
                  <p className="text-xs text-muted-foreground">They want to chat with you. Accept to start the conversation.</p>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={async () => {
                    await customFetch(`/api/message-requests/${partnerId}/accept`, { method: "POST" });
                    setRequestStatus(null);
                    queryClient.invalidateQueries({ queryKey: [`/api/conversations/${partnerId}`] });
                    queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
                  }}
                  className="flex-1 h-8 rounded-lg bg-primary text-primary-foreground text-xs font-semibold flex items-center justify-center gap-1.5 hover:bg-primary/90 transition-colors"
                >
                  <Check className="w-3.5 h-3.5" /> Accept
                </button>
                <button
                  onClick={async () => {
                    await customFetch(`/api/message-requests/${partnerId}`, { method: "DELETE" });
                    setRequestStatus(null);
                  }}
                  className="flex-1 h-8 rounded-lg bg-destructive/15 text-destructive text-xs font-semibold flex items-center justify-center gap-1.5 hover:bg-destructive/25 transition-colors"
                >
                  <X className="w-3.5 h-3.5" /> Decline
                </button>
              </div>
            </div>
          )}
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
                const reactionEntries = Object.entries(msg.reactions ?? {});

                return (
                  <div key={msg.id} className={cn("animate-in fade-in duration-300", isMine ? "slide-in-from-right-4" : "slide-in-from-left-4")}>
                    {showDate && (
                      <div className="flex justify-center my-3">
                        <span className="text-[10px] text-muted-foreground bg-secondary/80 px-3 py-0.5 rounded-full">
                          {dateLabel}
                        </span>
                      </div>
                    )}
                    <div className={cn("flex items-end gap-1.5", isMine ? "justify-end" : "justify-start", isLast ? "mb-1.5" : "mb-0.5")}>
                      {!isMine && (
                        <div className={cn("w-6 h-6 rounded-full shrink-0 overflow-hidden bg-secondary flex items-center justify-center text-xs", !isLast && "invisible")}>
                          {partner?.avatar && (partner.avatar.startsWith("/") || partner.avatar.startsWith("http"))
                            ? <img src={partner.avatar} alt="" className="w-full h-full object-cover" />
                            : partner?.avatar || "🔥"}
                        </div>
                      )}

                      <div className="flex flex-col" style={{ maxWidth: "72%" }}>
                        <div
                          className={cn(
                            "relative px-3.5 py-2 text-sm cursor-pointer select-none overflow-hidden",
                            isMine ? "bg-primary text-primary-foreground" : "bg-card border border-card-border text-foreground",
                            isMine
                              ? isFirst && isLast ? "rounded-2xl" : isFirst ? "rounded-2xl rounded-br-md" : isLast ? "rounded-2xl rounded-tr-md" : "rounded-2xl rounded-r-md"
                              : isFirst && isLast ? "rounded-2xl" : isFirst ? "rounded-2xl rounded-bl-md" : isLast ? "rounded-2xl rounded-tl-md" : "rounded-2xl rounded-l-md",
                            msg.optimistic && "opacity-75"
                          )}
                          onClick={() => handleMessageTap(msg)}
                          onMouseDown={(e) => handleLongPressStart(e, msg)}
                          onMouseUp={handleLongPressEnd}
                          onMouseLeave={handleLongPressEnd}
                          onTouchStart={(e) => handleLongPressStart(e, msg)}
                          onTouchEnd={handleLongPressEnd}
                          onTouchMove={handleLongPressEnd}
                          onContextMenu={(e) => handleContextMenu(e, msg)}
                        >
                          <p className="break-words leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                          <div className={cn("flex items-center gap-0.5 mt-0.5", isMine ? "justify-end" : "justify-start")}>
                            <span className={cn("text-[10px]", isMine ? "text-primary-foreground/60" : "text-muted-foreground")}>
                              {msg.optimistic ? "Sending…" : timeLabel(msg.createdAt)}
                            </span>
                            {isMine && <MessageTick optimistic={msg.optimistic} read={msg.read} />}
                          </div>
                          {heartAnim?.msgId === msg.id && (
                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                              <span key={heartAnim.key} className="text-5xl" style={{ animation: "heartPop 0.7s ease-out forwards" }}>👍</span>
                            </div>
                          )}
                        </div>

                        {reactionEntries.length > 0 && (
                          <div className={cn("flex flex-wrap gap-1 mt-1", isMine ? "justify-end" : "justify-start")}>
                            {reactionEntries.map(([emoji, userIds]) => {
                              const iReacted = userIds.includes(user!.id);
                              return (
                                <button
                                  key={emoji}
                                  onClick={() => handleReact(msg.id, emoji)}
                                  className={cn(
                                    "flex items-center gap-0.5 text-xs px-1.5 py-0.5 rounded-full border transition-all",
                                    iReacted
                                      ? "bg-primary/20 border-primary/40 text-primary"
                                      : "bg-secondary border-border text-foreground"
                                  )}
                                >
                                  <span>{emoji}</span>
                                  <span className="text-[10px] font-medium">{userIds.length}</span>
                                </button>
                              );
                            })}
                            <button
                              onClick={() => setReactionPicker(reactionPicker?.msgId === msg.id ? null : { msgId: msg.id })}
                              className="text-xs px-1.5 py-0.5 rounded-full border border-border bg-secondary text-muted-foreground hover:text-foreground"
                            >
                              +
                            </button>
                          </div>
                        )}

                        {reactionPicker?.msgId === msg.id && (
                          <div className={cn("flex gap-1 mt-1 bg-card border border-card-border rounded-2xl px-2 py-1.5 shadow-lg z-10", isMine ? "self-end" : "self-start")}>
                            {REACTION_EMOJIS.map((e) => (
                              <button key={e} onClick={() => handleReact(msg.id, e)} className="text-lg hover:scale-125 transition-transform">
                                {e}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      {!msg.optimistic && reactionEntries.length === 0 && !reactionPicker && (
                        <button
                          onClick={(ev) => { ev.stopPropagation(); setReactionPicker({ msgId: msg.id }); }}
                          className={cn(
                            "opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground transition-all text-base shrink-0 mb-1",
                            isLast ? "visible" : "invisible"
                          )}
                        >
                          <Smile className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full gap-4 text-center px-6">
              <div className="relative flex items-center justify-center">
                <div className="absolute w-20 h-20 rounded-full bg-primary/20 first-chat-ring" />
                <div className="absolute w-20 h-20 rounded-full bg-primary/10 first-chat-ring-2" />
                <div className="first-chat-avatar relative w-16 h-16 rounded-full bg-secondary flex items-center justify-center text-3xl overflow-hidden border-2 border-primary/30 shadow-lg">
                  {partner?.avatar && (partner.avatar.startsWith("/") || partner.avatar.startsWith("http") || partner.avatar.startsWith("data:"))
                    ? <img src={partner.avatar} alt={partner.name || "avatar"} className="w-full h-full object-cover" />
                    : partner?.avatar || "💬"}
                </div>
              </div>
              <div className="first-chat-text">
                <p className="font-bold text-base">{partner?.name || `User ${partnerId}`}</p>
                {partner?.handle && <p className="text-xs text-muted-foreground mt-0.5">@{partner.handle}</p>}
              </div>
              <div className="first-chat-hint flex flex-col items-center gap-1">
                <span className="text-2xl">👋</span>
                <p className="text-muted-foreground text-xs">This is the beginning of your conversation.<br />Say something nice!</p>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {showEmojiPicker && (
          <div className="border-t border-border bg-card px-2 py-2 flex flex-wrap gap-1.5">
            {QUICK_EMOJIS.map((e) => (
              <button
                key={e}
                onMouseDown={(ev) => { ev.preventDefault(); setText((t) => t + e); textareaRef.current?.focus(); adjustTextareaHeight(); }}
                className="text-xl w-9 h-9 flex items-center justify-center rounded-xl hover:bg-secondary transition-colors"
              >
                {e}
              </button>
            ))}
          </div>
        )}

        <div className="flex items-end gap-2 pt-2 pb-safe border-t border-border bg-background">
          <button
            type="button"
            onClick={() => setShowEmojiPicker(!showEmojiPicker)}
            className={cn("shrink-0 w-9 h-9 flex items-center justify-center rounded-full transition-colors", showEmojiPicker ? "text-primary" : "text-muted-foreground hover:text-foreground")}
          >
            <Smile className="w-5 h-5" />
          </button>
          <textarea
            ref={textareaRef}
            value={text}
            rows={1}
            onChange={(e) => { setText(e.target.value); adjustTextareaHeight(); }}
            onKeyDown={handleKeyDown}
            placeholder={requestStatus?.sent ? "Request pending approval..." : requestStatus?.received ? "Accept request to reply..." : "Message..."}
            disabled={!!requestStatus?.sent || !!requestStatus?.received}
            className="chat-input-glow flex-1 bg-card border border-card-border rounded-2xl px-4 py-2 text-sm resize-none overflow-hidden focus:outline-none leading-relaxed min-h-[38px] disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
            style={{ maxHeight: "120px" }}
            autoFocus={!requestStatus?.sent && !requestStatus?.received}
          />
          <Button
            size="icon"
            onClick={handleSend}
            disabled={!text.trim() || !!requestStatus?.sent || !!requestStatus?.received}
            className="shrink-0 rounded-full"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {contextMenu && (
        <div
          className="fixed inset-0 z-50"
          onClick={() => setContextMenu(null)}
        >
          <div
            className="absolute bg-card border border-card-border rounded-2xl shadow-xl overflow-hidden z-50 min-w-[180px]"
            style={{
              left: Math.min(contextMenu.x, window.innerWidth - 200),
              top: Math.min(contextMenu.y, window.innerHeight - 160),
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex gap-1 px-2 py-2 border-b border-border">
              {REACTION_EMOJIS.slice(0, 6).map((e) => (
                <button key={e} onClick={() => handleReact(contextMenu.msgId, e)} className="text-xl w-8 h-8 flex items-center justify-center rounded-lg hover:bg-secondary transition-colors">
                  {e}
                </button>
              ))}
            </div>
            <button
              onClick={() => handleCopy(contextMenu.content)}
              className="flex items-center gap-3 w-full px-4 py-3 text-sm hover:bg-secondary transition-colors"
            >
              <Copy className="w-4 h-4 text-muted-foreground" />
              Copy Message
            </button>
            <button
              onClick={() => setContextMenu(null)}
              className="flex items-center gap-3 w-full px-4 py-3 text-sm text-muted-foreground hover:bg-secondary transition-colors border-t border-border"
            >
              <X className="w-4 h-4" />
              Dismiss
            </button>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
