import { handle, json, requireUser } from "@/lib/http";
import { myProfesorProfile } from "@/lib/profesor-space";
import { mailerConfigured } from "@/lib/mailer";
/** → { profesor: profile | null, accounts_enabled } (accounts_enabled = an email sender is configured; sign-up/claim stay gated until then). */
export const GET = handle(async (req: Request) => { const u = await requireUser(req); return json({ profesor: await myProfesorProfile(u.id), accounts_enabled: mailerConfigured() }); });
