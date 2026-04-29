import cors from "cors";
import express from "express";
import { ensureAdminUser } from "./auth";
import db from "./db";
import { ensureEventsSchema } from "./events";
import { ensureEventAuditLogsSchema } from "./logs";
import { handleRequest } from "./http";
import { ensureUsersSchema } from "./users";

const app = express();
const PORT = Number(process.env.PORT || 3001);
const configuredOrigins = process.env.CORS_ORIGIN || "http://localhost:8080";
const AUTH_RATE_LIMIT_MAX_ATTEMPTS = Number(process.env.AUTH_RATE_LIMIT_MAX_ATTEMPTS || 12);
const AUTH_RATE_LIMIT_WINDOW_MS = Number(process.env.AUTH_RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000);

interface RateBucket {
  hits: number;
  expiresAt: number;
}

const authRateBuckets = new Map<string, RateBucket>();

const normalizeOrigin = (value: string): string => {
  const parsed = new URL(value.trim());
  return `${parsed.protocol}//${parsed.host}`.toLowerCase();
};

const allowedOrigins = new Set<string>();
for (const origin of configuredOrigins.split(",").map((value) => value.trim()).filter(Boolean)) {
  try {
    if (!origin.startsWith("http://") && !origin.startsWith("https://")) {
      throw new Error("invalid_origin_scheme");
    }
    allowedOrigins.add(normalizeOrigin(origin));
  } catch {
    console.warn(`[security] CORS_ORIGIN ignorado por formato invalido: ${origin}`);
  }
}

if (!allowedOrigins.size) {
  allowedOrigins.add("http://localhost:8080");
}

const isAuthLoginPath = (path: string): boolean => {
  return path === "/api/auth/login-local" || path === "/api/auth/login-google-token";
};

const getClientIp = (req: express.Request): string => {
  const xForwardedFor = req.headers["x-forwarded-for"];
  if (typeof xForwardedFor === "string" && xForwardedFor.trim()) {
    return xForwardedFor.split(",")[0].trim();
  }

  return req.ip || req.socket.remoteAddress || "unknown";
};

const cleanupExpiredBuckets = (): void => {
  const now = Date.now();
  for (const [key, bucket] of authRateBuckets.entries()) {
    if (bucket.expiresAt <= now) {
      authRateBuckets.delete(key);
    }
  }
};

const getRateLimitKeys = (req: express.Request): string[] => {
  const ip = getClientIp(req);
  const keys = [`auth:${ip}`];

  if (req.path === "/auth/login-local" && req.body && typeof req.body === "object") {
    const rawEmail = String((req.body as Record<string, unknown>).email || "").trim().toLowerCase();
    keys.push(`login-local:${ip}:${rawEmail || "-"}`);
    return keys;
  }

  keys.push(`login-google:${ip}`);
  return keys;
};

app.disable("x-powered-by");
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader("Cross-Origin-Resource-Policy", "same-site");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");

  if (String(process.env.NODE_ENV || "").toLowerCase() === "production") {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }

  next();
});
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) {
        callback(null, true);
        return;
      }

      try {
        const normalizedOrigin = normalizeOrigin(origin);
        callback(null, allowedOrigins.has(normalizedOrigin));
      } catch {
        callback(null, false);
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);
app.use(express.json({ limit: "1mb" }));
app.use("/api", (req, res, next) => {
  if (!isAuthLoginPath(`/api${req.path}`)) {
    next();
    return;
  }

  cleanupExpiredBuckets();
  const now = Date.now();
  const keys = getRateLimitKeys(req);

  let maxRetryAfterSeconds = 0;
  for (const key of keys) {
    const bucket = authRateBuckets.get(key);
    if (!bucket || bucket.expiresAt <= now) {
      continue;
    }

    if (bucket.hits >= AUTH_RATE_LIMIT_MAX_ATTEMPTS) {
      const retryAfterSeconds = Math.max(1, Math.ceil((bucket.expiresAt - now) / 1000));
      maxRetryAfterSeconds = Math.max(maxRetryAfterSeconds, retryAfterSeconds);
    }
  }

  if (maxRetryAfterSeconds > 0) {
    res.setHeader("Retry-After", String(maxRetryAfterSeconds));
    res.status(429).json({
      error: "Muitas tentativas de autenticacao. Aguarde alguns minutos e tente novamente.",
    });
    return;
  }

  for (const key of keys) {
    const bucket = authRateBuckets.get(key);
    if (!bucket || bucket.expiresAt <= now) {
      authRateBuckets.set(key, { hits: 1, expiresAt: now + AUTH_RATE_LIMIT_WINDOW_MS });
      continue;
    }

    bucket.hits += 1;
    authRateBuckets.set(key, bucket);
  }

  next();
});

app.get("/health", async (_req, res) => {
  try {
    await db.ping();
    return res.status(200).json({ ok: true, database: "connected" });
  } catch (error) {
    console.error("Healthcheck error:", error);
    return res.status(500).json({ ok: false, database: "disconnected" });
  }
});

app.use("/api", async (req, res) => {
  const normalizedHeaders = Object.fromEntries(
    Object.entries(req.headers).map(([key, value]) => [
      key.toLowerCase(),
      Array.isArray(value) ? value.join(",") : String(value || ""),
    ]),
  );

  const normalizedQuery = Object.fromEntries(
    Object.entries(req.query).map(([key, value]) => [key, Array.isArray(value) ? String(value[0] || "") : String(value || "")]),
  );

  const response = await handleRequest({
    method: req.method,
    path: `/api${req.path}`,
    headers: normalizedHeaders,
    query: normalizedQuery,
    body: req.body,
  });

  if (response.headers) {
    res.set(response.headers);
  }

  return res.status(response.status).json(response.body);
});

const startServer = async () => {
  try {
    await db.ping();
    await ensureUsersSchema();
    await ensureEventsSchema();
    await ensureEventAuditLogsSchema();
    await ensureAdminUser();

    app.listen(PORT, () => {
      console.log(`API disponível em http://localhost:${PORT}`);
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "invalid_or_missing_jwt_secret") {
        console.error(
          "Falha de seguranca: JWT_SECRET ausente/fraco em producao. Configure um segredo forte (>=32 caracteres).",
        );
      } else if (error.message === "missing_admin_bootstrap") {
        console.error(
          "Bootstrap admin obrigatorio: defina ADMIN_EMAIL e ADMIN_PASSWORD no .env para criar o primeiro administrador.",
        );
      } else if (error.message === "weak_admin_password") {
        console.error(
          "Falha de seguranca: ADMIN_PASSWORD fraca. Use no minimo 12 caracteres com maiuscula, minuscula, numero e simbolo.",
        );
      } else if (error.message === "invalid_admin_email") {
        console.error("Falha de configuracao: ADMIN_EMAIL invalido.");
      }
    }

    console.error("Falha ao iniciar servidor:", error);
    process.exit(1);
  }
};

startServer();
