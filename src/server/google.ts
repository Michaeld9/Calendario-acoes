import { createSign } from "node:crypto";

const GOOGLE_OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_TOKEN_INFO_URL = "https://oauth2.googleapis.com/tokeninfo";
const GOOGLE_CALENDAR_API_BASE = "https://www.googleapis.com/calendar/v3";
const GOOGLE_CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar";

interface AccessTokenCache {
  cacheKey: string;
  token: string;
  expiresAt: number;
}

type GoogleCalendarAuthMode = "service_account" | "oauth_user";

let cachedAccessToken: AccessTokenCache | null = null;

const base64UrlEncode = (value: string): string => {
  return Buffer.from(value)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
};

const getGoogleCalendarAuthMode = (): GoogleCalendarAuthMode => {
  const mode = (process.env.GOOGLE_CALENDAR_AUTH_MODE || "service_account").trim().toLowerCase();
  if (mode === "oauth_user") {
    return "oauth_user";
  }

  return "service_account";
};

const parseCsvToSet = (value: string): Set<string> => {
  return new Set(
    value
      .split(",")
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean),
  );
};

const assertGoogleEmailAllowed = (email: string): void => {
  const normalizedEmail = email.trim().toLowerCase();
  const atIndex = normalizedEmail.lastIndexOf("@");
  const domain = atIndex >= 0 ? normalizedEmail.slice(atIndex + 1) : "";

  const allowedDomains = parseCsvToSet(process.env.GOOGLE_ALLOWED_EMAIL_DOMAINS || "");
  const allowedEmails = parseCsvToSet(process.env.GOOGLE_ALLOWED_EMAILS || "");

  const isEmailAllowed = allowedEmails.size === 0 || allowedEmails.has(normalizedEmail);
  const isDomainAllowed = allowedDomains.size === 0 || (domain && allowedDomains.has(domain));

  if (!isEmailAllowed || !isDomainAllowed) {
    throw new Error("google_email_not_allowed");
  }
};

const getServiceAccountConfig = () => {
  const email = (process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || "").trim();
  const privateKey = (process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || "").replace(/\\n/g, "\n").trim();
  const delegatedUser = (process.env.GOOGLE_DELEGATED_USER_EMAIL || "").trim().toLowerCase();

  if (!email || !privateKey) {
    throw new Error("google_calendar_credentials_not_configured");
  }

  return {
    email,
    privateKey,
    delegatedUser,
  };
};

const getOAuthUserConfig = () => {
  const clientId = (process.env.GOOGLE_CLIENT_ID || "").trim();
  const clientSecret = (process.env.GOOGLE_CLIENT_SECRET || "").trim();
  const refreshToken = (process.env.GOOGLE_CALENDAR_USER_REFRESH_TOKEN || "").trim();
  const accountEmail = (process.env.GOOGLE_CALENDAR_ACCOUNT_EMAIL || "").trim().toLowerCase();

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("google_calendar_oauth_user_not_configured");
  }

  return {
    clientId,
    clientSecret,
    refreshToken,
    accountEmail,
  };
};

const getTokenCacheKey = (serviceAccountEmail: string, delegatedUser: string): string => {
  return `${serviceAccountEmail}|${delegatedUser || "-"}`;
};

const getOauthUserCacheKey = (clientId: string, accountEmail: string): string => {
  return `oauth_user|${clientId}|${accountEmail || "-"}`;
};

const parseGoogleSendUpdatesMode = (): "all" | "externalOnly" | "none" => {
  const rawValue = (process.env.GOOGLE_CALENDAR_SEND_UPDATES || "").trim();
  if (rawValue === "all" || rawValue === "externalOnly" || rawValue === "none") {
    return rawValue;
  }

  return "all";
};

const isAttendeesFallbackEnabled = (): boolean => {
  const rawValue = (process.env.GOOGLE_ALLOW_EVENT_WITHOUT_ATTENDEES_FALLBACK || "").trim().toLowerCase();
  return rawValue === "1" || rawValue === "true" || rawValue === "yes";
};

const appendSendUpdatesParam = (path: string): string => {
  const sendUpdates = parseGoogleSendUpdatesMode();
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}sendUpdates=${encodeURIComponent(sendUpdates)}`;
};

const createServiceJwtAssertion = (): string => {
  const { email, privateKey, delegatedUser } = getServiceAccountConfig();
  const nowInSeconds = Math.floor(Date.now() / 1000);

  const header = {
    alg: "RS256",
    typ: "JWT",
  };

  const payload = {
    iss: email,
    scope: GOOGLE_CALENDAR_SCOPE,
    aud: GOOGLE_OAUTH_TOKEN_URL,
    exp: nowInSeconds + 3600,
    iat: nowInSeconds,
    ...(delegatedUser ? { sub: delegatedUser } : {}),
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const unsignedToken = `${encodedHeader}.${encodedPayload}`;

  const signer = createSign("RSA-SHA256");
  signer.update(unsignedToken);
  signer.end();

  const signature = signer
    .sign(privateKey, "base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");

  return `${unsignedToken}.${signature}`;
};

const getServiceAccessToken = async (): Promise<string> => {
  const { email, delegatedUser } = getServiceAccountConfig();
  const cacheKey = getTokenCacheKey(email, delegatedUser);

  if (cachedAccessToken && cachedAccessToken.cacheKey === cacheKey && Date.now() < cachedAccessToken.expiresAt - 60_000) {
    return cachedAccessToken.token;
  }

  const assertion = createServiceJwtAssertion();
  const response = await fetch(GOOGLE_OAUTH_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }).toString(),
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`google_calendar_token_error:${response.status}:${details}`);
  }

  const payload = (await response.json()) as { access_token?: string; expires_in?: number };
  if (!payload.access_token) {
    throw new Error("google_calendar_token_missing");
  }

  cachedAccessToken = {
    cacheKey,
    token: payload.access_token,
    expiresAt: Date.now() + (payload.expires_in || 3600) * 1000,
  };

  return payload.access_token;
};

const getOAuthUserAccessToken = async (): Promise<string> => {
  const { clientId, clientSecret, refreshToken, accountEmail } = getOAuthUserConfig();
  const cacheKey = getOauthUserCacheKey(clientId, accountEmail);

  if (cachedAccessToken && cachedAccessToken.cacheKey === cacheKey && Date.now() < cachedAccessToken.expiresAt - 60_000) {
    return cachedAccessToken.token;
  }

  const response = await fetch(GOOGLE_OAUTH_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }).toString(),
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`google_calendar_token_error:${response.status}:${details}`);
  }

  const payload = (await response.json()) as { access_token?: string; expires_in?: number };
  if (!payload.access_token) {
    throw new Error("google_calendar_token_missing");
  }

  cachedAccessToken = {
    cacheKey,
    token: payload.access_token,
    expiresAt: Date.now() + (payload.expires_in || 3600) * 1000,
  };

  return payload.access_token;
};

const getGoogleAccessToken = async (): Promise<string> => {
  const mode = getGoogleCalendarAuthMode();
  if (mode === "oauth_user") {
    return getOAuthUserAccessToken();
  }

  return getServiceAccessToken();
};

const normalizeGoogleApiError = async (response: globalThis.Response): Promise<string> => {
  try {
    const payload = (await response.json()) as {
      error?: { message?: string };
    };

    if (payload.error?.message) {
      return payload.error.message;
    }
  } catch {
    // ignore parse errors and fallback below
  }

  return `${response.status} ${response.statusText}`;
};

const calendarRequest = async <T>(
  method: "GET" | "POST" | "PUT" | "DELETE",
  calendarId: string,
  path: string,
  body?: unknown,
): Promise<T> => {
  const token = await getGoogleAccessToken();
  const url = `${GOOGLE_CALENDAR_API_BASE}/calendars/${encodeURIComponent(calendarId)}${path}`;

  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const errorMessage = await normalizeGoogleApiError(response);
    throw new Error(`google_calendar_api_error:${errorMessage}`);
  }

  if (response.status === 204) {
    return null as T;
  }

  return (await response.json()) as T;
};

const normalizeDateOnly = (value: unknown, fieldName: string): string => {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      throw new Error(`google_calendar_invalid_date:${fieldName}`);
    }

    return value.toISOString().slice(0, 10);
  }

  const asString = String(value || "").trim();
  if (!asString) {
    throw new Error(`google_calendar_invalid_date:${fieldName}`);
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(asString)) {
    return asString;
  }

  const parsed = new Date(asString);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`google_calendar_invalid_date:${fieldName}`);
  }

  return parsed.toISOString().slice(0, 10);
};

const addDaysToDateOnly = (date: unknown, amount: number, fieldName = "date"): string => {
  const normalized = normalizeDateOnly(date, fieldName);
  const value = new Date(`${normalized}T00:00:00Z`);
  if (Number.isNaN(value.getTime())) {
    throw new Error(`google_calendar_invalid_date:${fieldName}`);
  }

  value.setUTCDate(value.getUTCDate() + amount);
  return value.toISOString().slice(0, 10);
};

const normalizeTime = (timeValue: string | null): string => {
  const fallback = "09:00:00";
  if (!timeValue) {
    return fallback;
  }

  const [hoursRaw, minutesRaw, secondsRaw] = timeValue.split(":");
  const hours = Number(hoursRaw);
  const minutes = Number(minutesRaw);
  const seconds = secondsRaw ? Number(secondsRaw) : 0;

  if (
    !Number.isInteger(hours) ||
    !Number.isInteger(minutes) ||
    !Number.isInteger(seconds) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59 ||
    seconds < 0 ||
    seconds > 59
  ) {
    return fallback;
  }

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
};

interface LocalCalendarEventPayload {
  title: string;
  description: string | null;
  involved_emails: string | null;
  event_type?: string | null;
  start_date: string | Date;
  end_date: string | Date;
  start_time: string | null;
  end_time: string | null;
  all_day: boolean;
  local_event_id?: number;
}

const parseGoogleAttendees = (involvedEmails: string | null): Array<{ email: string }> => {
  if (!involvedEmails) {
    return [];
  }

  const uniqueEmails = new Set<string>();
  const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  for (const token of involvedEmails.split(/[,\n;]+/)) {
    const normalized = token.trim().toLowerCase();
    if (!normalized || !isValidEmail.test(normalized)) {
      continue;
    }
    uniqueEmails.add(normalized);
  }

  return Array.from(uniqueEmails).map((email) => ({ email }));
};

const EVENT_TYPE_EVENTO = "Evento";
const EVENT_TYPE_ACAO_PONTUAL = "A\u00e7\u00e3o Pontual";
const EVENT_TYPE_PROJETO_INSTITUCIONAL = "Projeto Institucional";
const EVENT_TYPE_PROJETO_PEDAGOGICO = "Projeto Pedag\u00f3gico";
const EVENT_TYPE_EXPEDICAO_PEDAGOGICA = "Expedi\u00e7\u00e3o Pedag\u00f3gica";
const EVENT_TYPE_FORMACAO = "Forma\u00e7\u00e3o";
const EVENT_TYPE_FESTA = "Festa";

const GOOGLE_COLOR_BY_EVENT_TYPE: Record<string, string> = {
  [EVENT_TYPE_EVENTO]: "8",
  [EVENT_TYPE_ACAO_PONTUAL]: "5",
  [EVENT_TYPE_PROJETO_INSTITUCIONAL]: "10",
  [EVENT_TYPE_PROJETO_PEDAGOGICO]: "1",
  [EVENT_TYPE_EXPEDICAO_PEDAGOGICA]: "9",
  [EVENT_TYPE_FORMACAO]: "3",
  [EVENT_TYPE_FESTA]: "11",
};

const EVENT_TYPE_LABEL_BY_GOOGLE_COLOR: Record<string, string> = {
  "8": EVENT_TYPE_EVENTO,
  "5": EVENT_TYPE_ACAO_PONTUAL,
  "10": EVENT_TYPE_PROJETO_INSTITUCIONAL,
  "1": EVENT_TYPE_PROJETO_PEDAGOGICO,
  "9": EVENT_TYPE_EXPEDICAO_PEDAGOGICA,
  "3": EVENT_TYPE_FORMACAO,
  "11": EVENT_TYPE_FESTA,
};

const getGoogleColorIdForEventType = (value: string | null | undefined): string => {
  const eventType = String(value || "").trim();
  return GOOGLE_COLOR_BY_EVENT_TYPE[eventType] || "7";
};

const getEventTypeLabelFromGoogleColorId = (colorId: string | undefined): string | null => {
  if (!colorId) {
    return null;
  }

  return EVENT_TYPE_LABEL_BY_GOOGLE_COLOR[colorId] || null;
};

const toGoogleEventPayload = (event: LocalCalendarEventPayload, timezone: string) => {
  const normalizedStartDate = normalizeDateOnly(event.start_date, "start_date");
  const normalizedEndDate = normalizeDateOnly(event.end_date, "end_date");
  const attendees = parseGoogleAttendees(event.involved_emails);
  const colorId = getGoogleColorIdForEventType(event.event_type);

  const basePayload: Record<string, unknown> = {
    summary: event.title,
    description: event.description || "",
    colorId,
  };

  if (attendees.length) {
    basePayload.attendees = attendees;
  }

  if (event.local_event_id) {
    basePayload.extendedProperties = {
      private: {
        localEventId: String(event.local_event_id),
      },
    };
  }

  if (event.all_day) {
    return {
      ...basePayload,
      start: { date: normalizedStartDate },
      end: { date: addDaysToDateOnly(normalizedEndDate, 1, "end_date") },
    };
  }

  const startTime = normalizeTime(event.start_time);
  const endTime = normalizeTime(event.end_time || event.start_time);

  return {
    ...basePayload,
    start: {
      dateTime: `${normalizedStartDate}T${startTime}`,
      timeZone: timezone,
    },
    end: {
      dateTime: `${normalizedEndDate}T${endTime}`,
      timeZone: timezone,
    },
  };
};

const isAttendeesFallbackCandidate = (error: unknown): boolean => {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return (
    message.includes("attendee") ||
    message.includes("forbiddenforserviceaccounts") ||
    message.includes("service accounts cannot invite attendees") ||
    message.includes("domain-wide delegation")
  );
};

const calendarRequestWithAttendeesFallback = async <T>(
  requestWithPayload: (payload: Record<string, unknown>) => Promise<T>,
  payload: Record<string, unknown>,
): Promise<T> => {
  try {
    return await requestWithPayload(payload);
  } catch (error) {
    if (!("attendees" in payload) || !isAttendeesFallbackCandidate(error)) {
      throw error;
    }

    if (!isAttendeesFallbackEnabled()) {
      throw error;
    }

    console.warn("Google Calendar bloqueou convidados; enviando sem attendees por configuracao de fallback.");
    const payloadWithoutAttendees = { ...payload };
    delete payloadWithoutAttendees.attendees;
    return requestWithPayload(payloadWithoutAttendees);
  }
};

export const createGoogleCalendarEvent = async (
  calendarId: string,
  event: LocalCalendarEventPayload,
  timezone: string,
): Promise<string> => {
  const payload = toGoogleEventPayload(event, timezone) as Record<string, unknown>;
  const response = await calendarRequestWithAttendeesFallback(
    (nextPayload) =>
      calendarRequest<{ id?: string }>("POST", calendarId, appendSendUpdatesParam("/events"), nextPayload),
    payload,
  );

  if (!response.id) {
    throw new Error("google_calendar_missing_event_id");
  }

  return response.id;
};

export const updateGoogleCalendarEvent = async (
  calendarId: string,
  googleEventId: string,
  event: LocalCalendarEventPayload,
  timezone: string,
): Promise<void> => {
  const payload = toGoogleEventPayload(event, timezone) as Record<string, unknown>;
  await calendarRequestWithAttendeesFallback(
    (nextPayload) =>
      calendarRequest(
        "PUT",
        calendarId,
        appendSendUpdatesParam(`/events/${encodeURIComponent(googleEventId)}`),
        nextPayload,
      ),
    payload,
  );
};

export const deleteGoogleCalendarEvent = async (calendarId: string, googleEventId: string): Promise<void> => {
  await calendarRequest("DELETE", calendarId, `/events/${encodeURIComponent(googleEventId)}`);
};

interface GoogleCalendarListEvent {
  id: string;
  summary?: string;
  description?: string;
  colorId?: string;
  status?: string;
  htmlLink?: string;
  updated?: string;
  start?: { date?: string; dateTime?: string };
  end?: { date?: string; dateTime?: string };
  extendedProperties?: {
    private?: {
      localEventId?: string;
    };
  };
}

interface GoogleCalendarListResponse {
  items?: GoogleCalendarListEvent[];
}

export interface MirroredGoogleEvent {
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

interface LocalEventByGoogleId {
  id: number;
  google_calendar_event_id: string;
  status: "pending" | "approved" | "rejected";
  event_type: string;
}

const extractDateFromDateTime = (value: string): string => {
  return value.slice(0, 10);
};

const extractTimeFromDateTime = (value: string): string => {
  return value.slice(11, 16);
};

const mapGoogleEvent = (
  event: GoogleCalendarListEvent,
  localEventMap: Map<string, LocalEventByGoogleId>,
  localEventIdMap: Map<number, LocalEventByGoogleId>,
): MirroredGoogleEvent | null => {
  if (!event.id || !event.start || !event.end) {
    return null;
  }

  const isAllDay = Boolean(event.start.date && event.end.date);

  const startDate = isAllDay
    ? (event.start.date as string)
    : event.start.dateTime
      ? extractDateFromDateTime(event.start.dateTime)
      : "";
  const endDate = isAllDay
    ? addDaysToDateOnly(event.end.date as string, -1, "google_end_date")
    : event.end.dateTime
      ? extractDateFromDateTime(event.end.dateTime)
      : "";

  if (!startDate || !endDate) {
    return null;
  }

  const linkedByGoogleId = localEventMap.get(event.id) || null;
  const linkedByExtendedId = (() => {
    const rawId = event.extendedProperties?.private?.localEventId;
    if (!rawId) {
      return null;
    }

    const parsedId = Number(rawId);
    if (!Number.isInteger(parsedId) || parsedId <= 0) {
      return null;
    }

    return localEventIdMap.get(parsedId) || null;
  })();

  const linkedLocalEvent = linkedByGoogleId || linkedByExtendedId;
  const fallbackTypeFromColor = getEventTypeLabelFromGoogleColorId(event.colorId);

  return {
    google_event_id: event.id,
    title: event.summary || "(Sem titulo)",
    event_type: linkedLocalEvent?.event_type ?? fallbackTypeFromColor,
    description: event.description || null,
    start_date: startDate,
    end_date: endDate,
    start_time: isAllDay ? null : event.start.dateTime ? extractTimeFromDateTime(event.start.dateTime) : null,
    end_time: isAllDay ? null : event.end.dateTime ? extractTimeFromDateTime(event.end.dateTime) : null,
    all_day: isAllDay,
    status: event.status || "confirmed",
    html_link: event.htmlLink || null,
    updated_at: event.updated || null,
    local_event_id: linkedLocalEvent?.id ?? null,
    local_event_status: linkedLocalEvent?.status ?? null,
  };
};

export const listGoogleCalendarEvents = async (
  calendarId: string,
  options: {
    fromDate: string;
    toDate: string;
    timezone: string;
    localEvents: LocalEventByGoogleId[];
  },
): Promise<MirroredGoogleEvent[]> => {
  const params = new URLSearchParams({
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "2500",
    timeMin: `${options.fromDate}T00:00:00Z`,
    timeMax: `${options.toDate}T23:59:59Z`,
    timeZone: options.timezone,
  });

  const response = await calendarRequest<GoogleCalendarListResponse>(
    "GET",
    calendarId,
    `/events?${params.toString()}`,
  );

  const localEventMap = new Map<string, LocalEventByGoogleId>(
    options.localEvents.map((event) => [event.google_calendar_event_id, event]),
  );
  const localEventIdMap = new Map<number, LocalEventByGoogleId>(options.localEvents.map((event) => [event.id, event]));

  return (response.items || [])
    .map((event) => mapGoogleEvent(event, localEventMap, localEventIdMap))
    .filter((event): event is MirroredGoogleEvent => Boolean(event));
};

interface GoogleTokenInfoResponse {
  aud?: string;
  sub?: string;
  email?: string;
  email_verified?: string;
  name?: string;
  picture?: string;
}

export interface VerifiedGoogleUser {
  googleId: string;
  email: string;
  fullName: string;
  avatarUrl: string;
}

export const verifyGoogleIdToken = async (idToken: string): Promise<VerifiedGoogleUser> => {
  const configuredClientIds = (process.env.GOOGLE_CLIENT_ID || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  if (!configuredClientIds.length) {
    throw new Error("google_login_not_configured");
  }

  const url = `${GOOGLE_TOKEN_INFO_URL}?id_token=${encodeURIComponent(idToken)}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error("invalid_google_token");
  }

  const payload = (await response.json()) as GoogleTokenInfoResponse;

  if (!payload.sub || !payload.email || payload.email_verified !== "true" || !payload.aud) {
    throw new Error("invalid_google_token_payload");
  }

  if (!configuredClientIds.includes(payload.aud)) {
    throw new Error("google_token_audience_mismatch");
  }

  assertGoogleEmailAllowed(payload.email);

  return {
    googleId: payload.sub,
    email: payload.email.toLowerCase(),
    fullName: payload.name || payload.email,
    avatarUrl: payload.picture || "",
  };
};
