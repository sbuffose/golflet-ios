/**
 * Better Auth plugin: POST /api/auth/golfistics { matricula, clave, save_password? } → Better Auth session (cookie for the web,
 * `set-auth-token` header + `token` for the iPhone, via the bearer plugin). See API_v5.md §6.
 */
import { APIError, createAuthEndpoint } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import * as z from "zod";
import { q } from "./db";
import { classifyLoginError, currentVerifier, failCounts, findUserForMatricula, normMatricula, placeholderEmail, rateDecision, recordAttempt, refreshSavedClave, savePending, type LoginFailure } from "./golfistics-login";

const fail = (f: LoginFailure) => {
  const { counts: _c, status, ...body } = f;
  return new APIError(status === 401 ? "UNAUTHORIZED" : status === 429 ? "TOO_MANY_REQUESTS" : status === 400 ? "BAD_REQUEST" : "SERVICE_UNAVAILABLE", body, status === 429 ? { "Retry-After": String(f.retry_after_s ?? 900) } : undefined);
};
const clientIp = (h: Headers | undefined) => (h?.get("x-real-ip") || h?.get("x-forwarded-for")?.split(",")[0] || "").trim().slice(0, 64) || null;

export const golfisticsAuth = () => ({
  id: "golfistics",
  endpoints: {
    signInGolfistics: createAuthEndpoint("/golfistics", {
      method: "POST",
      body: z.object({ matricula: z.string().max(64), clave: z.string().max(128), save_password: z.boolean().optional() }),
    }, async (ctx) => {
      const matricula = normMatricula(ctx.body.matricula), clave = ctx.body.clave;
      if (!matricula || !clave) throw fail({ status: 400, code: "BAD_INPUT", message: "Escribí tu matrícula y tu contraseña.", counts: false });
      const ip = clientIp(ctx.request?.headers ?? ctx.headers);
      const c = await failCounts(matricula, ip);
      const limited = rateDecision(c.m, c.ip); if (limited) throw fail(limited);

      let player;
      try { player = await currentVerifier()(matricula, clave); }
      catch (e) {
        const f = classifyLoginError(e);
        if (f.counts) await recordAttempt(matricula, ip, false);
        else console.error("golfistics sign-in unavailable", e instanceof Error ? e.message.slice(0, 120) : "unknown");
        throw fail(f);
      }
      await recordAttempt(matricula, ip, true);
      const save = ctx.body.save_password !== false;
      const adapter = ctx.context.internalAdapter;

      let userId = await findUserForMatricula(matricula), isNew = false;
      let user = userId ? await adapter.findUserById(userId) : null;
      if (!user) {
        const email = placeholderEmail(matricula);
        user = (await adapter.findUserByEmail(email))?.user ?? null;
        if (!user) { user = await adapter.createUser({ email, name: player.player_name || `Matrícula ${matricula}`, emailVerified: false }, { method: "golfistics" } as any); isNew = true; }
        userId = user!.id;
      }
      const uid = user!.id;
      const [link] = await q(`select 1 from account where "userId"=$1 and "providerId"='golfistics' and lower("accountId")=lower($2)`, [uid, matricula]);
      if (!link) await adapter.linkAccount({ userId: uid, providerId: "golfistics", accountId: matricula });

      // existing link: keep the saved clave in step; no link yet: run the normal first sync right after (POST /api/accounts/first-sync)
      const r = await refreshSavedClave(uid, matricula, clave, save);
      const needsSync = r.linked === 0;
      if (needsSync) await savePending(uid, matricula, clave, save);

      const session = await adapter.createSession(uid);
      if (!session) throw new APIError("INTERNAL_SERVER_ERROR", { message: "No se pudo iniciar la sesión" });
      await setSessionCookie(ctx, { session, user: user! });
      const [role] = await q(`select role from user_role where user_id=$1`, [uid]);
      return ctx.json({ token: session.token, user: { id: uid, name: user!.name, email: user!.email, role: role?.role ?? null },
        new_account: isNew, needs_first_sync: needsSync, player: { name: player.player_name, handicap_index: player.handicap_index } });
    }),
  },
});
