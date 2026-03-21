import { useLocation, Link } from "wouter";
import { Home, Compass, Swords, User, LayoutDashboard, Plus, DollarSign } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";

const playerNav = [
  { href: "/", icon: Home, label: "Home" },
  { href: "/explore", icon: Compass, label: "Explore" },
  { href: "/my-matches", icon: Swords, label: "Matches" },
  { href: "/profile", icon: User, label: "Profile" },
];

const hostNav = [
  { href: "/host", icon: LayoutDashboard, label: "Dashboard" },
  { href: "/host/create-match", icon: Plus, label: "Create" },
  { href: "/my-matches", icon: Swords, label: "Matches" },
  { href: "/profile", icon: User, label: "Profile" },
];

const adminNav = [
  { href: "/admin", icon: LayoutDashboard, label: "Dashboard" },
  { href: "/admin/players", icon: User, label: "Players" },
  { href: "/admin/finance", icon: DollarSign, label: "Finance" },
  { href: "/admin/games", icon: Compass, label: "Games" },
  { href: "/admin/complaints", icon: Swords, label: "Issues" },
];

export function BottomNav() {
  const [location] = useLocation();
  const { user } = useAuth();

  const nav = user?.role === "admin" ? adminNav : user?.role === "host" ? hostNav : playerNav;

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border safe-area-bottom">
      <div className="flex items-center justify-around h-16 max-w-lg mx-auto px-2">
        {nav.map(({ href, icon: Icon, label }) => {
          const isActive = href === "/" ? location === "/" : location.startsWith(href);
          return (
            <Link key={href} href={href}>
              <button
                className={cn(
                  "flex flex-col items-center gap-1 px-4 py-2 rounded-xl transition-all",
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
