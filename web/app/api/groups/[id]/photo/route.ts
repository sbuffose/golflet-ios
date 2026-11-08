import { handle, json, requireUser, HttpError } from "@/lib/http";
import { groupPhoto, loadGroup, setPhoto } from "@/lib/groups";
import { MAX_PHOTO_BYTES } from "@/lib/group-share";
type C = { params: Promise<{ id: string }> };
/** GET (members) → JPEG */
export const GET = handle(async (req: Request, ctx: C) => {
  const u = await requireUser(req); const { id } = await ctx.params; await loadGroup(id, u.id, "member");
  const b = await groupPhoto(id); if (!b) throw new HttpError(404, "Sin foto");
  return new Response(new Uint8Array(b), { headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=86400", "X-Content-Type-Options": "nosniff" } });
});
/** PUT (admins) → body = the image bytes (Content-Type image/*) or multipart field "photo". Resized to 512px JPEG. */
export const PUT = handle(async (req: Request, ctx: C) => {
  const u = await requireUser(req); const { id } = await ctx.params;
  const ct = req.headers.get("content-type") || ""; let buf: Buffer;
  if (Number(req.headers.get("content-length") || 0) > MAX_PHOTO_BYTES) throw new HttpError(413, "La foto tiene que pesar menos de 6 MB.");
  if (ct.startsWith("multipart/form-data")) { const f = (await req.formData()).get("photo"); if (!f || typeof f === "string") throw new HttpError(400, "Falta la foto"); if (!f.type.startsWith("image/")) throw new HttpError(400, "Solo imágenes."); buf = Buffer.from(await f.arrayBuffer()); }
  else if (ct.startsWith("image/")) buf = Buffer.from(await req.arrayBuffer());
  else throw new HttpError(415, "Mandá una imagen (image/jpeg, image/png, image/webp o image/heic).");
  return json(await setPhoto(u.id, id, buf));
});
/** DELETE (admins) → removes the photo. */
export const DELETE = handle(async (req: Request, ctx: C) => {
  const u = await requireUser(req); const { id } = await ctx.params; return json(await setPhoto(u.id, id, null));
});
