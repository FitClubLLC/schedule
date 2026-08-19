import { Link, useLocation } from "wouter";
import { useClerk, useUser } from "@clerk/react";
import { LogOut, Menu, X } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { isConfiguredAdmin } from "@/lib/adminAccess";
import { Button } from "@/components/ui/button";

export function Navbar() {
  const [location] = useLocation();
  const { signOut } = useClerk();
  const { user } = useUser();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

  const adminEmail = import.meta.env.VITE_ADMIN_EMAIL;
  const isAdmin = isConfiguredAdmin(user, adminEmail);

  const navLinks = [
    { href: "/dashboard", label: "Dashboard" },
    { href: "/appointments", label: "Appointments" },
    { href: "/book", label: "Book a Session" },
    ...(isAdmin ? [{ href: "/admin", label: "Members" }] : []),
  ];

  return (
    <nav className="bg-card border-b border-border sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex items-center">
            <Link href="/dashboard" className="flex items-center gap-2 flex-shrink-0">
              <img src={`${basePath}/fitclub-logo.png`} alt="Fit Club" className="h-8 w-auto" />
            </Link>
            
            <div className="hidden md:ml-10 md:flex md:space-x-1">
              {navLinks.map((link) => {
                const isActive = location === link.href || (location.startsWith(link.href) && link.href !== "/dashboard");
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={cn(
                      "px-3 py-2 rounded-md text-sm font-semibold transition-colors",
                      isActive 
                        ? "bg-primary/10 text-primary" 
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                  >
                    {link.label}
                  </Link>
                );
              })}
            </div>
          </div>
          
          <div className="hidden md:flex md:items-center md:space-x-4">
            <div className="text-sm font-semibold text-foreground">
              {user?.firstName} {user?.lastName}
            </div>
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={() => signOut({ redirectUrl: basePath || "/" })}
              title="Sign out"
            >
              <LogOut className="w-4 h-4 text-muted-foreground hover:text-destructive" />
            </Button>
          </div>

          <div className="flex items-center md:hidden">
            <Button variant="ghost" size="icon" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </Button>
          </div>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-border bg-card">
          <div className="px-2 pt-2 pb-3 space-y-1">
            {navLinks.map((link) => {
              const isActive = location === link.href || (location.startsWith(link.href) && link.href !== "/dashboard");
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={cn(
                    "block px-3 py-2 rounded-md text-base font-semibold",
                    isActive 
                      ? "bg-primary/10 text-primary" 
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  {link.label}
                </Link>
              );
            })}
            <button
              onClick={() => {
                setMobileMenuOpen(false);
                signOut({ redirectUrl: basePath || "/" });
              }}
              className="w-full text-left block px-3 py-2 rounded-md text-base font-semibold text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              Sign out
            </button>
          </div>
        </div>
      )}
    </nav>
  );
}
