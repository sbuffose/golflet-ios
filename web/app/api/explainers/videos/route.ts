import { handle, json } from "@/lib/http";
import { publicVideos } from "@/lib/explainers";
/** Public (t130u): { videos: { <explainer_key>: { instagram?, tiktok?, youtube?, x? } } }. Only keys with a URL; show no link otherwise. */
export const GET = handle(async () => json(await publicVideos()));
