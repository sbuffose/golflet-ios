import { handle, json, requireUser } from "@/lib/http";
import { body } from "@/lib/accounts";
import { listEquipment, createEquipment } from "@/lib/bag-equipment";

export const GET = handle(async (req: Request) => { const user = await requireUser(req); return json({ clubs: await listEquipment(user.id) }); });
/** { code: "7i" | "W56" | …, brand?, model?, loft? } → 201 { club } */
export const POST = handle(async (req: Request) => {
  const user = await requireUser(req); const b = await body<any>(req);
  return json({ club: await createEquipment(user.id, b) }, 201);
});
