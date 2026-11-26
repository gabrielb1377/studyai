/**
 * StudyAI — Intelligence Engine (IE-1)
 * Ponto de entrada público do subsistema de Skills Pedagógicas.
 */

import { setDefaultRegistrationHandler } from "./SkillRegistry";
import { registerTeacherSkills } from "./teacher/TeacherSkills";
import { registerPilotSkills } from "./pilot";
import { registerFoundationSkills } from "./foundation";
import { registerOrganizationSkills } from "./organization";

// Configura o handler de registro das skills do Teacher, Pilot, Foundation (IE-4A) e Organization (IE-4B)
setDefaultRegistrationHandler((registry) => {
  registerTeacherSkills(registry);
  registerPilotSkills(registry);
  registerFoundationSkills(registry);
  registerOrganizationSkills(registry);
});

export * from "./types";
export * from "./config";
export * from "./SkillRegistry";
export * from "./OutputValidator";
export * from "./SkillRepairService";
export * from "./pilot";
export * from "./foundation";
export * from "./organization";
export { registerTeacherSkills, buildTeacherInstruction, buildTeacherActionMessage } from "./teacher/TeacherSkills";
