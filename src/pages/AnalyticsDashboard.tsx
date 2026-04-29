import { useCallback, useEffect, useMemo, useState } from "react";
import { subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import { format } from "date-fns";
import { BarChart3, CalendarDays, RefreshCw } from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useIsMobile } from "@/hooks/use-mobile";
import { useToast } from "@/hooks/use-toast";
import { eventsApi } from "@/integrations/api";
import { getEventTypeBadgeClass } from "@/lib/eventTypeColors";

type EventStatus = "pending" | "approved" | "rejected";

interface Event {
  id: number;
  title: string;
  start_date: string;
  event_type: string;
  status: EventStatus;
  created_by: number;
  creator?: {
    full_name: string | null;
    email: string;
  };
}

interface MonthCount {
  key: string;
  label: string;
  count: number;
}

interface TypeCount {
  label: string;
  count: number;
}

interface UserRankingCount {
  key: string;
  label: string;
  email: string | null;
  sent: number;
  approved: number;
}

const getCurrentMonthKey = (): string => {
  return format(new Date(), "yyyy-MM");
};

const getRollingMonthKeys = (months = 12): string[] => {
  const keys: string[] = [];
  const now = new Date();

  for (let index = months - 1; index >= 0; index -= 1) {
    keys.push(format(subMonths(now, index), "yyyy-MM"));
  }

  return keys;
};

const getYearMonthKeys = (year: number): string[] => {
  const keys: string[] = [];
  for (let month = 0; month < 12; month += 1) {
    keys.push(format(new Date(year, month, 1), "yyyy-MM"));
  }

  return keys;
};

const getMonthLabel = (monthKey: string): string => {
  const [year, month] = monthKey.split("-");
  const monthDate = new Date(Number(year), Number(month) - 1, 1);
  return format(monthDate, "MMM/yy", { locale: ptBR });
};

const getMonthTooltipLabel = (monthKey: string): string => {
  const monthDate = getMonthDateFromKey(monthKey);
  return format(monthDate, "MMMM/yyyy", { locale: ptBR });
};

const getMonthDateFromKey = (monthKey: string): Date => {
  const [year, month] = monthKey.split("-");
  return new Date(Number(year), Number(month) - 1, 1);
};

const normalizeMonthToken = (value: string): string => {
  return value.replace(".", "");
};

const getMonthAxisLabel = (monthKey: string, isMobile: boolean, barCount: number): string => {
  const monthDate = getMonthDateFromKey(monthKey);

  if (isMobile || barCount >= 18) {
    return normalizeMonthToken(format(monthDate, "MMM", { locale: ptBR }));
  }

  if (barCount >= 10) {
    return normalizeMonthToken(format(monthDate, "MMM/yy", { locale: ptBR }));
  }

  return normalizeMonthToken(format(monthDate, "MMMM/yy", { locale: ptBR }));
};

const getYAxisConfig = (maxValue: number, segments = 4, minMax = 4): { ticks: number[]; max: number } => {
  const safeMax = Math.max(minMax, maxValue);
  const step = Math.max(1, Math.ceil(safeMax / segments));
  const axisMax = step * segments;
  const ticks: number[] = [];

  for (let index = segments; index >= 0; index -= 1) {
    ticks.push(index * step);
  }

  return { ticks, max: axisMax };
};

const AnalyticsDashboard = () => {
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [monthViewMode, setMonthViewMode] = useState<"rolling" | "year">("year");
  const [rollingMonths, setRollingMonths] = useState<number>(12);
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [typeFilterMode, setTypeFilterMode] = useState<"total" | "year" | "month">("year");
  const [selectedTypeYear, setSelectedTypeYear] = useState<number>(new Date().getFullYear());
  const [selectedTypeMonthKey, setSelectedTypeMonthKey] = useState<string>(getCurrentMonthKey());

  const fetchAnalyticsEvents = useCallback(async () => {
    setLoading(true);

    try {
      const response = await eventsApi.getAllEvents();
      setEvents(response.data.events || []);
    } catch (error: unknown) {
      const apiError = error as { response?: { data?: { error?: string } }; message?: string };
      toast({
        variant: "destructive",
        title: "Falha ao carregar dashboard",
        description: apiError.response?.data?.error || apiError.message || "Nao foi possivel buscar os indicadores.",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchAnalyticsEvents();
  }, [fetchAnalyticsEvents]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      fetchAnalyticsEvents();
    }, 30000);

    return () => window.clearInterval(intervalId);
  }, [fetchAnalyticsEvents]);

  const totalByStatus = useMemo(() => {
    return {
      total: events.length,
      approved: events.filter((event) => event.status === "approved").length,
      pending: events.filter((event) => event.status === "pending").length,
      rejected: events.filter((event) => event.status === "rejected").length,
    };
  }, [events]);

  const availableYears = useMemo<number[]>(() => {
    const years = new Set<number>([new Date().getFullYear()]);

    for (const event of events) {
      const year = Number(String(event.start_date || "").slice(0, 4));
      if (Number.isInteger(year) && year > 0) {
        years.add(year);
      }
    }

    return Array.from(years).sort((a, b) => b - a);
  }, [events]);

  const monthKeys = useMemo(() => {
    if (monthViewMode === "year") {
      return getYearMonthKeys(selectedYear);
    }

    return getRollingMonthKeys(rollingMonths);
  }, [monthViewMode, rollingMonths, selectedYear]);

  const availableMonthKeys = useMemo(() => {
    const keys = new Set<string>();

    for (const event of events) {
      const monthKey = String(event.start_date || "").slice(0, 7);
      if (/^\d{4}-\d{2}$/.test(monthKey)) {
        keys.add(monthKey);
      }
    }

    return Array.from(keys).sort((a, b) => (a > b ? -1 : 1));
  }, [events]);

  useEffect(() => {
    if (!availableYears.length) {
      return;
    }

    if (!availableYears.includes(selectedYear)) {
      setSelectedYear(availableYears[0]);
    }

    if (!availableYears.includes(selectedTypeYear)) {
      setSelectedTypeYear(availableYears[0]);
    }
  }, [availableYears, selectedYear, selectedTypeYear]);

  useEffect(() => {
    if (!availableMonthKeys.length) {
      return;
    }

    if (!availableMonthKeys.includes(selectedTypeMonthKey)) {
      setSelectedTypeMonthKey(availableMonthKeys[0]);
    }
  }, [availableMonthKeys, selectedTypeMonthKey]);

  const eventsByMonth = useMemo<MonthCount[]>(() => {
    const counts = new Map<string, number>(monthKeys.map((key) => [key, 0]));

    for (const event of events) {
      const monthKey = String(event.start_date || "").slice(0, 7);
      if (!counts.has(monthKey)) {
        continue;
      }

      counts.set(monthKey, (counts.get(monthKey) || 0) + 1);
    }

    return monthKeys.map((key) => ({
      key,
      label: getMonthLabel(key),
      count: counts.get(key) || 0,
    }));
  }, [events, monthKeys]);

  const eventsForTypeChart = useMemo(() => {
    if (typeFilterMode === "total") {
      return events;
    }

    if (typeFilterMode === "year") {
      const prefix = `${selectedTypeYear}-`;
      return events.filter((event) => String(event.start_date || "").startsWith(prefix));
    }

    return events.filter((event) => String(event.start_date || "").slice(0, 7) === selectedTypeMonthKey);
  }, [events, typeFilterMode, selectedTypeYear, selectedTypeMonthKey]);

  const eventsByType = useMemo<TypeCount[]>(() => {
    const counts = new Map<string, number>();

    for (const event of eventsForTypeChart) {
      const typeLabel = String(event.event_type || "").trim() || "Nao informado";
      counts.set(typeLabel, (counts.get(typeLabel) || 0) + 1);
    }

    return Array.from(counts.entries())
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count);
  }, [eventsForTypeChart]);

  const eventsForUserRanking = useMemo(() => {
    const prefix = `${selectedYear}-`;
    return events.filter((event) => String(event.start_date || "").startsWith(prefix));
  }, [events, selectedYear]);

  const topUsersByEvents = useMemo<UserRankingCount[]>(() => {
    const counts = new Map<string, UserRankingCount>();

    for (const event of eventsForUserRanking) {
      const creatorEmail = String(event.creator?.email || "").trim().toLowerCase();
      const fallbackKey = Number.isInteger(event.created_by) ? `id:${event.created_by}` : "id:0";
      const key = creatorEmail || fallbackKey;
      const creatorName = String(event.creator?.full_name || "").trim();
      const label = creatorName || event.creator?.email || `Usuario #${event.created_by || 0}`;

      const current = counts.get(key) || {
        key,
        label,
        email: creatorEmail || null,
        sent: 0,
        approved: 0,
      };

      current.sent += 1;
      if (event.status === "approved") {
        current.approved += 1;
      }

      counts.set(key, current);
    }

    return Array.from(counts.values())
      .sort((a, b) => {
        if (b.sent !== a.sent) {
          return b.sent - a.sent;
        }
        if (b.approved !== a.approved) {
          return b.approved - a.approved;
        }
        return a.label.localeCompare(b.label, "pt-BR");
      })
      .slice(0, 5);
  }, [eventsForUserRanking]);

  const monthChartMax = useMemo(() => Math.max(0, ...eventsByMonth.map((item) => item.count)), [eventsByMonth]);
  const monthChartAxis = useMemo(() => getYAxisConfig(monthChartMax, 4, 4), [monthChartMax]);
  const monthLabelClassName = useMemo(() => {
    if (isMobile || eventsByMonth.length >= 18) {
      return "mt-2 origin-top-left -rotate-65 text-[9px] font-medium text-slate-700";
    }

    if (eventsByMonth.length >= 10) {
      return "mt-2 origin-top-left -rotate-50 text-[10px] font-medium text-slate-700";
    }

    return "mt-2 origin-top-left -rotate-35 text-[10px] font-medium text-slate-700";
  }, [eventsByMonth.length, isMobile]);
  const monthBarMaxWidthPx = useMemo(() => {
    if (isMobile || eventsByMonth.length >= 18) {
      return 20;
    }

    if (eventsByMonth.length >= 12) {
      return 28;
    }

    return 38;
  }, [eventsByMonth.length, isMobile]);
  const typeChartMax = useMemo(() => Math.max(1, ...eventsByType.map((item) => item.count)), [eventsByType]);
  const topUsersSentMax = useMemo(() => Math.max(1, ...topUsersByEvents.map((item) => item.sent)), [topUsersByEvents]);
  const selectedFilterLabel = useMemo(() => {
    if (typeFilterMode === "total") {
      return "Total geral";
    }

    if (typeFilterMode === "year") {
      return `Ano ${selectedTypeYear}`;
    }

    return getMonthLabel(selectedTypeMonthKey);
  }, [typeFilterMode, selectedTypeYear, selectedTypeMonthKey]);

  return (
    <DashboardLayout activeTab="analytics" hideSidebar>
      <div className="space-y-4">
        <Card className="border-white/60 bg-white/85">
          <CardHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="text-2xl">Dashboard de indicadores</CardTitle>
                <CardDescription>Visao analitica dos eventos cadastrados no sistema.</CardDescription>
              </div>
              <Button variant="outline" onClick={fetchAnalyticsEvents} disabled={loading}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Atualizar
              </Button>
            </div>
          </CardHeader>
        </Card>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="border-white/60 bg-white/80">
            <CardHeader className="pb-2">
              <CardDescription>Total de eventos</CardDescription>
              <CardTitle className="text-3xl">{totalByStatus.total}</CardTitle>
            </CardHeader>
          </Card>
          <Card className="border-white/60 bg-white/80">
            <CardHeader className="pb-2">
              <CardDescription>Aprovados</CardDescription>
              <CardTitle className="text-3xl text-emerald-700">{totalByStatus.approved}</CardTitle>
            </CardHeader>
          </Card>
          <Card className="border-white/60 bg-white/80">
            <CardHeader className="pb-2">
              <CardDescription>Pendentes</CardDescription>
              <CardTitle className="text-3xl text-amber-700">{totalByStatus.pending}</CardTitle>
            </CardHeader>
          </Card>
          <Card className="border-white/60 bg-white/80">
            <CardHeader className="pb-2">
              <CardDescription>Rejeitados</CardDescription>
              <CardTitle className="text-3xl text-rose-700">{totalByStatus.rejected}</CardTitle>
            </CardHeader>
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="border-white/60 bg-white/85">
            <CardHeader>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle className="text-lg">Quantidade de eventos por mes</CardTitle>
                  <CardDescription>Base em data de inicio. O grafico atualiza automaticamente ao atualizar os eventos.</CardDescription>
                </div>
                <div className="grid w-full gap-2 sm:w-[280px]">
                  <label className="text-xs font-medium text-slate-600">Periodo</label>
                  <select
                    value={monthViewMode}
                    onChange={(event) => setMonthViewMode(event.target.value as "rolling" | "year")}
                    className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-800"
                  >
                    <option value="rolling">Ultimos meses</option>
                    <option value="year">Ano especifico</option>
                  </select>

                  {monthViewMode === "rolling" ? (
                    <select
                      value={rollingMonths}
                      onChange={(event) => setRollingMonths(Number(event.target.value))}
                      className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-800"
                    >
                      <option value={3}>3 meses</option>
                      <option value={6}>6 meses</option>
                      <option value={9}>9 meses</option>
                      <option value={12}>12 meses</option>
                      <option value={18}>18 meses</option>
                      <option value={24}>24 meses</option>
                    </select>
                  ) : (
                    <select
                      value={selectedYear}
                      onChange={(event) => setSelectedYear(Number(event.target.value))}
                      className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-800"
                    >
                      {availableYears.map((year) => (
                        <option key={year} value={year}>
                          {year}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="py-8 text-center text-sm text-muted-foreground">Carregando dados...</div>
              ) : eventsByMonth.length === 0 ? (
                <div className="py-10 text-center text-sm text-muted-foreground">
                  <CalendarDays className="mx-auto mb-2 h-8 w-8" />
                  Nenhum dado encontrado para o periodo selecionado.
                </div>
              ) : (
                <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3">
                  <div className="grid grid-cols-[42px_1fr] gap-2">
                    <div className="relative h-[300px]">
                      {monthChartAxis.ticks.map((tickValue) => {
                        const top = 100 - (tickValue / monthChartAxis.max) * 100;
                        return (
                          <span
                            key={tickValue}
                            className="absolute -translate-y-1/2 text-[10px] font-medium text-slate-500"
                            style={{ top: `${top}%` }}
                          >
                            {tickValue}
                          </span>
                        );
                      })}
                    </div>

                    <div className="relative h-[300px] rounded-md border border-slate-200 bg-white/80 px-2 pb-11 pt-2">
                      {monthChartAxis.ticks.map((tickValue) => {
                        const top = 100 - (tickValue / monthChartAxis.max) * 100;
                        return (
                          <div
                            key={`grid-${tickValue}`}
                            className="absolute left-0 right-0 border-t border-dashed border-slate-200"
                            style={{ top: `${top}%` }}
                          />
                        );
                      })}

                      <div className="relative z-10 flex h-full items-end gap-2">
                        {eventsByMonth.map((item) => (
                          <div key={item.key} className="group relative flex min-w-0 flex-1 flex-col items-center justify-end">
                            <span className="mb-1 text-[10px] font-semibold text-slate-600">{item.count}</span>
                            <div className="flex h-[190px] w-full items-end justify-center">
                              <div
                                className="pointer-events-none absolute -top-11 left-1/2 z-20 -translate-x-1/2 rounded-md bg-slate-900 px-2 py-1 text-[10px] text-white opacity-0 shadow transition-all duration-200 group-hover:-translate-y-1 group-hover:opacity-100 group-focus-within:-translate-y-1 group-focus-within:opacity-100"
                              >
                                {getMonthTooltipLabel(item.key)}: {item.count} {item.count === 1 ? "evento" : "eventos"}
                              </div>
                              <div
                                tabIndex={0}
                                title={`${getMonthTooltipLabel(item.key)}: ${item.count} ${item.count === 1 ? "evento" : "eventos"}`}
                                className="w-full rounded-t-md bg-sky-500 transition-all duration-300 group-hover:bg-sky-600 group-hover:shadow-[0_0_0_2px_rgba(14,165,233,0.28)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/60"
                                style={{
                                  maxWidth: `${monthBarMaxWidthPx}px`,
                                  height: `${item.count === 0 ? 0 : Math.max(2, (item.count / monthChartAxis.max) * 100)}%`,
                                }}
                              />
                            </div>
                            <span className={monthLabelClassName}>
                              {getMonthAxisLabel(item.key, isMobile, eventsByMonth.length)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-white/60 bg-white/85">
            <CardHeader>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle className="text-lg">Quantidade de eventos por tipo</CardTitle>
                  <CardDescription>
                    Base atual: {selectedFilterLabel} ({eventsForTypeChart.length} eventos).
                  </CardDescription>
                </div>
                <div className="w-full sm:w-[220px]">
                  <label className="mb-1 block text-xs font-medium text-slate-600">Filtro por periodo</label>
                  <select
                    value={typeFilterMode}
                    onChange={(event) => setTypeFilterMode(event.target.value as "total" | "year" | "month")}
                    className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-800"
                  >
                    <option value="total">Total geral</option>
                    <option value="year">Por ano</option>
                    <option value="month">Por mes/ano</option>
                  </select>

                  {typeFilterMode === "year" && (
                    <select
                      value={selectedTypeYear}
                      onChange={(event) => setSelectedTypeYear(Number(event.target.value))}
                      className="mt-2 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-800"
                    >
                      {availableYears.map((year) => (
                        <option key={year} value={year}>
                          {year}
                        </option>
                      ))}
                    </select>
                  )}

                  {typeFilterMode === "month" && (
                    <select
                      value={selectedTypeMonthKey}
                      onChange={(event) => setSelectedTypeMonthKey(event.target.value)}
                      className="mt-2 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-800"
                    >
                      {availableMonthKeys.map((monthKey) => (
                        <option key={monthKey} value={monthKey}>
                          {getMonthLabel(monthKey)}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="py-8 text-center text-sm text-muted-foreground">Carregando dados...</div>
              ) : eventsByType.length === 0 ? (
                <div className="py-10 text-center text-sm text-muted-foreground">
                  <CalendarDays className="mx-auto mb-2 h-8 w-8" />
                  Nenhum evento encontrado.
                </div>
              ) : (
                <div className="space-y-3">
                  {eventsByType.map((item) => (
                    <div key={item.label} className="grid grid-cols-[minmax(120px,220px)_1fr_38px] items-center gap-3">
                      <Badge className={getEventTypeBadgeClass(item.label)}>{item.label}</Badge>
                      <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full bg-indigo-500 transition-all"
                          style={{ width: `${(item.count / typeChartMax) * 100}%` }}
                        />
                      </div>
                      <span className="text-right text-xs font-semibold text-slate-700">{item.count}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-white/60 bg-white/85">
            <CardHeader>
              <div className="flex flex-col gap-2">
                <CardTitle className="text-lg">Top 5 usuarios por eventos enviados/aprovados</CardTitle>
                <CardDescription>
                  Base atual: Ano {selectedYear} ({eventsForUserRanking.length} eventos).
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="py-8 text-center text-sm text-muted-foreground">Carregando dados...</div>
              ) : topUsersByEvents.length === 0 ? (
                <div className="py-10 text-center text-sm text-muted-foreground">
                  <CalendarDays className="mx-auto mb-2 h-8 w-8" />
                  Nenhum usuario com eventos no periodo selecionado.
                </div>
              ) : (
                <div className="space-y-3">
                  {topUsersByEvents.map((item) => {
                    const sentWidth = item.sent === 0 ? 0 : Math.max(4, (item.sent / topUsersSentMax) * 100);
                    const approvalRate = item.sent === 0 ? 0 : Math.round((item.approved / item.sent) * 100);

                    return (
                      <div key={item.key} className="rounded-xl border border-slate-200 bg-white p-3">
                        <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-slate-900">{item.label}</p>
                            {item.email && <p className="truncate text-xs text-muted-foreground">{item.email}</p>}
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="outline">Enviados: {item.sent}</Badge>
                            <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
                              Aprovados: {item.approved}
                            </Badge>
                          </div>
                        </div>

                        <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className="h-full rounded-full bg-sky-500 transition-all"
                            style={{ width: `${sentWidth}%` }}
                          />
                        </div>
                        <p className="mt-1 text-[11px] text-slate-500">Taxa de aprovacao: {approvalRate}%</p>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="border-white/60 bg-white/80">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Escopo de acesso</CardTitle>
            <CardDescription>
              Esta pagina e exclusiva para supervisao e administracao.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0 text-xs text-slate-600">
            <div className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
              <BarChart3 className="h-4 w-4" />
              Os dados usam os eventos retornados pela listagem completa de eventos.
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default AnalyticsDashboard;
