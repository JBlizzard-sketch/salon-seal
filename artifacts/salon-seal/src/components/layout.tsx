import { Link, useLocation } from "wouter";
import { LayoutDashboard, Calendar, Users, Scissors, UserCheck, BarChart3, Settings, ScissorsSquare } from "lucide-react";
import { cn } from "@/lib/utils";

const navigation = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard },
  { name: "Bookings", href: "/bookings", icon: Calendar },
  { name: "Clients", href: "/clients", icon: Users },
  { name: "Services", href: "/services", icon: Scissors },
  { name: "Staff", href: "/staff", icon: UserCheck },
  { name: "Analytics", href: "/analytics", icon: BarChart3 },
  { name: "Settings", href: "/settings", icon: Settings },
];

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();

  return (
    <div className="min-h-screen bg-background flex flex-col md:flex-row">
      <div className="w-full md:w-64 bg-sidebar border-b md:border-r border-sidebar-border shrink-0 flex-col hidden md:flex">
        <div className="p-6 flex items-center gap-3">
          <div className="w-8 h-8 bg-primary rounded flex items-center justify-center text-primary-foreground font-bold">
            <ScissorsSquare className="w-5 h-5" />
          </div>
          <span className="font-bold text-xl tracking-tight text-sidebar-foreground">SalonSeal</span>
        </div>
        <nav className="flex-1 px-4 space-y-1">
          {navigation.map((item) => {
            const isActive = location === item.href;
            return (
              <Link key={item.name} href={item.href}>
                <div
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors cursor-pointer",
                    isActive
                      ? "bg-sidebar-primary text-sidebar-primary-foreground"
                      : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                  )}
                >
                  <item.icon className="w-5 h-5" />
                  {item.name}
                </div>
              </Link>
            );
          })}
        </nav>
      </div>
      
      {/* Mobile nav (simplified) */}
      <div className="md:hidden flex items-center justify-between p-4 border-b bg-sidebar">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-primary rounded flex items-center justify-center text-primary-foreground font-bold">
            <ScissorsSquare className="w-4 h-4" />
          </div>
          <span className="font-bold text-lg">SalonSeal</span>
        </div>
      </div>

      <main className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto p-4 md:p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
