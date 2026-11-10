import { handle, json, requireUser, HttpError } from "@/lib/http";
import { MAX_PHOTO_BYTES } from "@/lib/group-share";
import { readProfilePhoto, setProfilePhoto } from "@/lib/profile-photo";

/** GET → JPEG, or 404 when there is no photo or migration 0045 is not applied. */
export const GET = handle(async (req: Request) => {
  const u = await requireUser(req);
  const b = await readProfilePhoto(u.id);
  if (!b) throw new HttpError(404, "Sin foto");
  return new Response(new Uint8Array(b), { headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff" } });
});

/** PUT body = image bytes. Square JPEG is produced by the shared cropper before this call. */
export const PUT = handle(async (req: Request) => {
  const u = await requireUser(req);
  const ct = req.headers.get("content-type") || "";
  if (Number(req.headers.get("content-length") || 0) > MAX_PHOTO_BYTES) throw new HttpError(413, "La foto tiene que pesar menos de 6 MB. La anterior sigue igual.");
  if (!ct.startsWith("image/")) throw new HttpError(415, "Mandá una imagen. La anterior sigue igual.");
  const buf = Buffer.from(await req.arrayBuffer());
  return json(await setProfilePhoto(u.id, buf));
});

/** DELETE removes the photo. Initials come back. */
export const DELETE = handle(async (req: Request) => {
  const u = await requireUser(req);
  return json(await setProfilePhoto(u.id, null));
});
