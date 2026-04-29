import { useCallback, useEffect, useMemo, useState } from "react";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  isToday,
  parseISO,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarDays, ChevronLeft, ChevronRight, Edit, ExternalLink, Plus, RefreshCw, Trash2 } from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import EventFormDialog from "@/components/EventFormDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getEventTypeBadgeClass, getEventTypeDayChipClass } from "@/lib/eventTypeColors";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { eventsApi } from "@/integrations/api";

type UserRole = "admin" | "supervisor" | "coordenador" | "aguardando";

interface MirroredEvent {
  google_event_id: string;
  title: string;
  event_type: string | null;
  description: string | null;
  start_date: string;
  end_date: string;
  start_time: string | null;
  end_time: string | null;
  all_day: boolean;
  status: string;
  html_link: string | null;
  updated_at: string | null;
  local_event_id: number | null;
  local_event_status: "pending" | "approved" | "rejected" | null;
}

interface EditableEvent {
  id: number;
  title: string;
  event_type: "Evento" | "Ação Pontual" | "Projeto Institucional" | "Projeto Pedagógico" | "Expedição Pedagógica" | "Formação" | "Festa";
  start_date: string;
  end_date: string;
  all_day: boolean;
  start_time: string | null;
  end_time: string | null;
  involved_emails: string | null;
  description: string | null;
}

const weekdayLabels = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"];

const toDateKey = (value: Date): string => format(value, "yyyy-MM-dd");

const CalendarView = () => {
  const { toast } = useToast();
  const [events, setEvents] = useState<MirroredEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [selectedDate, setSelectedDate] = useState("");
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [showEventDialog, setShowEventDialog] = useState(false);
  const [editingEvent, setEditingEvent] = useState<EditableEvent | null>(null);
  const [userRole, setUserRole] = useState<UserRole | null>(null);

  const canManageGoogle = userRole === "admin" || userRole === "supervisor";

  useEffect(() => {
    const today = new Date();
    const currentYear = today.getFullYear();
    const start = new Date(currentYear, 0, 1);
    const end = new Date(currentYear, 11, 31);
    const startKey = format(start, "yyyy-MM-dd");
    const endKey = format(end, "yyyy-MM-dd");
    const todayKey = format(today, "yyyy-MM-dd");

    setFromDate(startKey);
    setToDate(endKey);
    setSelectedDate(todayKey);
    setCurrentMonth(startOfMonth(today));

    const userRaw = localStorage.getItem("user");
    if (userRaw) {
      try {
        const parsed = JSON.parse(userRaw) as { role?: UserRole };
        setUserRole(parsed.role || null);
      } catch {
        setUserRole(null);
      }
    }
  }, []);

  const fetchMirror = useCallback(async () => {
    if (!fromDate || !toDate) {
      return;
    }

    setLoading(true);
    try {
      const response = await eventsApi.getMirrorEvents({ from: fromDate, to: toDate });
      setEvents(response.data.events || []);
    } catch (error: unknown) {
      const apiError = error as { response?: { data?: { error?: string } }; message?: string };
      toast({
        variant: "destructive",
        title: "Erro ao espelhar agenda Google",
        description: apiError.response?.data?.error || apiError.message || "Falha inesperada ao carregar agenda.",
      });
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate, toast]);

  useEffect(() => {
    fetchMirror();
  }, [fetchMirror]);

  useEffect(() => {
    if (!fromDate) {
      return;
    }

    if (!selectedDate) {
      setSelectedDate(fromDate);
      return;
    }

    if (selectedDate < fromDate || (toDate && selectedDate > toDate)) {
      setSelectedDate(fromDate);
    }
  }, [fromDate, toDate, selectedDate]);

  const sortedEvents = useMemo(() => {
    return [...events].sort((a, b) => {
      const aStamp = `${a.start_date}T${a.start_time || "00:00"}:00`;
      const bStamp = `${b.start_date}T${b.start_time || "00:00"}:00`;
      return new Date(aStamp).getTime() - new Date(bStamp).getTime();
    });
  }, [events]);

  const getEventsForDay = useCallback(
    (dateKey: string) => sortedEvents.filter((event) => dateKey >= event.start_date && dateKey <= event.end_date),
    [sortedEvents],
  );

  const monthStart = useMemo(() => startOfMonth(currentMonth), [currentMonth]);
  const gridStart = useMemo(() => startOfWeek(monthStart, { weekStartsOn: 0 }), [monthStart]);
  const gridEnd = useMemo(() => endOfWeek(endOfMonth(monthStart), { weekStartsOn: 0 }), [monthStart]);
  const gridDays = useMemo(() => eachDayOfInterval({ start: gridStart, end: gridEnd }), [gridStart, gridEnd]);

  const selectedDayEvents = useMemo(() => {
    if (!selectedDate) {
      return [];
    }
    return getEventsForDay(selectedDate);
  }, [getEventsForDay, selectedDate]);

  const handleDelete = async (event: MirroredEvent) => {
    if (!event.local_event_id) {
      toast({
        variant: "destructive",
        title: "Evento externo ao fluxo interno",
        description: "Este evento veio direto do Google e não está vinculado a um registro interno para exclusão.",
      });
      return;
    }

    const confirmDelete = window.confirm("Deseja excluir este evento da agenda Google?");
    if (!confirmDelete) return;

    try {
      await eventsApi.deleteEvent(event.local_event_id);
      toast({
        title: "Evento excluído",
        description: "Evento removido do sistema e do Google Calendar.",
      });
      fetchMirror();
    } catch (error: unknown) {
      const apiError = error as { response?: { data?: { error?: string } }; message?: string };
      toast({
        variant: "destructive",
        title: "Falha ao excluir evento",
        description: apiError.response?.data?.error || apiError.message || "Falha inesperada ao excluir evento.",
      });
    }
  };

  const handleEdit = async (event: MirroredEvent) => {
    if (!event.local_event_id) {
      toast({
        variant: "destructive",
        title: "Evento externo ao fluxo interno",
        description: "Edite este evento diretamente no Google Calendar e depois atualize o espelho.",
      });
      return;
    }

    try {
      const response = await eventsApi.getEvent(event.local_event_id);
      const localEvent = response.data.event;

      setEditingEvent({
        id: localEvent.id,
        title: localEvent.title,
        event_type: localEvent.event_type as EditableEvent["event_type"],
        start_date: localEvent.start_date,
        end_date: localEvent.end_date,
        all_day: localEvent.all_day,
        start_time: localEvent.start_time,
        end_time: localEvent.end_time,
        involved_emails: localEvent.involved_emails,
        description: localEvent.description,
      });
      setShowEventDialog(true);
    } catch (error: unknown) {
      const apiError = error as { response?: { data?: { error?: string } }; message?: string };
      toast({
        variant: "destructive",
        title: "Falha ao carregar evento",
        description: apiError.response?.data?.error || apiError.message || "Não foi possível abrir o evento para edição.",
      });
    }
  };

  const selectedDateLabel = selectedDate
    ? format(parseISO(selectedDate), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })
    : "";

  return (
    <DashboardLayout activeTab="mirror">
      <Card className="border-white/60 bg-white/85">
        <CardHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
              <div>
                <CardTitle className="text-2xl">Agenda Google espelhada</CardTitle>
                <CardDescription>
                  Espelho visual do calendário Google com datas e eventos em grade mensal.
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={fetchMirror} disabled={loading}>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Atualizar espelho
                </Button>
                {canManageGoogle && (
                  <Button
                    onClick={() => {
                      setEditingEvent(null);
                      setShowEventDialog(true);
                    }}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Novo evento direto
                  </Button>
                )}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white/90 p-3">
              <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] md:items-end">
                <div className="space-y-1">
                  <Label htmlFor="mirror_from_date">Data inicial</Label>
                  <Input
                    id="mirror_from_date"
                    type="date"
                    value={fromDate}
                    onChange={(event) => setFromDate(event.target.value)}
                    max={toDate || undefined}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="mirror_to_date">Data final</Label>
                  <Input
                    id="mirror_to_date"
                    type="date"
                    value={toDate}
                    onChange={(event) => setToDate(event.target.value)}
                    min={fromDate || undefined}
                  />
                </div>
                <div className="flex items-end">
                  <Button className="w-full md:w-auto" variant="outline" onClick={fetchMirror} disabled={loading || !fromDate || !toDate}>
                    Aplicar intervalo
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {loading && <div className="py-8 text-center text-muted-foreground">Carregando agenda espelhada...</div>}

          {!loading && sortedEvents.length === 0 && (
            <div className="py-12 text-center">
              <CalendarDays className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
              <p className="text-muted-foreground">Nenhum evento encontrado no intervalo informado.</p>
            </div>
          )}

          {!loading && sortedEvents.length > 0 && (
            <>
              <div className="rounded-xl border border-slate-200 bg-white p-3">
                <div className="mb-3 flex items-center justify-between">
                  <Button variant="outline" size="icon" onClick={() => setCurrentMonth((current) => subMonths(current, 1))}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <div className="text-sm sm:text-base font-semibold capitalize">
                    {format(currentMonth, "MMMM yyyy", { locale: ptBR })}
                  </div>
                  <Button variant="outline" size="icon" onClick={() => setCurrentMonth((current) => addMonths(current, 1))}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>

                <div className="grid grid-cols-7 gap-2">
                  {weekdayLabels.map((weekday) => (
                    <div
                      key={weekday}
                      className="rounded-md bg-slate-100 py-1 text-center text-[11px] font-semibold uppercase tracking-wide text-slate-600"
                    >
                      {weekday}
                    </div>
                  ))}
                </div>

                <div className="mt-2 grid grid-cols-7 gap-2">
                  {gridDays.map((day) => {
                    const dateKey = toDateKey(day);
                    const isOutsideMonth = !isSameMonth(day, currentMonth);
                    const isSelected = dateKey === selectedDate;
                    const dayEvents = getEventsForDay(dateKey);

                    return (
                      <button
                        key={dateKey}
                        type="button"
                        onClick={() => setSelectedDate(dateKey)}
                        className={cn(
                          "min-h-[96px] rounded-lg border p-2 text-left transition",
                          isSelected ? "border-primary bg-primary/5 shadow-sm" : "border-slate-200 hover:bg-slate-50",
                          isOutsideMonth && "opacity-45",
                        )}
                      >
                        <div className="mb-1 flex items-center justify-between">
                          <span
                            className={cn(
                              "text-xs font-semibold",
                              isToday(day) ? "text-primary" : "text-slate-700",
                            )}
                          >
                            {format(day, "d")}
                          </span>
                          {dayEvents.length > 0 && (
                            <span className="rounded-full bg-slate-900 px-1.5 py-0.5 text-[10px] text-white">
                              {dayEvents.length}
                            </span>
                          )}
                        </div>

                        <div className="space-y-1">
                          {dayEvents.slice(0, 2).map((event) => (
                            <div
                              key={`${dateKey}-${event.google_event_id}`}
                              className={cn(
                                "truncate rounded px-1.5 py-0.5 text-[10px] font-medium",
                                getEventTypeDayChipClass(event.event_type),
                              )}
                              title={event.title}
                            >
                              {event.title}
                            </div>
                          ))}
                          {dayEvents.length > 2 && (
                            <div className="text-[10px] text-slate-500">+{dayEvents.length - 2} mais</div>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <h3 className="text-base font-semibold text-slate-900">
                  Eventos em {selectedDateLabel || "-"}
                </h3>
                <p className="mb-3 text-xs text-muted-foreground">
                  A cor do evento representa o tipo. Eventos sem tipo interno usam a cor padrao (ciano).
                </p>

                {selectedDayEvents.length === 0 && (
                  <p className="py-4 text-sm text-muted-foreground">Nenhum evento nesta data.</p>
                )}

                {selectedDayEvents.length > 0 && (
                  <div className="space-y-3">
                    {selectedDayEvents.map((event) => (
                      <article key={event.google_event_id} className="rounded-xl border border-slate-200 p-3">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                          <div className="min-w-0 flex-1">
                            <div className="mb-1 flex flex-wrap items-center gap-2">
                              <h4 className="text-sm font-semibold text-slate-900">{event.title}</h4>
                              <Badge className={getEventTypeBadgeClass(event.event_type)}>
                                {event.event_type || "Sem tipo interno"}
                              </Badge>
                              <Badge variant="outline">{event.all_day ? "Dia inteiro" : "Com horário"}</Badge>
                              {event.local_event_id ? (
                                <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
                                  Vinculado
                                </Badge>
                              ) : (
                                <Badge className="bg-slate-100 text-slate-700 hover:bg-slate-100">
                                  Externo
                                </Badge>
                              )}
                            </div>

                            <p className="text-xs text-muted-foreground">
                              {event.start_date !== event.end_date
                                ? `${format(parseISO(event.start_date), "dd/MM/yyyy")} ate ${format(parseISO(event.end_date), "dd/MM/yyyy")}`
                                : format(parseISO(event.start_date), "dd/MM/yyyy")}
                              {!event.all_day && ` | ${event.start_time || "--:--"} - ${event.end_time || "--:--"}`}
                            </p>
                            {event.description && <p className="mt-1 text-xs text-slate-600">{event.description}</p>}
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            {event.html_link && (
                              <Button asChild variant="outline" size="sm">
                                <a href={event.html_link} target="_blank" rel="noreferrer">
                                  <ExternalLink className="mr-1 h-4 w-4" />
                                  Abrir no Google
                                </a>
                              </Button>
                            )}
                            {canManageGoogle && (
                              <>
                                <Button variant="outline" size="sm" onClick={() => handleEdit(event)}>
                                  <Edit className="mr-1 h-4 w-4" />
                                  Editar
                                </Button>
                                <Button variant="outline" size="sm" onClick={() => handleDelete(event)}>
                                  <Trash2 className="mr-1 h-4 w-4 text-destructive" />
                                  Excluir
                                </Button>
                              </>
                            )}
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <EventFormDialog
        open={showEventDialog}
        onOpenChange={setShowEventDialog}
        event={editingEvent}
        directPublish={Boolean(canManageGoogle)}
        onSuccess={() => {
          setShowEventDialog(false);
          setEditingEvent(null);
          fetchMirror();
        }}
      />
    </DashboardLayout>
  );
};

export default CalendarView;

