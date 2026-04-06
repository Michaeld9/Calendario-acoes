import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { eventsApi } from "@/integrations/api";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";

const eventTypes = [
  "Evento",
  "Ação Pontual",
  "Projeto Institucional",
  "Projeto Pedagógico",
  "Expedição Pedagógica",
  "Formação",
  "Festa",
] as const;

const formSchema = z
  .object({
    title: z.string().trim().min(3, "O título deve ter no mínimo 3 caracteres."),
    event_type: z.enum(eventTypes, {
      required_error: "Selecione um tipo de evento.",
    }),
    start_date: z.string().min(1, "Data de início é obrigatória."),
    end_date: z.string().min(1, "Data de fim é obrigatória."),
    all_day: z.boolean().default(false),
    start_time: z.string().optional(),
    end_time: z.string().optional(),
    involved_emails: z.string().max(3000, "A lista de e-mails deve ter no maximo 3000 caracteres.").optional(),
    description: z.string().max(1000, "A descrição deve ter no máximo 1000 caracteres.").optional(),
  })
  .refine(
    (values) => {
      const startDate = new Date(values.start_date);
      const endDate = new Date(values.end_date);
      return endDate >= startDate;
    },
    {
      message: "A data de fim deve ser maior ou igual à data de início.",
      path: ["end_date"],
    },
  )
  .superRefine((values, context) => {
    if (values.all_day) return;

    if (!values.start_time) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Informe o horário de início.",
        path: ["start_time"],
      });
    }

    if (!values.end_time) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Informe o horário de fim.",
        path: ["end_time"],
      });
    }

    if (
      values.start_time &&
      values.end_time &&
      values.start_date === values.end_date &&
      values.end_time <= values.start_time
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "No mesmo dia, o horário de fim deve ser maior que o de início.",
        path: ["end_time"],
      });
    }
  });

type FormValues = z.infer<typeof formSchema>;

interface EventFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  event?: {
    id: number;
    title: string;
    event_type: (typeof eventTypes)[number];
    start_date: string;
    end_date: string;
    all_day: boolean;
    start_time: string | null;
    end_time: string | null;
    involved_emails: string | null;
    description: string | null;
  } | null;
  directPublish: boolean;
  onSuccess: () => void;
}

const EventFormDialog = ({ open, onOpenChange, event, directPublish, onSuccess }: EventFormDialogProps) => {
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const isEditing = useMemo(() => Boolean(event), [event]);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: "",
      event_type: undefined,
      start_date: "",
      end_date: "",
      all_day: false,
      start_time: "",
      end_time: "",
      involved_emails: "",
      description: "",
    },
  });

  useEffect(() => {
    if (event) {
      form.reset({
        title: event.title,
        event_type: event.event_type,
        start_date: event.start_date,
        end_date: event.end_date,
        all_day: event.all_day,
        start_time: event.start_time || "",
        end_time: event.end_time || "",
        involved_emails: event.involved_emails || "",
        description: event.description || "",
      });
    } else {
      form.reset({
        title: "",
        event_type: undefined,
        start_date: "",
        end_date: "",
        all_day: false,
        start_time: "",
        end_time: "",
        involved_emails: "",
        description: "",
      });
    }
  }, [event, form, open]);

  const allDay = form.watch("all_day");

  const onSubmit = async (values: FormValues) => {
    setSubmitting(true);

    try {
      const eventData = {
        title: values.title.trim(),
        event_type: values.event_type,
        start_date: values.start_date,
        end_date: values.end_date,
        all_day: values.all_day,
        start_time: values.all_day ? null : values.start_time || null,
        end_time: values.all_day ? null : values.end_time || null,
        involved_emails: values.involved_emails?.trim() || null,
        description: values.description?.trim() || null,
      };

      if (event) {
        await eventsApi.updateEvent(event.id, eventData);
        toast({
          title: "Evento atualizado",
          description: directPublish
            ? "Alterações sincronizadas com o Google Calendar."
            : "As alterações foram salvas com sucesso.",
        });
      } else {
        await eventsApi.createEvent(eventData);
        toast({
          title: directPublish ? "Evento publicado" : "Evento criado",
          description: directPublish
            ? "Evento enviado diretamente para o Google Calendar."
            : "O evento foi enviado para aprovação.",
        });
      }

      onSuccess();
    } catch (error: unknown) {
      const apiError = error as { response?: { data?: { error?: string } }; message?: string };
      toast({
        variant: "destructive",
        title: "Erro ao salvar evento",
        description: apiError.response?.data?.error || apiError.message || "Falha inesperada ao salvar.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const submitLabel = isEditing
    ? directPublish
      ? "Salvar e sincronizar"
      : "Salvar alterações"
    : directPublish
      ? "Publicar no Google Calendar"
      : "Criar evento";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto border-slate-200/80">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Editar evento" : "Criar novo evento"}</DialogTitle>
          <DialogDescription>
            {directPublish
              ? "Como supervisor/admin, sua ação publica diretamente no Google Calendar."
              : "Como coordenação, o evento ficará pendente até aprovação."}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Título *</FormLabel>
                  <FormControl>
                    <Input placeholder="Nome do evento" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="event_type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tipo de evento *</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione o tipo" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {eventTypes.map((type) => (
                        <SelectItem key={type} value={type}>
                          {type}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="start_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Data de início *</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="end_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Data de fim *</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="all_day"
              render={({ field }) => (
                <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-3">
                  <FormControl>
                    <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                  <div className="space-y-1 leading-none">
                    <FormLabel>Evento de dia inteiro</FormLabel>
                    <FormDescription>Marque se o evento não tiver horários específicos.</FormDescription>
                  </div>
                </FormItem>
              )}
            />

            {!allDay && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="start_time"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Horário de início *</FormLabel>
                      <FormControl>
                        <Input type="time" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="end_time"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Horário de fim *</FormLabel>
                      <FormControl>
                        <Input type="time" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            )}

            <FormField
              control={form.control}
              name="involved_emails"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Setores envolvidos (e-mail)</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="email1@dominio.com, email2@dominio.com"
                      className="min-h-[80px]"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>Opcional. Separe e-mails por virgula, ponto e virgula ou quebra de linha.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Descrição</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Informações adicionais sobre o evento"
                      className="min-h-[100px]"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-3">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
                Cancelar
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? "Salvando..." : submitLabel}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export default EventFormDialog;
