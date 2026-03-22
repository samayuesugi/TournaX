import { useState, useEffect, useRef } from "react";
import { useParams, useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Send, Users, UserPlus, UserMinus, Crown, Lock, Globe, Megaphone, Clock } from "lucide-react";
import { customFetch } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";

interface GroupInfo {
  id: number;
  name: string;
  avatar: string;
  type: string;
  createdBy: number;
  maxMembers: number | null;
  messageRetentionDays: number;
  isPublic: boolean;
  isMember: boolean;
  memberCount: number;
  members: { id: number; name: string; handle: string; avatar: string; role: string }[];
}

interface GroupMessage {
  id: number;
  groupId: number;
  fromUserId: number;
  senderName: string;
  senderAvatar: string;
  content: string;
  createdAt: string;
}

function timeLabel(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
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

export default function GroupChatPage() {
  const { groupId: groupIdStr } = useParams<{ groupId: string }>();
  const groupId = Number(groupIdStr);
  const { user } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const [group, setGroup] = useState<GroupInfo | null>(null);
  const [messages, setMessages] = useState<GroupMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [text, setText] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const [addHandle, setAddHandle] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [retentionDays, setRetentionDays] = useState<number>(3);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const isCreator = group?.createdBy === user?.id;
  const isHostGroup = group?.type === "host";
  const isMember = group?.isMember ?? false;
  const canSend = isMember && (isHostGroup ? isCreator : true);
  const maxRetentionDays = isHostGroup ? 2 : 7;

  const fetchGroup = async () => {
    try {
      const data = await customFetch<GroupInfo>(`/api/groups/${groupId}`);
      setGroup(data);
      setRetentionDays(data.messageRetentionDays);
    } catch (err: any) {
      if (err?.status === 404) setNotFound(true);
      else navigate("/chat");
    }
  };

  const fetchMessages = async () => {
    if (!group?.isMember && group != null) return;
    try {
      const data = await customFetch<GroupMessage[]>(`/api/groups/${groupId}/messages`);
      setMessages(data);
    } catch {}
  };

  useEffect(() => {
    const init = async () => {
      setIsLoading(true);
      await fetchGroup();
      setIsLoading(false);
    };
    init();
  }, [groupId]);

  useEffect(() => {
    if (!isMember) return;
    fetchMessages();
    const interval = setInterval(fetchMessages, 3000);
    return () => clearInterval(interval);
  }, [groupId, isMember]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleJoin = async () => {
    setIsJoining(true);
    try {
      await customFetch(`/api/groups/${groupId}/join`, { method: "POST" });
      toast({ title: "Joined group!" });
      await fetchGroup();
      await fetchMessages();
    } catch (err: any) {
      toast({ title: "Error", description: err?.data?.error || "Failed to join", variant: "destructive" });
    } finally {
      setIsJoining(false);
    }
  };

  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed || isSending) return;
    setText("");
    setIsSending(true);
    try {
      await customFetch(`/api/groups/${groupId}/messages`, {
        method: "POST",
        body: JSON.stringify({ content: trimmed }),
      });
      await fetchMessages();
    } catch (err: any) {
      toast({ title: "Error", description: err?.data?.error || "Failed to send", variant: "destructive" });
    } finally {
      setIsSending(false);
    }
  };

  const handleAddMember = async () => {
    if (!addHandle.trim()) return;
    setIsAdding(true);
    try {
      await customFetch(`/api/groups/${groupId}/members`, {
        method: "POST",
        body: JSON.stringify({ handle: addHandle.trim() }),
      });
      setAddHandle("");
      await fetchGroup();
      toast({ title: "Member added!" });
    } catch (err: any) {
      toast({ title: "Error", description: err?.data?.error || "Failed to add member", variant: "destructive" });
    } finally {
      setIsAdding(false);
    }
  };

  const handleRemoveMember = async (memberId: number) => {
    try {
      await customFetch(`/api/groups/${groupId}/members/${memberId}`, { method: "DELETE" });
      await fetchGroup();
      toast({ title: "Member removed" });
    } catch (err: any) {
      toast({ title: "Error", description: err?.data?.error || "Failed to remove", variant: "destructive" });
    }
  };

  const handleSaveSettings = async (patch: { messageRetentionDays?: number; isPublic?: boolean }) => {
    setIsSavingSettings(true);
    try {
      await customFetch(`/api/groups/${groupId}/settings`, {
        method: "PUT",
        body: JSON.stringify(patch),
      });
      await fetchGroup();
      toast({ title: "Settings saved" });
    } catch (err: any) {
      toast({ title: "Error", description: err?.data?.error || "Failed to save", variant: "destructive" });
    } finally {
      setIsSavingSettings(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  if (isLoading) {
    return (
      <AppLayout showBack hideNav title="Group">
        <div className="space-y-3 py-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className={cn("h-10 w-2/3 rounded-2xl", i % 2 === 0 && "ml-auto")} />
          ))}
        </div>
      </AppLayout>
    );
  }

  if (notFound || !group) {
    return (
      <AppLayout showBack hideNav title="Group">
        <div className="flex flex-col items-center justify-center h-64 text-center px-4">
          <p className="text-muted-foreground">Group not found.</p>
        </div>
      </AppLayout>
    );
  }

  // Public group, non-member — show join screen
  if (!isMember) {
    return (
      <AppLayout showBack hideNav title={group.name}>
        <div className="flex flex-col items-center justify-center h-64 text-center px-4 space-y-4">
          <div className="w-20 h-20 rounded-2xl bg-primary/20 flex items-center justify-center text-4xl">
            {group.avatar}
          </div>
          <div>
            <h2 className="text-xl font-bold">{group.name}</h2>
            <p className="text-muted-foreground text-sm mt-1">{group.memberCount} member{group.memberCount !== 1 ? "s" : ""} · Public Group</p>
          </div>
          <Button className="w-48 gap-2" onClick={handleJoin} disabled={isJoining}>
            <Users className="w-4 h-4" />
            {isJoining ? "Joining..." : "Join Group"}
          </Button>
        </div>
      </AppLayout>
    );
  }

  let lastDate = "";

  return (
    <AppLayout showBack hideNav title={group?.name || "Group"}>
      <div className="flex flex-col h-[calc(100vh-8rem)]">
        {/* Group info bar */}
        <button
          onClick={() => setShowMembers(true)}
          className="flex items-center gap-2 pb-2 border-b border-border mb-2"
        >
          <span className="text-xl">{group?.avatar}</span>
          <div className="flex-1 text-left">
            <div className="flex items-center gap-1.5">
              <p className="text-sm font-semibold">{group?.name}</p>
              {group?.isPublic
                ? <Globe className="w-3 h-3 text-blue-400" />
                : <Lock className="w-3 h-3 text-muted-foreground" />
              }
            </div>
            <p className="text-xs text-muted-foreground">
              {group?.memberCount} member{group?.memberCount !== 1 ? "s" : ""}
              {isHostGroup && " · Broadcast only"}
              {" · "}<Clock className="inline w-3 h-3 mb-0.5" /> {group?.messageRetentionDays}d
            </p>
          </div>
          <Users className="w-4 h-4 text-muted-foreground" />
        </button>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto space-y-1 pb-2">
          {messages.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <p className="text-muted-foreground text-sm">No messages yet.</p>
            </div>
          ) : (
            messages.map((msg) => {
              const isMine = msg.fromUserId === user?.id;
              const dateLabel = dateSeparator(msg.createdAt);
              const showDate = dateLabel !== lastDate;
              lastDate = dateLabel;
              return (
                <div key={msg.id}>
                  {showDate && (
                    <div className="text-center my-3">
                      <span className="text-[10px] text-muted-foreground bg-secondary px-2 py-0.5 rounded-full">{dateLabel}</span>
                    </div>
                  )}
                  <div className={cn("flex gap-2", isMine ? "justify-end" : "justify-start")}>
                    {!isMine && (
                      <div className="w-7 h-7 rounded-full bg-secondary flex items-center justify-center text-sm shrink-0 self-end">
                        {msg.senderAvatar}
                      </div>
                    )}
                    <div className={cn("max-w-[75%]", isMine ? "items-end" : "items-start", "flex flex-col")}>
                      {!isMine && <p className="text-[10px] text-muted-foreground mb-0.5 ml-1">{msg.senderName}</p>}
                      <div className={cn(
                        "px-3 py-2 rounded-2xl text-sm",
                        isMine ? "bg-primary text-primary-foreground rounded-br-sm" : "bg-card border border-card-border rounded-bl-sm"
                      )}>
                        <p className="break-words">{msg.content}</p>
                        <p className={cn("text-[10px] mt-0.5", isMine ? "text-primary-foreground/70 text-right" : "text-muted-foreground")}>
                          {timeLabel(msg.createdAt)}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        {canSend ? (
          <div className="flex items-center gap-2 pt-2 pb-safe border-t border-border">
            <Input
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={isHostGroup ? "Broadcast a message..." : "Type a message..."}
              className="flex-1 bg-card border-card-border"
            />
            <Button size="icon" onClick={handleSend} disabled={!text.trim() || isSending} className="shrink-0">
              <Send className="w-4 h-4" />
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2 pt-2 pb-safe border-t border-border">
            <div className="flex-1 flex items-center gap-2 bg-secondary/50 rounded-xl px-4 py-3">
              <Megaphone className="w-4 h-4 text-muted-foreground shrink-0" />
              <span className="text-sm text-muted-foreground">Only the host can send messages here</span>
            </div>
          </div>
        )}
      </div>

      {/* Members + Settings Dialog */}
      <Dialog open={showMembers} onOpenChange={setShowMembers}>
        <DialogContent className="max-w-sm max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span>{group?.avatar}</span> {group?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="overflow-y-auto flex-1 space-y-4">

            {/* Creator-only settings */}
            {isCreator && (
              <div className="bg-secondary/40 rounded-xl p-3 space-y-3">
                {/* Public / Private toggle */}
                <div>
                  <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                    {group?.isPublic ? <Globe className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
                    Visibility
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => !group?.isPublic && handleSaveSettings({ isPublic: true })}
                      disabled={isSavingSettings || group?.isPublic === true}
                      className={cn(
                        "flex flex-col items-center gap-1 rounded-xl border py-2.5 text-xs font-medium transition-all",
                        group?.isPublic
                          ? "bg-blue-500/15 border-blue-500/50 text-blue-400"
                          : "bg-secondary/50 border-border text-muted-foreground hover:text-foreground"
                      )}
                    >
                      <Globe className="w-4 h-4" />
                      Public
                      <span className="text-[10px] font-normal opacity-70">Shows on profile, anyone can join</span>
                    </button>
                    <button
                      onClick={() => group?.isPublic && handleSaveSettings({ isPublic: false })}
                      disabled={isSavingSettings || group?.isPublic === false}
                      className={cn(
                        "flex flex-col items-center gap-1 rounded-xl border py-2.5 text-xs font-medium transition-all",
                        !group?.isPublic
                          ? "bg-primary/10 border-primary text-primary"
                          : "bg-secondary/50 border-border text-muted-foreground hover:text-foreground"
                      )}
                    >
                      <Lock className="w-4 h-4" />
                      Private
                      <span className="text-[10px] font-normal opacity-70">Hidden, invite only</span>
                    </button>
                  </div>
                </div>

                {/* Retention slider */}
                <div>
                  <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                    <Clock className="w-3.5 h-3.5" /> Auto-Delete Messages
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min={1}
                      max={maxRetentionDays}
                      value={retentionDays}
                      onChange={(e) => setRetentionDays(Number(e.target.value))}
                      className="flex-1 accent-primary"
                    />
                    <span className="text-sm font-bold w-16 text-right shrink-0">
                      {retentionDays === 1 ? "24 hrs" : `${retentionDays} days`}
                    </span>
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <p className="text-xs text-muted-foreground">
                      Messages older than {retentionDays === 1 ? "24 hours" : `${retentionDays} days`} are hidden
                    </p>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs shrink-0 ml-2"
                      onClick={() => handleSaveSettings({ messageRetentionDays: retentionDays })}
                      disabled={isSavingSettings || retentionDays === group?.messageRetentionDays}
                    >
                      {isSavingSettings ? "Saving..." : "Save"}
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Add member — creator only */}
            {isCreator && (
              <div className="flex gap-2">
                <Input
                  placeholder="Add by @handle"
                  value={addHandle}
                  onChange={(e) => setAddHandle(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAddMember()}
                />
                <Button size="sm" onClick={handleAddMember} disabled={isAdding || !addHandle.trim()}>
                  <UserPlus className="w-4 h-4" />
                </Button>
              </div>
            )}

            {group?.maxMembers && (
              <p className="text-xs text-muted-foreground">
                {group.members.length} / {group.maxMembers} members
              </p>
            )}

            <div className="space-y-2">
              {group?.members.map((m) => (
                <div key={m.id} className="flex items-center gap-3 bg-secondary/30 rounded-xl px-3 py-2">
                  <div className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center text-lg shrink-0">
                    {m.avatar}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-medium truncate">{m.name || m.handle}</p>
                      {m.id === group.createdBy && <Crown className="w-3.5 h-3.5 text-yellow-400 shrink-0" />}
                    </div>
                    <p className="text-xs text-muted-foreground">@{m.handle}</p>
                  </div>
                  {isCreator && m.id !== user?.id && (
                    <button onClick={() => handleRemoveMember(m.id)} className="text-destructive hover:text-destructive/80 p-1">
                      <UserMinus className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
