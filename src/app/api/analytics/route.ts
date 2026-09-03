import { jsonOk } from "@/lib/api";
import { learningAnalytics } from "@/lib/items/analytics";
export const dynamic = "force-dynamic";
export async function GET() { return jsonOk(await learningAnalytics()); }
