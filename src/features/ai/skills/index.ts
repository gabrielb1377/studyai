/**
 * StudyAI — Intelligence Engine (IE-1)
 * Ponto de entrada público do subsistema de Skills Pedagógicas.
 */

import { setDefaultRegistrationHandler } from "./SkillRegistry";
import { registerTeacherSkills } from "./teacher/TeacherSkills";
import { registerPilotSkills } from "./pilot";
import { registerFoundationSkills } from "./foundation";
import { registerOrganizationSkills } from "./organization";
import { registerPracticeSkills } from "./practice";
import { registerPersonalizedSkills } from "./personalized";
import { registerAudioComputingSkills } from "./audio-computing";
import { registerMathExamSkills } from "./math-exam";

// Configura o handler de registro das 13 skills do Teacher + 20/20 skills oficiais (Piloto, IE-4A..IE-4F)
setDefaultRegistrationHandler((registry) => {
  registerTeacherSkills(registry);
  registerPilotSkills(registry);
  registerFoundationSkills(registry);
  registerOrganizationSkills(registry);
  registerPracticeSkills(registry);
  registerPersonalizedSkills(registry);
  registerAudioComputingSkills(registry);
  registerMathExamSkills(registry);
});

export * from "./types";
export * from "./config";
export * from "./SkillRegistry";
export * from "./OutputValidator";
export * from "./SkillRepairService";
export * from "./pilot";
export * from "./foundation";
export * from "./organization";
export * from "./practice";
export * from "./personalized";
export * from "./audio-computing";
export * from "./math-exam";
export { registerTeacherSkills, buildTeacherInstruction, buildTeacherActionMessage } from "./teacher/TeacherSkills";
