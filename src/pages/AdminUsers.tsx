import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { KeyRound, Plus, RefreshCw, Save, ShieldAlert, Trash2, Users2 } from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { settingsApi, usersApi } from "@/integrations/api";

type UserRole = "admin" | "supervisor" | "coordenador" | "aguardando";

interface ManagedUser {
  id: number;
  email: string;
  full_name: string | null;
  auth_type: "local" | "google";
  role: UserRole;
  active: boolean;
  google_id: string | null;
  created_at: string;
}

const roleLabel: Record<UserRole, string> = {
  admin: "Administrador",
  supervisor: "Supervisor",
  coordenador: "Coordenação",
  aguardando: "Aguardando liberação",
};

const AdminUsers = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingCalendar, setSavingCalendar] = useState(false);
  const [creatingUser, setCreatingUser] = useState(false);
  const [calendarId, setCalendarId] = useState("");
  const [newUser, setNewUser] = useState({
    fullName: "",
    email: "",
    password: "",
    role: "coordenador" as UserRole,
  });
  const [sessionUser, setSessionUser] = useState<{ id: number; role: UserRole } | null>(null);
  const [passwordDialogUser, setPasswordDialogUser] = useState<ManagedUser | null>(null);
  const [passwordValue, setPasswordValue] = useState("");
  const [updatingPassword, setUpdatingPassword] = useState(false);
  const [deletingUserId, setDeletingUserId] = useState<number | null>(null);

  const canAccess = sessionUser?.role === "admin";

  useEffect(() => {
    const userRaw = localStorage.getItem("user");
    if (!userRaw) {
      navigate("/auth");
      return;
    }

    try {
      const parsed = JSON.parse(userRaw) as { id: number; role: UserRole };
      setSessionUser(parsed);
      if (parsed.role !== "admin") {
        toast({
          variant: "destructive",
          title: "Sem permissão",
          description: "A aba Admin é exclusiva para administradores.",
        });
        navigate("/dashboard");
      }
    } catch {
      navigate("/auth");
    }
  }, [navigate, toast]);

  const fetchAdminData = useCallback(async () => {
    if (!canAccess) {
      return;
    }

    setLoading(true);
    try {
      const [usersResponse, settingsResponse] = await Promise.all([
        usersApi.listUsers(),
        settingsApi.getGoogleCalendarSettings(),
      ]);

      setUsers(usersResponse.data.users || []);
      setCalendarId(settingsResponse.data.settings?.calendarId || "");
    } catch (error: unknown) {
      const apiError = error as { response?: { data?: { error?: string } }; message?: string };
      toast({
        variant: "destructive",
        title: "Falha ao carregar painel admin",
        description: apiError.response?.data?.error || apiError.message || "Falha inesperada ao carregar dados.",
      });
    } finally {
      setLoading(false);
    }
  }, [canAccess, toast]);

  useEffect(() => {
    fetchAdminData();
  }, [fetchAdminData]);

  const handleCreateLocalUser = async (event: React.FormEvent) => {
    event.preventDefault();
    setCreatingUser(true);

    try {
      await usersApi.createLocalUser(newUser);
      toast({
        title: "Usuário local criado",
        description: "Conta criada com sucesso.",
      });

      setNewUser({
        fullName: "",
        email: "",
        password: "",
        role: "coordenador",
      });
      fetchAdminData();
    } catch (error: unknown) {
      const apiError = error as { response?: { data?: { error?: string } }; message?: string };
      toast({
        variant: "destructive",
        title: "Erro ao criar usuário",
        description: apiError.response?.data?.error || apiError.message || "Falha inesperada ao criar usuário.",
      });
    } finally {
      setCreatingUser(false);
    }
  };

  const handleRoleChange = async (userId: number, role: UserRole) => {
    try {
      await usersApi.updateUserRole(userId, role);
      setUsers((current) => current.map((user) => (user.id === userId ? { ...user, role } : user)));
      toast({
        title: "Tier atualizado",
        description: "Escopo de usuário alterado com sucesso.",
      });
    } catch (error: unknown) {
      const apiError = error as { response?: { data?: { error?: string } }; message?: string };
      toast({
        variant: "destructive",
        title: "Falha ao alterar tier",
        description: apiError.response?.data?.error || apiError.message || "Não foi possível atualizar o tier.",
      });
    }
  };

  const handleActiveChange = async (userId: number, active: boolean) => {
    try {
      await usersApi.updateUserActive(userId, active);
      setUsers((current) => current.map((user) => (user.id === userId ? { ...user, active } : user)));
      toast({
        title: active ? "Usuário ativado" : "Usuário desativado",
        description: "Status atualizado com sucesso.",
      });
    } catch (error: unknown) {
      const apiError = error as { response?: { data?: { error?: string } }; message?: string };
      toast({
        variant: "destructive",
        title: "Falha ao atualizar status",
        description: apiError.response?.data?.error || apiError.message || "Não foi possível atualizar o status.",
      });
    }
  };

  const closePasswordDialog = () => {
    setPasswordDialogUser(null);
    setPasswordValue("");
    setUpdatingPassword(false);
  };

  const handleUpdateLocalPassword = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!passwordDialogUser) {
      return;
    }

    setUpdatingPassword(true);
    try {
      await usersApi.updateLocalUserPassword(passwordDialogUser.id, passwordValue);
      toast({
        title: "Senha atualizada",
        description: `Senha alterada para ${passwordDialogUser.full_name || passwordDialogUser.email}.`,
      });
      closePasswordDialog();
    } catch (error: unknown) {
      const apiError = error as { response?: { data?: { error?: string } }; message?: string };
      toast({
        variant: "destructive",
        title: "Falha ao alterar senha",
        description: apiError.response?.data?.error || apiError.message || "Nao foi possivel atualizar a senha.",
      });
      setUpdatingPassword(false);
    }
  };

  const handleDeleteUser = async (managedUser: ManagedUser) => {
    if (managedUser.id === sessionUser?.id) {
      toast({
        variant: "destructive",
        title: "Operacao bloqueada",
        description: "Nao e permitido excluir seu proprio usuario.",
      });
      return;
    }

    const confirmed = window.confirm(
      `Excluir o usuario ${managedUser.full_name || managedUser.email}? Esta acao e permanente e pode remover eventos relacionados.`,
    );
    if (!confirmed) {
      return;
    }

    setDeletingUserId(managedUser.id);
    try {
      await usersApi.deleteUser(managedUser.id);
      setUsers((current) => current.filter((user) => user.id !== managedUser.id));
      toast({
        title: "Usuario excluido",
        description: `${managedUser.full_name || managedUser.email} foi removido.`,
      });
    } catch (error: unknown) {
      const apiError = error as { response?: { data?: { error?: string } }; message?: string };
      toast({
        variant: "destructive",
        title: "Falha ao excluir usuario",
        description: apiError.response?.data?.error || apiError.message || "Nao foi possivel excluir o usuario.",
      });
    } finally {
      setDeletingUserId(null);
    }
  };

  const handleSaveCalendarId = async () => {
    setSavingCalendar(true);
    try {
      await settingsApi.updateGoogleCalendarSettings(calendarId);
      toast({
        title: "Calendar ID salvo",
        description: "A plataforma agora espelha o calendário Google informado.",
      });
    } catch (error: unknown) {
      const apiError = error as { response?: { data?: { error?: string } }; message?: string };
      toast({
        variant: "destructive",
        title: "Erro ao salvar Calendar ID",
        description: apiError.response?.data?.error || apiError.message || "Falha ao atualizar configuração.",
      });
    } finally {
      setSavingCalendar(false);
    }
  };

  const totals = useMemo(() => {
    return {
      total: users.length,
      local: users.filter((user) => user.auth_type === "local").length,
      google: users.filter((user) => user.auth_type === "google").length,
      active: users.filter((user) => user.active).length,
    };
  }, [users]);

  if (!canAccess) {
    return null;
  }

  return (
    <DashboardLayout activeTab="admin">
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-4">
          <Card className="border-white/60 bg-white/80">
            <CardHeader className="pb-2">
              <CardDescription>Total</CardDescription>
              <CardTitle className="text-3xl">{totals.total}</CardTitle>
            </CardHeader>
          </Card>
          <Card className="border-white/60 bg-white/80">
            <CardHeader className="pb-2">
              <CardDescription>Locais</CardDescription>
              <CardTitle className="text-3xl">{totals.local}</CardTitle>
            </CardHeader>
          </Card>
          <Card className="border-white/60 bg-white/80">
            <CardHeader className="pb-2">
              <CardDescription>Google</CardDescription>
              <CardTitle className="text-3xl">{totals.google}</CardTitle>
            </CardHeader>
          </Card>
          <Card className="border-white/60 bg-white/80">
            <CardHeader className="pb-2">
              <CardDescription>Ativos</CardDescription>
              <CardTitle className="text-3xl text-emerald-700">{totals.active}</CardTitle>
            </CardHeader>
          </Card>
        </div>

        <Card className="border-white/60 bg-white/85">
          <CardHeader>
            <CardTitle className="text-xl">Integração Google Calendar</CardTitle>
            <CardDescription>
              Defina o Calendar ID usado para espelhar, criar e sincronizar eventos.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3">
              <Input
                value={calendarId}
                onChange={(event) => setCalendarId(event.target.value)}
                placeholder="exemplo@group.calendar.google.com"
              />
              <Button onClick={handleSaveCalendarId} disabled={savingCalendar || !calendarId.trim()}>
                <Save className="mr-2 h-4 w-4" />
                {savingCalendar ? "Salvando..." : "Salvar Calendar ID"}
              </Button>
            </div>
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
              <p className="font-medium">Importante</p>
              <p className="mt-1">
                A conta de serviço definida no backend precisa ter permissão de escrita neste calendário.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-white/60 bg-white/85">
          <CardHeader>
            <CardTitle className="text-xl">Criar usuário local</CardTitle>
            <CardDescription>Cadastre usuários locais e defina o tier inicial de acesso.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreateLocalUser} className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="new_full_name">Nome completo</Label>
                <Input
                  id="new_full_name"
                  value={newUser.fullName}
                  onChange={(event) => setNewUser((current) => ({ ...current, fullName: event.target.value }))}
                  required
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="new_email">E-mail</Label>
                <Input
                  id="new_email"
                  type="email"
                  value={newUser.email}
                  onChange={(event) => setNewUser((current) => ({ ...current, email: event.target.value }))}
                  required
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="new_password">Senha</Label>
                <Input
                  id="new_password"
                  type="password"
                  minLength={12}
                  value={newUser.password}
                  onChange={(event) => setNewUser((current) => ({ ...current, password: event.target.value }))}
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Minimo 12 caracteres com maiuscula, minuscula, numero e simbolo.
                </p>
              </div>
              <div className="space-y-1">
                <Label>Tier inicial</Label>
                <Select
                  value={newUser.role}
                  onValueChange={(value: UserRole) => setNewUser((current) => ({ ...current, role: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="aguardando">Aguardando liberação</SelectItem>
                    <SelectItem value="coordenador">Coordenação</SelectItem>
                    <SelectItem value="supervisor">Supervisor</SelectItem>
                    <SelectItem value="admin">Administrador</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="md:col-span-2">
                <Button type="submit" disabled={creatingUser}>
                  <Plus className="mr-2 h-4 w-4" />
                  {creatingUser ? "Criando..." : "Criar usuário local"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card className="border-white/60 bg-white/85">
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <CardTitle className="text-xl">Gestão de usuários (local + Google)</CardTitle>
                <CardDescription>Altere tier, ative/desative e acompanhe origem de autenticação.</CardDescription>
              </div>
              <Button variant="outline" onClick={fetchAdminData} disabled={loading}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Atualizar
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading && <div className="py-6 text-center text-muted-foreground">Carregando usuários...</div>}

            {!loading && users.length === 0 && (
              <div className="py-8 text-center text-muted-foreground">
                <Users2 className="mx-auto mb-3 h-12 w-12" />
                Nenhum usuário encontrado.
              </div>
            )}

            {!loading &&
              users.map((user) => {
                const canChangePassword = user.auth_type === "local";
                const isSelf = user.id === sessionUser?.id;
                const isDeleting = deletingUserId === user.id;

                return (
                  <article key={user.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px_220px] xl:items-center">
                      <section className="min-w-0">
                        <p className="truncate text-base font-semibold text-slate-900">{user.full_name || "Sem nome"}</p>
                        <p className="truncate text-sm text-slate-600">{user.email}</p>

                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <Badge variant="outline">{user.auth_type === "google" ? "Google" : "Local"}</Badge>
                          <Badge variant="outline">{roleLabel[user.role]}</Badge>
                          {user.active ? (
                            <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">Ativo</Badge>
                          ) : (
                            <Badge className="bg-rose-100 text-rose-800 hover:bg-rose-100">Inativo</Badge>
                          )}
                          {user.google_id && (
                            <Badge variant="outline" className="font-mono text-[10px]">
                              {user.google_id.slice(0, 18)}...
                            </Badge>
                          )}
                        </div>
                      </section>

                      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                        <div className="space-y-1">
                          <Label className="text-xs uppercase tracking-wide text-muted-foreground">Tier</Label>
                          <Select value={user.role} onValueChange={(value: UserRole) => handleRoleChange(user.id, value)}>
                            <SelectTrigger className="h-10 bg-white">
                              <SelectValue>{roleLabel[user.role]}</SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="aguardando">Aguardando liberação</SelectItem>
                              <SelectItem value="coordenador">Coordenação</SelectItem>
                              <SelectItem value="supervisor">Supervisor</SelectItem>
                              <SelectItem value="admin">Administrador</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-1">
                          <Label className="text-xs uppercase tracking-wide text-muted-foreground">Status</Label>
                          <div className="flex h-10 items-center justify-between rounded-md border border-slate-200 px-3">
                            <span className="text-sm text-slate-700">{user.active ? "Conta ativa" : "Conta inativa"}</span>
                            <Switch checked={user.active} onCheckedChange={(checked) => handleActiveChange(user.id, checked)} />
                          </div>
                        </div>
                      </section>

                      <section className="flex flex-col gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="w-full justify-start"
                          disabled={!canChangePassword}
                          onClick={() => {
                            setPasswordDialogUser(user);
                            setPasswordValue("");
                          }}
                        >
                          <KeyRound className="mr-1 h-4 w-4" />
                          {canChangePassword ? "Alterar senha" : "Senha indisponivel"}
                        </Button>

                        <Button
                          size="sm"
                          variant="destructive"
                          className="w-full justify-start"
                          disabled={isDeleting || isSelf}
                          onClick={() => handleDeleteUser(user)}
                        >
                          <Trash2 className="mr-1 h-4 w-4" />
                          {isDeleting ? "Excluindo..." : "Excluir usuario"}
                        </Button>
                      </section>
                    </div>
                  </article>
                );
              })}
          </CardContent>
        </Card>

        <Dialog
          open={Boolean(passwordDialogUser)}
          onOpenChange={(open) => {
            if (!open) {
              closePasswordDialog();
            }
          }}
        >
          <DialogContent className="max-w-md border-slate-200/80">
            <DialogHeader>
              <DialogTitle>Alterar senha de usuario local</DialogTitle>
              <DialogDescription>
                {passwordDialogUser
                  ? `Atualize a senha de ${passwordDialogUser.full_name || passwordDialogUser.email}.`
                  : "Defina uma nova senha."}
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleUpdateLocalPassword} className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="reset_password">Nova senha</Label>
                <Input
                  id="reset_password"
                  type="password"
                  minLength={12}
                  value={passwordValue}
                  onChange={(event) => setPasswordValue(event.target.value)}
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Minimo 12 caracteres com maiuscula, minuscula, numero e simbolo.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2">
                <Button type="button" variant="outline" onClick={closePasswordDialog} disabled={updatingPassword}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={updatingPassword || !passwordValue.trim()}>
                  {updatingPassword ? "Salvando..." : "Salvar nova senha"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
          <p className="flex items-center gap-2 font-medium">
            <ShieldAlert className="h-4 w-4" />
            Regras de escopo aplicadas
          </p>
          <p className="mt-1">
            Coordenação cria solicitações pendentes. Supervisão/Admin aprovam e publicam no Google Calendar.
            Apenas Supervisão/Admin podem gerenciar diretamente eventos publicados.
          </p>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default AdminUsers;

