import "dotenv/config";
import mysql, { type ResultSetHeader } from "mysql2/promise";

type QueryParam = string | number | boolean | Date | null;

const parseDatabaseUrl = (databaseUrl: string) => {
  const parsed = new URL(databaseUrl);

  return {
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 3306,
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database: parsed.pathname.replace(/^\/+/, ""),
  };
};

const connectionConfig = (() => {
  if (process.env.DATABASE_URL) {
    return parseDatabaseUrl(process.env.DATABASE_URL);
  }

  return {
    host: process.env.DB_HOST || "127.0.0.1",
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || "app_user",
    password: process.env.DB_PASSWORD || "app_password_secure_change_me",
    database: process.env.DB_NAME || "event_calendar",
  };
})();

const pool = mysql.createPool({
  ...connectionConfig,
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_CONNECTION_LIMIT || 10),
  queueLimit: 0,
  timezone: "Z",
});

export const db = {
  async query<T = Record<string, unknown>>(sql: string, params: QueryParam[] = []): Promise<T[]> {
    const [rows] = await pool.execute<T[]>(sql, params);
    return rows;
  },
  async execute(sql: string, params: QueryParam[] = []): Promise<ResultSetHeader> {
    const [result] = await pool.execute<ResultSetHeader>(sql, params);
    return result;
  },
  async ping(): Promise<void> {
    await pool.query("SELECT 1");
  },
  async close(): Promise<void> {
    await pool.end();
  },
};

export type { ResultSetHeader };

export default db;
