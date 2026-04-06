import db from "./db";

export interface Event {
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
  status: "pending" | "approved" | "rejected";
  created_by: number;
  created_at: string;
  updated_at: string;
  approved_by: number | null;
  approved_at: string | null;
  google_calendar_event_id: string | null;
  creator?: { full_name: string | null; email: string };
}

interface EventRow extends Event {
  creator_name: string | null;
  creator_email: string;
}

const formatEvent = (row: EventRow): Event => ({
  ...row,
  all_day: Boolean(row.all_day),
  creator: {
    full_name: row.creator_name,
    email: row.creator_email,
  },
});

export const ensureEventsSchema = async (): Promise<void> => {
  const involvedEmailsColumn = await db.query<{ Field: string }>(
    "SHOW COLUMNS FROM events LIKE 'involved_emails'",
  );

  if (!involvedEmailsColumn.length) {
    await db.execute("ALTER TABLE events ADD COLUMN involved_emails TEXT NULL AFTER description");
  }
};

export const createEvent = async (
  eventData: Omit<
    Event,
    | "id"
    | "created_at"
    | "updated_at"
    | "approved_by"
    | "approved_at"
    | "google_calendar_event_id"
    | "creator"
  >,
): Promise<Event> => {
  const result = await db.execute(
    `INSERT INTO events (title, description, involved_emails, start_date, end_date, start_time, end_time, all_day, event_type, status, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      eventData.title,
      eventData.description,
      eventData.involved_emails,
      eventData.start_date,
      eventData.end_date,
      eventData.start_time,
      eventData.end_time,
      eventData.all_day,
      eventData.event_type,
      eventData.status,
      eventData.created_by,
    ],
  );

  const event = await getEventById(result.insertId);
  if (!event) {
    throw new Error("event_creation_failed");
  }

  return event;
};

export const getEventsByUser = async (userId: number): Promise<Event[]> => {
  const rows = await db.query<EventRow>(
    `SELECT e.*, u.full_name AS creator_name, u.email AS creator_email
     FROM events e
     JOIN users u ON e.created_by = u.id
     WHERE e.created_by = ?
     ORDER BY e.start_date ASC, e.start_time ASC`,
    [userId],
  );

  return rows.map(formatEvent);
};

export const getAllEvents = async (): Promise<Event[]> => {
  const rows = await db.query<EventRow>(
    `SELECT e.*, u.full_name AS creator_name, u.email AS creator_email
     FROM events e
     JOIN users u ON e.created_by = u.id
     ORDER BY e.created_at DESC, e.id DESC`,
  );

  return rows.map(formatEvent);
};

export const getApprovedEvents = async (): Promise<Event[]> => {
  const rows = await db.query<EventRow>(
    `SELECT e.*, u.full_name AS creator_name, u.email AS creator_email
     FROM events e
     JOIN users u ON e.created_by = u.id
     WHERE e.status = 'approved'
     ORDER BY e.start_date ASC, e.start_time ASC`,
  );

  return rows.map(formatEvent);
};

interface EventByGoogleId {
  id: number;
  google_calendar_event_id: string;
  status: "pending" | "approved" | "rejected";
}

export const getSyncedLocalEvents = async (): Promise<EventByGoogleId[]> => {
  return db.query<EventByGoogleId>(
    `SELECT id, google_calendar_event_id, status
     FROM events
     WHERE google_calendar_event_id IS NOT NULL`,
  );
};

export const getLocalEventsByGoogleIds = async (googleIds: string[]): Promise<EventByGoogleId[]> => {
  if (!googleIds.length) {
    return [];
  }

  const placeholders = googleIds.map(() => "?").join(", ");
  return db.query<EventByGoogleId>(
    `SELECT id, google_calendar_event_id, status
     FROM events
     WHERE google_calendar_event_id IN (${placeholders})`,
    googleIds,
  );
};

export const getPendingEvents = async (): Promise<Event[]> => {
  const rows = await db.query<EventRow>(
    `SELECT e.*, u.full_name AS creator_name, u.email AS creator_email
     FROM events e
     JOIN users u ON e.created_by = u.id
     WHERE e.status = 'pending'
     ORDER BY e.created_at ASC`,
  );

  return rows.map(formatEvent);
};

export const getEventById = async (eventId: number): Promise<Event | null> => {
  const rows = await db.query<EventRow>(
    `SELECT e.*, u.full_name AS creator_name, u.email AS creator_email
     FROM events e
     JOIN users u ON e.created_by = u.id
     WHERE e.id = ?
     LIMIT 1`,
    [eventId],
  );

  if (!rows.length) {
    return null;
  }

  return formatEvent(rows[0]);
};

const allowedUpdateFields = new Set<keyof Event>([
  "title",
  "description",
  "involved_emails",
  "start_date",
  "end_date",
  "start_time",
  "end_time",
  "all_day",
  "event_type",
  "status",
  "approved_by",
  "approved_at",
  "google_calendar_event_id",
]);

export const updateEvent = async (eventId: number, updates: Partial<Event>): Promise<Event | null> => {
  const fields: string[] = [];
  const values: Array<string | number | boolean | null> = [];

  Object.entries(updates).forEach(([key, value]) => {
    if (allowedUpdateFields.has(key as keyof Event)) {
      fields.push(`${key} = ?`);
      values.push(value as string | number | boolean | null);
    }
  });

  if (!fields.length) {
    return getEventById(eventId);
  }

  values.push(eventId);
  await db.execute(`UPDATE events SET ${fields.join(", ")} WHERE id = ?`, values);

  return getEventById(eventId);
};

export const deleteEvent = async (eventId: number): Promise<boolean> => {
  const result = await db.execute("DELETE FROM events WHERE id = ?", [eventId]);
  return result.affectedRows > 0;
};

export const approveEvent = async (eventId: number, approverId: number): Promise<Event | null> => {
  return updateEvent(eventId, {
    status: "approved",
    approved_by: approverId,
    approved_at: new Date().toISOString().slice(0, 19).replace("T", " "),
  });
};

export const rejectEvent = async (eventId: number, approverId: number): Promise<Event | null> => {
  return updateEvent(eventId, {
    status: "rejected",
    approved_by: approverId,
    approved_at: new Date().toISOString().slice(0, 19).replace("T", " "),
  });
};
