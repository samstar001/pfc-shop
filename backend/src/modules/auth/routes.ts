import { Router } from "express";
import { googleCallback, googleLogin, logout, me } from "./controller.js";

// Authentication routes
export const authRouter = Router();

authRouter.get("/auth/google/login", googleLogin);
authRouter.get("/auth/google/callback", googleCallback);
authRouter.get("/auth/me", me);
authRouter.post("/auth/logout", logout);
