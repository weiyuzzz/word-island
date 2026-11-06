import { db } from "@/db";
import {
  achievements,
  buildings,
  dailyStats,
  decks,
  explorations,
  inventory,
  players,
  playerQuests,
  purchases,
  regionProgress,
  reviewLogs,
  sessions,
  studySessions,
  taskClaims,
  users,
  wordProgress,
  words,
} from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { BUILTIN_DECKS, rowToWord } from "@/data/vocabulary";
import { INITIAL_CABIN_SLOT } from "@/lib/game/buildings";
import { levelFromXp } from "@/lib/game/economy";
import { normalizeWord } from "@/lib/utils";
import { createSession, hashPassword, requireAdmin, verifyPassword } from "./session";
import { ensureSeeded } from "./player";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>;

/** 首个注册的账号自动成为管理员，并接管升级前遗留的单人数据 */
const USER_OWNED_TABLES = [
  players,
  decks,
  words,
  wordProgress,
  reviewLogs,
  studySessions,
  dailyStats,
  buildings,
  taskClaims,
  achievements,
  explorations,
  playerQuests,
  inventory,
  purchases,
  regionProgress,
] as const;

function validateCredentials(username: string, password: string) {
  const name = username.trim();
  if (!/^[a-zA-Z0-9_\u4e00-\u9fa5]{2,20}$/.test(name)) throw new Error("用户名需为 2-20 位字母、数字、下划线或中文");
  if (password.length < 6) throw new Error("密码至少 6 位");
  if (password.length > 64) throw new Error("密码过长");
  return name;
}

/** 为用户准备独立的玩家档案、初始建筑与内置词库副本（已存在则跳过） */
async function seedUserGames(tx: Parameters<Parameters<typeof db.transaction>[0]>[0], userId: number): Promise<void> {
  const [existing] = await tx.select({ id: players.id }).from(players).where(eq(players.userId, userId)).limit(1);
  if (existing) return;
  await tx.insert(players).values({ userId });
  await tx.insert(buildings).values({ userId, type: "cabin", level: 1, slot: INITIAL_CABIN_SLOT }).onConflictDoNothing();
  for (const deck of BUILTIN_DECKS) {
    const [inserted] = await tx
      .insert(decks)
      .values({ userId, slug: deck.slug, name: deck.name, description: deck.description, kind: "builtin", color: deck.color })
      .returning({ id: decks.id });
    const rows = deck.words.map((r) => {
      const w = rowToWord(r);
      return { userId, ...w, deckId: inserted.id, wordKey: normalizeWord(w.word) };
    });
    await tx.insert(words).values(rows).onConflictDoNothing();
  }
}

/**
 * 创建账号：第一个注册的用户自动成为管理员，并接管升级前遗留的单人数据；
 * 每个账号注册时获得独立的玩家档案、初始建筑与内置词库副本。
 */
export async function createUserAccount(username: string, password: string): Promise<{ id: number; username: string; role: string }> {
  const name = validateCredentials(username, password);
  await ensureSeeded();
  return db.transaction(async (tx) => {
    const [dup] = await tx.select({ id: users.id }).from(users).where(eq(users.username, name));
    if (dup) throw new Error("用户名已被占用");
    const [{ count }] = await tx.select({ count: sql<number>`count(*)::int` }).from(users);
    const role = count === 0 ? "admin" : "user";
    const [user] = await tx
      .insert(users)
      .values({ username: name, passwordHash: hashPassword(password), role })
      .returning();

    if (count === 0) {
      // 遗留单人数据挂到首个账号名下（全新部署没有遗留行，这批 update 空跑）
      for (const table of USER_OWNED_TABLES) {
        await tx.update(table).set({ userId: user.id }).where(sql`${table.userId} is null`);
      }
    }

    await seedUserGames(tx, user.id);
    return { id: user.id, username: user.username, role };
  });
}

export async function loginUser(username: string, password: string): Promise<{ id: number; username: string; role: string }> {
  await ensureSeeded();
  const [user] = await db.select().from(users).where(eq(users.username, username.trim()));
  if (!user || !verifyPassword(password, user.passwordHash)) throw new Error("用户名或密码错误");
  await createSession(user.id);
  return { id: user.id, username: user.username, role: user.role };
}

export async function registerAndLogin(username: string, password: string): Promise<{ id: number; username: string; role: string }> {
  const user = await createUserAccount(username, password);
  await createSession(user.id);
  return user;
}

// ---------- 后台管理 ----------

export interface AdminUserRow {
  id: number;
  username: string;
  role: string;
  createdAt: string;
  level: number;
  coins: number;
  xp: number;
  totalWords: number;
  learned: number;
  mastered: number;
}

export async function listUsersForAdmin(): Promise<AdminUserRow[]> {
  await requireAdmin();
  const rows = await db
    .select({
      id: users.id,
      username: users.username,
      role: users.role,
      createdAt: users.createdAt,
      coins: players.coins,
      xp: players.xp,
      totalWords: sql<number>`(select count(*)::int from ${words} where ${words.userId} = ${users.id})`,
      learned: sql<number>`(select count(*)::int from ${wordProgress} where ${wordProgress.userId} = ${users.id} and ${wordProgress.status} <> 'new')`,
      mastered: sql<number>`(select count(*)::int from ${wordProgress} where ${wordProgress.userId} = ${users.id} and ${wordProgress.status} = 'mastered')`,
    })
    .from(users)
    .leftJoin(players, eq(players.userId, users.id))
    .orderBy(users.id);
  return rows.map((r) => ({
    id: r.id,
    username: r.username,
    role: r.role,
    createdAt: r.createdAt.toISOString(),
    level: r.xp != null ? levelFromXp(r.xp).level : 1,
    coins: r.coins ?? 0,
    xp: r.xp ?? 0,
    totalWords: r.totalWords,
    learned: r.learned,
    mastered: r.mastered,
  }));
}

export async function adminCreateUser(username: string, password: string): Promise<void> {
  await requireAdmin();
  const user = await createUserAccount(username, password);
  if (user.role === "admin") throw new Error("管理员账号已存在，新注册的账号将不是管理员");
}

export async function adminResetPassword(userId: number, newPassword: string): Promise<void> {
  await requireAdmin();
  if (newPassword.length < 6) throw new Error("密码至少 6 位");
  await db.update(users).set({ passwordHash: hashPassword(newPassword) }).where(eq(users.id, userId));
  // 重置密码后让该用户的所有会话失效
  await db.delete(sessions).where(eq(sessions.userId, userId));
}

export async function adminDeleteUser(userId: number): Promise<void> {
  const admin = await requireAdmin();
  if (admin.id === userId) throw new Error("不能删除自己的账号");
  const [target] = await db.select().from(users).where(eq(users.id, userId));
  if (!target) throw new Error("用户不存在");
  if (target.role === "admin") {
    const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(users).where(eq(users.role, "admin"));
    if (count <= 1) throw new Error("至少保留一个管理员账号");
  }
  await db.transaction(async (tx) => {
    for (const table of USER_OWNED_TABLES) {
      await tx.delete(table).where(eq(table.userId, userId));
    }
    await tx.delete(users).where(eq(users.id, userId));
  });
}
