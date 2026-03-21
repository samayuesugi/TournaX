import { useAdminListComplaints } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle } from "lucide-react";

export default function AdminComplaintsPage() {
  const { data: complaints, isLoading } = useAdminListComplaints();

  return (
    <AppLayout title="Complaints">
      <div className="space-y-3 pb-4">
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
          </div>
        ) : complaints?.length ? (
          complaints.map((c) => (
            <div key={c.id} className="bg-card border border-card-border rounded-xl p-4">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-destructive/20 flex items-center justify-center shrink-0">
                  <AlertCircle className="w-4 h-4 text-destructive" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <h4 className="font-semibold text-sm">{c.subject}</h4>
                    <span className="text-xs text-muted-foreground shrink-0">{new Date(c.createdAt).toLocaleDateString("en-IN")}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{c.userName}</p>
                  <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{c.description}</p>
                </div>
              </div>
            </div>
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
