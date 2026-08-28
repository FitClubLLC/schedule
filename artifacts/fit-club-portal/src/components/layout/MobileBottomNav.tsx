import type { LucideIcon } from "lucide-react";
import { CalendarDays, CreditCard, House, PlusCircle, UserRound } from "lucide-react";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { markMembershipCatalogOpened } from "@/lib/membershipCatalogReturn";

type MobileBottomNavProps = {
  membershipsUrl?: string;
};

type Tab = {
  label: string;
  href: string;
  icon: LucideIcon;
};

const tabs: Tab[] = [
  { href: "/dashboard", label: "Home", icon: House },
  { href: "/appointments", label: "Sessions", icon: CalendarDays },
  { href: "/book", label: "Book", icon: PlusCircle },
  { href: "/profile", label: "Profile", icon: UserRound },
];

function isTabActive(location: string, href: string) {
  return location === href || (href !== "/dashboard" && location.startsWith(`${href}/`));
}

export function MobileBottomNav({ membershipsUrl }: MobileBottomNavProps) {
  const [location] = useLocation();

  return (
    <nav
      aria-label="Mobile navigation"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80 md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="mx-auto grid min-h-16 max-w-6xl grid-cols-5">
        {tabs.slice(0, 3).map((tab) => {
          const Icon = tab.icon;
          const active = isTabActive(location, tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-w-0 flex-col items-center justify-center gap-1 px-1 text-[11px] font-semibold transition-colors",
                active ? "text-primary" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className={cn("h-5 w-5", active && "stroke-[2.5]")} aria-hidden="true" />
              <span className="truncate">{tab.label}</span>
            </Link>
          );
        })}

        {membershipsUrl ? (
          <a
            href={membershipsUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => markMembershipCatalogOpened()}
            className="flex min-w-0 flex-col items-center justify-center gap-1 px-1 text-[11px] font-semibold text-muted-foreground transition-colors hover:text-foreground"
          >
            <CreditCard className="h-5 w-5" aria-hidden="true" />
            <span className="truncate">Memberships</span>
          </a>
        ) : (
          <button
            type="button"
            disabled
            aria-label="Memberships unavailable"
            className="flex min-w-0 cursor-not-allowed flex-col items-center justify-center gap-1 px-1 text-[11px] font-semibold text-muted-foreground opacity-60"
          >
            <CreditCard className="h-5 w-5" aria-hidden="true" />
            <span className="truncate">Memberships</span>
          </button>
        )}

        {(() => {
          const tab = tabs[3];
          const Icon = tab.icon;
          const active = isTabActive(location, tab.href);
          return (
            <Link
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-w-0 flex-col items-center justify-center gap-1 px-1 text-[11px] font-semibold transition-colors",
                active ? "text-primary" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className={cn("h-5 w-5", active && "stroke-[2.5]")} aria-hidden="true" />
              <span className="truncate">{tab.label}</span>
            </Link>
          );
        })()}
      </div>
    </nav>
  );
}