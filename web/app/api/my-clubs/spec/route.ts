import { handle, json } from "@/lib/http";
import { lookupMaker } from "@/lib/maker-specs";
import type { Category } from "@/lib/club-catalog";

/** Public, cached manufacturer fact for one brand + model + club type. No user row. No live scrape. */
export const GET = handle(async (req: Request) => {
  const u = new URL(req.url);
  const category = (u.searchParams.get("category") || "") as Category;
  return json(lookupMaker({
    brand: u.searchParams.get("brand"),
    model: u.searchParams.get("model"),
    category: category || null,
  }), 200);
});
