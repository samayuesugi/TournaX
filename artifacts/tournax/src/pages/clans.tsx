import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/useAuth";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { Users, Plus, Search, Shield, Lock, Globe, Swords, MessageCircle, Loader2 } from "lucide-react";

const CLAN_EMOJIS = ["⚔️", "🛡️", "🔥", "💥", "🎮", "🏆", "👑", "⚡", "🦁", "🐉", "🦅", "🌟"];

type Group = {
  id: number;
  name: string;
  avatar: string;
  type: string;
  createdBy: number;
  maxMembers: number | null;
  messageRetentionDays: number;
  isPublic: boolean;
  memberCount: number;
  lastMessage?: string;
  lastMessageAt?: string;
  isMember?: boolean;
};

function ClanCard({ group, onJoin, currentUserId, navigate }: {
  group: Group; onJoin: (id: number) => void; currentUserId: number; navigate: (p: string) => void;
}) {
  const isOwner = group.createdBy === currentUserId;
  const isMember = group.isMember;

  return (
    <div className="bg-card border border-card-border rounded-2xl p-4 flex items-center gap-3">
      <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-2xl shrink-0 border border-primary/20">
        {group.avatar}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="font-semibold text-sm truncate">{group.name}</p>
          {group.isPublic
            ? <Globe className="w-3 h-3 text-muted-foreground shrink-0" />
            : <Lock className="w-3 h-3 text-muted-foreground shrink-0" />}
          {isOwner && <Shield className="w-3 h-3 text-primary shrink-0" />}
        </div>
        <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
          <Users className="w-3 h-3" />
          {group.memberCount}{group.maxMembers ? `/${group.maxMembers}` : ""} members
        </p>
        {group.lastMessage && (
          <p className="text-[11px] text-muted-foreground truncate mt-0.5 opacity-70">{group.lastMessage}</p>
        )}
      </div>
      <div className="shrink-0">
        {isMember ? (
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 h-8"
            onClick={() => navigate(`/chat/group/${group.id}`)}
          >
            <MessageCircle className="w-3.5 h-3.5" />
            Chat
          </Button>
        ) : (
          <Button
            size="sm"
            className="h-8"
            onClick={() => onJoin(group.id)}
          >
            {group.isPublic ? "Join" : "Request"}
          </Button>
        )}
      </div>
    </div>
  );
}

export default function ClansPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [newClan, setNewClan] = useState({ name: "", avatar: "⚔️", isPublic: true });
  const [activeTab, setActiveTab] = useState<"my" | "discover">("my");
  const [discoverPage, setDiscoverPage] = useState(1);
  const [allDiscoverGroups, setAllDiscoverGroups] = useState<Group[]>([]);

  const { data: myGroups = [], isLoading: myLoading } = useQuery<Group[]>({
    queryKey: ["/api/groups"],
    queryFn: async () => {
      const res = await customFetch("/api/groups");
      if (!res.ok) throw new Error("Failed to fetch groups");
      const data = await res.json();
      return (data as Group[]).filter((g: Group) => g.type === "player").map((g: Group) => ({ ...g, isMember: true }));
    },
  });

  const { data: discoverData, isLoading: discoverLoading, isFetching: discoverFetching } = useQuery<{
    groups: Group[]; total: number; page: number; totalPages: number; hasMore: boolean;
  }>({
    queryKey: ["/api/groups/discover", discoverPage, searchQuery],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(discoverPage), limit: "12" });
      if (searchQuery) params.set("search", searchQuery);
      const res = await customFetch(`/api/groups/discover?${params}`);
      if (!res.ok) return { groups: [], total: 0, page: 1, totalPages: 1, hasMore: false };
      const data = await res.json();
      if (discoverPage === 1) {
        setAllDiscoverGroups(data.groups || []);
      } else {
        setAllDiscoverGroups(prev => [...prev, ...(data.groups || [])]);
      }
      return data;
    },
  });

  const { mutateAsync: createGroup, isPending: isCreating } = useMutation({
    mutationFn: async (data: { name: string; avatar: string; isPublic: boolean }) => {
      const res = await customFetch("/api/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, type: "player" }),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
      return res.json();
    },
    onSuccess: (group) => {
      queryClient.invalidateQueries({ queryKey: ["/api/groups"] });
      setCreateOpen(false);
      setNewClan({ name: "", avatar: "⚔️", isPublic: true });
      toast({ title: "Clan created!", description: `${group.name} is ready.` });
      navigate(`/chat/group/${group.id}`);
    },
    onError: (err: any) => {
      toast({ title: "Failed to create clan", description: err.message, variant: "destructive" });
    },
  });

  const { mutateAsync: joinGroup } = useMutation({
    mutationFn: async (groupId: number) => {
      const res = await customFetch(`/api/groups/${groupId}/join`, { method: "POST" });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/groups"] });
      queryClient.invalidateQueries({ queryKey: ["/api/groups/public"] });
      if (data.joined) {
        toast({ title: "Joined clan!" });
      } else if (data.requested) {
        toast({ title: "Request sent!", description: "Waiting for clan owner to approve." });
      }
    },
    onError: (err: any) => {
      toast({ title: "Failed to join", description: err.message, variant: "destructive" });
    },
  });

  const filteredMy = myGroups.filter(g =>
    g.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const displayGroups = activeTab === "my" ? filteredMy : allDiscoverGroups;
  const isLoading = activeTab === "my" ? myLoading : (discoverLoading && discoverPage === 1);
  const hasMore = discoverData?.hasMore ?? false;

  return (
    <AppLayout title="Clans">
      <div className="space-y-4">

        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-bold text-xl">Clans</h1>
            <p className="text-xs text-muted-foreground">Join or create your gaming squad</p>
          </div>
          {user?.role === "player" && (
            <Button size="sm" className="gap-1.5" onClick={() => setCreateOpen(true)}>
              <Plus className="w-4 h-4" />
              Create
            </Button>
          )}
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search clans..."
            className="pl-9"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setDiscoverPage(1);
              setAllDiscoverGroups([]);
            }}
          />
        </div>

        <div className="flex gap-1 bg-secondary/40 rounded-xl p-1">
          {[
            { id: "my", label: "My Clans", icon: Swords },
            { id: "discover", label: "Discover", icon: Globe },
          ].map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id as "my" | "discover")}
              className={cn(
                "flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium transition-all",
                activeTab === id
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-20 bg-secondary/40 rounded-2xl animate-pulse" />
            ))}
          </div>
        ) : displayGroups.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-5xl mb-4">⚔️</div>
            <h3 className="font-semibold text-base mb-2">
              {activeTab === "my" ? "No clans yet" : "No clans found"}
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              {activeTab === "my"
                ? "Create or join a clan to play with your squad!"
                : searchQuery ? "Try a different search term" : "No public clans available"}
            </p>
            {activeTab === "my" && user?.role === "player" && (
              <Button onClick={() => setCreateOpen(true)} className="gap-2">
                <Plus className="w-4 h-4" />
                Create a Clan
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-2.5">
            {displayGroups.map((group) => (
              <ClanCard
                key={group.id}
                group={group}
                onJoin={(id) => joinGroup(id)}
                currentUserId={user?.id ?? 0}
                navigate={navigate}
              />
            ))}
            {activeTab === "discover" && hasMore && (
              <Button
                variant="outline"
                className="w-full gap-2"
                disabled={discoverFetching}
                onClick={() => setDiscoverPage(p => p + 1)}
              >
                {discoverFetching
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Loading...</>
                  : "Load More Clans"
                }
              </Button>
            )}
          </div>
        )}
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Swords className="w-4 h-4 text-primary" />
              Create a Clan
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Clan Name</Label>
              <Input
                placeholder="e.g. Shadow Warriors, Fire Squad..."
                value={newClan.name}
                onChange={(e) => setNewClan(n => ({ ...n, name: e.target.value }))}
                maxLength={50}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Clan Icon</Label>
              <div className="grid grid-cols-6 gap-2">
                {CLAN_EMOJIS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => setNewClan(n => ({ ...n, avatar: emoji }))}
                    className={cn(
                      "h-10 rounded-xl text-xl flex items-center justify-center border transition-all",
                      newClan.avatar === emoji
                        ? "border-primary bg-primary/10 scale-110"
                        : "border-border bg-secondary/50 hover:border-primary/50"
                    )}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between rounded-xl border border-border bg-secondary/30 px-4 py-3">
              <div className="flex items-center gap-2.5">
                {newClan.isPublic
                  ? <Globe className="w-4 h-4 text-primary" />
                  : <Lock className="w-4 h-4 text-muted-foreground" />}
                <div>
                  <p className="text-sm font-medium">{newClan.isPublic ? "Public Clan" : "Private Clan"}</p>
                  <p className="text-xs text-muted-foreground">
                    {newClan.isPublic ? "Anyone can join directly" : "Members need your approval"}
                  </p>
                </div>
              </div>
              <Switch
                checked={newClan.isPublic}
                onCheckedChange={(v) => setNewClan(n => ({ ...n, isPublic: v }))}
              />
            </div>

            <Button
              className="w-full"
              disabled={!newClan.name.trim() || isCreating}
              onClick={() => createGroup(newClan)}
            >
              {isCreating ? "Creating..." : "Create Clan"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
