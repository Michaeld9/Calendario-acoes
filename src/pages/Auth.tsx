import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Calendar, KeyRound, ShieldCheck, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { authApi } from "@/integrations/api";

const GOOGLE_SCRIPT_ID = "google-identity-service-script";
const GOOGLE_CLIENT_ID = (import.meta.env.VITE_GOOGLE_CLIENT_ID || "").trim();

const Auth = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const googleButtonRef = useRef<HTMLDivElement | null>(null);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [googleReady, setGoogleReady] = useState(false);
  const [googleError, setGoogleError] = useState<string | null>(null);
  const [googleReloadKey, setGoogleReloadKey] = useState(0);
  const [isAuthenticating, setIsAuthenticating] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      const token = localStorage.getItem("auth_token");

      if (!token) {
        setIsAuthenticating(false);
        return;
      }

      try {
        const response = await authApi.verify();
        const verifiedUser = response.data?.user as { role?: string } | undefined;
        if (verifiedUser) {
          localStorage.setItem("user", JSON.stringify(response.data.user));
        }
        navigate(verifiedUser?.role === "aguardando" ? "/dashboard/aguardando" : "/dashboard");
      } catch {
        localStorage.removeItem("auth_token");
        localStorage.removeItem("user");
        setIsAuthenticating(false);
      }
    };

    checkAuth();
  }, [navigate]);

  useEffect(() => {
    if (isAuthenticating) {
      return;
    }

    if (!GOOGLE_CLIENT_ID || !googleButtonRef.current) {
      return;
    }

    let cancelled = false;

    const waitForGoogleSdk = async (timeoutMs: number): Promise<boolean> => {
      const startAt = Date.now();

      while (!cancelled && Date.now() - startAt < timeoutMs) {
        if (window.google?.accounts?.id) {
          return true;
        }
        await new Promise((resolve) => setTimeout(resolve, 150));
      }

      return Boolean(window.google?.accounts?.id);
    };

    const loadGoogleScript = async (): Promise<void> => {
      if (window.google?.accounts?.id) {
        return;
      }

      const existingScript = document.getElementById(GOOGLE_SCRIPT_ID) as HTMLScriptElement | null;

      if (existingScript) {
        return;
      }

      await new Promise<void>((resolve, reject) => {
        const script = document.createElement("script");
        script.id = GOOGLE_SCRIPT_ID;
        script.src = "https://accounts.google.com/gsi/client";
        script.async = true;
        script.defer = true;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error("google_script_failed"));
        document.head.appendChild(script);
      });
    };

    const initializeGoogleButton = async () => {
      setGoogleReady(false);
      setGoogleError(null);

      try {
        await loadGoogleScript();
      } catch {
        if (!cancelled) {
          setGoogleError("Falha ao carregar script do Google. Verifique rede e bloqueadores.");
        }
        return;
      }

      const sdkAvailable = await waitForGoogleSdk(8000);
      if (!sdkAvailable || !googleButtonRef.current) {
        if (!cancelled) {
          setGoogleError("Não foi possível carregar autenticação Google. Tente novamente.");
        }
        return;
      }

      try {
        window.google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: async (response) => {
            if (!response?.credential) {
              toast({
                variant: "destructive",
                title: "Falha no login Google",
                description: "Token de autenticação do Google não foi recebido.",
              });
              return;
            }

            setGoogleLoading(true);
            try {
              const apiResponse = await authApi.loginGoogleWithToken(response.credential);
              const { user, token } = apiResponse.data;

              localStorage.setItem("auth_token", token);
              localStorage.setItem("user", JSON.stringify(user));

              toast({
                title: "Login com Google realizado",
                description: `Acesso concedido para ${user.full_name || user.email}.`,
              });

              navigate(user.role === "aguardando" ? "/dashboard/aguardando" : "/dashboard");
            } catch (error: unknown) {
              const apiError = error as { response?: { data?: { error?: string } }; message?: string };
              toast({
                variant: "destructive",
                title: "Falha no login Google",
                description:
                  apiError.response?.data?.error || apiError.message || "Não foi possível autenticar com Google.",
              });
            } finally {
              setGoogleLoading(false);
            }
          },
        });

        googleButtonRef.current.innerHTML = "";
        window.google.accounts.id.renderButton(googleButtonRef.current, {
          theme: "outline",
          size: "large",
          type: "standard",
          text: "signin_with",
          shape: "pill",
          width: 320,
        });

        if (!cancelled) {
          setGoogleReady(true);
          setGoogleError(null);
        }
      } catch {
        if (!cancelled) {
          setGoogleError("Erro ao inicializar botão Google. Confira o Client ID e recarregue.");
        }
      }
    };

    initializeGoogleButton();

    return () => {
      cancelled = true;
    };
  }, [navigate, toast, googleReloadKey, isAuthenticating]);

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);

    try {
      const response = await authApi.loginLocal(email.trim(), password);
      const { user, token } = response.data;

      localStorage.setItem("auth_token", token);
      localStorage.setItem("user", JSON.stringify(user));

      toast({
        title: "Login realizado",
        description: `Bem-vindo(a), ${user.full_name || user.email}.`,
      });

      navigate(user.role === "aguardando" ? "/dashboard/aguardando" : "/dashboard");
    } catch (error: unknown) {
      const apiError = error as { response?: { data?: { error?: string } }; message?: string };
      toast({
        variant: "destructive",
        title: "Falha no login",
        description:
          apiError.response?.data?.error || apiError.message || "Não foi possível autenticar com as credenciais.",
      });
    } finally {
      setLoading(false);
    }
  };

  if (isAuthenticating) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-cyan-100 via-white to-amber-50">
        <div className="text-center">
          <div className="h-12 w-12 mx-auto mb-4 rounded-full border-b-2 border-primary animate-spin" />
          <p className="text-muted-foreground">Validando sessão...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,hsl(193_100%_92%),transparent_40%),radial-gradient(circle_at_bottom_right,hsl(36_100%_90%),transparent_35%)] px-4 py-10">
      <div className="mx-auto grid max-w-6xl items-center gap-8 lg:grid-cols-2">
        <section className="hidden lg:block">
          <div className="rounded-3xl border border-white/60 bg-white/75 p-8 shadow-xl backdrop-blur">
            <div className="mb-8 inline-flex items-center gap-3 rounded-full bg-slate-900 px-4 py-2 text-sm text-white">
              <Calendar className="h-4 w-4" />
              Calendário de Ações
            </div>

            <h1 className="text-4xl font-semibold tracking-tight text-slate-900">Sincronização de Eventos</h1>
            <p className="mt-4 text-base leading-relaxed text-slate-600">
              Aprovação em camadas, integração com Google Calendar e controle de escopo por tier.
            </p>

            <div className="mt-8 space-y-4">
              <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4">
                <UserPlus className="h-5 w-5 text-cyan-600" />
                <div>
                  <p className="text-sm font-semibold text-slate-900">Coordenação</p>
                  <p className="text-sm text-slate-600">Cria solicitações de eventos que aguardam aprovação.</p>
                </div>
              </div>
              <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4">
                <ShieldCheck className="h-5 w-5 text-amber-600" />
                <div>
                  <p className="text-sm font-semibold text-slate-900">Supervisão e Admin</p>
                  <p className="text-sm text-slate-600">Publicam direto no Google Calendar e gerenciam usuários.</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <Card className="w-full max-w-md justify-self-center border-slate-200/80 bg-white/90 shadow-2xl backdrop-blur">
          <CardHeader className="space-y-4 text-center">
            <div className="mx-auto h-14 w-14 rounded-2xl bg-slate-900 text-white flex items-center justify-center shadow-md">
              <Calendar className="h-7 w-7" />
            </div>
            <div>
              <CardTitle className="text-3xl font-semibold tracking-tight">Acessar painel</CardTitle>
              <CardDescription className="text-base mt-1">Entre com conta local ou com Google</CardDescription>
            </div>
          </CardHeader>

          <CardContent className="space-y-5">
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">E-mail</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="Digite seu E-mail"
                  autoComplete="email"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Senha</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Digite sua senha"
                  autoComplete="current-password"
                  required
                />
              </div>

              <Button type="submit" className="w-full h-11 text-base font-medium" disabled={loading}>
                {loading ? (
                  "Entrando..."
                ) : (
                  <>
                    <KeyRound className="mr-2 h-4 w-4" />
                    Entrar com senha
                  </>
                )}
              </Button>
            </form>

            <div className="relative flex items-center py-1">
              <div className="flex-1 border-t border-slate-200" />
              <span className="px-3 text-xs uppercase tracking-wide text-slate-500">ou</span>
              <div className="flex-1 border-t border-slate-200" />
            </div>

            <div className="space-y-2">
              <div className="flex justify-center" ref={googleButtonRef} />
              {!GOOGLE_CLIENT_ID && (
                <p className="text-center text-xs text-amber-700">
                  Defina `VITE_GOOGLE_CLIENT_ID` para habilitar login Google.
                </p>
              )}
              {GOOGLE_CLIENT_ID && !googleReady && (
                <p className="text-center text-xs text-muted-foreground">Carregando autenticação Google...</p>
              )}
              {googleError && (
                <div className="space-y-2 text-center">
                  <p className="text-xs text-destructive">{googleError}</p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setGoogleReloadKey((current) => current + 1)}
                  >
                    Tentar novamente
                  </Button>
                </div>
              )}
              {googleLoading && (
                <p className="text-center text-xs text-muted-foreground">Validando conta Google...</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Auth;
