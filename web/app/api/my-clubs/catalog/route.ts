import { handle, HttpError } from "@/lib/http";
import { CLUB_TYPES, CATEGORY_LABEL, CATALOG, brandsFor, modelsFor, type Category } from "@/lib/club-catalog";

/** Public reference list (no user data): club types, brands and models. ?category=driver|fairway|hybrid|iron|wedge|putter[&brand=X] */
export const GET = handle(async (req: Request) => {
  const u = new URL(req.url), cat = u.searchParams.get("category") as Category | null, brand = u.searchParams.get("brand");
  if (cat && !(cat in CATEGORY_LABEL)) throw new HttpError(400, "Categoría inválida");
  const cats = Object.keys(CATEGORY_LABEL) as Category[];
  const res: any = { types: CLUB_TYPES, categories: cats.map(k => ({ key: k, label: CATEGORY_LABEL[k] })), note: "Lista de referencia, no exhaustiva: si tu marca o modelo no está, escribilo." };
  if (cat && brand) res.models = modelsFor(brand, cat);
  else if (cat) res.brands = brandsFor(cat).map(b => ({ brand: b, models: modelsFor(b, cat) }));
  else res.brands = Object.entries(CATALOG).map(([b, l]) => ({ brand: b, categories: l }));
  return Response.json(res, { headers: { "Cache-Control": "public, max-age=3600" } });
});
