import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import db from "./db";

const JWT_SECRET = process.env.JWT_SECRET || "default_secret_change_me";

export interface AuthUser {
  id: number;
  email: string;
  full_name: string | null;
  role: "admin" | "supervisor" | "coordenador";
  auth_type: "local" | "google";
}

interface UserRow extends AuthUser {
  password_hash: string | null;
  google_id: string | null;
  active: number;
}

export const generateToken = (user: AuthUser): string => {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      full_name: user.full_name,
      role: user.role,
      auth_type: user.auth_type,
    },
    JWT_SECRET,
    { expiresIn: "7d" },
  );
};

export const verifyToken = (token: string): AuthUser | null => {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as AuthUser & { exp: number; iat: number };
    return {
      id: decoded.id,
      email: decoded.email,
      full_name: decoded.full_name ?? null,
      role: decoded.role,
      auth_type: decoded.auth_type,
    };
  } catch {
    return null;
  }
};

export const hashPassword = async (password: string): Promise<string> => {
  return bcrypt.hash(password, 10);
};

export const verifyPassword = async (password: string, hash: string): Promise<boolean> => {
  return bcrypt.compare(password, hash);
};

export const getUserByEmail = async (email: string): Promise<AuthUser | null> => {
  const rows = await db.query<AuthUser>(
    "SELECT id, email, full_name, role, auth_type FROM users WHERE email = ? AND active = 1",
    [email],
  );
  return rows[0] || null;
};

export const getUserById = async (id: number): Promise<AuthUser | null> => {
  const rows = await db.query<AuthUser>(
    "SELECT id, email, full_name, role, auth_type FROM users WHERE id = ? AND active = 1",
    [id],
  );
  return rows[0] || null;
};

export const loginLocal = async (email: string, password: string) => {
  const rows = await db.query<UserRow>(
    "SELECT id, email, full_name, role, password_hash, auth_type, google_id FROM users WHERE email = ? AND auth_type = 'local' AND active = 1 LIMIT 1",
    [email],
  );

  if (!rows.length || !rows[0].password_hash) {
    throw new Error("invalid_credentials");
  }

  const user = rows[0];
  const passwordMatch = await verifyPassword(password, user.password_hash);

  if (!passwordMatch) {
    throw new Error("invalid_credentials");
  }

  const authUser: AuthUser = {
    id: user.id,
    email: user.email,
    full_name: user.full_name,
    role: user.role,
    auth_type: user.auth_type,
  };

  return {
    user: authUser,
    token: generateToken(authUser),
  };
};

export const loginGoogle = async (
  googleId: string,
  email: string,
  fullName: string,
  avatarUrl: string,
) => {
  let rows = await db.query<UserRow>(
    "SELECT id, email, full_name, role, auth_type, google_id, password_hash, active FROM users WHERE google_id = ? LIMIT 1",
    [googleId],
  );

  let user = rows[0];
  if (user && !user.active) {
    throw new Error("user_inactive");
  }

  if (!user) {
    rows = await db.query<UserRow>(
      "SELECT id, email, full_name, role, auth_type, google_id, password_hash, active FROM users WHERE email = ? LIMIT 1",
      [email],
    );
    user = rows[0];

    if (user && !user.active) {
      throw new Error("user_inactive");
    }

    if (user) {
      await db.execute(
        "UPDATE users SET google_id = ?, avatar_url = ?, full_name = COALESCE(NULLIF(?, ''), full_name) WHERE id = ?",
        [googleId, avatarUrl || null, fullName || null, user.id],
      );

      const refreshed = await db.query<UserRow>(
        "SELECT id, email, full_name, role, auth_type, google_id, password_hash, active FROM users WHERE id = ? LIMIT 1",
        [user.id],
      );

      if (refreshed[0]) {
        user = refreshed[0];
      }
    } else {
      const insertResult = await db.execute(
        "INSERT INTO users (google_id, email, full_name, avatar_url, auth_type, role, active) VALUES (?, ?, ?, ?, 'google', 'coordenador', 1)",
        [googleId, email, fullName || null, avatarUrl || null],
      );

      const created = await getUserById(insertResult.insertId);
      if (!created) {
        throw new Error("failed_to_create_user");
      }

      user = { ...created, password_hash: null, google_id: googleId };
    }
  }

  const authUser: AuthUser = {
    id: user.id,
    email: user.email,
    full_name: user.full_name,
    role: user.role,
    auth_type: user.auth_type,
  };

  return {
    user: authUser,
    token: generateToken(authUser),
  };
};

export const ensureAdminUser = async (): Promise<void> => {
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;
  const adminName = process.env.ADMIN_NAME || "Administrador do Sistema";

  if (!adminEmail || !adminPassword) {
    return;
  }

  const passwordHash = await hashPassword(adminPassword);
  const existingUser = await db.query<UserRow>(
    "SELECT id, email, full_name, role, auth_type, google_id, password_hash FROM users WHERE email = ? LIMIT 1",
    [adminEmail],
  );

  if (existingUser.length) {
    await db.execute(
      "UPDATE users SET password_hash = ?, full_name = ?, auth_type = 'local', role = 'admin', active = 1 WHERE id = ?",
      [passwordHash, adminName, existingUser[0].id],
    );
    return;
  }

  await db.execute(
    "INSERT INTO users (email, password_hash, full_name, auth_type, role, active) VALUES (?, ?, ?, 'local', 'admin', 1)",
    [adminEmail, passwordHash, adminName],
  );
};
