import { useLocation, Link } from "wouter";
import { Home, Compass, LayoutDashboard, Plus, DollarSign, User, Swords, Gavel } from "lucide-react";
import { useAuth } from "@/contexts/useAuth";
import { cn } from "@/lib/utils";

const playerNav = [
  { href: "/", icon: Home, label: "Home" },
  { href: "/explore", icon: Compass, label: "Explore" },
  { href: "/my-matches", icon: Swords, label: "Matches" },
  { href: "/auctions", icon: Gavel, label: "Auctions" },
  { href: "/profile", icon: User, label: "Profile" },
];

const hostNav = [
  { href: "/host", icon: LayoutDashboard, label: "Dashboard" },
  { href: "/host/create-match", icon: Plus, label: "Create" },
  { href: "/my-matches", icon: Swords, label: "Matches" },
  { href: "/explore", icon: Compass, label: "Explore" },
  { href: "/profile", icon: User, label: "Profile" },
];

const adminNav = [
  { href: "/admin", icon: LayoutDashboard, label: "Dashboard" },
  { href: "/admin/players", icon: User, label: "Players" },
  { href: "/admin/auctions", icon: Gavel, label: "Auctions" },
  { href: "/admin/finance", icon: DollarSign, label: "Finance" },
  { href: "/admin/profile", icon: User, label: "Profile" },
];

const EXACT_MATCH_HREFS = new Set(["/", "/admin", "/host"]);

function isNavActive(href: string, location: string): boolean {
  if (EXACT_MATCH_HREFS.has(href)) return location === href;
  return location === href || location.startsWith(href + "/");
}

export function BottomNav() {
  const [location] = useLocation();
  const { user } = useAuth();
  const nav = user?.role === "admin" ? adminNav : user?.role === "host" ? hostNav : playerNav;

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border safe-area-bottom">
      <div className="flex items-center justify-around h-16 max-w-lg mx-auto px-2">
        {nav.map(({ href, icon: Icon, label }) => {
          const isActive = isNavActive(href, location);
          return (
            <Link key={href} href={href}>
              <button
                className={cn(
                  "flex flex-col items-center gap-1 px-3 py-2 rounded-xl transition-all",
                  isActive
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon className={cn("w-5 h-5", isActive && "stroke-[2.5]")} />
                <span className="text-[10px] font-medium">{label}</span>
              </button>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
