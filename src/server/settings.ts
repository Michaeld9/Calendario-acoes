import db from "./db";

const SETTINGS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS app_settings (
    setting_key VARCHAR(120) PRIMARY KEY,
    setting_value TEXT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

let settingsTableEnsured = false;

const ensureSettingsTable = async (): Promise<void> => {
  if (settingsTableEnsured) {
    return;
  }

  await db.execute(SETTINGS_TABLE_SQL);
  settingsTableEnsured = true;
};

interface SettingRow {
  setting_value: string | null;
}

export const getSetting = async (key: string): Promise<string | null> => {
  await ensureSettingsTable();

  const rows = await db.query<SettingRow>("SELECT setting_value FROM app_settings WHERE setting_key = ? LIMIT 1", [key]);
  return rows[0]?.setting_value ?? null;
};

export const setSetting = async (key: string, value: string | null): Promise<void> => {
  await ensureSettingsTable();

  await db.execute(
    `INSERT INTO app_settings (setting_key, setting_value)
     VALUES (?, ?)
     ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
    [key, value],
  );
};

export interface GoogleCalendarSettings {
  calendarId: string | null;
  source: "database" | "env" | "unset";
  timezone: string;
}

export const getGoogleCalendarSettings = async (): Promise<GoogleCalendarSettings> => {
  const fromDatabase = await getSetting("google_calendar_id");
  const fromEnv = (process.env.GOOGLE_CALENDAR_ID || "").trim();
  const calendarId = (fromDatabase || "").trim() || fromEnv || null;
  const source = fromDatabase ? "database" : fromEnv ? "env" : "unset";

  return {
    calendarId,
    source,
    timezone: (process.env.GOOGLE_CALENDAR_TIMEZONE || "America/Fortaleza").trim(),
  };
};

export const updateGoogleCalendarId = async (calendarId: string): Promise<GoogleCalendarSettings> => {
  const value = calendarId.trim();
  await setSetting("google_calendar_id", value || null);
  return getGoogleCalendarSettings();
};
