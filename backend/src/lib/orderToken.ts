import { SignJWT, jwtVerify } from "jose";
import { env } from "../config/env.js";

const secret = new TextEncoder().encode(env.JWT_SECRET);

// A signed link-token that lets a GUEST view their own order (valid 30 days)
export async function signOrderToken(orderId: string): Promise<string> {
  return new SignJWT({ purpose: "order" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(orderId)
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secret);
}

// Returns the order id inside a valid order token, or null (the "purpose" check stops login tokens being reused here)
export async function verifyOrderToken(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, secret);
    return payload.purpose === "order" ? (payload.sub ?? null) : null;
  } catch {
    return null;
  }
}
