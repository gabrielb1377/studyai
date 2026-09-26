import {
  teacherActions,
  teacherLevels,
  teacherMethods,
  teacherSummaryStyles,
  type TeacherRequest,
} from "./types";

export function isTeacherRequest(value: unknown): value is TeacherRequest {
  if (typeof value !== "object" || value === null) return false;
  const request = value as Partial<TeacherRequest>;
  const selection = request.selection;
  const validSelection = selection === undefined || (
    typeof selection === "object" && selection !== null &&
    typeof selection.text === "string" && selection.text.trim().length > 0 && selection.text.length <= 4_000 &&
    (selection.sourceName === undefined || typeof selection.sourceName === "string") &&
    (selection.page === undefined || (Number.isInteger(selection.page) && selection.page > 0)) &&
    (selection.chapter === undefined || typeof selection.chapter === "string")
  );

  return request.mode === "teacher" &&
    teacherLevels.includes(request.level as TeacherRequest["level"]) &&
    teacherMethods.includes(request.method as TeacherRequest["method"]) &&
    teacherActions.includes(request.action as TeacherRequest["action"]) &&
    teacherSummaryStyles.includes(request.summaryStyle as TeacherRequest["summaryStyle"]) &&
    validSelection;
}
