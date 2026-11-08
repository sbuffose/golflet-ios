/** t190u: registry of coarse green guides (sourced from clubs' printed course guides). Separate from green_surface (precise survey). */
import type { GreenGuideCourse } from "./green-guide-core";
import { MDP_CANCHA_VIEJA } from "./green-guide/209-cancha-vieja";
const ALL: GreenGuideCourse[] = [MDP_CANCHA_VIEJA];
export function getGreenGuide(club: string, course: string): GreenGuideCourse | null {
  return ALL.find(g => g.club_code === String(club) && g.course.toLowerCase() === String(course).toLowerCase()) ?? null;
}
export const listGreenGuides = () => ALL;
