import { useState, useEffect } from "react";
import { useGetConversations } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MessageCircle, Users, Plus, Crown } from "lucide-react";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/useAuth";
import { useToast } from "@/hooks/use-toast";
import { customFetch } from "@workspace/api-client-react";

interface GroupSummary {
  id: number;
  name: string;
  avatar: string;
  type: string;
  createdBy: number;
  maxMembers: number | null;
  memberCount: number;
  lastMessage: string;
  lastMessageAt: string;
}

interface Game {
  id: number;
  name: string;
}

// Emoji map for known game names
const GAME_EMOJI: Record<string, string> = {
  "BGMI": "🎯",
  "Free Fire": "🔥",
  "COD Mobile": "💀",
  "Call of Duty": "💀",
  "Valorant": "⚡",
  "PUBG PC": "🏆",
  "PUBG": "🏆",
  "Chess": "♟️",
  "FIFA": "⚽",
  "Cricket": "🏏",
};

const EXTRA_EMOJIS = ["🎮", "⚔️", "🌟", "🐉", "🦅", "🏅"];

function getGameEmoji(name: string): string {
  return GAME_EMOJI[name] || name.charAt(0).toUpperCase();
}

function timeAgo(iso: string) {
  if (!iso) return "";
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

function roleBadge(role: string) {
  if (role === "host") return <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-500/20 text-blue-400 font-medium">Host</span>;
  if (role === "admin") return <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-orange-500/20 text-orange-400 font-medium">Admin</span>;
  return null;
}

export default function ChatListPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const { data: conversations, isLoading: convsLoading } = useGetConversations();
  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(true);
  const [games, setGames] = useState<Game[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [groupAvatar, setGroupAvatar] = useState("🎮");
  const [isCreating, setIsCreating] = useState(false);

  const fetchGroups = async () => {
    try {
      const data = await customFetch<GroupSummary[]>("/api/groups");
      setGroups(data);
    } catch {}
    setGroupsLoading(false);
  };

  const fetchGames = async () => {
    try {
      const data = await customFetch<Game[]>("/api/games");
      setGames(data);
    } catch {}
  };

  useEffect(() => {
    fetchGroups();
    fetchGames();
    const interval = setInterval(fetchGroups, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleCreateGroup = async () => {
    if (!groupName.trim()) return;
    setIsCreating(true);
    try {
      const group = await customFetch<{ id: number }>("/api/groups", {
        method: "POST",
        body: JSON.stringify({ name: groupName.trim(), avatar: groupAvatar }),
      });
      setCreateOpen(false);
      setGroupName("");
      navigate(`/chat/group/${group.id}`);
    } catch (err: any) {
      toast({ title: "Error", description: err?.data?.error || "Failed to create group", variant: "destructive" });
    } finally {
      setIsCreating(false);
    }
  };

  const isLoading = convsLoading && groupsLoading;

  // All available avatar options: games + extras
  const gameAvatars = games.map((g) => ({ label: g.name, emoji: getGameEmoji(g.name) }));
  const extraAvatars = EXTRA_EMOJIS.map((e) => ({ label: e, emoji: e }));
  const allAvatars = [...gameAvatars, ...extraAvatars];

  return (
    <AppLayout title="Messages">
      <div className="space-y-1 pb-4">
        {/* Groups section */}
        <div className="flex items-center justify-between mb-2 mt-1">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Groups</h3>
          {(user?.role === "player" || user?.role === "host") && (
            <button
              onClick={() => setCreateOpen(true)}
              className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> New Group
            </button>
          )}
        </div>

        {groupsLoading ? (
          <Skeleton className="h-16 rounded-xl" />
        ) : groups.length > 0 ? (
          <div className="flex flex-col gap-1 mb-4">
            {groups.map((g) => (
              <Link key={g.id} href={`/chat/group/${g.id}`}>
                <div className="flex items-center gap-3 bg-card border border-card-border rounded-xl px-4 py-3 hover:bg-secondary/30 transition-all cursor-pointer">
                  <div className="w-11 h-11 rounded-full bg-secondary flex items-center justify-center text-xl shrink-0">
                    {g.avatar}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="font-semibold text-sm truncate">{g.name}</span>
                      {g.type === "host" && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-500/20 text-blue-400 font-medium flex items-center gap-0.5">
                          <Crown className="w-2.5 h-2.5" /> Host
                        </span>
                      )}
                      {g.createdBy === user?.id && g.type === "player" && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-yellow-500/20 text-yellow-400 font-medium">Mine</span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      {g.lastMessage || `${g.memberCount} member${g.memberCount !== 1 ? "s" : ""}`}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className="text-[10px] text-muted-foreground">{timeAgo(g.lastMessageAt)}</span>
                    <div className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                      <Users className="w-3 h-3" /> {g.memberCount}
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="text-center py-6 text-muted-foreground text-sm border border-dashed border-border rounded-xl mb-4">
            No groups yet.{" "}
            {(user?.role === "player" || user?.role === "host") && (
              <button onClick={() => setCreateOpen(true)} className="text-primary underline">Create one</button>
            )}
          </div>
        )}

        {/* DMs section */}
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Direct Messages</h3>

        {isLoading ? (
          [1, 2, 3].map((i) => <Skeleton key={i} className="h-20 rounded-xl" />)
        ) : conversations && conversations.length > 0 ? (
          <div className="flex flex-col gap-1">
          {conversations.map((conv) => (
            <Link key={conv.userId} href={`/chat/${conv.userId}`}>
              <div
                className={cn(
                  "flex items-center gap-3 bg-card border rounded-xl px-4 py-3 hover:bg-secondary/30 transition-all cursor-pointer",
                  conv.unreadCount > 0 ? "border-primary/30" : "border-card-border"
                )}
              >
                <div className="w-11 h-11 rounded-full bg-secondary flex items-center justify-center text-xl shrink-0 overflow-hidden">
                  {conv.avatar && (conv.avatar.startsWith("/") || conv.avatar.startsWith("http") || conv.avatar.startsWith("data:"))
                    ? <img src={conv.avatar} alt={conv.name || "avatar"} className="w-full h-full object-cover" />
                    : conv.avatar || "🔥"}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="font-semibold text-sm truncate">{conv.name || conv.handle}</span>
                    {roleBadge(conv.role)}
                  </div>
                  <p className={cn(
                    "text-xs truncate",
                    conv.unreadCount > 0 ? "text-foreground font-medium" : "text-muted-foreground"
                  )}>
                    {conv.lastMessage}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <span className="text-[10px] text-muted-foreground">{timeAgo(conv.lastMessageAt)}</span>
                  {conv.unreadCount > 0 && (
                    <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px] flex items-center justify-center font-bold">
                      {conv.unreadCount > 9 ? "9+" : conv.unreadCount}
                    </span>
                  )}
                </div>
              </div>
            </Link>
          ))}
          </div>
        ) : (
          <div className="text-center py-10 text-muted-foreground text-sm">
            <MessageCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
            No direct messages yet
          </div>
        )}
      </div>

      {/* Create Group Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Create Group</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {user?.role === "host" && (
              <div className="flex items-start gap-2 bg-blue-500/10 border border-blue-500/20 rounded-xl p-3">
                <Crown className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" />
                <p className="text-xs text-blue-400">As a host, you can create one group with unlimited players. Only you can broadcast messages.</p>
              </div>
            )}
            {user?.role === "player" && (
              <div className="flex items-start gap-2 bg-secondary/50 border border-border rounded-xl p-3">
                <Users className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                <p className="text-xs text-muted-foreground">Player groups are private and limited to 10 members. You can add teammates by their handle.</p>
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Group Name</Label>
              <Input
                placeholder="e.g. Squad Alpha"
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreateGroup()}
              />
            </div>

            {/* Avatar preview */}
            <div className="flex items-center gap-3">
              <div className="w-14 h-14 rounded-2xl bg-primary/15 border-2 border-primary/40 flex items-center justify-center text-3xl shrink-0">
                {groupAvatar}
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium">Selected Avatar</p>
                <p className="text-xs text-muted-foreground">Pick a game or icon below</p>
              </div>
            </div>

            <div className="space-y-2">
              {/* Game-based avatars */}
              {gameAvatars.length > 0 && (
                <>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Games</p>
                  <div className="flex flex-wrap gap-2">
                    {gameAvatars.map((a) => (
                      <button
                        key={a.label}
                        onClick={() => setGroupAvatar(a.emoji)}
                        title={a.label}
                        className={cn(
                          "flex flex-col items-center gap-0.5 px-3 py-2 rounded-xl transition-all border",
                          groupAvatar === a.emoji
                            ? "bg-primary/20 border-primary text-foreground"
                            : "bg-secondary border-transparent hover:border-border"
                        )}
                      >
                        <span className="text-xl">{a.emoji}</span>
                        <span className="text-[9px] text-muted-foreground leading-tight max-w-[48px] truncate">{a.label}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}

              {/* Extra emojis */}
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Others</p>
              <div className="flex flex-wrap gap-2">
                {extraAvatars.map((a) => (
                  <button
                    key={a.emoji}
                    onClick={() => setGroupAvatar(a.emoji)}
                    className={cn(
                      "w-10 h-10 rounded-xl flex items-center justify-center text-xl transition-all border",
                      groupAvatar === a.emoji
                        ? "bg-primary/20 border-primary"
                        : "bg-secondary border-transparent hover:border-border"
                    )}
                  >
                    {a.emoji}
                  </button>
                ))}
              </div>
            </div>

            <Button
              className="w-full"
              onClick={handleCreateGroup}
              disabled={isCreating || !groupName.trim()}
            >
              {isCreating ? "Creating..." : "Create Group"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
