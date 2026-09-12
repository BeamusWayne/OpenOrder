import { createMiddleware } from "hono/factory";
import { SignJWT, jwtVerify } from "jose";
import { env } from "./env.js";

const secret = new TextEncoder().encode(env.jwtSecret);

export async function signCustomer(customerId: string): Promise<string> {
  return new SignJWT({ sub: customerId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secret);
}

export const requireAuth = createMiddleware<{
  Variables: { customerId: string };
}>(async (context, next) => {
  const header = context.req.header("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) {
    return context.json({ error: "missing_token" }, 401);
  }
  try {
    const { payload } = await jwtVerify(token, secret);
    if (typeof payload.sub !== "string") {
      return context.json({ error: "invalid_token" }, 401);
    }
    context.set("customerId", payload.sub);
    await next();
  } catch {
    return context.json({ error: "invalid_token" }, 401);
  }
});
