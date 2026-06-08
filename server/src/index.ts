import express from "express";
import cors from "cors";
import { env } from "./config/env";
import { apiRouter } from "./routes";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";
import { startScrapeScheduler } from "./services/scraping/scheduler";

const app = express();

app.use(cors({ origin: env.appUrl, credentials: true }));
// Report attachments are uploaded as base64 JSON (see reports.controller.ts) —
// base64 inflates payloads ~33%, so this must comfortably exceed MAX_UPLOAD_BYTES.
app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ extended: true }));

app.use("/api", apiRouter);

app.use(notFoundHandler);
app.use(errorHandler);

app.listen(env.port, () => {
  console.log(`Server listening on http://localhost:${env.port} (${env.nodeEnv})`);
  startScrapeScheduler();
});
