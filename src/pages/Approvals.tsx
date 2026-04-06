import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CheckCircle, Clock, RefreshCw, User, XCircle } from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { eventsApi } from "@/integrations/api";

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
  status: string;
  created_at: string;
  creator?: { full_name: string | null; email: string };
}

const Approvals = () => {
  const { toast } = useToast();
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<number | null>(null);

  const fetchPendingEvents = useCallback(async () => {
    setLoading(true);
    try {
      const response = await eventsApi.getPendingEvents();
      setEvents(response.data.events || []);
    } catch (error: unknown) {
      const apiError = error as { response?: { data?: { error?: string } }; message?: string };
      toast({
        variant: "destructive",
        title: "Falha ao carregar aprovações",
        description: apiError.response?.data?.error || apiError.message || "Falha inesperada ao carregar aprovações.",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchPendingEvents();
  }, [fetchPendingEvents]);

  const handleApprove = async (eventId: number) => {
    setProcessing(eventId);
    try {
      await eventsApi.approveEvent(eventId);
      toast({
        title: "Evento aprovado",
        description: "A solicitação foi aprovada e sincronizada com o Google Calendar.",
      });
      fetchPendingEvents();
    } catch (error: unknown) {
      const apiError = error as { response?: { data?: { error?: string } }; message?: string };
      toast({
        variant: "destructive",
        title: "Erro ao aprovar evento",
        description: apiError.response?.data?.error || apiError.message || "Falha inesperada ao aprovar evento.",
      });
    } finally {
      setProcessing(null);
    }
  };

  const handleReject = async (eventId: number) => {
    const confirmReject = window.confirm("Deseja rejeitar este evento?");
    if (!confirmReject) return;

    setProcessing(eventId);
    try {
      await eventsApi.rejectEvent(eventId);
      toast({
        title: "Evento rejeitado",
        description: "A solicitação foi marcada como rejeitada.",
      });
      fetchPendingEvents();
    } catch (error: unknown) {
      const apiError = error as { response?: { data?: { error?: string } }; message?: string };
      toast({
        variant: "destructive",
        title: "Erro ao rejeitar evento",
        description: apiError.response?.data?.error || apiError.message || "Falha inesperada ao rejeitar evento.",
      });
    } finally {
      setProcessing(null);
    }
  };

  return (
    <DashboardLayout activeTab="approvals">
      <Card className="border-white/60 bg-white/85">
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <CardTitle className="text-2xl">Aprovações pendentes</CardTitle>
              <CardDescription>Eventos da coordenação aguardando decisão da supervisão.</CardDescription>
            </div>
            <Button variant="outline" onClick={fetchPendingEvents} disabled={loading}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Atualizar
            </Button>
          </div>
        </CardHeader>

        <CardContent>
          {loading && <div className="py-8 text-center text-muted-foreground">Carregando eventos pendentes...</div>}

          {!loading && events.length === 0 && (
            <div className="py-12 text-center">
              <CheckCircle className="h-16 w-16 mx-auto mb-4 text-emerald-600" />
              <p className="text-muted-foreground">Não há eventos pendentes de aprovação.</p>
            </div>
          )}

          {!loading && events.length > 0 && (
            <div className="space-y-4">
              {events.map((event) => (
                <article
                  key={event.id}
                  className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm hover:shadow transition-shadow"
                >
                  <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        <h3 className="text-lg font-semibold">{event.title}</h3>
                        <Badge variant="outline" className="bg-amber-100 text-amber-800 hover:bg-amber-100">
                          <Clock className="h-3 w-3 mr-1" />
                          Pendente
                        </Badge>
                      </div>

                      <div className="mb-3 flex items-center gap-2 text-sm text-muted-foreground">
                        <User className="h-4 w-4" />
                        <span>
                          Solicitado por <strong>{event.creator?.full_name || event.creator?.email}</strong>
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                        <div>
                          <strong className="text-foreground">Tipo</strong>
                          <p className="text-muted-foreground">{event.event_type}</p>
                        </div>
                        <div>
                          <strong className="text-foreground">Período</strong>
                          <p className="text-muted-foreground">
                            {format(new Date(event.start_date), "dd/MM/yyyy", { locale: ptBR })}
                            {event.start_date !== event.end_date &&
                              ` até ${format(new Date(event.end_date), "dd/MM/yyyy", { locale: ptBR })}`}
                          </p>
                        </div>
                        {!event.all_day && event.start_time && (
                          <div className="sm:col-span-2">
                            <strong className="text-foreground">Horário</strong>
                            <p className="text-muted-foreground">
                              {event.start_time.slice(0, 5)} - {event.end_time?.slice(0, 5)}
                            </p>
                          </div>
                        )}
                        {event.description && (
                          <div className="sm:col-span-2">
                            <strong className="text-foreground">Descrição</strong>
                            <p className="text-muted-foreground">{event.description}</p>
                          </div>
                        )}
                        {event.involved_emails && (
                          <div className="sm:col-span-2">
                            <strong className="text-foreground">Setores envolvidos (e-mail)</strong>
                            <p className="text-muted-foreground">{event.involved_emails}</p>
                          </div>
                        )}
                        <div className="sm:col-span-2 text-xs text-muted-foreground">
                          Criado em{" "}
                          {format(new Date(event.created_at), "dd/MM/yyyy 'às' HH:mm", {
                            locale: ptBR,
                          })}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-row xl:flex-col gap-2">
                      <Button
                        onClick={() => handleApprove(event.id)}
                        disabled={processing === event.id}
                        className="bg-emerald-600 hover:bg-emerald-700"
                      >
                        <CheckCircle className="h-4 w-4 mr-2" />
                        {processing === event.id ? "Processando..." : "Aprovar"}
                      </Button>
                      <Button
                        variant="destructive"
                        onClick={() => handleReject(event.id)}
                        disabled={processing === event.id}
                      >
                        <XCircle className="h-4 w-4 mr-2" />
                        Rejeitar
                      </Button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </DashboardLayout>
  );
};

export default Approvals;
