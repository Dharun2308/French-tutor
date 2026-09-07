import { NextRequest } from "next/server";
import { z } from "zod";
import { curriculumOverview, setTopicCompletion, TopicNotFound } from "@/lib/curriculum/service";
import { jsonError, jsonOk } from "@/lib/api";

export const dynamic = "force-dynamic";
export async function GET() {
  try { return jsonOk(await curriculumOverview()); }
  catch (error) { console.error("Topics overview:", error); return jsonError("Could not load topic progress. Please retry.", 500); }
}

export async function PATCH(request: NextRequest) {
  let body;
  try { body = z.object({ topicId: z.string().min(1).max(100), manualDone: z.boolean() }).parse(await request.json()); }
  catch { return jsonError("Choose a topic and a Done or Unfinished status.", 400); }
  try { return jsonOk(await setTopicCompletion(body.topicId, body.manualDone)); }
  catch (error) { return jsonError(error instanceof TopicNotFound ? "Topic not found." : "Could not save topic status. Please retry.", error instanceof TopicNotFound ? 404 : 500); }
}
