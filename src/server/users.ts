import db from "./db";
import { hashPassword, type AuthUser } from "./auth";

export type UserRole = AuthUser["role"];
export type UserAuthType = AuthUser["auth_type"];

export interface ManagedUser {
  id: number;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  google_id: string | null;
  auth_type: UserAuthType;
  role: UserRole;
  active: boolean;
  created_at: string;
  updated_at: string;
}

interface ManagedUserRow extends Omit<ManagedUser, "active"> {
  active: number;
}

const mapManagedUser = (row: ManagedUserRow): ManagedUser => ({
  ...row,
  active: Boolean(row.active),
});

export const ensureUsersSchema = async (): Promise<void> => {
  const roleColumn = await db.query<{ Type: string }>("SHOW COLUMNS FROM users LIKE 'role'");
  if (!roleColumn.length) {
    return;
  }

  const currentType = String(roleColumn[0].Type || "").toLowerCase();
  if (currentType.includes("'aguardando'")) {
    return;
  }

  await db.execute(
    "ALTER TABLE users MODIFY COLUMN role ENUM('admin', 'supervisor', 'coordenador', 'aguardando') NOT NULL DEFAULT 'coordenador'",
  );
};

export const listUsers = async (): Promise<ManagedUser[]> => {
  const rows = await db.query<ManagedUserRow>(
    `SELECT id, email, full_name, avatar_url, google_id, auth_type, role, active, created_at, updated_at
     FROM users
     ORDER BY created_at DESC, id DESC`,
  );

  return rows.map(mapManagedUser);
};

interface CreateLocalUserInput {
  email: string;
  password: string;
  fullName: string;
  role: UserRole;
}

export const createLocalUser = async (input: CreateLocalUserInput): Promise<ManagedUser> => {
  const email = input.email.trim().toLowerCase();
  const fullName = input.fullName.trim();

  const existing = await db.query<{ id: number }>("SELECT id FROM users WHERE email = ? LIMIT 1", [email]);
  if (existing.length) {
    throw new Error("email_already_exists");
  }

  const passwordHash = await hashPassword(input.password);

  const result = await db.execute(
    `INSERT INTO users (email, password_hash, full_name, auth_type, role, active)
     VALUES (?, ?, ?, 'local', ?, 1)`,
    [email, passwordHash, fullName || null, input.role],
  );

  const created = await getManagedUserById(result.insertId);
  if (!created) {
    throw new Error("user_creation_failed");
  }

  return created;
};

export const getManagedUserById = async (userId: number): Promise<ManagedUser | null> => {
  const rows = await db.query<ManagedUserRow>(
    `SELECT id, email, full_name, avatar_url, google_id, auth_type, role, active, created_at, updated_at
     FROM users
     WHERE id = ?
     LIMIT 1`,
    [userId],
  );

  if (!rows.length) {
    return null;
  }

  return mapManagedUser(rows[0]);
};

export const updateUserRole = async (userId: number, role: UserRole): Promise<ManagedUser | null> => {
  await db.execute("UPDATE users SET role = ? WHERE id = ?", [role, userId]);
  return getManagedUserById(userId);
};

export const updateUserActive = async (userId: number, active: boolean): Promise<ManagedUser | null> => {
  await db.execute("UPDATE users SET active = ? WHERE id = ?", [active ? 1 : 0, userId]);
  return getManagedUserById(userId);
};

export const updateLocalUserPassword = async (userId: number, password: string): Promise<ManagedUser | null> => {
  const current = await db.query<{ auth_type: UserAuthType }>(
    "SELECT auth_type FROM users WHERE id = ? LIMIT 1",
    [userId],
  );

  if (!current.length) {
    return null;
  }

  if (current[0].auth_type !== "local") {
    throw new Error("password_change_only_local");
  }

  const passwordHash = await hashPassword(password);
  await db.execute("UPDATE users SET password_hash = ? WHERE id = ?", [passwordHash, userId]);
  return getManagedUserById(userId);
};

export const deleteUserById = async (userId: number): Promise<boolean> => {
  const result = await db.execute("DELETE FROM users WHERE id = ?", [userId]);
  return result.affectedRows > 0;
};
