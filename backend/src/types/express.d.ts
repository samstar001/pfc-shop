import type { User } from "@prisma/client";

// Tell TypeScript that req.user may exist after the attachUser middleware runs
declare global {
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

export {};
