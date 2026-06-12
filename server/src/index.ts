import express from "express";
import cors from "cors";
import helmet from "helmet";
import { env } from "./config/env";
import { apiRouter } from "./routes";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";
import { apiRateLimiter } from "./middleware/rateLimit";
import { startScrapeScheduler } from "./services/scraping/scheduler";

const app = express();

// Render sits in front of the app as a single reverse-proxy hop, setting
// X-Forwarded-For — trust it so req.ip (used by express-rate-limit) reflects
// the real client IP instead of Render's internal proxy address.
app.set("trust proxy", 1);

const allowedOrigins = env.appUrl
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

// Security headers (HSTS, X-Content-Type-Options, etc.). CSP is left to the
// default (off for non-HTML APIs) since this server only ever returns JSON/PDF.
app.use(helmet({ contentSecurityPolicy: false }));

app.use(
  cors({
    origin: (origin, cb) => {
      // Allow requests with no origin (mobile apps, curl, Render health checks)
      if (!origin) return cb(null, true);
      if (allowedOrigins.includes(origin)) return cb(null, true);
      cb(new Error(`CORS: origin ${origin} not allowed`));
    },
    credentials: true,
  })
);
// Report attachments are uploaded as base64 JSON (see reports.controller.ts) —
// base64 inflates payloads ~33%, so this must comfortably exceed MAX_UPLOAD_BYTES.
app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ extended: true }));

app.use("/api", apiRateLimiter, apiRouter);

app.use(notFoundHandler);
app.use(errorHandler);

app.listen(env.port, () => {
  console.log(`Server listening on http://localhost:${env.port} (${env.nodeEnv})`);
  startScrapeScheduler();
});
