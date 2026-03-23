import { useState } from "react";
import { useAdminListComplaints } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, ImageIcon, ChevronDown, ChevronUp } from "lucide-react";

export default function AdminComplaintsPage() {
  const { data: complaints, isLoading } = useAdminListComplaints();
  const [expandedImage, setExpandedImage] = useState<number | null>(null);

  return (
    <AppLayout title="Complaints">
      <div className="space-y-3 pb-4">
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
          </div>
        ) : complaints?.length ? (
          complaints.map((c: any) => (
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
                  {c.hostHandle && (
                    <p className="text-xs text-blue-400 mt-0.5">Host: @{c.hostHandle}</p>
                  )}
                  <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{c.description}</p>
                  {c.imageUrl && (
                    <div className="mt-2">
                      <button
                        onClick={() => setExpandedImage(expandedImage === c.id ? null : c.id)}
                        className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors"
                      >
                        <ImageIcon className="w-3.5 h-3.5" />
                        {expandedImage === c.id ? "Hide" : "View"} Screenshot
                        {expandedImage === c.id ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                      </button>
                      {expandedImage === c.id && (
                        <img
                          src={c.imageUrl}
                          alt="Complaint screenshot"
                          className="mt-2 rounded-xl max-h-64 object-contain border border-border"
                        />
                      )}
                    </div>
                  )}
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
