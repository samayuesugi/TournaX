import { useState } from "react";
import { useGetMyMatches } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/useAuth";
import { AppLayout } from "@/components/layout/AppLayout";
import { MatchCard } from "@/components/match/MatchCard";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { customFetch } from "@workspace/api-client-react";
import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

function StarRating({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [hovered, setHovered] = useState(0);
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          onMouseEnter={() => setHovered(star)}
          onMouseLeave={() => setHovered(0)}
          onClick={() => onChange(star)}
        >
          <Star
            className={cn(
              "w-8 h-8 transition-colors",
              (hovered || value) >= star ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground"
            )}
          />
        </button>
      ))}
    </div>
  );
}

function ReviewDialog({ match, onDone }: { match: any; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async () => {
    if (!rating) {
      toast({ title: "Please select a star rating", variant: "destructive" }); return;
    }
    setSubmitting(true);
    try {
      await customFetch(`/api/matches/${match.id}/review`, {
        method: "POST",
        body: JSON.stringify({ rating, comment }),
      });
      toast({ title: "Review submitted!", description: "Thanks for rating this host." });
      setOpen(false);
      onDone();
    } catch (err: any) {
      toast({ title: "Error", description: err?.data?.error || "Failed to submit review", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  if ((match as any).hasReviewed) {
    return (
      <div className="flex items-center gap-1 mt-2">
        {[1, 2, 3, 4, 5].map(s => (
          <Star key={s} className="w-3.5 h-3.5 fill-yellow-400 text-yellow-400" />
        ))}
        <span className="text-xs text-muted-foreground ml-1">You reviewed this host</span>
      </div>
    );
  }

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        className="mt-2 w-full gap-1.5 text-yellow-400 border-yellow-400/30 hover:bg-yellow-400/10"
        onClick={() => setOpen(true)}
      >
        <Star className="w-3.5 h-3.5" /> Rate Host @{match.hostHandle}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Rate Host @{match.hostHandle}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">How was your experience in <span className="text-foreground font-medium">{match.game} — {match.mode}</span>?</p>
            <div className="flex justify-center py-2">
              <StarRating value={rating} onChange={setRating} />
            </div>
            <Textarea
              placeholder="Leave a comment (optional)..."
              value={comment}
              onChange={e => setComment(e.target.value)}
              rows={3}
              className="resize-none"
            />
            <Button className="w-full" onClick={handleSubmit} disabled={submitting || !rating}>
              {submitting ? "Submitting..." : "Submit Review"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default function MyMatchesPage() {
  const { data, isLoading, refetch } = useGetMyMatches();
  const { user } = useAuth();
  const isHost = user?.role === "host" || user?.role === "admin";
  const isPlayer = user?.role === "player";

  return (
    <AppLayout title="My Matches">
      <div className="space-y-4">
        {isLoading ? (
          <div className="space-y-5">
            {[1, 2].map((i) => <Skeleton key={i} className="h-44 rounded-xl" />)}
          </div>
        ) : (
          <Tabs defaultValue="active">
            <TabsList className="w-full mb-4">
              <TabsTrigger value="active" className="flex-1">
                {isHost ? "My Matches" : "Active"} ({data?.participated.length ?? 0})
              </TabsTrigger>
              <TabsTrigger value="history" className="flex-1">
                History ({data?.history.length ?? 0})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="active">
              {data?.participated.length ? (
                <div className="flex flex-col gap-2">
                  {data.participated.map((m) => <MatchCard key={m.id} match={m} />)}
                </div>
              ) : (
                <div className="text-center py-16">
                  <div className="text-4xl mb-3">🎮</div>
                  <h3 className="font-semibold">No active matches</h3>
                  <p className="text-muted-foreground text-sm mt-1">Join a tournament to get started</p>
                </div>
              )}
            </TabsContent>

            <TabsContent value="history">
              {data?.history.length ? (
                <div className="flex flex-col gap-2">
                  {data.history.map((m) => (
                    <div key={m.id}>
                      <MatchCard match={m} />
                      {isPlayer && (
                        <ReviewDialog match={m} onDone={refetch} />
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-16">
                  <div className="text-4xl mb-3">📜</div>
                  <h3 className="font-semibold">No match history</h3>
                  <p className="text-muted-foreground text-sm mt-1">Completed matches will appear here</p>
                </div>
              )}
            </TabsContent>
          </Tabs>
        )}
      </div>
    </AppLayout>
  );
}
