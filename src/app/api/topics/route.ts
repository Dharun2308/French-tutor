import { curriculumOverview } from "@/lib/curriculum/service";
import { jsonError, jsonOk } from "@/lib/api";

export const dynamic = "force-dynamic";
export async function GET() {
  try { return jsonOk(await curriculumOverview()); }
  catch (error) { console.error("Topics overview:", error); return jsonError("Could not load topic progress. Please retry.", 500); }
}
