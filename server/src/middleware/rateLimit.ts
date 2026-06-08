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
