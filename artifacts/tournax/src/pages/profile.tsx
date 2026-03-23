import { useState, useEffect, useRef } from "react";
import { useRoute, useLocation, Link } from "wouter";
import {
  useGetUserProfile, useFollowUser, useUnfollowUser,
  useGetMySquad, useAddSquadMember, useUpdateMyProfile, useGetMe,
  customFetch
} from "@workspace/api-client-react";
import { useAuth } from "@/contexts/useAuth";
import { AppLayout } from "@/components/layout/AppLayout";
import { MatchCard } from "@/components/match/MatchCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Users, Star, Swords, LogOut, Settings, Plus, Trash2, MessageCircle, Crown, Camera, Loader2 } from "lucide-react";

function canChat(senderRole: string, recipientRole: string): boolean {
  if (senderRole === "player" && recipientRole === "admin") return false;
  if (senderRole === "admin" && recipientRole === "player") return false;
  return true;
}

const AVATARS = ["🎮", "🏆", "⚔️", "🔥", "💀", "👑", "🎯", "🦾", "🤑", "🤒", "😴", "🧔", "👩‍🦰", "🐲", "⚡️", "🗿"];

export function isImageAvatar(avatar: string | null | undefined): boolean {
  return !!avatar && avatar.startsWith("/objects/");
}

export function AvatarDisplay({
  avatar,
  className = "w-16 h-16 rounded-2xl text-3xl",
}: {
  avatar?: string | null;
  className?: string;
}) {
  if (isImageAvatar(avatar)) {
    return (
      <img
        src={`/api/storage${avatar}`}
        alt="avatar"
        className={`${className} object-cover bg-secondary`}
      />
    );
  }
  return (
    <div className={`${className} bg-primary/20 flex items-center justify-center`}>
      {avatar || "🎮"}
    </div>
  );
}

function OwnProfile() {
  const { user, logout, refreshUser } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { data: squad, refetch: refetchSquad } = useGetMySquad();
  const { mutateAsync: addSquadMember, isPending: isAdding } = useAddSquadMember();
  const { mutateAsync: updateProfile, isPending: isUpdating } = useUpdateMyProfile();

  const [squadForm, setSquadForm] = useState({ name: "", uid: "" });
  const [profileForm, setProfileForm] = useState({ name: user?.name ?? "", handle: user?.handle ?? "", avatar: user?.avatar ?? "🎮" });
  const [profileOpen, setProfileOpen] = useState(false);
  const [squadOpen, setSquadOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (profileOpen) {
      setProfileForm({ name: user?.name ?? "", handle: user?.handle ?? "", avatar: user?.avatar ?? "🎮" });
      setPreviewUrl(null);
    }
  }, [profileOpen]);

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

  const handleAvatarImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "Please select an image file", variant: "destructive" });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "Image must be under 5 MB", variant: "destructive" });
      return;
    }

    setPreviewUrl(URL.createObjectURL(file));
    setIsUploading(true);
    try {
      const { uploadURL, objectPath } = await customFetch<{ uploadURL: string; objectPath: string }>(
        "/api/storage/uploads/request-url",
        {
          method: "POST",
          body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
          responseType: "json",
        }
      );

      const uploadRes = await fetch(uploadURL, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!uploadRes.ok) throw new Error("Failed to upload image");

      setProfileForm(f => ({ ...f, avatar: objectPath }));
      toast({ title: "Image uploaded!" });
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
      setPreviewUrl(null);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
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
              <AvatarDisplay avatar={user.avatar} className="w-16 h-16 rounded-2xl text-3xl" />
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
                    <div className="space-y-2">
                      <Label>Avatar</Label>

                      {user.role === "host" ? (
                        <div className="flex flex-col items-center gap-3 py-2">
                          <div className="relative">
                            {isUploading ? (
                              <div className="w-24 h-24 rounded-2xl bg-secondary flex items-center justify-center">
                                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                              </div>
                            ) : previewUrl ? (
                              <img src={previewUrl} alt="preview" className="w-24 h-24 rounded-2xl object-cover" />
                            ) : (
                              <AvatarDisplay avatar={profileForm.avatar} className="w-24 h-24 rounded-2xl text-4xl" />
                            )}
                          </div>
                          <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={handleAvatarImageSelect}
                          />
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-2"
                            disabled={isUploading}
                            onClick={() => fileInputRef.current?.click()}
                          >
                            <Camera className="w-4 h-4" />
                            {isUploading ? "Uploading..." : "Choose from Gallery"}
                          </Button>
                          <p className="text-xs text-muted-foreground">Max 5 MB · JPG, PNG, GIF, WebP</p>
                        </div>
                      ) : (
                        <div className="grid grid-cols-4 gap-2">
                          {AVATARS.map((avatar) => (
                            <button
                              key={avatar}
                              type="button"
                              className={`text-2xl p-2.5 rounded-xl border transition-all ${profileForm.avatar === avatar ? "border-primary bg-primary/20" : "border-border bg-secondary/50 hover:border-border/80"}`}
                              onClick={() => setProfileForm(f => ({ ...f, avatar }))}
                            >
                              {avatar}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="space-y-1.5">
                      <Label>Display Name</Label>
                      <Input value={profileForm.name} onChange={(e) => setProfileForm(f => ({ ...f, name: e.target.value }))} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Handle</Label>
                      <Input value={profileForm.handle} onChange={(e) => setProfileForm(f => ({ ...f, handle: e.target.value }))} />
                    </div>
                    <Button className="w-full" onClick={handleUpdateProfile} disabled={isUpdating || isUploading}>
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
            <div className="mt-3 flex items-center gap-2 flex-wrap">
              <span className="flex items-center gap-1.5 text-xs font-semibold bg-primary/15 text-primary border border-primary/30 rounded-full px-3 py-1">
                🎮 {user.game} Host
              </span>
              {user.handle && (
                <span className="text-xs text-muted-foreground">IGN: <span className="text-foreground font-medium">{user.handle}</span></span>
              )}
            </div>
          )}
        </div>

        {user.role === "player" && (
          <div className="bg-card border border-card-border rounded-2xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold">My Squad</h3>
                <span className="text-xs text-muted-foreground bg-secondary/60 px-2 py-0.5 rounded-full">
                  {squad?.length ?? 0}/6
                </span>
              </div>
              {(squad?.length ?? 0) < 6 ? (
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
              ) : (
                <span className="text-xs text-muted-foreground">Squad Full</span>
              )}
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
  const [hostGroup, setHostGroup] = useState<{ id: number; name: string; avatar: string; memberCount: number; isPublic: boolean } | null>(null);

  useEffect(() => {
    if (profile?.role === "host" && profile.id) {
      customFetch<{ id: number; name: string; avatar: string; memberCount: number; isPublic: boolean } | null>(
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
              <AvatarDisplay avatar={profile.avatar} className="w-16 h-16 rounded-2xl text-3xl" />
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

          {(profile as any).game && profile.role === "host" && (
            <div className="mt-3">
              <span className="flex items-center gap-1.5 w-fit text-xs font-semibold bg-primary/15 text-primary border border-primary/30 rounded-full px-3 py-1">
                🎮 {(profile as any).game} Host
              </span>
            </div>
          )}
        </div>

        {/* Host Group Card */}
        {profile.role === "host" && hostGroup && (
          <Link href={`/chat/group/${hostGroup.id}`}>
            <div className={`bg-card border rounded-2xl p-4 cursor-pointer hover:bg-secondary/30 transition-all ${hostGroup.isPublic ? "border-blue-500/20" : "border-border"}`}>
              <div className="flex items-center gap-3">
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center text-2xl shrink-0 ${hostGroup.isPublic ? "bg-blue-500/20" : "bg-secondary"}`}>
                  {hostGroup.avatar}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <Crown className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                    <p className="text-sm font-semibold truncate">{hostGroup.name}</p>
                    {!hostGroup.isPublic && (
                      <span className="text-[10px] bg-secondary text-muted-foreground px-1.5 py-0.5 rounded-full shrink-0">🔒 Private</span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {hostGroup.memberCount} member{hostGroup.memberCount !== 1 ? "s" : ""} · {hostGroup.isPublic ? "Public" : "Private"} broadcast group
                  </p>
                </div>
                <Users className="w-4 h-4 text-muted-foreground shrink-0" />
              </div>
            </div>
          </Link>
        )}

        {(profile.upcomingMatches.length > 0 || profile.activeMatches.length > 0) && (
          <div className="space-y-5">
            {profile.activeMatches.length > 0 && (
              <div>
                <h3 className="font-semibold text-sm mb-2">Live / Active</h3>
                <div className="space-y-4">
                  {profile.activeMatches.map((m) => <MatchCard key={m.id} match={m} />)}
                </div>
              </div>
            )}
            {profile.upcomingMatches.length > 0 && (
              <div>
                <h3 className="font-semibold text-sm mb-2">Upcoming</h3>
                <div className="space-y-4">
                  {profile.upcomingMatches.map((m) => <MatchCard key={m.id} match={m} />)}
                </div>
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
