import cors from "cors";
import express from "express";
import { ensureAdminUser } from "./auth";
import db from "./db";
import { ensureEventsSchema } from "./events";
import { handleRequest } from "./http";

const app = express();
const PORT = Number(process.env.PORT || 3001);
const configuredOrigins = process.env.CORS_ORIGIN || "http://localhost:8080";
const allowedOrigins = configuredOrigins
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  }),
);
app.use(express.json({ limit: "1mb" }));

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
    await ensureEventsSchema();
    await ensureAdminUser();

    app.listen(PORT, () => {
      console.log(`API disponível em http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("Falha ao iniciar servidor:", error);
    process.exit(1);
  }
};

startServer();
