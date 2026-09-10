export type QuizDifficulty = "easy" | "medium" | "hard";

export type QuizQuestion = {
  id: string;
  studyId: string;
  question: string;
  alternatives: string[];
  correctAnswer: number;
  explanation: string;
  difficulty: QuizDifficulty;
  createdAt: string;
};

export type QuizResult = {
  id: string;
  studyId: string;
  questionIds: string[];
  correctAnswers: number;
  wrongAnswers: number;
  score: number;
  createdAt: string;
  completedAt: string;
};
