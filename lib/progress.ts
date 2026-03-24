import { UserProgress, QuestionProgress, Level } from "./types";
import { questions } from "./questions";

const STORAGE_KEY = "rtl_prep_progress";

const ALL_LEVELS: Level[] = [1, 2, 3, 4];

export function loadProgress(): UserProgress {
  if (typeof window === "undefined")
    return { answers: [], unlockedLevels: ALL_LEVELS };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { answers: [], unlockedLevels: ALL_LEVELS };
    const parsed = JSON.parse(raw) as UserProgress;
    // Always ensure all levels are unlocked
    parsed.unlockedLevels = ALL_LEVELS;
    return parsed;
  } catch {
    return { answers: [], unlockedLevels: ALL_LEVELS };
  }
}

export function saveAnswer(qId: string, score: number, hintsUsed?: number): void {
  const progress = loadProgress();
  const existing = progress.answers.findIndex((a) => a.questionId === qId);
  const entry: QuestionProgress = {
    questionId: qId,
    score,
    answeredAt: new Date().toISOString(),
    hintsUsed: hintsUsed ?? 0,
  };
  if (existing >= 0) progress.answers[existing] = entry;
  else progress.answers.push(entry);

  progress.unlockedLevels = ALL_LEVELS; // all levels always unlocked
  localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function computeUnlocked(answers: QuestionProgress[]): Level[] {
  const levels: Level[] = [1];
  const avgForLevel = (ids: string[]) => {
    const relevant = answers.filter((a) => ids.includes(a.questionId));
    if (relevant.length < 4) return 0;
    return relevant.reduce((s, a) => s + a.score, 0) / relevant.length;
  };

  const l1ids = ["l1-q1","l1-q2","l1-q3","l1-q4","l1-q5","l1-q6","l1-q7","l1-q8"];
  const l2ids = ["l2-q1","l2-q2","l2-q3","l2-q4","l2-q5","l2-q6","l2-q7","l2-q8"];
  const l3ids = ["l3-q1","l3-q2","l3-q3","l3-q4","l3-q5","l3-q6","l3-q7","l3-q8"];

  if (avgForLevel(l1ids) >= 6) levels.push(2);
  if (levels.includes(2) && avgForLevel(l2ids) >= 6) levels.push(3);
  if (levels.includes(3) && avgForLevel(l3ids) >= 6) levels.push(4);
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

// Spaced repetition: return questions due for review
// <7: review after 1 day, 7-8: after 3 days, 9-10: after 7 days
export function getReviewQueue(): { question: typeof questions[0]; daysUntilDue: number }[] {
  const progress = loadProgress();
  const now = new Date();

  return questions
    .map((q) => {
      const ans = progress.answers.find((a) => a.questionId === q.id);
      if (!ans) return null;

      const answeredAt = new Date(ans.answeredAt);
      const daysSince = (now.getTime() - answeredAt.getTime()) / (1000 * 60 * 60 * 24);

      let reviewAfterDays: number;
      if (ans.score < 7) reviewAfterDays = 1;
      else if (ans.score <= 8) reviewAfterDays = 3;
      else reviewAfterDays = 7;

      const daysUntilDue = reviewAfterDays - daysSince;
      return { question: q, daysUntilDue };
    })
    .filter((item): item is { question: typeof questions[0]; daysUntilDue: number } =>
      item !== null && item.daysUntilDue <= 0
    )
    .sort((a, b) => a.daysUntilDue - b.daysUntilDue);
}

export function getTopicStats(answers: QuestionProgress[]) {
  const topicMap: Record<string, { scores: number[]; topic: string }> = {};

  questions.forEach((q) => {
    const ans = answers.find((a) => a.questionId === q.id);
    if (!ans) return;
    if (!topicMap[q.topic]) topicMap[q.topic] = { scores: [], topic: q.topic };
    topicMap[q.topic].scores.push(ans.score);
  });

  return Object.values(topicMap).map(({ topic, scores }) => ({
    topic,
    avgScore: Math.round((scores.reduce((s, v) => s + v, 0) / scores.length) * 10) / 10,
    count: scores.length,
  }));
}
