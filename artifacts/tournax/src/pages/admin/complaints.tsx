import { useState } from "react";
import { useAdminListComplaints } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, ImageIcon, ChevronDown, ChevronUp, Wallet, Swords, User, Mail } from "lucide-react";
import { GoldCoin } from "@/components/ui/Coins";

function resolveAvatarSrc(avatar: string): string {
  if (avatar.startsWith("/objects/")) return `/api/storage${avatar}`;
  return avatar;
}

function AvatarDisplay({ avatar, name, className }: { avatar?: string | null; name?: string | null; className?: string }) {
  if (avatar && (avatar.startsWith("/") || avatar.startsWith("http"))) {
    return <img src={resolveAvatarSrc(avatar)} alt={name || ""} className={`object-cover ${className ?? ""}`} />;
  }
  return (
    <div className={`flex items-center justify-center bg-secondary text-2xl ${className ?? ""}`}>
      {avatar || "👤"}
    </div>
  );
}

function ComplaintCard({ c }: { c: any }) {
  const [expandedImage, setExpandedImage] = useState(false);
  const [showProfile, setShowProfile] = useState(false);

  const topicColor: Record<string, string> = {
    "Withdrawal Issue": "text-orange-400 bg-orange-500/10 border-orange-500/30",
    "Add Balance Issue": "text-primary bg-primary/10 border-primary/30",
    "Bugs": "text-yellow-400 bg-yellow-500/10 border-yellow-500/30",
    "Host Issues": "text-red-400 bg-red-500/10 border-red-500/30",
    "Other": "text-muted-foreground bg-secondary/60 border-border",
  };

  const topicIcon: Record<string, string> = {
    "Withdrawal Issue": "💸",
    "Add Balance Issue": "💳",
    "Bugs": "🐛",
    "Host Issues": "🛡️",
    "Other": "📋",
  };

  return (
    <div className="bg-card border border-card-border rounded-2xl overflow-hidden">
      <div className="p-4">
        <div className="flex items-start gap-3">
          <button
            onClick={() => setShowProfile(!showProfile)}
            className="shrink-0 mt-0.5"
          >
            <AvatarDisplay
              avatar={c.userAvatar}
              name={c.userName}
              className="w-10 h-10 rounded-xl ring-2 ring-border hover:ring-primary transition-all"
            />
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-semibold text-sm leading-tight">{c.userName}</p>
                {c.userHandle && <p className="text-xs text-muted-foreground">@{c.userHandle}</p>}
              </div>
              <span className="text-xs text-muted-foreground shrink-0 mt-0.5">
                {new Date(c.createdAt).toLocaleDateString("en-IN")}
              </span>
            </div>

            <div className="mt-2.5 flex items-center gap-2 flex-wrap">
              <span className={`inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full border ${topicColor[c.subject] ?? topicColor["Other"]}`}>
                <span>{topicIcon[c.subject] ?? "📋"}</span>
                {c.subject}
              </span>
              {c.hostHandle && (
                <span className="inline-flex items-center gap-1 text-xs text-primary bg-primary/10 border border-primary/30 rounded-full px-2.5 py-1 font-medium">
                  🛡️ @{c.hostHandle}
                </span>
              )}
            </div>

            <p className="text-sm text-muted-foreground mt-2.5 leading-relaxed">{c.description}</p>

            <div className="mt-3 flex items-center gap-2 flex-wrap">
              {c.imageUrl && (
                <button
                  onClick={() => setExpandedImage(!expandedImage)}
                  className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors"
                >
                  <ImageIcon className="w-3.5 h-3.5" />
                  {expandedImage ? "Hide" : "View"} Screenshot
                  {expandedImage ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                </button>
              )}
              <button
                onClick={() => setShowProfile(!showProfile)}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <User className="w-3.5 h-3.5" />
                {showProfile ? "Hide" : "View"} Profile
                {showProfile ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>
            </div>
          </div>
        </div>

        {expandedImage && c.imageUrl && (
          <div className="mt-3">
            <img
              src={c.imageUrl}
              alt="Complaint screenshot"
              className="w-full rounded-xl max-h-64 object-contain border border-border bg-black/40"
            />
          </div>
        )}
      </div>

      {showProfile && (
        <div className="border-t border-border bg-secondary/30 p-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">User Profile</p>
          <div className="flex items-center gap-3 mb-3">
            <AvatarDisplay
              avatar={c.userAvatar}
              name={c.userName}
              className="w-14 h-14 rounded-2xl"
            />
            <div>
              <p className="font-bold">{c.userName}</p>
              {c.userHandle && <p className="text-sm text-muted-foreground">@{c.userHandle}</p>}
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full mt-1 inline-block capitalize ${
                c.userRole === "host"
                  ? "bg-yellow-500/15 text-yellow-400"
                  : c.userRole === "admin"
                  ? "bg-primary/15 text-primary"
                  : "bg-green-500/15 text-green-400"
              }`}>
                {c.userRole}
              </span>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-card border border-border rounded-xl p-2.5 text-center">
              <div className="flex items-center justify-center gap-1 text-green-400 mb-1">
                <Wallet className="w-3.5 h-3.5" />
              </div>
              <p className="font-bold text-sm"><GoldCoin amount={Number(c.userWallet ?? 0).toFixed(0)} /></p>
              <p className="text-xs text-muted-foreground">Wallet</p>
            </div>
            <div className="bg-card border border-border rounded-xl p-2.5 text-center">
              <div className="flex items-center justify-center gap-1 text-primary mb-1">
                <Swords className="w-3.5 h-3.5" />
              </div>
              <p className="font-bold text-sm">{c.userMatchCount ?? 0}</p>
              <p className="text-xs text-muted-foreground">Matches</p>
            </div>
            <div className="bg-card border border-border rounded-xl p-2.5 text-center">
              <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
                <Mail className="w-3.5 h-3.5" />
              </div>
              <p className="font-bold text-xs truncate">{c.userEmail?.split("@")[0]}</p>
              <p className="text-xs text-muted-foreground">Email</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AdminComplaintsPage() {
  const { data: complaints, isLoading } = useAdminListComplaints();

  return (
    <AppLayout title="Complaints">
      <div className="space-y-3 pb-4">
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-32 rounded-2xl" />)}
          </div>
        ) : complaints?.length ? (
          (complaints as any[]).map((c) => (
            <ComplaintCard key={c.id} c={c} />
          ))
        ) : (
          <div className="text-center py-16">
            <AlertCircle className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <h3 className="font-semibold">No complaints</h3>
            <p className="text-muted-foreground text-sm mt-1">All clear!</p>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
