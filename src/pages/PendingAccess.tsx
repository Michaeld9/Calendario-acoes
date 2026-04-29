import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Clock3, LogOut, RefreshCw, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { authApi } from "@/integrations/api";

const PendingAccess = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [checkingAccess, setCheckingAccess] = useState(false);

  const rawUser = localStorage.getItem("user");
  let storedUser: { full_name?: string | null; email?: string } | null = null;
  if (rawUser) {
    try {
      storedUser = JSON.parse(rawUser) as { full_name?: string | null; email?: string };
    } catch {
      storedUser = null;
    }
  }

  const handleLogout = () => {
    localStorage.removeItem("auth_token");
    localStorage.removeItem("user");
    navigate("/auth", { replace: true });
  };

  const handleCheckAccess = async () => {
    setCheckingAccess(true);

    try {
      const response = await authApi.verify();
      const user = response.data?.user as { role?: string; full_name?: string | null; email?: string } | undefined;

      if (user) {
        localStorage.setItem("user", JSON.stringify(user));
      }

      if (user?.role && user.role !== "aguardando") {
        toast({
          title: "Acesso liberado",
          description: "Seu perfil foi atualizado. Redirecionando para o painel.",
        });
        navigate("/dashboard", { replace: true });
        return;
      }

      toast({
        title: "Aguardando liberação",
        description: "Seu acesso ainda está em análise pelo administrador.",
      });
    } catch {
      toast({
        variant: "destructive",
        title: "Sessão inválida",
        description: "Faça login novamente para continuar.",
      });
      handleLogout();
    } finally {
      setCheckingAccess(false);
    }
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,hsl(193_100%_92%),transparent_40%),radial-gradient(circle_at_bottom_right,hsl(36_100%_90%),transparent_35%)] px-4 py-8">
      <div className="mx-auto flex min-h-[80vh] max-w-2xl items-center justify-center">
        <Card className="w-full border-slate-200/80 bg-white/90 shadow-2xl backdrop-blur">
          <CardHeader className="space-y-4 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
              <Clock3 className="h-7 w-7" />
            </div>
            <div>
              <CardTitle className="text-3xl font-semibold tracking-tight">Acesso em análise</CardTitle>
              <CardDescription className="mt-2 text-base">
                Seu login foi realizado, mas o perfil ainda está no tier inicial <strong>aguardando</strong>.
              </CardDescription>
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
              <p className="font-medium text-slate-900">
                {storedUser?.full_name || storedUser?.email || "Usuário autenticado"}
              </p>
              {storedUser?.email && <p className="text-xs text-slate-500">{storedUser.email}</p>}
              <p className="mt-3">
                O administrador vai liberar o escopo correto em breve. Assim que o tier for atualizado, você poderá acessar o painel normalmente.
              </p>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <Button className="w-full" onClick={handleCheckAccess} disabled={checkingAccess}>
                <RefreshCw className="mr-2 h-4 w-4" />
                {checkingAccess ? "Verificando..." : "Verificar liberação"}
              </Button>
              <Button className="w-full" variant="outline" onClick={handleLogout}>
                <LogOut className="mr-2 h-4 w-4" />
                Sair
              </Button>
            </div>

            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              <p className="inline-flex items-center gap-2 font-medium">
                <ShieldCheck className="h-4 w-4" />
                Segurança de acesso
              </p>
              <p className="mt-1">Essa etapa evita que contas autenticadas no Google acessem dados sem autorização administrativa.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default PendingAccess;
