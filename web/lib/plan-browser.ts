/** Browser bundle entry (public/plan-core.js → window.GolfletPlanCore): planner maths + Modo torneo matrix + Qué conviene. */
export * from "./plan-core";
export * from "./torneo-core";
export * from "./plan-suggest";
// green-guide-core shares inPoly with plan-core (an ambiguous `export *` drops both), so list its exports explicitly
export { greenGeom, greenBox, halfWidthAt, RULES_480_PT_PER_YD } from "./green-guide-core";
export * from "./shotlog-core";   // t202u: on-device OMR of the pencil libreta (photos never leave the phone)
export { AUTO_DEFAULTS, asMeters, asInPoly, asDistToLine, asLateral, classifyLie, detectStops, autoHole, holeOutcome, relayHole, autoToLog, geoFromMap } from "./autoshot-core";   // t204u: GPS/wearable auto shot detection, on the phone
