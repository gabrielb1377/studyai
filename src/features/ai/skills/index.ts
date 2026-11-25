/**
 * StudyAI — Intelligence Engine (IE-1)
 * Ponto de entrada público do subsistema de Skills Pedagógicas.
 */

import { setDefaultRegistrationHandler } from "./SkillRegistry";
import { registerTeacherSkills } from "./teacher/TeacherSkills";

// Configura o handler de registro das skills do Teacher
setDefaultRegistrationHandler((registry) => {
  registerTeacherSkills(registry);
});

export * from "./types";
export * from "./config";
export * from "./SkillRegistry";
export * from "./OutputValidator";
export * from "./SkillRepairService";
export { registerTeacherSkills, buildTeacherInstruction, buildTeacherActionMessage } from "./teacher/TeacherSkills";
