import { handle, json, requireUser } from "@/lib/http";
import { body } from "@/lib/accounts";
import { ReconstructSchemaError, deleteManualShot, listManualShots, saveManualShot, updateManualShot } from "@/lib/reconstruct";

type Ctx = { params: Promise<{ id: string }> };

function fail(e: unknown) {
  if (e instanceof ReconstructSchemaError) return json({ error: e.message }, 503);
  throw e;
}

export const GET = handle(async (req: Request, ctx: Ctx) => {
  const user = await requireUser(req);
  const { id } = await ctx.params;
  try { return json({ shots: await listManualShots(user.id, id) }); }
  catch (e) { return fail(e); }
});

export const POST = handle(async (req: Request, ctx: Ctx) => {
  const user = await requireUser(req);
  const { id } = await ctx.params;
  const b = await body<any>(req);
  try { return json({ shot: await saveManualShot(user.id, id, b) }, 201); }
  catch (e) { return fail(e); }
});

export const PATCH = handle(async (req: Request, ctx: Ctx) => {
  const user = await requireUser(req);
  const { id } = await ctx.params;
  const b = await body<any>(req);
  if (!b.shot_id) return json({ error: "Falta el golpe" }, 400);
  try { return json({ shot: await updateManualShot(user.id, id, String(b.shot_id), b) }); }
  catch (e) { return fail(e); }
});

export const DELETE = handle(async (req: Request, ctx: Ctx) => {
  const user = await requireUser(req);
  const { id } = await ctx.params;
  const shotId = new URL(req.url).searchParams.get("shot");
  if (!shotId) return json({ error: "Falta el golpe" }, 400);
  try { return json(await deleteManualShot(user.id, id, shotId)); }
  catch (e) { return fail(e); }
});
