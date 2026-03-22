import { useState, useEffect } from "react";
import { useRoute, useLocation, Link } from "wouter";
import {
  useGetUserProfile, useFollowUser, useUnfollowUser,
  useGetMySquad, useAddSquadMember, useUpdateMyProfile, useGetMe,
  customFetch
} from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/layout/AppLayout";
import { MatchCard } from "@/components/match/MatchCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Users, Star, Swords, LogOut, Settings, Plus, Trash2, MessageCircle, Crown } from "lucide-react";

function canChat(senderRole: string, recipientRole: string): boolean {
  if (senderRole === "player" && recipientRole === "admin") return false;
  if (senderRole === "admin" && recipientRole === "player") return false;
  return true;
}

function OwnProfile() {
  const { user, logout, refreshUser } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { data: squad, refetch: refetchSquad } = useGetMySquad();
  const { mutateAsync: addSquadMember, isPending: isAdding } = useAddSquadMember();
  const { mutateAsync: updateProfile, isPending: isUpdating } = useUpdateMyProfile();

  const [squadForm, setSquadForm] = useState({ name: "", uid: "" });
  const [profileForm, setProfileForm] = useState({ name: user?.name ?? "", handle: user?.handle ?? "" });
  const [profileOpen, setProfileOpen] = useState(false);
  const [squadOpen, setSquadOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate("/auth");
  };

  const handleAddMember = async () => {
    if (!squadForm.name || !squadForm.uid) return;
    try {
      await addSquadMember({ data: squadForm });
      refetchSquad();
      setSquadForm({ name: "", uid: "" });
      toast({ title: "Squad member added!" });
    } catch (err: any) {
      toast({ title: "Error", description: err?.data?.error, variant: "destructive" });
    }
  };

  const handleUpdateProfile = async () => {
    try {
      await updateProfile({ data: profileForm });
      await refreshUser();
      setProfileOpen(false);
      toast({ title: "Profile updated!" });
    } catch (err: any) {
      toast({ title: "Error", description: err?.data?.error, variant: "destructive" });
    }
  };

  if (!user) return null;

  return (
    <AppLayout title="My Profile">
      <div className="space-y-4 pb-4">
        <div className="bg-card border border-card-border rounded-2xl p-5">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="w-16 h-16 rounded-2xl bg-primary/20 flex items-center justify-center text-3xl">
                {user.avatar || "🎮"}
              </div>
              <div>
                <h2 className="text-lg font-bold">{user.name || "Player"}</h2>
                <p className="text-muted-foreground text-sm">@{user.handle || user.email}</p>
                <p className="text-xs text-muted-foreground mt-0.5 capitalize">{user.role}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Dialog open={profileOpen} onOpenChange={setProfileOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="icon" className="h-8 w-8">
                    <Settings className="w-3.5 h-3.5" />
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-sm">
                  <DialogHeader><DialogTitle>Edit Profile</DialogTitle></DialogHeader>
                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <Label>Display Name</Label>
                      <Input value={profileForm.name} onChange={(e) => setProfileForm(f => ({ ...f, name: e.target.value }))} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Handle</Label>
                      <Input value={profileForm.handle} onChange={(e) => setProfileForm(f => ({ ...f, handle: e.target.value }))} />
                    </div>
                    <Button className="w-full" onClick={handleUpdateProfile} disabled={isUpdating}>
                      {isUpdating ? "Saving..." : "Save Changes"}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
              <Button variant="destructive" size="icon" className="h-8 w-8" onClick={handleLogout}>
                <LogOut className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 mt-4">
            <div className="bg-secondary/50 rounded-xl p-3 text-center">
              <div className="font-bold text-lg">{user.followersCount ?? 0}</div>
              <div className="text-xs text-muted-foreground">Followers</div>
            </div>
            <div className="bg-secondary/50 rounded-xl p-3 text-center">
              <div className="font-bold text-lg">{user.followingCount ?? 0}</div>
              <div className="text-xs text-muted-foreground">Following</div>
            </div>
            <div className="bg-secondary/50 rounded-xl p-3 text-center">
              <div className="font-bold text-lg text-primary">₹{user.balance.toFixed(0)}</div>
              <div className="text-xs text-muted-foreground">Balance</div>
            </div>
          </div>

          {user.game && (
            <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
              <span>🎮</span>
              <span>{user.game}</span>
              {user.handle && <span>· IGN: <span className="text-foreground font-medium">{user.handle}</span></span>}
            </div>
          )}
        </div>

        {user.role === "player" && (
          <div className="bg-card border border-card-border rounded-2xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold">My Squad</h3>
              <Dialog open={squadOpen} onOpenChange={setSquadOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm" className="h-7 gap-1">
                    <Plus className="w-3.5 h-3.5" /> Add
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-sm">
                  <DialogHeader><DialogTitle>Add Squad Member</DialogTitle></DialogHeader>
                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <Label>Player Name / IGN</Label>
                      <Input value={squadForm.name} onChange={(e) => setSquadForm(f => ({ ...f, name: e.target.value }))} placeholder="IGN" />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Game UID</Label>
                      <Input value={squadForm.uid} onChange={(e) => setSquadForm(f => ({ ...f, uid: e.target.value }))} placeholder="UID" />
                    </div>
                    <Button className="w-full" onClick={handleAddMember} disabled={isAdding || !squadForm.name || !squadForm.uid}>
                      {isAdding ? "Adding..." : "Add Member"}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
            {squad && squad.length > 0 ? (
              <div className="space-y-2">
                {squad.map((m) => (
                  <div key={m.id} className="flex items-center justify-between bg-secondary/40 rounded-lg px-3 py-2">
                    <div>
                      <div className="text-sm font-medium">{m.name}</div>
                      <div className="text-xs text-muted-foreground font-mono">{m.uid}</div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">No squad members yet</p>
            )}
          </div>
        )}
      </div>
    </AppLayout>
  );
}

function PublicProfile({ handle }: { handle: string }) {
  const { user: currentUser } = useAuth();
  const { toast } = useToast();
  const { data: profile, isLoading, refetch } = useGetUserProfile(handle);
  const { mutateAsync: follow } = useFollowUser();
  const { mutateAsync: unfollow } = useUnfollowUser();
  const [hostGroup, setHostGroup] = useState<{ id: number; name: string; avatar: string; memberCount: number } | null>(null);

  useEffect(() => {
    if (profile?.role === "host" && profile.id) {
      customFetch<{ id: number; name: string; avatar: string; memberCount: number } | null>(
        `/api/groups/by-host/${profile.id}`
      ).then(setHostGroup).catch(() => {});
    }
  }, [profile?.id, profile?.role]);

  const handleFollow = async () => {
    try {
      if (profile?.isFollowing) {
        await unfollow({ handle });
      } else {
        await follow({ handle });
      }
      refetch();
    } catch (err: any) {
      toast({ title: "Error", description: err?.data?.error, variant: "destructive" });
    }
  };

  if (isLoading) {
    return (
      <AppLayout showBack title="Profile">
        <div className="space-y-4">
          <Skeleton className="h-40 rounded-2xl" />
        </div>
      </AppLayout>
    );
  }

  if (!profile) {
    return (
      <AppLayout showBack title="Profile">
        <div className="text-center py-16 text-muted-foreground">User not found</div>
      </AppLayout>
    );
  }

  const isOwnProfile = currentUser?.handle === handle;

  return (
    <AppLayout showBack title={`@${handle}`}>
      <div className="space-y-4 pb-4">
        <div className="bg-card border border-card-border rounded-2xl p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 flex-1">
              <div className="w-16 h-16 rounded-2xl bg-primary/20 flex items-center justify-center text-3xl">
                {profile.avatar || "🎮"}
              </div>
              <div>
                <h2 className="text-lg font-bold">{profile.name || `@${handle}`}</h2>
                <p className="text-muted-foreground text-sm">@{profile.handle}</p>
                <p className="text-xs capitalize text-muted-foreground">{profile.role}</p>
              </div>
            </div>
            {!isOwnProfile && currentUser && (
              <div className="flex gap-2">
                {canChat(currentUser.role, profile.role) && (
                  <Link href={`/chat/${profile.id}`}>
                    <Button variant="outline" size="sm" className="gap-1">
                      <MessageCircle className="w-3.5 h-3.5" />
                      Message
                    </Button>
                  </Link>
                )}
                <Button
                  variant={profile.isFollowing ? "outline" : "default"}
                  size="sm"
                  onClick={handleFollow}
                >
                  {profile.isFollowing ? "Unfollow" : "Follow"}
                </Button>
              </div>
            )}
          </div>

          <div className="grid grid-cols-3 gap-3 mt-4">
            <div className="bg-secondary/50 rounded-xl p-3 text-center">
              <div className="font-bold text-lg">{profile.followersCount}</div>
              <div className="text-xs text-muted-foreground">Followers</div>
            </div>
            <div className="bg-secondary/50 rounded-xl p-3 text-center">
              <div className="font-bold text-lg">{profile.followingCount}</div>
              <div className="text-xs text-muted-foreground">Following</div>
            </div>
            <div className="bg-secondary/50 rounded-xl p-3 text-center">
              <div className="font-bold text-lg">{profile.matchesCount}</div>
              <div className="text-xs text-muted-foreground">Matches</div>
            </div>
          </div>
        </div>

        {/* Host Group Card */}
        {profile.role === "host" && hostGroup && (
          <Link href={`/chat/group/${hostGroup.id}`}>
            <div className="bg-card border border-blue-500/20 rounded-2xl p-4 cursor-pointer hover:bg-secondary/30 transition-all">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-blue-500/20 flex items-center justify-center text-2xl shrink-0">
                  {hostGroup.avatar}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <Crown className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                    <p className="text-sm font-semibold truncate">{hostGroup.name}</p>
                  </div>
                  <p className="text-xs text-muted-foreground">{hostGroup.memberCount} member{hostGroup.memberCount !== 1 ? "s" : ""} · Host broadcast group</p>
                </div>
                <Users className="w-4 h-4 text-muted-foreground shrink-0" />
              </div>
            </div>
          </Link>
        )}

        {(profile.upcomingMatches.length > 0 || profile.activeMatches.length > 0) && (
          <div className="space-y-3">
            {profile.activeMatches.length > 0 && (
              <div>
                <h3 className="font-semibold text-sm mb-2">Live / Active</h3>
                {profile.activeMatches.map((m) => <MatchCard key={m.id} match={m} />)}
              </div>
            )}
            {profile.upcomingMatches.length > 0 && (
              <div>
                <h3 className="font-semibold text-sm mb-2">Upcoming</h3>
                {profile.upcomingMatches.map((m) => <MatchCard key={m.id} match={m} />)}
              </div>
            )}
          </div>
        )}
      </div>
    </AppLayout>
  );
}

export default function ProfilePage() {
  const [, params] = useRoute("/profile/:handle");
  const { user } = useAuth();

  if (params?.handle) {
    if (user?.handle === params.handle) {
      return <OwnProfile />;
    }
    return <PublicProfile handle={params.handle} />;
  }

  return <OwnProfile />;
}
