import { useGetMyMatches } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { MatchCard } from "@/components/match/MatchCard";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function MyMatchesPage() {
  const { data, isLoading } = useGetMyMatches();

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
                Active ({data?.participated.length ?? 0})
              </TabsTrigger>
              <TabsTrigger value="history" className="flex-1">
                History ({data?.history.length ?? 0})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="active">
              {data?.participated.length ? (
                <div className="space-y-8">
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
                <div className="space-y-8">
                  {data.history.map((m) => <MatchCard key={m.id} match={m} />)}
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
