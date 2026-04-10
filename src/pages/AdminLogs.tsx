import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw, ScrollText, ShieldAlert } from "lucide-react";
import { useNavigate } from "react-router-dom";
import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { logsApi } from "@/integrations/api";

type UserRole = "admin" | "supervisor" | "coordenador";

interface EventAuditLog {
  id: number;
  action: string;
  event_id: number | null;
  event_title: string | null;
  actor_user_id: number;
  actor_email: string;
  actor_name: string | null;
  details: string | null;
  created_at: string;
}

const actionLabelMap: Record<string, string> = {
  evento_criado_pendente: "Evento criado (pendente)",
  evento_criado_publicado_direto: "Evento criado e publicado",
  evento_atualizado: "Evento atualizado",
  evento_excluido: "Evento excluído",
  evento_aprovado: "Evento aprovado",
  evento_rejeitado: "Evento rejeitado",
};

const MYSQL_DATETIME_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/;

const parseLogDate = (rawValue: string): Date | null => {
  const value = String(rawValue || "").trim();
  if (!value) {
    return null;
  }

  if (MYSQL_DATETIME_PATTERN.test(value)) {
    const [, year, month, day, hour, minute, second] = value.match(MYSQL_DATETIME_PATTERN)!;
    const parsed = new Date(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second),
      0,
    );
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const formatLogDateTime = (rawValue: string): string => {
  const mysqlMatch = String(rawValue || "").trim().match(MYSQL_DATETIME_PATTERN);
  if (mysqlMatch) {
    const [, year, month, day, hour, minute, second] = mysqlMatch;
    return `${day}/${month}/${year} às ${hour}:${minute}:${second}`;
  }

  const parsed = parseLogDate(rawValue);
  if (!parsed) {
    return rawValue;
  }

  const formatted = new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(parsed);

  return formatted.replace(",", " às");
};

const getDateKey = (rawValue: string): string | null => {
  const mysqlMatch = String(rawValue || "").trim().match(MYSQL_DATETIME_PATTERN);
  if (mysqlMatch) {
    const [, year, month, day] = mysqlMatch;
    return `${year}-${month}-${day}`;
  }

  const parsed = parseLogDate(rawValue);
  if (!parsed) {
    return null;
  }

  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(parsed);
};

const getActionBadgeClass = (action: string): string => {
  if (action.includes("aprovado") || action.includes("publicado")) {
    return "bg-emerald-100 text-emerald-800 hover:bg-emerald-100";
  }
  if (action.includes("rejeitado") || action.includes("excluido")) {
    return "bg-rose-100 text-rose-800 hover:bg-rose-100";
  }
  if (action.includes("atualizado")) {
    return "bg-sky-100 text-sky-800 hover:bg-sky-100";
  }

  return "bg-amber-100 text-amber-800 hover:bg-amber-100";
};

const AdminLogs = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [logs, setLogs] = useState<EventAuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [sessionUser, setSessionUser] = useState<{ id: number; role: UserRole } | null>(null);

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
          description: "A aba de logs é exclusiva para administradores.",
        });
        navigate("/dashboard");
      }
    } catch {
      navigate("/auth");
    }
  }, [navigate, toast]);

  const fetchLogs = useCallback(async () => {
    if (!canAccess) {
      return;
    }

    setLoading(true);
    try {
      const response = await logsApi.getEventLogs(300);
      setLogs(response.data.logs || []);
    } catch (error: unknown) {
      const apiError = error as { response?: { data?: { error?: string } }; message?: string };
      toast({
        variant: "destructive",
        title: "Falha ao carregar logs",
        description: apiError.response?.data?.error || apiError.message || "Falha inesperada ao carregar logs.",
      });
    } finally {
      setLoading(false);
    }
  }, [canAccess, toast]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const totals = useMemo(() => {
    const todayKey = getDateKey(new Date().toISOString());

    return {
      total: logs.length,
      today: logs.filter((log) => {
        const dateKey = getDateKey(log.created_at);
        return Boolean(todayKey && dateKey && dateKey === todayKey);
      }).length,
    };
  }, [logs]);

  if (!canAccess) {
    return null;
  }

  return (
    <DashboardLayout activeTab="logs">
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Card className="border-white/60 bg-white/80">
            <CardHeader className="pb-2">
              <CardDescription>Total de registros</CardDescription>
              <CardTitle className="text-3xl">{totals.total}</CardTitle>
            </CardHeader>
          </Card>
          <Card className="border-white/60 bg-white/80">
            <CardHeader className="pb-2">
              <CardDescription>Registros de hoje</CardDescription>
              <CardTitle className="text-3xl">{totals.today}</CardTitle>
            </CardHeader>
          </Card>
        </div>

        <Card className="border-white/60 bg-white/85">
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <CardTitle className="text-2xl">Logs de auditoria de eventos</CardTitle>
                <CardDescription>
                  Histórico de criação, alteração, aprovação, rejeição e exclusão de eventos.
                </CardDescription>
              </div>
              <Button variant="outline" onClick={fetchLogs} disabled={loading}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Atualizar
              </Button>
            </div>
          </CardHeader>

          <CardContent>
            {loading && <div className="py-8 text-center text-muted-foreground">Carregando logs...</div>}

            {!loading && logs.length === 0 && (
              <div className="py-12 text-center text-muted-foreground">
                <ScrollText className="h-14 w-14 mx-auto mb-3" />
                Nenhum log encontrado.
              </div>
            )}

            {!loading && logs.length > 0 && (
              <div className="space-y-3">
                {logs.map((log) => (
                  <article key={log.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div className="space-y-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge className={getActionBadgeClass(log.action)}>
                            {actionLabelMap[log.action] || log.action}
                          </Badge>
                          <span className="text-xs text-muted-foreground">#{log.id}</span>
                        </div>

                        <p className="text-sm text-slate-700">
                          <strong className="text-slate-900">Evento:</strong>{" "}
                          {log.event_title || "(sem título)"}{" "}
                          {log.event_id ? <span className="text-xs text-muted-foreground">(ID {log.event_id})</span> : null}
                        </p>

                        <p className="text-sm text-slate-700">
                          <strong className="text-slate-900">Ator:</strong>{" "}
                          {log.actor_name || log.actor_email}{" "}
                          <span className="text-xs text-muted-foreground">({log.actor_email})</span>
                        </p>

                        {log.details && (
                          <p className="text-sm text-slate-700">
                            <strong className="text-slate-900">Detalhes:</strong> {log.details}
                          </p>
                        )}
                      </div>

                      <div className="text-xs text-muted-foreground whitespace-nowrap">
                        {formatLogDateTime(log.created_at)}
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
          <p className="flex items-center gap-2 font-medium">
            <ShieldAlert className="h-4 w-4" />
            Transparência operacional
          </p>
          <p className="mt-1">
            Cada ação de evento registra automaticamente ator, horário e contexto para rastreabilidade administrativa.
          </p>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default AdminLogs;
