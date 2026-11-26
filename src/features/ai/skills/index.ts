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

// Configura o handler de registro das skills do Teacher, Pilot, Foundation (IE-4A), Organization (IE-4B), Practice (IE-4C), Personalized (IE-4D) e Audio/Computing (IE-4E)
setDefaultRegistrationHandler((registry) => {
  registerTeacherSkills(registry);
  registerPilotSkills(registry);
  registerFoundationSkills(registry);
  registerOrganizationSkills(registry);
  registerPracticeSkills(registry);
  registerPersonalizedSkills(registry);
  registerAudioComputingSkills(registry);
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
export { registerTeacherSkills, buildTeacherInstruction, buildTeacherActionMessage } from "./teacher/TeacherSkills";
