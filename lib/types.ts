export type Level = 1 | 2 | 3;

export interface Resource {
  title: string;
  url: string;
  type: "repo" | "book" | "spec" | "paper";
}

export interface Question {
  id: string;
  level: Level;
  topic: string;
  question: string;
  reference_answer: string;
  explanation: string;
  resources: Resource[];
}

export interface EvaluationResult {
  score: number;
  what_you_got_wrong: string;
  correct_answer: string;
  concept_explanation: string;
  real_code_reference: string;
}

export interface QuestionProgress {
  questionId: string;
  score: number;
  answeredAt: string;
}

export interface UserProgress {
  answers: QuestionProgress[];
  unlockedLevels: Level[];
}
