import { AuthUser, getUserById, loginGoogle, loginLocal, verifyToken } from "./auth";
import * as eventService from "./events";
import {
  createGoogleCalendarEvent,
  deleteGoogleCalendarEvent,
  listGoogleCalendarEvents,
  updateGoogleCalendarEvent,
  verifyGoogleIdToken,
} from "./google";
import { createEventAuditLog, listEventAuditLogs } from "./logs";
import { getGoogleCalendarSettings, updateGoogleCalendarId } from "./settings";
import {
  createLocalUser,
  deleteUserById,
  getManagedUserById,
  listUsers,
  type UserRole,
  updateLocalUserPassword,
  updateUserActive,
  updateUserRole,
} from "./users";

export interface Request {
  method: string;
  path: string;
  headers: Record<string, string>;
  query?: Record<string, string>;
  body?: unknown;
}

export interface Response {
  status: number;
  body: unknown;
  headers?: Record<string, string>;
}

const hasApprovalPermission = (user: AuthUser): boolean => {
  return user.role === "admin" || user.role === "supervisor";
};

const hasAdminPermission = (user: AuthUser): boolean => {
  return user.role === "admin";
};

const extractUserFromHeader = async (req: Request): Promise<AuthUser | null> => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }

  const token = authHeader.slice(7).trim();
  if (!token) {
    return null;
  }

  const tokenUser = verifyToken(token);
  if (!tokenUser) {
    return null;
  }

  return getUserById(tokenUser.id);
};

const parseBody = (body: unknown): Record<string, unknown> => {
  if (!body) {
    return {};
  }

  if (typeof body === "string") {
    try {
      return JSON.parse(body) as Record<string, unknown>;
    } catch {
      return {};
    }
  }

  if (typeof body === "object" && !Array.isArray(body)) {
    return body as Record<string, unknown>;
  }

  return {};
};

const parseEventId = (value: unknown): number | null => {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    return null;
  }

  return id;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EVENT_TYPE_VALUES = new Set([
  "Evento",
  "Ação Pontual",
  "Projeto Institucional",
  "Projeto Pedagógico",
  "Expedição Pedagógica",
  "Formação",
  "Festa",
]);
const TITLE_MAX_LENGTH = 255;
const DESCRIPTION_MAX_LENGTH = 4000;
const INVOLVED_EMAILS_MAX_LENGTH = 4000;

const normalizeEmail = (value: unknown): string => {
  return String(value || "").trim().toLowerCase();
};

const isValidEmail = (value: string): boolean => {
  return EMAIL_PATTERN.test(value);
};

const normalizeEventType = (value: unknown): string | null => {
  const raw = String(value || "").trim();
  if (!raw || !EVENT_TYPE_VALUES.has(raw)) {
    return null;
  }

  return raw;
};

const isStrongPassword = (value: string): boolean => {
  if (value.length < 12) {
    return false;
  }

  return /[A-Z]/.test(value) && /[a-z]/.test(value) && /\d/.test(value) && /[^A-Za-z0-9]/.test(value);
};

const normalizeDateString = (value: unknown): string | null => {
  const date = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return null;
  }

  return date;
};

const normalizeTimeString = (value: unknown): string | null => {
  const rawValue = String(value || "").trim();
  if (!rawValue) {
    return null;
  }

  const match = rawValue.match(/^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/);
  if (!match) {
    return null;
  }

  return `${match[1]}:${match[2]}${match[3] || ""}`;
};

const isValidDateRange = (startDate?: string, endDate?: string): boolean => {
  if (!startDate || !endDate) {
    return true;
  }

  const start = new Date(startDate);
  const end = new Date(endDate);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return false;
  }

  return end >= start;
};

const isValidTimeRange = (startDate: string, endDate: string, startTime: string | null, endTime: string | null): boolean => {
  if (!startTime || !endTime) {
    return false;
  }

  if (startDate !== endDate) {
    return true;
  }

  return endTime > startTime;
};

const getNowForMysql = (): string => {
  return new Date().toISOString().slice(0, 19).replace("T", " ");
};

const normalizeInvolvedEmails = (value: unknown): string | null => {
  if (value === undefined || value === null) {
    return null;
  }

  const normalized = String(value).trim();
  return normalized || null;
};

const parseAndValidateInvolvedEmails = (
  value: unknown,
): { normalized: string | null; invalidEmails: string[] } => {
  const raw = normalizeInvolvedEmails(value);
  if (!raw) {
    return { normalized: null, invalidEmails: [] };
  }

  if (raw.length > INVOLVED_EMAILS_MAX_LENGTH) {
    return { normalized: null, invalidEmails: ["campo muito longo"] };
  }

  const validEmails = new Set<string>();
  const invalidEmails: string[] = [];

  for (const token of raw.split(/[,\n;]+/)) {
    const trimmed = token.trim();
    if (!trimmed) {
      continue;
    }

    const normalizedEmail = trimmed.toLowerCase();
    if (!isValidEmail(normalizedEmail)) {
      invalidEmails.push(trimmed);
      continue;
    }

    validEmails.add(normalizedEmail);
  }

  return {
    normalized: validEmails.size ? Array.from(validEmails).join(", ") : null,
    invalidEmails,
  };
};

const parseRole = (value: unknown): UserRole | null => {
  const role = String(value || "").trim();
  if (role === "admin" || role === "supervisor" || role === "coordenador") {
    return role;
  }

  return null;
};

const parseBoolean = (value: unknown): boolean | null => {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    if (value.toLowerCase() === "true") {
      return true;
    }
    if (value.toLowerCase() === "false") {
      return false;
    }
  }

  return null;
};

const getDefaultMirrorRange = () => {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const to = new Date(now.getFullYear(), now.getMonth() + 7, 0);

  return {
    fromDate: from.toISOString().slice(0, 10),
    toDate: to.toISOString().slice(0, 10),
  };
};

const mapEventForGoogle = (event: eventService.Event) => ({
  title: event.title,
  description: event.description,
  involved_emails: event.involved_emails,
  event_type: event.event_type,
  start_date: event.start_date,
  end_date: event.end_date,
  start_time: event.start_time,
  end_time: event.end_time,
  all_day: event.all_day,
  local_event_id: event.id,
});

const registerEventAudit = async (
  user: AuthUser,
  action: string,
  event: { id?: number | null; title?: string | null } | null,
  details?: string | null,
): Promise<void> => {
  try {
    await createEventAuditLog({
      action,
      eventId: event?.id ?? null,
      eventTitle: event?.title ?? null,
      actorUserId: user.id,
      actorEmail: user.email,
      actorName: user.full_name,
      details: details || null,
    });
  } catch (error) {
    console.error("Audit log error:", error);
  }
};

const getGoogleCalendarErrorDetail = (error: Error): string | null => {
  if (error.message === "google_calendar_oauth_user_not_configured") {
    return "Modo oauth_user ativo, mas faltam GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET ou GOOGLE_CALENDAR_USER_REFRESH_TOKEN.";
  }

  if (error.message === "google_calendar_credentials_not_configured") {
    return "Credenciais de Service Account nao configuradas.";
  }

  if (error.message === "google_email_not_allowed") {
    return "Esta conta Google nao esta autorizada para acessar a plataforma.";
  }

  const prefix = "google_calendar_api_error:";
  if (!error.message.startsWith(prefix)) {
    return null;
  }

  const detail = error.message.slice(prefix.length).trim();
  if (!detail) {
    return null;
  }

  const lowerDetail = detail.toLowerCase();

  if (lowerDetail.includes("not found")) {
    return "Calendario Google nao encontrado ou sem permissao de acesso.";
  }

  if (lowerDetail.includes("quota") || lowerDetail.includes("rate limit")) {
    return "Limite de requisicoes da API Google Calendar atingido. Tente novamente em instantes.";
  }

  if (lowerDetail.includes("insufficient permission") || lowerDetail.includes("forbidden")) {
    return "Permissao insuficiente para operar no Google Calendar configurado.";
  }

  if (
    lowerDetail.includes("forbiddenforserviceaccounts") ||
    lowerDetail.includes("service accounts cannot invite attendees") ||
    lowerDetail.includes("domain-wide delegation")
  ) {
    return "Convidados bloqueados para conta de servico. Configure Domain-wide delegation e GOOGLE_DELEGATED_USER_EMAIL.";
  }

  if (lowerDetail.includes("invalid_grant") || lowerDetail.includes("token")) {
    return "Credenciais OAuth do Google invalidas ou expiradas.";
  }

  return "Falha de comunicacao com Google Calendar.";
};

export async function handleRequest(req: Request): Promise<Response> {
  const [pathWithoutQuery] = req.path.split("?");
  const [basePath, ...pathParts] = pathWithoutQuery.split("/").filter(Boolean);

  try {
    if (basePath !== "api") {
      return { status: 404, body: { error: "Rota nao encontrada" } };
    }

    const [resource, action = "", ...subActions] = pathParts;

    if (resource === "auth") {
      return await handleAuth(req, action);
    }

    if (resource === "events") {
      return await handleEvents(req, action);
    }

    if (resource === "users") {
      return await handleUsers(req, action, subActions);
    }

    if (resource === "settings") {
      return await handleSettings(req, action);
    }

    if (resource === "logs") {
      return await handleLogs(req, action);
    }

    if (resource === "health" && req.method === "GET") {
      return { status: 200, body: { ok: true } };
    }

    return { status: 404, body: { error: "Recurso nao encontrado" } };
  } catch (error) {
    console.error("Request error:", error);
    return {
      status: 500,
      body: { error: "Erro interno no servidor" },
    };
  }
}

async function handleAuth(req: Request, action: string): Promise<Response> {
  if (req.method === "POST" && action === "login-local") {
    const body = parseBody(req.body);
    const email = normalizeEmail(body.email);
    const password = String(body.password || "");

    if (!email || !password) {
      return { status: 400, body: { error: "Informe e-mail e senha" } };
    }

    if (!isValidEmail(email)) {
      return { status: 400, body: { error: "E-mail invalido" } };
    }

    try {
      const result = await loginLocal(email, password);
      return { status: 200, body: { user: result.user, token: result.token } };
    } catch (error) {
      if (error instanceof Error && error.message === "invalid_credentials") {
        return { status: 401, body: { error: "Credenciais invalidas" } };
      }

      throw error;
    }
  }

  if (req.method === "POST" && action === "login-google-token") {
    const body = parseBody(req.body);
    const idToken = String(body.idToken || "").trim();

    if (!idToken) {
      return { status: 400, body: { error: "idToken e obrigatorio" } };
    }

    try {
      const profile = await verifyGoogleIdToken(idToken);
      const result = await loginGoogle(profile.googleId, profile.email, profile.fullName, profile.avatarUrl);
      return { status: 200, body: { user: result.user, token: result.token } };
    } catch (error) {
      if (!(error instanceof Error)) {
        throw error;
      }

      if (error.message === "google_login_not_configured") {
        return { status: 503, body: { error: "Login Google nao configurado no servidor" } };
      }

      if (
        error.message === "invalid_google_token" ||
        error.message === "invalid_google_token_payload" ||
        error.message === "google_token_audience_mismatch"
      ) {
        return { status: 401, body: { error: "Token Google invalido" } };
      }

      if (error.message === "google_email_not_allowed") {
        return { status: 403, body: { error: "Conta Google nao autorizada para este ambiente" } };
      }

      if (error.message === "user_inactive") {
        return { status: 403, body: { error: "Usuario desativado. Procure um administrador." } };
      }

      throw error;
    }
  }

  if (req.method === "POST" && action === "verify") {
    const user = await extractUserFromHeader(req);
    if (!user) {
      return { status: 401, body: { error: "Nao autorizado" } };
    }

    return { status: 200, body: { user } };
  }

  return { status: 404, body: { error: "Endpoint de autenticacao nao encontrado" } };
}

async function handleUsers(req: Request, action: string, subActions: string[]): Promise<Response> {
  const user = await extractUserFromHeader(req);
  if (!user) {
    return { status: 401, body: { error: "Nao autorizado" } };
  }

  if (!hasAdminPermission(user)) {
    return { status: 403, body: { error: "Apenas administradores podem gerenciar usuarios" } };
  }

  const performUserDeletion = async (userId: number): Promise<Response> => {
    if (userId === user.id) {
      return { status: 400, body: { error: "Nao e permitido excluir seu proprio usuario" } };
    }

    const targetUser = await getManagedUserById(userId);
    if (!targetUser) {
      return { status: 404, body: { error: "Usuario nao encontrado" } };
    }

    if (targetUser.role === "admin" && targetUser.active) {
      const users = await listUsers();
      const activeAdmins = users.filter((item) => item.role === "admin" && item.active).length;
      if (activeAdmins <= 1) {
        return { status: 400, body: { error: "Nao e permitido excluir o ultimo administrador ativo" } };
      }
    }

    const deleted = await deleteUserById(userId);
    if (!deleted) {
      return { status: 404, body: { error: "Usuario nao encontrado" } };
    }

    return { status: 200, body: { message: "Usuario excluido com sucesso" } };
  };

  if (req.method === "GET" && !action) {
    const users = await listUsers();
    return { status: 200, body: { users } };
  }

  if (req.method === "POST" && action === "local") {
    const body = parseBody(req.body);
    const email = normalizeEmail(body.email);
    const password = String(body.password || "");
    const fullName = String(body.fullName || "").trim();
    const role = parseRole(body.role);

    if (!email || !password || !fullName || !role) {
      return { status: 400, body: { error: "Campos obrigatorios: fullName, email, password e role" } };
    }

    if (!isValidEmail(email)) {
      return { status: 400, body: { error: "E-mail invalido" } };
    }

    if (!isStrongPassword(password)) {
      return {
        status: 400,
        body: {
          error: "A senha deve ter no minimo 12 caracteres e incluir letra maiuscula, minuscula, numero e simbolo.",
        },
      };
    }

    try {
      const createdUser = await createLocalUser({
        email,
        password,
        fullName,
        role,
      });

      return { status: 201, body: { user: createdUser } };
    } catch (error) {
      if (error instanceof Error && error.message === "email_already_exists") {
        return { status: 409, body: { error: "Ja existe usuario com este e-mail" } };
      }

      throw error;
    }
  }

  if (req.method === "POST" && subActions[0] === "delete") {
    const userId = parseEventId(action);
    if (!userId) {
      return { status: 400, body: { error: "ID de usuario invalido" } };
    }

    return performUserDeletion(userId);
  }

  if (req.method === "PATCH") {
    const userId = parseEventId(action);
    if (!userId) {
      return { status: 400, body: { error: "ID de usuario invalido" } };
    }

    const patchTarget = subActions[0] || "";
    const body = parseBody(req.body);

    if (patchTarget === "role") {
      const role = parseRole(body.role);
      if (!role) {
        return { status: 400, body: { error: "role invalido" } };
      }

      if (userId === user.id && role !== "admin") {
        return { status: 400, body: { error: "Nao e permitido remover seu proprio papel de administrador" } };
      }

      const updatedUser = await updateUserRole(userId, role);
      if (!updatedUser) {
        return { status: 404, body: { error: "Usuario nao encontrado" } };
      }

      return { status: 200, body: { user: updatedUser } };
    }

    if (patchTarget === "active") {
      const active = parseBoolean(body.active);
      if (active === null) {
        return { status: 400, body: { error: "active deve ser booleano" } };
      }

      if (userId === user.id && !active) {
        return { status: 400, body: { error: "Nao e permitido desativar seu proprio usuario" } };
      }

      const updatedUser = await updateUserActive(userId, active);
      if (!updatedUser) {
        return { status: 404, body: { error: "Usuario nao encontrado" } };
      }

      return { status: 200, body: { user: updatedUser } };
    }

    if (patchTarget === "password") {
      const password = String(body.password || "");
      if (!password) {
        return { status: 400, body: { error: "password e obrigatoria" } };
      }

      if (!isStrongPassword(password)) {
        return {
          status: 400,
          body: {
            error: "A senha deve ter no minimo 12 caracteres e incluir letra maiuscula, minuscula, numero e simbolo.",
          },
        };
      }

      try {
        const updatedUser = await updateLocalUserPassword(userId, password);
        if (!updatedUser) {
          return { status: 404, body: { error: "Usuario nao encontrado" } };
        }

        return { status: 200, body: { user: updatedUser } };
      } catch (error) {
        if (error instanceof Error && error.message === "password_change_only_local") {
          return { status: 400, body: { error: "Somente usuarios locais podem ter senha alterada" } };
        }

        throw error;
      }
    }
  }

  if (req.method === "DELETE") {
    const userId = parseEventId(action);
    if (!userId) {
      return { status: 400, body: { error: "ID de usuario invalido" } };
    }

    return performUserDeletion(userId);
  }

  return { status: 404, body: { error: "Endpoint de usuarios nao encontrado" } };
}

async function handleLogs(req: Request, action: string): Promise<Response> {
  const user = await extractUserFromHeader(req);
  if (!user) {
    return { status: 401, body: { error: "Nao autorizado" } };
  }

  if (!hasAdminPermission(user)) {
    return { status: 403, body: { error: "Apenas administradores podem visualizar logs" } };
  }

  if (req.method === "GET" && action === "events") {
    const rawLimit = Number(req.query?.limit || 200);
    const limit = Number.isInteger(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 500) : 200;
    const logs = await listEventAuditLogs(limit);
    return { status: 200, body: { logs } };
  }

  return { status: 404, body: { error: "Endpoint de logs nao encontrado" } };
}

async function handleSettings(req: Request, action: string): Promise<Response> {
  const user = await extractUserFromHeader(req);
  if (!user) {
    return { status: 401, body: { error: "Nao autorizado" } };
  }

  if (action === "google-calendar" && req.method === "GET") {
    const settings = await getGoogleCalendarSettings();
    return { status: 200, body: { settings } };
  }

  if (action === "google-calendar" && req.method === "PUT") {
    if (!hasAdminPermission(user)) {
      return { status: 403, body: { error: "Apenas administradores podem alterar configuracoes" } };
    }

    const body = parseBody(req.body);
    const calendarId = String(body.calendarId || "").trim();
    if (!calendarId) {
      return { status: 400, body: { error: "calendarId e obrigatorio" } };
    }

    const settings = await updateGoogleCalendarId(calendarId);
    return { status: 200, body: { settings } };
  }

  return { status: 404, body: { error: "Endpoint de configuracoes nao encontrado" } };
}

async function handleEvents(req: Request, action: string): Promise<Response> {
  const user = await extractUserFromHeader(req);

  if (!user) {
    return { status: 401, body: { error: "Nao autorizado" } };
  }

  if (req.method === "GET") {
    if (action === "my-events") {
      const events = await eventService.getEventsByUser(user.id);
      return { status: 200, body: { events } };
    }

    if (action === "all") {
      if (!hasApprovalPermission(user)) {
        return { status: 403, body: { error: "Sem permissao para listar todos os eventos" } };
      }

      const events = await eventService.getAllEvents();
      return { status: 200, body: { events } };
    }

    if (action === "approved") {
      const events = await eventService.getApprovedEvents();
      return { status: 200, body: { events } };
    }

    if (action === "pending") {
      if (!hasApprovalPermission(user)) {
        return { status: 403, body: { error: "Sem permissao para listar aprovacoes" } };
      }

      const events = await eventService.getPendingEvents();
      return { status: 200, body: { events } };
    }

    if (action === "mirror") {
      const settings = await getGoogleCalendarSettings();
      if (!settings.calendarId) {
        return {
          status: 400,
          body: {
            error: "Calendar ID do Google nao configurado. Configure na aba de administracao.",
          },
        };
      }

      const defaults = getDefaultMirrorRange();
      const fromDate = normalizeDateString(req.query?.from) || defaults.fromDate;
      const toDate = normalizeDateString(req.query?.to) || defaults.toDate;

      if (!isValidDateRange(fromDate, toDate)) {
        return { status: 400, body: { error: "Periodo invalido para espelhamento" } };
      }

      let mirroredEvents: Awaited<ReturnType<typeof listGoogleCalendarEvents>>;
      try {
        const localEvents = await eventService.getSyncedLocalEvents();
        mirroredEvents = await listGoogleCalendarEvents(settings.calendarId, {
          fromDate,
          toDate,
          timezone: settings.timezone,
          localEvents,
        });
      } catch (error) {
        if (error instanceof Error && error.message.startsWith("google_calendar_invalid_date")) {
          return {
            status: 500,
            body: {
              error: "Encontramos um evento com data invalida no Google Calendar.",
            },
          };
        }

        if (error instanceof Error && error.message.startsWith("google_calendar")) {
          return {
            status: 502,
            body: {
              error: "Falha ao consultar Google Calendar. Verifique se a API Calendar esta habilitada no Google Cloud e aguarde a propagacao.",
            },
          };
        }

        throw error;
      }

      return {
        status: 200,
        body: {
          events: mirroredEvents,
          calendar: {
            calendarId: settings.calendarId,
            timezone: settings.timezone,
            source: settings.source,
            fromDate,
            toDate,
          },
        },
      };
    }

    const eventId = parseEventId(action);
    if (!eventId) {
      return { status: 400, body: { error: "ID do evento invalido" } };
    }

    const event = await eventService.getEventById(eventId);
    if (!event) {
      return { status: 404, body: { error: "Evento nao encontrado" } };
    }

    if (!hasApprovalPermission(user) && event.status !== "approved" && event.created_by !== user.id) {
      return { status: 403, body: { error: "Sem permissao para visualizar este evento" } };
    }

    return { status: 200, body: { event } };
  }

  if (req.method === "POST" && action === "create") {
    const body = parseBody(req.body);
    const title = String(body.title || "").trim();
    const eventType = normalizeEventType(body.event_type);
    const startDate = normalizeDateString(body.start_date);
    const endDate = normalizeDateString(body.end_date);
    const allDay = Boolean(body.all_day);
    const startTime = allDay ? null : normalizeTimeString(body.start_time);
    const endTime = allDay ? null : normalizeTimeString(body.end_time);
    const description = body.description ? String(body.description).trim() : null;
    const { normalized: involvedEmails, invalidEmails } = parseAndValidateInvolvedEmails(body.involved_emails);

    if (!title || !eventType || !startDate || !endDate) {
      return { status: 400, body: { error: "Campos obrigatorios: title, event_type, start_date e end_date" } };
    }

    if (title.length > TITLE_MAX_LENGTH) {
      return { status: 400, body: { error: `title excede ${TITLE_MAX_LENGTH} caracteres` } };
    }

    if (description && description.length > DESCRIPTION_MAX_LENGTH) {
      return { status: 400, body: { error: `description excede ${DESCRIPTION_MAX_LENGTH} caracteres` } };
    }

    if (invalidEmails.length) {
      return {
        status: 400,
        body: {
          error: `E-mail(s) invalido(s) em "Setores envolvidos": ${invalidEmails.join(", ")}`,
        },
      };
    }

    if (!isValidDateRange(startDate, endDate)) {
      return { status: 400, body: { error: "Periodo invalido: end_date deve ser maior ou igual a start_date" } };
    }

    if (!allDay && !isValidTimeRange(startDate, endDate, startTime, endTime)) {
      return {
        status: 400,
        body: { error: "Horario invalido: informe start_time e end_time validos (end_time > start_time no mesmo dia)" },
      };
    }

    const canDirectPublish = hasApprovalPermission(user);
    const settings = canDirectPublish ? await getGoogleCalendarSettings() : null;

    if (canDirectPublish && !settings?.calendarId) {
      return {
        status: 400,
        body: {
          error: "Calendar ID do Google nao configurado. Configure na aba de administracao para publicar direto.",
        },
      };
    }

    let createdEvent = await eventService.createEvent({
      title,
      description,
      involved_emails: involvedEmails,
      start_date: startDate,
      end_date: endDate,
      start_time: startTime,
      end_time: endTime,
      all_day: allDay,
      event_type: eventType,
      status: canDirectPublish ? "approved" : "pending",
      created_by: user.id,
    });

    if (!canDirectPublish) {
      await registerEventAudit(
        user,
        "evento_criado_pendente",
        { id: createdEvent.id, title: createdEvent.title },
        `Tipo: ${createdEvent.event_type}. Periodo: ${createdEvent.start_date} a ${createdEvent.end_date}.`,
      );
      return { status: 201, body: { event: createdEvent } };
    }

    try {
      const googleEventId = await createGoogleCalendarEvent(
        settings!.calendarId!,
        mapEventForGoogle(createdEvent),
        settings!.timezone,
      );

      const updated = await eventService.updateEvent(createdEvent.id, {
        status: "approved",
        approved_by: user.id,
        approved_at: getNowForMysql(),
        google_calendar_event_id: googleEventId,
      });

      if (updated) {
        createdEvent = updated;
      }

      await registerEventAudit(
        user,
        "evento_criado_publicado_direto",
        { id: createdEvent.id, title: createdEvent.title },
        `Tipo: ${createdEvent.event_type}. Publicado no Google Calendar.`,
      );

      return { status: 201, body: { event: createdEvent } };
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("google_calendar_invalid_date")) {
        return { status: 400, body: { error: "Data invalida no evento. Revise periodo e tente novamente." } };
      }

      await eventService.deleteEvent(createdEvent.id);
      if (error instanceof Error && error.message.startsWith("google_calendar")) {
        const detail = getGoogleCalendarErrorDetail(error);
        return {
          status: 502,
          body: {
            error: detail
              ? `Falha ao publicar evento no Google Calendar: ${detail}`
              : "Falha ao publicar evento no Google Calendar",
          },
        };
      }
      throw error;
    }
  }

  if (req.method === "PUT") {
    const eventId = parseEventId(action);
    if (!eventId) {
      return { status: 400, body: { error: "ID do evento invalido" } };
    }

    const currentEvent = await eventService.getEventById(eventId);
    if (!currentEvent) {
      return { status: 404, body: { error: "Evento nao encontrado" } };
    }

    const isOwner = currentEvent.created_by === user.id;
    const canApprove = hasApprovalPermission(user);

    if (!isOwner && !canApprove) {
      return { status: 403, body: { error: "Sem permissao para editar este evento" } };
    }

    if (!canApprove && currentEvent.status !== "pending") {
      return { status: 403, body: { error: "Apenas eventos pendentes podem ser editados pelo criador" } };
    }

    const body = parseBody(req.body);
    const updates: Partial<eventService.Event> = {};

    if (body.title !== undefined) {
      const value = String(body.title || "").trim();
      if (!value) {
        return { status: 400, body: { error: "title nao pode ser vazio" } };
      }
      if (value.length > TITLE_MAX_LENGTH) {
        return { status: 400, body: { error: `title excede ${TITLE_MAX_LENGTH} caracteres` } };
      }
      updates.title = value;
    }
    if (body.description !== undefined) {
      const value = body.description ? String(body.description).trim() : null;
      if (value && value.length > DESCRIPTION_MAX_LENGTH) {
        return { status: 400, body: { error: `description excede ${DESCRIPTION_MAX_LENGTH} caracteres` } };
      }
      updates.description = value;
    }
    if (body.involved_emails !== undefined) {
      const { normalized, invalidEmails } = parseAndValidateInvolvedEmails(body.involved_emails);
      if (invalidEmails.length) {
        return {
          status: 400,
          body: {
            error: `E-mail(s) invalido(s) em "Setores envolvidos": ${invalidEmails.join(", ")}`,
          },
        };
      }

      updates.involved_emails = normalized;
    }
    if (body.event_type !== undefined) {
      const value = normalizeEventType(body.event_type);
      if (!value) {
        return { status: 400, body: { error: "event_type invalido" } };
      }
      updates.event_type = value;
    }
    if (body.start_date !== undefined) {
      const normalized = normalizeDateString(body.start_date);
      if (!normalized) {
        return { status: 400, body: { error: "start_date invalido" } };
      }
      updates.start_date = normalized;
    }
    if (body.end_date !== undefined) {
      const normalized = normalizeDateString(body.end_date);
      if (!normalized) {
        return { status: 400, body: { error: "end_date invalido" } };
      }
      updates.end_date = normalized;
    }
    if (body.all_day !== undefined) {
      updates.all_day = Boolean(body.all_day);
    }
    if (body.start_time !== undefined) {
      updates.start_time = normalizeTimeString(body.start_time);
    }
    if (body.end_time !== undefined) {
      updates.end_time = normalizeTimeString(body.end_time);
    }

    if (updates.all_day === true) {
      updates.start_time = null;
      updates.end_time = null;
    }

    const nextEvent = {
      ...currentEvent,
      ...updates,
    };

    if (!isValidDateRange(nextEvent.start_date, nextEvent.end_date)) {
      return { status: 400, body: { error: "Periodo invalido: end_date deve ser maior ou igual a start_date" } };
    }

    if (!nextEvent.all_day && !isValidTimeRange(nextEvent.start_date, nextEvent.end_date, nextEvent.start_time, nextEvent.end_time)) {
      return {
        status: 400,
        body: { error: "Horario invalido: informe start_time e end_time validos (end_time > start_time no mesmo dia)" },
      };
    }

    if (canApprove && currentEvent.status === "approved" && currentEvent.google_calendar_event_id) {
      const settings = await getGoogleCalendarSettings();
      if (!settings.calendarId) {
        return { status: 400, body: { error: "Calendar ID do Google nao configurado para sincronizar alteracoes" } };
      }

      try {
        await updateGoogleCalendarEvent(
          settings.calendarId,
          currentEvent.google_calendar_event_id,
          mapEventForGoogle(nextEvent),
          settings.timezone,
        );
      } catch (error) {
        if (error instanceof Error && error.message.startsWith("google_calendar_invalid_date")) {
          return { status: 400, body: { error: "Data invalida no evento para sincronizacao com Google Calendar." } };
        }

        if (error instanceof Error && error.message.startsWith("google_calendar")) {
          const detail = getGoogleCalendarErrorDetail(error);
          return {
            status: 502,
            body: {
              error: detail
                ? `Falha ao sincronizar alteracao com Google Calendar: ${detail}`
                : "Falha ao sincronizar alteracao com Google Calendar",
            },
          };
        }
        throw error;
      }
    }

    const updated = await eventService.updateEvent(eventId, updates);
    const changedFields = Object.keys(updates).join(", ") || "sem alteracoes detectadas";
    await registerEventAudit(
      user,
      "evento_atualizado",
      { id: updated?.id ?? currentEvent.id, title: updated?.title ?? currentEvent.title },
      `Campos alterados: ${changedFields}.`,
    );
    return { status: 200, body: { event: updated } };
  }

  if (req.method === "DELETE") {
    const eventId = parseEventId(action);
    if (!eventId) {
      return { status: 400, body: { error: "ID do evento invalido" } };
    }

    const event = await eventService.getEventById(eventId);
    if (!event) {
      return { status: 404, body: { error: "Evento nao encontrado" } };
    }

    const isOwner = event.created_by === user.id;
    const canApprove = hasApprovalPermission(user);

    if (!isOwner && !canApprove) {
      return { status: 403, body: { error: "Sem permissao para excluir este evento" } };
    }

    if (!canApprove && event.status !== "pending") {
      return { status: 403, body: { error: "Apenas eventos pendentes podem ser excluidos pelo criador" } };
    }

    if (canApprove && event.google_calendar_event_id && event.status === "approved") {
      const settings = await getGoogleCalendarSettings();
      if (!settings.calendarId) {
        return { status: 400, body: { error: "Calendar ID do Google nao configurado para exclusao sincronizada" } };
      }

      try {
        await deleteGoogleCalendarEvent(settings.calendarId, event.google_calendar_event_id);
      } catch (error) {
        if (error instanceof Error && error.message.startsWith("google_calendar")) {
          const detail = getGoogleCalendarErrorDetail(error);
          return {
            status: 502,
            body: {
              error: detail
                ? `Falha ao excluir evento no Google Calendar: ${detail}`
                : "Falha ao excluir evento no Google Calendar",
            },
          };
        }
        throw error;
      }
    }

    await eventService.deleteEvent(eventId);
    await registerEventAudit(
      user,
      "evento_excluido",
      { id: event.id, title: event.title },
      `Status anterior: ${event.status}.`,
    );
    return { status: 200, body: { message: "Evento excluido com sucesso" } };
  }

  if (req.method === "POST" && (action === "approve" || action === "reject")) {
    if (!hasApprovalPermission(user)) {
      return { status: 403, body: { error: "Sem permissao para aprovar/rejeitar eventos" } };
    }

    const body = parseBody(req.body);
    const eventId = parseEventId(body.eventId);

    if (!eventId) {
      return { status: 400, body: { error: "eventId e obrigatorio" } };
    }

    const event = await eventService.getEventById(eventId);
    if (!event) {
      return { status: 404, body: { error: "Evento nao encontrado" } };
    }

    if (event.status !== "pending") {
      return { status: 400, body: { error: "Apenas eventos pendentes podem ser aprovados/rejeitados" } };
    }

    if (action === "reject") {
      const rejectedEvent = await eventService.rejectEvent(eventId, user.id);
      await registerEventAudit(
        user,
        "evento_rejeitado",
        { id: rejectedEvent?.id ?? event.id, title: rejectedEvent?.title ?? event.title },
        "Solicitacao rejeitada pela supervisao/admin.",
      );
      return { status: 200, body: { event: rejectedEvent } };
    }

    const settings = await getGoogleCalendarSettings();
    if (!settings.calendarId) {
      return {
        status: 400,
        body: { error: "Calendar ID do Google nao configurado. Configure na aba de administracao." },
      };
    }

    try {
      const googleEventId = await createGoogleCalendarEvent(settings.calendarId, mapEventForGoogle(event), settings.timezone);
      const approvedEvent = await eventService.updateEvent(eventId, {
        status: "approved",
        approved_by: user.id,
        approved_at: getNowForMysql(),
        google_calendar_event_id: googleEventId,
      });

      await registerEventAudit(
        user,
        "evento_aprovado",
        { id: approvedEvent?.id ?? event.id, title: approvedEvent?.title ?? event.title },
        "Solicitacao aprovada e publicada no Google Calendar.",
      );

      return { status: 200, body: { event: approvedEvent } };
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("google_calendar_invalid_date")) {
        return { status: 400, body: { error: "Data invalida no evento. Corrija as datas e tente aprovar novamente." } };
      }

      if (error instanceof Error && error.message.startsWith("google_calendar")) {
        const detail = getGoogleCalendarErrorDetail(error);
        return {
          status: 502,
          body: {
            error: detail
              ? `Falha ao publicar evento no Google Calendar: ${detail}`
              : "Falha ao publicar evento no Google Calendar",
          },
        };
      }
      throw error;
    }
  }

  return { status: 404, body: { error: "Endpoint de eventos nao encontrado" } };
}
