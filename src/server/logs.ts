import db from "./db";

export interface EventAuditLog {
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

interface ListEventAuditLogsOptions {
  limit?: number;
  action?: string | null;
  fromDate?: string | null;
  toDate?: string | null;
}

interface CreateEventAuditLogInput {
  action: string;
  eventId?: number | null;
  eventTitle?: string | null;
  actorUserId: number;
  actorEmail: string;
  actorName?: string | null;
  details?: string | null;
}

export const ensureEventAuditLogsSchema = async (): Promise<void> => {
  const table = await db.query<{ TABLE_NAME: string }>("SHOW TABLES LIKE 'event_audit_logs'");
  if (table.length) {
    return;
  }

  await db.execute(`
    CREATE TABLE event_audit_logs (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      action VARCHAR(80) NOT NULL,
      event_id INT UNSIGNED NULL,
      event_title VARCHAR(255) NULL,
      actor_user_id INT UNSIGNED NOT NULL,
      actor_email VARCHAR(255) NOT NULL,
      actor_name VARCHAR(255) NULL,
      details TEXT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_event_audit_logs_created_at (created_at),
      INDEX idx_event_audit_logs_actor_user_id (actor_user_id),
      INDEX idx_event_audit_logs_event_id (event_id),
      INDEX idx_event_audit_logs_action (action)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
};

export const createEventAuditLog = async (input: CreateEventAuditLogInput): Promise<void> => {
  await db.execute(
    `INSERT INTO event_audit_logs (
      action,
      event_id,
      event_title,
      actor_user_id,
      actor_email,
      actor_name,
      details
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      input.action,
      input.eventId || null,
      input.eventTitle || null,
      input.actorUserId,
      input.actorEmail,
      input.actorName || null,
      input.details || null,
    ],
  );
};

export const listEventAuditLogs = async (options: ListEventAuditLogsOptions = {}): Promise<EventAuditLog[]> => {
  const safeLimit = Number.isInteger(options.limit) && Number(options.limit) > 0 ? Math.min(Number(options.limit), 500) : 200;
  const whereClauses: string[] = [];
  const queryParams: string[] = [];

  if (options.action) {
    whereClauses.push("action = ?");
    queryParams.push(options.action);
  }

  if (options.fromDate) {
    whereClauses.push("created_at >= ?");
    queryParams.push(`${options.fromDate} 00:00:00`);
  }

  if (options.toDate) {
    whereClauses.push("created_at <= ?");
    queryParams.push(`${options.toDate} 23:59:59`);
  }

  const whereSql = whereClauses.length ? `WHERE ${whereClauses.join(" AND ")}` : "";

  return db.query<EventAuditLog>(
    `SELECT
        id,
        action,
        event_id,
        event_title,
        actor_user_id,
        actor_email,
        actor_name,
        details,
        DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS created_at
      FROM event_audit_logs
      ${whereSql}
      ORDER BY id DESC
      LIMIT ${safeLimit}`,
    queryParams,
  );
};
