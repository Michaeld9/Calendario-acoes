import { useCallback, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Calendar, CheckCircle2, Clock, Edit, Plus, Trash2, User2, XCircle } from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import EventFormDialog from "@/components/EventFormDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { eventsApi } from "@/integrations/api";
import { getEventTypeBadgeClass } from "@/lib/eventTypeColors";

type EventStatus = "pending" | "approved" | "rejected";
type UserRole = "admin" | "supervisor" | "coordenador";

interface Event {
  id: number;
  title: string;
  description: string | null;
  involved_emails: string | null;
  start_date: string;
  end_date: string;
  start_time: string | null;
  end_time: string | null;
  all_day: boolean;
  event_type: string;
  status: EventStatus;
  created_by: number;
  creator?: { full_name: string | null; email: string };
}

interface StoredUser {
  id: number;
  role: UserRole;
}

const Dashboard = () => {
  const { toast } = useToast();
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [showEventDialog, setShowEventDialog] = useState(false);
  const [editingEvent, setEditingEvent] = useState<Event | null>(null);
  const [user, setUser] = useState<StoredUser | null>(null);

  const canDirectPublish = user?.role === "admin" || user?.role === "supervisor";

  useEffect(() => {
    const userRaw = localStorage.getItem("user");
    if (!userRaw) {
      return;
    }

    try {
      const parsed = JSON.parse(userRaw) as StoredUser;
      setUser(parsed);
    } catch {
      // ignore parse failure and keep null
    }
  }, []);

  const fetchEvents = useCallback(async () => {
    if (!user) {
      return;
    }

    setLoading(true);
    try {
      const response = canDirectPublish ? await eventsApi.getAllEvents() : await eventsApi.getMyEvents();
      setEvents(response.data.events || []);
    } catch (error: unknown) {
      const apiError = error as { response?: { data?: { error?: string } }; message?: string };
      toast({
        variant: "destructive",
        title: "Falha ao carregar eventos",
        description: apiError.response?.data?.error || apiError.message || "Falha inesperada ao carregar eventos.",
      });
    } finally {
      setLoading(false);
    }
  }, [canDirectPublish, toast, user]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  const handleDelete = async (eventId: number) => {
    const confirmDelete = window.confirm("Deseja excluir este evento?");
    if (!confirmDelete) return;

    try {
      await eventsApi.deleteEvent(eventId);
      setEvents((currentEvents) => currentEvents.filter((event) => event.id !== eventId));
      toast({
        title: "Evento excluído",
        description: "O evento foi removido com sucesso.",
      });
    } catch (error: unknown) {
      const apiError = error as { response?: { data?: { error?: string } }; message?: string };
      toast({
        variant: "destructive",
        title: "Erro ao excluir evento",
        description: apiError.response?.data?.error || apiError.message || "Falha inesperada ao excluir evento.",
      });
    }
  };

  const getStatusBadge = (status: EventStatus) => {
    const statusConfig = {
      pending: { label: "Pendente", icon: Clock, className: "bg-amber-100 text-amber-800 hover:bg-amber-100" },
      approved: { label: "Aprovado", icon: CheckCircle2, className: "bg-emerald-100 text-emerald-800 hover:bg-emerald-100" },
      rejected: { label: "Rejeitado", icon: XCircle, className: "bg-rose-100 text-rose-800 hover:bg-rose-100" },
    };

    const config = statusConfig[status];
    const Icon = config.icon;

    return (
      <Badge className={config.className}>
        <Icon className="h-3 w-3 mr-1" />
        {config.label}
      </Badge>
    );
  };

  const totals = useMemo(() => {
    return {
      total: events.length,
      pending: events.filter((event) => event.status === "pending").length,
      approved: events.filter((event) => event.status === "approved").length,
    };
  }, [events]);

  const canEditEvent = (event: Event): boolean => {
    if (!user) {
      return false;
    }

    if (canDirectPublish) {
      return true;
    }

    return event.created_by === user.id && event.status === "pending";
  };

  const canDeleteEvent = canEditEvent;

  return (
    <DashboardLayout activeTab="events">
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Card className="border-white/60 bg-white/80">
            <CardHeader className="pb-2">
              <CardDescription>Total de eventos</CardDescription>
              <CardTitle className="text-3xl">{totals.total}</CardTitle>
            </CardHeader>
          </Card>
          <Card className="border-white/60 bg-white/80">
            <CardHeader className="pb-2">
              <CardDescription>Pendentes</CardDescription>
              <CardTitle className="text-3xl text-amber-700">{totals.pending}</CardTitle>
            </CardHeader>
          </Card>
          <Card className="border-white/60 bg-white/80">
            <CardHeader className="pb-2">
              <CardDescription>Aprovados</CardDescription>
              <CardTitle className="text-3xl text-emerald-700">{totals.approved}</CardTitle>
            </CardHeader>
          </Card>
        </div>

        <Card className="border-white/60 bg-white/85">
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <CardTitle className="text-2xl">
                  {canDirectPublish ? "Gestão de eventos" : "Meus eventos"}
                </CardTitle>
                <CardDescription>
                  {canDirectPublish
                    ? "Você pode criar, editar e excluir eventos com publicação direta no Google Calendar."
                    : "Crie e acompanhe solicitações que aguardam aprovação da supervisão."}
                </CardDescription>
              </div>
              <Button
                onClick={() => {
                  setEditingEvent(null);
                  setShowEventDialog(true);
                }}
              >
                <Plus className="h-4 w-4 mr-2" />
                {canDirectPublish ? "Publicar evento" : "Novo evento"}
              </Button>
            </div>
          </CardHeader>

          <CardContent>
            {loading && <div className="py-8 text-center text-muted-foreground">Carregando eventos...</div>}

            {!loading && events.length === 0 && (
              <div className="py-12 text-center">
                <Calendar className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
                <p className="mb-4 text-muted-foreground">Nenhum evento encontrado.</p>
                <Button
                  onClick={() => {
                    setEditingEvent(null);
                    setShowEventDialog(true);
                  }}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Criar primeiro evento
                </Button>
              </div>
            )}

            {!loading && events.length > 0 && (
              <div className="space-y-4">
                {events.map((event) => (
                  <article
                    key={event.id}
                    className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm hover:shadow transition-shadow"
                  >
                    <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-2">
                          <h3 className="text-lg font-semibold text-slate-900">{event.title}</h3>
                          {getStatusBadge(event.status)}
                        </div>

                        {canDirectPublish && event.creator && (
                          <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-700">
                            <User2 className="h-3.5 w-3.5" />
                            {event.creator.full_name || event.creator.email}
                          </div>
                        )}

                        <div className="space-y-1 text-sm text-muted-foreground">
                          <div className="flex flex-wrap items-center gap-2">
                            <strong className="text-foreground">Tipo:</strong>
                            <Badge className={getEventTypeBadgeClass(event.event_type)}>
                              {event.event_type || "Nao informado"}
                            </Badge>
                          </div>
                          <p>
                            <strong className="text-foreground">Data:</strong>{" "}
                            {format(new Date(event.start_date), "dd/MM/yyyy", { locale: ptBR })}
                            {event.start_date !== event.end_date &&
                              ` até ${format(new Date(event.end_date), "dd/MM/yyyy", { locale: ptBR })}`}
                          </p>
                          {!event.all_day && event.start_time && (
                            <p>
                              <strong className="text-foreground">Horário:</strong>{" "}
                              {event.start_time.slice(0, 5)} - {event.end_time?.slice(0, 5)}
                            </p>
                          )}
                          {event.description && (
                            <p className="pt-1">
                              <strong className="text-foreground">Descrição:</strong> {event.description}
                            </p>
                          )}
                          {event.involved_emails && (
                            <p className="pt-1">
                              <strong className="text-foreground">Setores envolvidos (e-mail):</strong> {event.involved_emails}
                            </p>
                          )}
                        </div>
                      </div>

                      {(canEditEvent(event) || canDeleteEvent(event)) && (
                        <div className="flex gap-2">
                          {canEditEvent(event) && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setEditingEvent(event);
                                setShowEventDialog(true);
                              }}
                            >
                              <Edit className="h-4 w-4 mr-1" />
                              Editar
                            </Button>
                          )}
                          {canDeleteEvent(event) && (
                            <Button variant="outline" size="sm" onClick={() => handleDelete(event.id)}>
                              <Trash2 className="h-4 w-4 mr-1 text-destructive" />
                              Excluir
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <EventFormDialog
        open={showEventDialog}
        onOpenChange={setShowEventDialog}
        event={
          editingEvent
            ? {
                id: editingEvent.id,
                title: editingEvent.title,
                event_type: editingEvent.event_type as
                  | "Evento"
                  | "Ação Pontual"
                  | "Projeto Institucional"
                  | "Projeto Pedagógico"
                  | "Expedição Pedagógica"
                  | "Formação"
                  | "Festa",
                start_date: editingEvent.start_date,
                end_date: editingEvent.end_date,
                all_day: editingEvent.all_day,
                start_time: editingEvent.start_time,
                end_time: editingEvent.end_time,
                involved_emails: editingEvent.involved_emails,
                description: editingEvent.description,
              }
            : null
        }
        directPublish={Boolean(canDirectPublish)}
        onSuccess={() => {
          fetchEvents();
          setShowEventDialog(false);
          setEditingEvent(null);
        }}
      />
    </DashboardLayout>
  );
};

export default Dashboard;
