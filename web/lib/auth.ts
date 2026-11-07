import { betterAuth } from "better-auth";
import { bearer } from "better-auth/plugins";
import { nextCookies } from "better-auth/next-js";
import { getPool } from "./db";
import { golfisticsAuth } from "./golfistics-auth";

const prodUrl = process.env.BETTER_AUTH_URL || "https://golflet.vercel.app";
const vercelUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined;
const branchUrl = process.env.VERCEL_BRANCH_URL ? `https://${process.env.VERCEL_BRANCH_URL}` : undefined;

export const auth = betterAuth({
  appName: "Golflet",
  baseURL: process.env.VERCEL_ENV === "production" ? prodUrl : vercelUrl || prodUrl,
  secret: process.env.BETTER_AUTH_SECRET,
  database: getPool(),
  // Players sign in with Golfistics (matrícula + clave) through /api/auth/golfistics. Email sign-in stays only for accounts that already
  // have a Golflet password (current iPhone builds, QA); new email sign-ups are closed.
  emailAndPassword: { enabled: true, minPasswordLength: 8, autoSignIn: true, disableSignUp: true },
  session: { expiresIn: 60 * 60 * 24 * 60, updateAge: 60 * 60 * 24 },
  trustedOrigins: [prodUrl, vercelUrl, branchUrl, "http://localhost:3000"].filter(Boolean) as string[],
  advanced: { useSecureCookies: process.env.NODE_ENV === "production" },
  // bearer(): native apps send `Authorization: Bearer <token>` (token from the `set-auth-token` header)
  plugins: [bearer(), golfisticsAuth(), nextCookies()],
});
