import { ReactNode, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Calendar, CalendarClock, CheckSquare, LogOut, Shield, User, Users2 } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useIsMobile } from "@/hooks/use-mobile";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface DashboardLayoutProps {
  children: ReactNode;
  activeTab: "events" | "approvals" | "mirror" | "admin";
}

interface StoredUser {
  email: string;
  full_name: string | null;
  role: "admin" | "supervisor" | "coordenador";
}

const DashboardLayout = ({ children, activeTab }: DashboardLayoutProps) => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const [user, setUser] = useState<StoredUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadUserFromStorage = async () => {
      try {
        const userStr = localStorage.getItem("user");
        if (!userStr) {
          navigate("/auth");
          return;
        }

        setUser(JSON.parse(userStr));
      } catch {
        navigate("/auth");
      } finally {
        setLoading(false);
      }
    };

    loadUserFromStorage();
  }, [navigate]);

  const handleLogout = () => {
    localStorage.removeItem("auth_token");
    localStorage.removeItem("user");

    toast({
      title: "Sessão encerrada",
      description: "Você saiu da plataforma com sucesso.",
    });

    navigate("/auth");
  };

  const navItems = useMemo(
    () => [
      {
        key: "events" as const,
        icon: Calendar,
        label: "Eventos",
        description: "Solicitações e gestão",
        onClick: () => navigate("/dashboard"),
        visible: true,
      },
      {
        key: "approvals" as const,
        icon: CheckSquare,
        label: "Aprovações",
        description: "Fila da supervisão",
        onClick: () => navigate("/dashboard/approvals"),
        visible: user?.role === "admin" || user?.role === "supervisor",
      },
      {
        key: "mirror" as const,
        icon: CalendarClock,
        label: "Agenda Google",
        description: "Espelho do calendário",
        onClick: () => navigate("/dashboard/calendar"),
        visible: true,
      },
      {
        key: "admin" as const,
        icon: Users2,
        label: "Admin",
        description: "Usuários e escopos",
        onClick: () => navigate("/dashboard/admin"),
        visible: user?.role === "admin",
      },
    ],
    [navigate, user?.role],
  );

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="h-12 w-12 mx-auto rounded-full border-b-2 border-primary animate-spin" />
          <p className="mt-4 text-muted-foreground">Carregando dados do usuário...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_right,hsl(193_90%_92%),transparent_42%),radial-gradient(circle_at_bottom_left,hsl(36_95%_92%),transparent_35%)]">
      <header className="sticky top-0 z-30 border-b border-white/70 bg-white/80 backdrop-blur">
        <div className="mx-auto max-w-7xl px-4 py-3 flex items-center justify-between gap-3">
          <button
            onClick={() => navigate("/dashboard")}
            className="min-w-0 flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-2 shadow-sm hover:shadow transition"
          >
            <div className="h-10 w-10 flex items-center justify-center rounded-xl bg-slate-900 text-white">
              <Calendar className="h-5 w-5" />
            </div>
            <div className="min-w-0 text-left">
              <h1 className="text-sm sm:text-base font-semibold truncate text-slate-900">Syncro Event Desk</h1>
              <p className="text-xs text-slate-500 truncate">Orquestração de agenda Google</p>
            </div>
          </button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="relative h-11 w-11 rounded-full">
                <Avatar className="h-11 w-11 border border-slate-200 bg-white">
                  <AvatarFallback className="bg-slate-900 text-white font-semibold">
                    {user.email?.charAt(0).toUpperCase() || "U"}
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-64" align="end">
              <DropdownMenuLabel className="font-normal">
                <div className="space-y-1">
                  <p className="text-sm font-medium">{user.full_name || "Usuário"}</p>
                  <p className="text-xs text-muted-foreground">{user.email}</p>
                  <div className="pt-1">
                    {(user.role === "admin" || user.role === "supervisor") && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-1 text-xs text-primary">
                        <Shield className="h-3 w-3" />
                        {user.role === "admin" ? "Administrador" : "Supervisor"}
                      </span>
                    )}
                    {user.role === "coordenador" && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-1 text-xs text-secondary-foreground">
                        <User className="h-3 w-3" />
                        Coordenação
                      </span>
                    )}
                  </div>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive cursor-pointer" onClick={handleLogout}>
                <LogOut className="h-4 w-4 mr-2" />
                Sair
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-5">
        <div className={cn("flex gap-4", isMobile ? "flex-col" : "items-start")}>
          <aside className={cn("flex-shrink-0", isMobile ? "w-full" : "w-[280px]")}>
            <nav
              className={cn(
                "rounded-2xl border border-white/70 bg-white/85 shadow-md backdrop-blur",
                isMobile ? "flex gap-2 overflow-x-auto p-2" : "space-y-2 p-3 sticky top-24",
              )}
            >
              {navItems
                .filter((item) => item.visible)
                .map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.key}
                      onClick={item.onClick}
                      className={cn(
                        "w-full inline-flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-left transition-all",
                        activeTab === item.key
                          ? "bg-slate-900 text-white shadow"
                          : "text-slate-700 hover:bg-slate-100",
                      )}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span className="min-w-0">
                        <span className="block font-medium leading-tight">{item.label}</span>
                        {!isMobile && <span className="block text-[11px] opacity-80">{item.description}</span>}
                      </span>
                    </button>
                  );
                })}
            </nav>
          </aside>

          <main className="flex-1 min-w-0">{children}</main>
        </div>
      </div>
    </div>
  );
};

export default DashboardLayout;
