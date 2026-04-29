import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw, ScrollText, ShieldAlert } from "lucide-react";
import { useNavigate } from "react-router-dom";
import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { logsApi } from "@/integrations/api";

type UserRole = "admin" | "supervisor" | "coordenador" | "aguardando";

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
  evento_excluido: "Evento excluido",
  evento_aprovado: "Evento aprovado",
  evento_rejeitado: "Evento rejeitado",
};

const actionOptions = Object.entries(actionLabelMap).map(([value, label]) => ({
  value,
  label,
}));

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
    return `${day}/${month}/${year} as ${hour}:${minute}:${second}`;
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

  return formatted.replace(",", " as");
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
  const [actionFilter, setActionFilter] = useState("all");
  const [fromDateFilter, setFromDateFilter] = useState("");
  const [toDateFilter, setToDateFilter] = useState("");

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
          title: "Sem permissao",
          description: "A aba de logs e exclusiva para administradores.",
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

    if (fromDateFilter && toDateFilter && fromDateFilter > toDateFilter) {
      setLoading(false);
      toast({
        variant: "destructive",
        title: "Periodo invalido",
        description: "A data inicial nao pode ser maior que a data final.",
      });
      return;
    }

    setLoading(true);
    try {
      const response = await logsApi.getEventLogs({
        limit: 300,
        action: actionFilter !== "all" ? actionFilter : undefined,
        fromDate: fromDateFilter || undefined,
        toDate: toDateFilter || undefined,
      });
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
  }, [actionFilter, canAccess, fromDateFilter, toDateFilter, toast]);

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

  const clearFilters = () => {
    setActionFilter("all");
    setFromDateFilter("");
    setToDateFilter("");
  };

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
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="text-2xl">Logs de auditoria de eventos</CardTitle>
                <CardDescription>
                  Historico de criacao, alteracao, aprovacao, rejeicao e exclusao de eventos.
                </CardDescription>
              </div>
              <Button variant="outline" onClick={fetchLogs} disabled={loading}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Atualizar
              </Button>
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            <div className="rounded-xl border border-slate-200 bg-white p-3">
              <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px_180px_auto] md:items-end">
                <div className="space-y-1">
                  <Label>Tipo de log</Label>
                  <Select value={actionFilter} onValueChange={setActionFilter}>
                    <SelectTrigger>
                      <SelectValue placeholder="Todos os tipos" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos os tipos</SelectItem>
                      {actionOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label htmlFor="logs_from_date">Data inicial</Label>
                  <Input
                    id="logs_from_date"
                    type="date"
                    value={fromDateFilter}
                    onChange={(event) => setFromDateFilter(event.target.value)}
                    max={toDateFilter || undefined}
                  />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="logs_to_date">Data final</Label>
                  <Input
                    id="logs_to_date"
                    type="date"
                    value={toDateFilter}
                    onChange={(event) => setToDateFilter(event.target.value)}
                    min={fromDateFilter || undefined}
                  />
                </div>

                <Button variant="ghost" onClick={clearFilters} disabled={loading}>
                  Limpar filtros
                </Button>
              </div>
            </div>

            {loading && <div className="py-8 text-center text-muted-foreground">Carregando logs...</div>}

            {!loading && logs.length === 0 && (
              <div className="py-12 text-center text-muted-foreground">
                <ScrollText className="mx-auto mb-3 h-14 w-14" />
                Nenhum log encontrado para os filtros selecionados.
              </div>
            )}

            {!loading && logs.length > 0 && (
              <div className="space-y-3">
                {logs.map((log) => (
                  <article key={log.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge className={getActionBadgeClass(log.action)}>{actionLabelMap[log.action] || log.action}</Badge>
                          <span className="text-xs text-muted-foreground">#{log.id}</span>
                        </div>

                        <p className="text-sm text-slate-700">
                          <strong className="text-slate-900">Evento:</strong>{" "}
                          {log.event_title || "(sem titulo)"}{" "}
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

                      <div className="whitespace-nowrap text-xs text-muted-foreground">{formatLogDateTime(log.created_at)}</div>
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
            Transparencia operacional
          </p>
          <p className="mt-1">
            Cada acao de evento registra automaticamente ator, horario e contexto para rastreabilidade administrativa.
          </p>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default AdminLogs;

