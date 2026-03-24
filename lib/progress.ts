import { UserProgress, QuestionProgress, Level } from "./types";

const STORAGE_KEY = "rtl_prep_progress";

export function loadProgress(): UserProgress {
  if (typeof window === "undefined")
    return { answers: [], unlockedLevels: [1] };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { answers: [], unlockedLevels: [1] };
    return JSON.parse(raw) as UserProgress;
  } catch {
    return { answers: [], unlockedLevels: [1] };
  }
}

export function saveAnswer(qId: string, score: number): void {
  const progress = loadProgress();
  const existing = progress.answers.findIndex((a) => a.questionId === qId);
  const entry: QuestionProgress = {
    questionId: qId,
    score,
    answeredAt: new Date().toISOString(),
  };
  if (existing >= 0) progress.answers[existing] = entry;
  else progress.answers.push(entry);

  // Unlock next level if avg score >= 6 on current level
  progress.unlockedLevels = computeUnlocked(progress.answers);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
}

function computeUnlocked(answers: QuestionProgress[]): Level[] {
  const levels: Level[] = [1];
  const avgForLevel = (lvl: number, ids: string[]) => {
    const relevant = answers.filter((a) => ids.includes(a.questionId));
    if (relevant.length < 4) return 0;
    return relevant.reduce((s, a) => s + a.score, 0) / relevant.length;
  };

  const l1ids = ["l1-q1","l1-q2","l1-q3","l1-q4","l1-q5","l1-q6","l1-q7","l1-q8"];
  const l2ids = ["l2-q1","l2-q2","l2-q3","l2-q4","l2-q5","l2-q6","l2-q7","l2-q8"];

  if (avgForLevel(1, l1ids) >= 6) levels.push(2);
  if (levels.includes(2) && avgForLevel(2, l2ids) >= 6) levels.push(3);
  return levels;
}

export function getLevelStats(level: Level, answers: QuestionProgress[], total: number) {
  const prefix = `l${level}-`;
  const levelAnswers = answers.filter((a) => a.questionId.startsWith(prefix));
  const avgScore =
    levelAnswers.length > 0
      ? levelAnswers.reduce((s, a) => s + a.score, 0) / levelAnswers.length
      : 0;
  return {
    answered: levelAnswers.length,
    total,
    avgScore: Math.round(avgScore * 10) / 10,
    pct: Math.round((levelAnswers.length / total) * 100),
  };
}
