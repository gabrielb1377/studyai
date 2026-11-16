import { NextResponse } from "next/server";
import { apiError, jsonBody, requireActiveSession, requireCsrf, requireSessionOwner, requireUser } from "@/server/auth/http";
import { ExamAttemptServer } from "@/server/exam/ExamAttemptServer";

export const runtime = "nodejs";

type GradePayload = { attemptId?: unknown; answers?: unknown };

export async function POST(request: Request) {
  try {
    requireCsrf(request);
    const user = requireUser(request);
    await requireActiveSession(request, user);
    requireSessionOwner(request, user.sub);
    const body = await jsonBody<GradePayload>(request);
    const result = await ExamAttemptServer.grade(user.sub, body.attemptId, body.answers);
    return NextResponse.json(result);
  } catch (error) {
    return apiError(error);
  }
}