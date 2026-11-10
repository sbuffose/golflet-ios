import { handle, json } from "@/lib/http";
import { lookupMaker } from "@/lib/maker-specs";
import type { Category } from "@/lib/club-catalog";

/** One checked manufacturer row. No user bag, no scrape. */
export const GET = handle(async (req: Request) => {
  const u = new URL(req.url);
  const category = (u.searchParams.get("category") || "") as Category;
  return json(lookupMaker({
    brand: u.searchParams.get("brand"),
    model: u.searchParams.get("model"),
    category: category || null,
  }));
});
