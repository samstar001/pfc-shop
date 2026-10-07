import rateLimit from "express-rate-limit";

// Limit order creation to 20 requests per 15 minutes per IP (stops spam and accidental loops)
export const orderLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, //15 minutes window
  limit: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({
      error: {
        code: "RATE_LIMITED",
        message: "Too many requests, please try again shortly",
      },
    });
  },
});

// Payment start/verify: 40 requests per 15 minutes per IP
export const paymentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 40,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({
      error: {
        code: "RATE_LIMITED",
        message: "Too many requests, please try again shortly",
      },
    });
  },
});

// Public design uploads: 15 per 15 minutes per IP
export const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 15,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  handler: (_req, res) => {
    res
      .status(429)
      .json({
        error: {
          code: "RATE_LIMITED",
          message: "Too many uploads, please try again shortly",
        },
      });
  },
});
