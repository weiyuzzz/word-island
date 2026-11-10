import { SESSION_SIZE_MAX } from "@/lib/game/economy";
import { db } from "@/db";
import { decks, players, reviewLogs, studySessions, wordProgress, words } from "@/db/schema";
import { and, asc, eq, gt, inArray, isNull, lte, ne, or, sql } from "drizzle-orm";
import { answerReward, levelFromXp, sessionBonus } from "@/lib/game/economy";
import { applyReview, chooseMode, gradeAnswer, initialProgress, INTERVAL_LADDER_MINUTES, MASTERED_MIN_INTERVAL, resolveStatus, type ProgressState } from "@/lib/game/srs";
import type {
  AnswerResult,
  ClientQuestion,
  ClientSession,
  QuestionRecord,
  QuizMode,
  SessionKind,
  SessionSummary,
  WordDetail,
  WordStatus,
} from "@/lib/types";
import { blankSentence, dateKey, normalizeWord, pickRandom, shuffle } from "@/lib/utils";
import { bumpDaily, ensureSeeded, lockPlayer, nextStreak, snapshot } from "./player";
import { currentUserId } from "./session";
import { checkAchievements, getDailyTasks } from "./tasks";

type WordRow = typeof words.$inferSelect;
type ProgressRow = typeof wordProgress.$inferSelect;

function toDetail(w: WordRow): WordDetail {
  return {
    id: w.id,
    deckId: w.deckId,
    word: w.word,
    phonetic: w.phonetic,
    pos: w.pos,
    meaning: w.meaning,
    example: w.example,
    translation: w.translation,
    difficulty: w.difficulty,
  };
}

function toState(p: ProgressRow | undefined): ProgressState {
  if (!p) return initialProgress();
  return {
    status: p.status as WordStatus,
    proficiency: p.proficiency,
    streak: p.streak,
    correctCount: p.correctCount,
    wrongCount: p.wrongCount,
    lapses: p.lapses,
    intervalMinutes: p.intervalMinutes,
    nextReviewAt: p.nextReviewAt,
    lastReviewedAt: p.lastReviewedAt,
  };
}

function buildQuestion(word: WordRow, status: WordStatus, pool: WordRow[], forceMode?: QuizMode): QuestionRecord {
  const blank = word.example ? blankSentence(word.word, word.example) : null;
  let mode = forceMode ?? chooseMode(status, Boolean(blank));
  const others = pool.filter((p) => p.id !== word.id);

  const meaningDistractors = Array.from(
    new Map(others.filter((o) => o.meaning !== word.meaning).map((o) => [o.meaning, o])).values(),
  );
  const wordDistractors = Array.from(
    new Map(others.filter((o) => normalizeWord(o.word) !== normalizeWord(word.word)).map((o) => [normalizeWord(o.word), o])).values(),
  );

  if ((mode === "en2zh" && meaningDistractors.length < 3) || ((mode === "zh2en" || mode === "context") && wordDistractors.length < 3)) {
    mode = "spelling";
  }

  if (mode === "en2zh") {
    const options = shuffle([word.meaning, ...pickRandom(meaningDistractors, 3).map((o) => o.meaning)]);
    return { wordId: word.id, mode, options, correct: word.meaning, prompt: null, isNew: status === "new", answered: false, wasCorrect: null };
  }
  if (mode === "zh2en" || mode === "context") {
    const options = shuffle([word.word, ...pickRandom(wordDistractors, 3).map((o) => o.word)]);
    return {
      wordId: word.id,
      mode,
      options,
      correct: word.word,
      prompt: mode === "context" ? blank!.blanked : null,
      isNew: status === "new",
      answered: false,
      wasCorrect: null,
    };
  }
  return { wordId: word.id, mode, options: [], correct: word.word, prompt: blank?.blanked ?? null, isNew: status === "new", answered: false, wasCorrect: null };
}

function toClientQuestion(q: QuestionRecord, w: WordRow, index: number): ClientQuestion {
  const base: ClientQuestion = { index, wordId: q.wordId, mode: q.mode, isNew: q.isNew };
  switch (q.mode) {
    case "en2zh":
      return { ...base, word: w.word, phonetic: w.phonetic, pos: w.pos, options: q.options };
    case "zh2en":
      return { ...base, meaning: w.meaning, pos: w.pos, options: q.options };
    case "context":
      return { ...base, prompt: q.prompt, meaning: w.meaning, pos: w.pos, options: q.options };
    case "spelling":
      return { ...base, meaning: w.meaning, pos: w.pos, prompt: q.prompt, length: w.word.length, firstLetter: w.word[0] };
    case "dictation":
      // 纯拼写：客户端需要单词本身做逐字母比对（单词反正会朗读出来，不额外泄露答案），
      // meaning / phonetic 只在判错后的复查界面展示
      return { ...base, word: w.word, phonetic: w.phonetic, meaning: w.meaning, length: w.word.length };
    default:
      return base;
  }
}

export interface CreateSessionInput {
  deckId: number | null;
  kind: SessionKind;
  size: number;
}

export async function createSession(input: CreateSessionInput): Promise<ClientSession> {
  await ensureSeeded();
  const uid = await currentUserId();
  const size = Math.min(SESSION_SIZE_MAX, Math.max(5, Math.round(input.size || 10)));
  const now = new Date();
  const deckFilter = input.deckId ? and(eq(words.deckId, input.deckId), eq(words.userId, uid)) : eq(words.userId, uid);

  let deckName = "全部词库";
  if (input.deckId) {
    const [deck] = await db.select().from(decks).where(and(eq(decks.id, input.deckId), eq(decks.userId, uid)));
    if (!deck) throw new Error("词库不存在");
    deckName = deck.name;
  }

  const dueRows = await db
    .select({ w: words, p: wordProgress })
    .from(words)
    .innerJoin(wordProgress, eq(wordProgress.wordId, words.id))
    .where(and(deckFilter, ne(wordProgress.status, "new"), lte(wordProgress.nextReviewAt, now)))
    .orderBy(asc(wordProgress.nextReviewAt))
    .limit(size);

  const freshRows = await db
    .select({ w: words, p: wordProgress })
    .from(words)
    .leftJoin(wordProgress, eq(wordProgress.wordId, words.id))
    .where(and(deckFilter, or(isNull(wordProgress.id), eq(wordProgress.status, "new"))))
    .orderBy(asc(words.difficulty), asc(words.id))
    .limit(size);

  let selected: { w: WordRow; status: WordStatus }[] = [];
  const due = dueRows.map((r) => ({ w: r.w, status: r.p.status as WordStatus }));
  const fresh = freshRows.map((r) => ({ w: r.w, status: "new" as WordStatus }));

  if (input.kind === "review") {
    if (due.length === 0) throw new Error("当前没有需要复习的单词，先去学习新词吧！");
    selected = due.slice(0, size);
  } else if (input.kind === "new") {
    if (fresh.length === 0) throw new Error("这个词库的单词都已经学过了，去复习或导入新词吧！");
    selected = fresh.slice(0, size);
  } else {
    const reviewCount = Math.min(due.length, Math.ceil(size * 0.6));
    const newCount = Math.min(fresh.length, size - reviewCount);
    selected = [...due.slice(0, reviewCount), ...fresh.slice(0, newCount)];
    if (selected.length < size) {
      const extraDue = due.slice(reviewCount, reviewCount + (size - selected.length));
      selected.push(...extraDue);
    }
    if (selected.length < size) {
      const excluded = selected.map((s) => s.w.id);
      const upcoming = await db
        .select({ w: words, p: wordProgress })
        .from(words)
        .innerJoin(wordProgress, eq(wordProgress.wordId, words.id))
        .where(
          and(
            deckFilter,
            ne(wordProgress.status, "new"),
            gt(wordProgress.nextReviewAt, now),
            excluded.length ? sql`${words.id} not in (${sql.join(excluded.map((id) => sql`${id}`), sql`, `)})` : undefined,
          ),
        )
        .orderBy(asc(wordProgress.nextReviewAt))
        .limit(size - selected.length);
      selected.push(...upcoming.map((r) => ({ w: r.w, status: r.p.status as WordStatus })));
    }
    if (selected.length === 0) {
      const [cnt] = await db.select({ count: sql<number>`count(*)::int` }).from(words).where(deckFilter);
      throw new Error(cnt?.count ? "所有单词都已学过，而且暂时没有到期的复习，稍后再来吧！" : "词库里还没有单词，先去导入一些吧！");
    }
  }

  selected = shuffle(selected);

  // 干扰项只从当前用户自己的词库中取，避免跨账号泄露
  const pool = await db
    .select()
    .from(words)
    .where(eq(words.userId, uid))
    .orderBy(sql`random()`)
    .limit(80);

  const questions = selected.map((s) => buildQuestion(s.w, s.status, pool, input.kind === "dictation" ? "dictation" : undefined));

  const [session] = await db
    .insert(studySessions)
    .values({ userId: uid, deckId: input.deckId, deckName, kind: input.kind, questions, total: questions.length })
    .returning();

  const wordMap = new Map(selected.map((s) => [s.w.id, s.w]));
  return {
    id: session.id,
    kind: input.kind,
    deckName,
    total: questions.length,
    questions: questions.map((q, i) => toClientQuestion(q, wordMap.get(q.wordId)!, i)),
  };
}

export interface SubmitAnswerInput {
  sessionId: number;
  index: number;
  answer: string;
  responseMs: number;
  usedHint: boolean;
}

function isCorrect(q: QuestionRecord, answer: string): boolean {
  if (q.mode === "en2zh") return answer.trim() === q.correct.trim();
  return normalizeWord(answer) === normalizeWord(q.correct);
}

export async function submitAnswer(input: SubmitAnswerInput): Promise<AnswerResult> {
  const now = new Date();
  const uid = await currentUserId();
  return db.transaction(async (tx) => {
    const [session] = await tx.select().from(studySessions).where(and(eq(studySessions.id, input.sessionId), eq(studySessions.userId, uid))).for("update");
    if (!session) throw new Error("学习会话不存在");
    if (session.finishedAt) throw new Error("该学习会话已结束");
    const q = session.questions[input.index];
    if (!q) throw new Error("题目不存在");
    const [word] = await tx.select().from(words).where(eq(words.id, q.wordId));
    if (!word) throw new Error("单词已被删除");
    const [existing] = await tx.select().from(wordProgress).where(eq(wordProgress.wordId, q.wordId));
    const prev = toState(existing);

    if (q.answered) {
      const [p] = await tx.select().from(players).orderBy(players.id).limit(1);
      // 纯拼写等模式允许对同一题多次作答：重复提交不发奖，但若本次确实拼对了，
      // 返回 correct=true 以便客户端展示「回答正确」而不是沿用首次的错误结果
      const recheck = isCorrect(q, input.answer);
      return {
        correct: Boolean(q.wasCorrect) || recheck,
        correctAnswer: q.correct,
        word: toDetail(word),
        reward: { coins: 0, xp: 0, streakBonus: 0 },
        quality: q.wasCorrect ? 2 : 0,
        sessionStreak: session.currentStreak,
        player: snapshot(p),
        leveledUp: false,
        statusBefore: prev.status,
        statusAfter: prev.status,
        proficiency: prev.proficiency,
        nextReviewAt: prev.nextReviewAt?.toISOString() ?? null,
        alreadyAnswered: true,
      };
    }

    const correct = isCorrect(q, input.answer);
    const responseMs = Math.max(0, Math.min(10 * 60_000, Math.round(input.responseMs || 0)));
    const quality = gradeAnswer(correct, q.mode, responseMs, input.usedHint);
    const next = applyReview(prev, q.mode, quality, now);

    await tx
      .insert(wordProgress)
      .values({
        userId: uid,
        wordId: q.wordId,
        status: next.status,
        proficiency: next.proficiency,
        streak: next.streak,
        correctCount: next.correctCount,
        wrongCount: next.wrongCount,
        lapses: next.lapses,
        intervalMinutes: next.intervalMinutes,
        lastReviewedAt: now,
        nextReviewAt: next.nextReviewAt,
        firstLearnedAt: now,
        masteredAt: next.status === "mastered" ? now : null,
      })
      .onConflictDoUpdate({
        target: wordProgress.wordId,
        set: {
          status: next.status,
          proficiency: next.proficiency,
          streak: next.streak,
          correctCount: next.correctCount,
          wrongCount: next.wrongCount,
          lapses: next.lapses,
          intervalMinutes: next.intervalMinutes,
          lastReviewedAt: now,
          nextReviewAt: next.nextReviewAt,
          firstLearnedAt: sql`coalesce(${wordProgress.firstLearnedAt}, ${now.toISOString()}::timestamptz)`,
          masteredAt: next.status === "mastered" ? sql`coalesce(${wordProgress.masteredAt}, ${now.toISOString()}::timestamptz)` : null,
        },
      });

    await tx.insert(reviewLogs).values({ userId: uid, wordId: q.wordId, sessionId: session.id, mode: q.mode, correct, quality, responseMs });

    const sessionStreak = correct ? session.currentStreak + 1 : 0;
    const isReview = prev.status === "review" || prev.status === "mastered";
    const reward = answerReward({ quality, isNew: q.isNew, isReview, streakAfter: sessionStreak });
    const coinsTotal = reward.coins + reward.streakBonus;

    const questions = session.questions.map((item, i) => (i === input.index ? { ...item, answered: true, wasCorrect: correct } : item));
    await tx
      .update(studySessions)
      .set({
        questions,
        answered: session.answered + 1,
        correct: session.correct + (correct ? 1 : 0),
        currentStreak: sessionStreak,
        bestStreak: Math.max(session.bestStreak, sessionStreak),
        coinsEarned: session.coinsEarned + coinsTotal,
        xpEarned: session.xpEarned + reward.xp,
      })
      .where(eq(studySessions.id, session.id));

    const player = await lockPlayer(tx, uid);
    const today = dateKey(now);
    const streakInfo = nextStreak(player, today);
    const [updated] = await tx
      .update(players)
      .set({
        coins: player.coins + coinsTotal,
        xp: player.xp + reward.xp,
        totalAnswered: player.totalAnswered + 1,
        totalCorrect: player.totalCorrect + (correct ? 1 : 0),
        streak: streakInfo.streak,
        bestStreak: streakInfo.bestStreak,
        lastStudyDate: today,
      })
      .where(eq(players.id, player.id))
      .returning();

    await bumpDaily(tx, uid, today, {
      newLearned: q.isNew ? 1 : 0,
      reviewed: q.isNew ? 0 : 1,
      correct: correct ? 1 : 0,
      total: 1,
      coinsEarned: coinsTotal,
      xpEarned: reward.xp,
      bestStreak: sessionStreak,
    });

    return {
      correct,
      correctAnswer: q.correct,
      word: toDetail(word),
      reward,
      quality,
      sessionStreak,
      player: snapshot(updated),
      leveledUp: levelFromXp(updated.xp).level > levelFromXp(player.xp).level,
      statusBefore: prev.status,
      statusAfter: next.status,
      proficiency: next.proficiency,
      nextReviewAt: next.nextReviewAt?.toISOString() ?? null,
      alreadyAnswered: false,
    };
  });
}

export async function finishSession(sessionId: number): Promise<SessionSummary> {
  const uid = await currentUserId();
  return db.transaction(async (tx) => {
    const [session] = await tx.select().from(studySessions).where(and(eq(studySessions.id, sessionId), eq(studySessions.userId, uid))).for("update");
    if (!session) throw new Error("学习会话不存在");

    const wrongIds = session.questions.filter((q) => q.answered && q.wasCorrect === false).map((q) => q.wordId);
    const wrongRows = wrongIds.length ? await tx.select({ id: words.id, word: words.word, meaning: words.meaning }).from(words).where(inArray(words.id, wrongIds)) : [];
    const wrongWords = wrongIds.map((id) => wrongRows.find((r) => r.id === id)).filter((r): r is NonNullable<typeof r> => Boolean(r));

    const player = await lockPlayer(tx, uid);
    const today = dateKey();

    if (session.finishedAt) {
      const tasks = await getDailyTasks(tx, uid, player.dailyGoal, today);
      return {
        sessionId: session.id,
        total: session.total,
        answered: session.answered,
        correct: session.correct,
        accuracy: session.answered ? session.correct / session.answered : 0,
        coinsEarned: session.coinsEarned,
        xpEarned: session.xpEarned,
        bonusCoins: session.bonusCoins,
        bonusXp: session.bonusXp,
        bonusReasons: [],
        completed: session.answered >= session.total,
        player: snapshot(player),
        leveledUp: false,
        newAchievements: [],
        wrongWords,
        claimableTasks: tasks.filter((t) => t.claimable),
      };
    }

    const bonus = sessionBonus({ total: session.total, answered: session.answered, correct: session.correct });
    const completed = session.answered >= session.total;

    await tx
      .update(studySessions)
      .set({
        finishedAt: new Date(),
        bonusCoins: bonus.coins,
        bonusXp: bonus.xp,
        coinsEarned: session.coinsEarned + bonus.coins,
        xpEarned: session.xpEarned + bonus.xp,
      })
      .where(eq(studySessions.id, session.id));

    const levelBefore = levelFromXp(player.xp).level;
    if (bonus.coins || bonus.xp) {
      await tx
        .update(players)
        .set({ coins: player.coins + bonus.coins, xp: player.xp + bonus.xp })
        .where(eq(players.id, player.id));
    }
    await bumpDaily(tx, uid, today, { sessionsCompleted: completed ? 1 : 0, coinsEarned: bonus.coins, xpEarned: bonus.xp });

    const perfectSession = completed && session.total >= 10 && session.correct === session.total;
    const newAchievements = await checkAchievements(tx, uid, { perfectSession });

    const [finalPlayer] = await tx.select().from(players).where(eq(players.id, player.id));
    const tasks = await getDailyTasks(tx, uid, finalPlayer.dailyGoal, today);

    return {
      sessionId: session.id,
      total: session.total,
      answered: session.answered,
      correct: session.correct,
      accuracy: session.answered ? session.correct / session.answered : 0,
      coinsEarned: session.coinsEarned + bonus.coins,
      xpEarned: session.xpEarned + bonus.xp,
      bonusCoins: bonus.coins,
      bonusXp: bonus.xp,
      bonusReasons: bonus.reasons,
      completed,
      player: snapshot(finalPlayer),
      leveledUp: levelFromXp(finalPlayer.xp).level > levelBefore,
      newAchievements,
      wrongWords,
      claimableTasks: tasks.filter((t) => t.claimable),
    };
  });
}

export async function countDue(deckId: number | null = null): Promise<{ due: number; fresh: number }> {
  await ensureSeeded();
  const uid = await currentUserId();
  const deckFilter = deckId ? and(eq(words.deckId, deckId), eq(words.userId, uid)) : eq(words.userId, uid);
  const [dueRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(words)
    .innerJoin(wordProgress, eq(wordProgress.wordId, words.id))
    .where(and(deckFilter, ne(wordProgress.status, "new"), lte(wordProgress.nextReviewAt, new Date())));
  const [freshRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(words)
    .leftJoin(wordProgress, eq(wordProgress.wordId, words.id))
    .where(and(deckFilter, or(isNull(wordProgress.id), eq(wordProgress.status, "new"))));
  return { due: dueRow?.count ?? 0, fresh: freshRow?.count ?? 0 };
}

export type { QuizMode };

// ---------- 答题后主观反馈：熟悉 / 一般 / 遗忘 ----------

export type SelfGrade = "familiar" | "ok" | "forgotten";

export interface SelfAssessResult {
  status: WordStatus;
  proficiency: number;
  nextReviewAt: string | null;
}

/** 把间隔分钟数定位到阶梯档位 */
function stageForInterval(intervalMinutes: number): number {
  let stage = 0;
  for (let i = 0; i < INTERVAL_LADDER_MINUTES.length; i++) {
    if (INTERVAL_LADDER_MINUTES[i] <= intervalMinutes) stage = i;
  }
  return stage;
}

/**
 * 用户自评调整复习计划（在原有 SRS 结果之上的增量修正）：
 * - familiar 熟悉：熟练度 +15、间隔上移一档（可能提前进入掌握）
 * - ok 一般：维持原有计划不变
 * - forgotten 遗忘：视为一次 lapse——熟练度 -30、间隔回到 10 分钟、状态下调
 * 不选择时什么都不发生，完全保留原有 SRS 结果。
 */
export async function selfAssess(wordId: number, grade: SelfGrade): Promise<SelfAssessResult | null> {
  const uid = await currentUserId();
  return db.transaction(async (tx) => {
    const [p] = await tx
      .select()
      .from(wordProgress)
      .where(and(eq(wordProgress.wordId, wordId), eq(wordProgress.userId, uid)))
      .for("update");
    if (!p) return null;
    const prev = toState(p);
    if (grade === "ok") {
      return { status: prev.status, proficiency: prev.proficiency, nextReviewAt: prev.nextReviewAt?.toISOString() ?? null };
    }
    const now = new Date();
    let next: ProgressState;
    if (grade === "familiar") {
      const proficiency = Math.min(100, prev.proficiency + 15);
      const streak = prev.streak + 1;
      const stage = Math.min(INTERVAL_LADDER_MINUTES.length - 1, stageForInterval(prev.intervalMinutes) + 1);
      const intervalMinutes = INTERVAL_LADDER_MINUTES[stage];
      const partial = { proficiency, streak, correctCount: prev.correctCount, wrongCount: prev.wrongCount, lapses: prev.lapses, intervalMinutes, nextReviewAt: null, lastReviewedAt: now };
      const status = resolveStatus(prev.status, partial);
      const finalInterval = status === "mastered" ? Math.max(intervalMinutes, MASTERED_MIN_INTERVAL) : intervalMinutes;
      next = { ...partial, status, intervalMinutes: finalInterval, nextReviewAt: new Date(now.getTime() + finalInterval * 60_000) };
    } else {
      const proficiency = Math.max(0, prev.proficiency - 30);
      const partial = {
        proficiency,
        streak: 0,
        correctCount: prev.correctCount,
        wrongCount: prev.wrongCount,
        lapses: prev.status !== "new" ? prev.lapses + 1 : prev.lapses,
        intervalMinutes: INTERVAL_LADDER_MINUTES[0],
        nextReviewAt: null,
        lastReviewedAt: now,
      };
      const status = resolveStatus(prev.status, partial);
      next = { ...partial, status, nextReviewAt: new Date(now.getTime() + INTERVAL_LADDER_MINUTES[0] * 60_000) };
    }
    await tx
      .update(wordProgress)
      .set({
        status: next.status,
        proficiency: next.proficiency,
        streak: next.streak,
        lapses: next.lapses,
        intervalMinutes: next.intervalMinutes,
        lastReviewedAt: now,
        nextReviewAt: next.nextReviewAt,
        masteredAt: next.status === "mastered" ? sql`coalesce(${wordProgress.masteredAt}, ${now.toISOString()}::timestamptz)` : null,
      })
      .where(eq(wordProgress.id, p.id));
    return { status: next.status, proficiency: next.proficiency, nextReviewAt: next.nextReviewAt?.toISOString() ?? null };
  });
}
