import { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { Plus, Trash2, Gamepad2, ChevronRight } from "lucide-react";

interface GameMode { id: number; name: string; teamSize: number; }
interface Game { id: number; name: string; modes: GameMode[]; }

function useGames() {
  return useQuery<Game[]>({
    queryKey: ["admin-games"],
    queryFn: () => customFetch("/games"),
  });
}

function useCreateGame() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string }) =>
      customFetch("/admin/games", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-games"] }),
  });
}

function useDeleteGame() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      customFetch(`/admin/games/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-games"] }),
  });
}

function useAddMode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ gameId, data }: { gameId: number; data: { name: string; teamSize: number } }) =>
      customFetch(`/admin/games/${gameId}/modes`, { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-games"] }),
  });
}

function useDeleteMode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ gameId, modeId }: { gameId: number; modeId: number }) =>
      customFetch(`/admin/games/${gameId}/modes/${modeId}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-games"] }),
  });
}

function GameCard({ game }: { game: Game }) {
  const { toast } = useToast();
  const { mutateAsync: deleteGame } = useDeleteGame();
  const { mutateAsync: addMode, isPending: isAddingMode } = useAddMode();
  const { mutateAsync: deleteMode } = useDeleteMode();
  const [modeOpen, setModeOpen] = useState(false);
  const [modeName, setModeName] = useState("");
  const [teamSize, setTeamSize] = useState("1");
  const [expanded, setExpanded] = useState(true);

  const handleDeleteGame = async () => {
    if (!confirm(`Delete "${game.name}" and all its modes?`)) return;
    try {
      await deleteGame(game.id);
      toast({ title: `${game.name} deleted` });
    } catch (err: any) {
      toast({ title: "Error", description: err?.data?.error, variant: "destructive" });
    }
  };

  const handleAddMode = async () => {
    if (!modeName.trim()) {
      toast({ title: "Enter mode name", variant: "destructive" });
      return;
    }
    try {
      await addMode({ gameId: game.id, data: { name: modeName.trim(), teamSize: Number(teamSize) } });
      toast({ title: `Mode "${modeName}" added!` });
      setModeName("");
      setTeamSize("1");
      setModeOpen(false);
    } catch (err: any) {
      toast({ title: "Error", description: err?.data?.error, variant: "destructive" });
    }
  };

  const handleDeleteMode = async (modeId: number, modeName: string) => {
    try {
      await deleteMode({ gameId: game.id, modeId });
      toast({ title: `Mode "${modeName}" removed` });
    } catch (err: any) {
      toast({ title: "Error", description: err?.data?.error, variant: "destructive" });
    }
  };

  return (
    <div className="bg-card border border-card-border rounded-2xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3">
        <button
          className="flex items-center gap-2 flex-1 text-left"
          onClick={() => setExpanded((e) => !e)}
        >
          <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center">
            <Gamepad2 className="w-4 h-4 text-primary" />
          </div>
          <div>
            <div className="font-semibold text-sm">{game.name}</div>
            <div className="text-xs text-muted-foreground">{game.modes.length} mode{game.modes.length !== 1 ? "s" : ""}</div>
          </div>
          <ChevronRight className={`w-4 h-4 text-muted-foreground ml-auto transition-transform ${expanded ? "rotate-90" : ""}`} />
        </button>
        <Button variant="destructive" size="icon" className="h-7 w-7 ml-2 shrink-0" onClick={handleDeleteGame}>
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
      </div>

      {expanded && (
        <div className="border-t border-card-border px-4 py-3 space-y-2">
          {game.modes.length > 0 ? (
            game.modes.map((mode) => (
              <div key={mode.id} className="flex items-center justify-between bg-secondary/40 rounded-xl px-3 py-2">
                <div>
                  <span className="text-sm font-medium">{mode.name}</span>
                  <span className="text-xs text-muted-foreground ml-2">
                    {mode.teamSize === 1 ? "Solo" : mode.teamSize === 2 ? "Duo" : `${mode.teamSize} players/team`}
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-muted-foreground hover:text-destructive"
                  onClick={() => handleDeleteMode(mode.id, mode.name)}
                >
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
            ))
          ) : (
            <p className="text-xs text-muted-foreground text-center py-2">No modes yet. Add one below.</p>
          )}

          <Dialog open={modeOpen} onOpenChange={setModeOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="w-full h-8 text-xs gap-1.5 mt-1">
                <Plus className="w-3.5 h-3.5" /> Add Mode
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-sm">
              <DialogHeader><DialogTitle>Add Mode to {game.name}</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label>Mode Name</Label>
                  <Input
                    placeholder="e.g. Squad, Duo, Solo, TDM..."
                    value={modeName}
                    onChange={(e) => setModeName(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Team Size</Label>
                  <Select value={teamSize} onValueChange={setTeamSize}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">1 — Solo</SelectItem>
                      <SelectItem value="2">2 — Duo</SelectItem>
                      <SelectItem value="3">3 — Trio</SelectItem>
                      <SelectItem value="4">4 — Squad</SelectItem>
                      <SelectItem value="5">5</SelectItem>
                      <SelectItem value="6">6</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button className="w-full" onClick={handleAddMode} disabled={isAddingMode}>
                  {isAddingMode ? "Adding..." : "Add Mode"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      )}
    </div>
  );
}

export default function AdminGamesPage() {
  const { toast } = useToast();
  const { data: games, isLoading } = useGames();
  const { mutateAsync: createGame, isPending: isCreating } = useCreateGame();
  const [newGameName, setNewGameName] = useState("");
  const [createOpen, setCreateOpen] = useState(false);

  const handleCreateGame = async () => {
    if (!newGameName.trim()) {
      toast({ title: "Enter game name", variant: "destructive" });
      return;
    }
    try {
      await createGame({ name: newGameName.trim() });
      toast({ title: `"${newGameName}" added!` });
      setNewGameName("");
      setCreateOpen(false);
    } catch (err: any) {
      toast({ title: "Error", description: err?.data?.error, variant: "destructive" });
    }
  };

  return (
    <AppLayout title="Games & Modes">
      <div className="space-y-4 pb-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {games?.length ?? 0} game{games?.length !== 1 ? "s" : ""} configured
          </p>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1.5 h-8">
                <Plus className="w-3.5 h-3.5" /> Add Game
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-sm">
              <DialogHeader><DialogTitle>Add New Game</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label>Game Name</Label>
                  <Input
                    placeholder="e.g. BGMI, Free Fire, Valorant..."
                    value={newGameName}
                    onChange={(e) => setNewGameName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleCreateGame()}
                  />
                </div>
                <Button className="w-full" onClick={handleCreateGame} disabled={isCreating}>
                  {isCreating ? "Adding..." : "Add Game"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}
          </div>
        ) : games?.length ? (
          <div className="space-y-3">
            {games.map((g) => <GameCard key={g.id} game={g} />)}
          </div>
        ) : (
          <div className="text-center py-16">
            <Gamepad2 className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-40" />
            <h3 className="font-semibold">No games yet</h3>
            <p className="text-muted-foreground text-sm mt-1">Add a game and configure its modes.</p>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
