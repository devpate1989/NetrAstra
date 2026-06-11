import rateLimit from "express-rate-limit";

// Generous enough for normal use, tight enough to blunt credential-stuffing /
// password-reset-spam against these public, unauthenticated endpoints.
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many attempts. Please try again in a few minutes." },
});

// Coarse ceiling across the whole API — generous for normal app usage, but
// blunts gross abuse (e.g. a compromised token hammering an endpoint).
export const apiRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 600,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many requests. Please slow down and try again shortly." },
});

// Portal-refresh endpoints launch a Selenium browser session against an
// external portal — keep these tight so they can't be triggered repeatedly.
export const scrapeRateLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Portal sync was run recently. Please wait a few minutes before retrying." },
});

// Document scanning calls the Claude API for OCR on every request — keep this
// tighter than the general API limit to bound AI spend from a single account.
export const ocrRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many document scans recently. Please wait a few minutes before scanning more." },
});

// Legal analysis calls Claude on every request, and "deep" mode uses a larger
// sonnet output budget — keep this tight to bound AI spend.
export const legalAnalysisRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many legal analysis requests recently. Please wait a few minutes before trying again." },
});
