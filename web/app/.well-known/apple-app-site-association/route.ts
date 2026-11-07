/** iOS universal links: https://golflet.vercel.app/g/<token> opens the Golflet app (applinks:golflet.vercel.app). */
const APP_ID = "R56Y2GZ2M9.com.sbuffose.golflet";
export const dynamic = "force-static";
export function GET() {
  return Response.json({ applinks: { apps: [], details: [{ appID: APP_ID, appIDs: [APP_ID], paths: ["/g/*"], components: [{ "/": "/g/*", comment: "Group share links" }] }] } },
    { headers: { "Cache-Control": "public, max-age=3600" } });
}
