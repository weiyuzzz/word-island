import type {
  ClientQuestion,
  PlayerSnapshot,
  QuestionRecord,
  QuizMode,
  Reward,
  WordDetail,
  WordStatus,
} from "@/lib/types";
import type { RegionDef } from "@/data/world";

export type EventKind = "monster" | "boss" | "npc" | "treasure" | "bottle" | "stone" | "cave" | "rest";

/** 事件负载（含答案，仅存在于服务端） */
export interface EventPayload {
  title: string;
  description: string;
  monster?: { key: string; name: string; hp: number; maxHp: number; art: string; flavor: string };
  npc?: { key: string; name: string; role: string; line: string };
  questions: QuestionRecord[];
  coinsReward: number;
  xpReward: number;
  itemReward: string | null;
  guardUsed?: boolean;
}

export interface ClientEventView {
  eventKey: string;
  kind: EventKind;
  order: number;
  status: "pending" | "resolved";
  title: string;
  description: string;
  monster?: { key: string; name: string; hp: number; maxHp: number; art: string; flavor: string; damage: number };
  npc?: { key: string; name: string; role: string; line: string };
  coinsReward: number;
  xpReward: number;
  itemReward: string | null;
  question: ClientQuestion | null;
  questionIndex: number;
  questionCount: number;
  answeredCount: number;
}

export interface ExpeditionView {
  id: number;
  regionKey: string;
  regionName: string;
  hearts: number;
  maxHearts: number;
  totalEvents: number;
  resolvedEvents: number;
  coinsEarned: number;
  xpEarned: number;
  currentStreak: number;
  bestStreak: number;
  events: ClientEventView[];
}

export interface EventResult {
  eventKey: string;
  questionIndex: number;
  correct: boolean;
  correctAnswer: string;
  word: WordDetail;
  mode: QuizMode;
  attack: { label: string; damage: number };
  quality: 0 | 1 | 2;
  monsterHp: number;
  monsterMaxHp: number;
  hearts: number;
  reward: Reward;
  streakBonus: number;
  statusBefore: WordStatus;
  statusAfter: WordStatus;
  proficiency: number;
  nextReviewAt: string | null;
  alreadyAnswered: boolean;
  eventStatus: "pending" | "resolved";
  eventReward: { coins: number; xp: number; item: string | null } | null;
  questProgress: QuestView[];
  event: ClientEventView;
  player: PlayerSnapshot;
  leveledUp: boolean;
  expeditionOver: boolean;
}

export interface RunReportWord {
  id: number;
  word: string;
  meaning: string;
  correct: boolean;
  mode: QuizMode;
  nextReviewAt: string | null;
  status: WordStatus;
}

export interface ExpeditionSummary {
  id: number;
  regionKey: string;
  regionName: string;
  completed: boolean;
  eventsResolved: number;
  totalEvents: number;
  answered: number;
  correct: number;
  accuracy: number;
  monstersDefeated: number;
  chestsFound: number;
  coinsEarned: number;
  xpEarned: number;
  bonusCoins: number;
  bonusXp: number;
  itemsFound: string[];
  report: RunReportWord[];
  wrongWords: RunReportWord[];
  player: PlayerSnapshot;
  leveledUp: boolean;
  quests: QuestView[];
}

export type QuestMetric = "correct" | "spelling" | "monsters" | "treasures" | "review" | "mastered";

export interface QuestView {
  key: string;
  npcKey: string;
  npcName: string;
  title: string;
  description: string;
  metric: QuestMetric;
  target: number;
  progress: number;
  reward: Reward;
  itemReward: string | null;
  unlocked: boolean;
  claimed: boolean;
  claimable: boolean;
}

export interface ShopItemView {
  key: string;
  name: string;
  description: string;
  kind: "boat" | "outfit" | "tool" | "consumable" | "decor";
  rarity: "common" | "rare" | "epic" | "legend";
  price: number;
  unlockLevel: number;
  unique: boolean;
  effect: string;
  owned: number;
  affordable: boolean;
  locked: boolean;
}

export type GardenStage = "seed" | "sprout" | "sapling" | "tree" | "bloom";

export interface GardenPlant {
  id: number;
  word: string;
  meaning: string;
  phonetic: string;
  pos: string;
  example: string;
  translation: string;
  stage: GardenStage;
  proficiency: number;
  streak: number;
  correctCount: number;
  wrongCount: number;
  status: WordStatus;
  nextReviewAt: string | null;
  lastReviewedAt: string | null;
}

export interface RegionState {
  region: RegionDef;
  unlocked: boolean;
  unlockText: string;
  runs: number;
  eventsResolved: number;
  monstersDefeated: number;
  chestsFound: number;
}

export interface MapState {
  regions: RegionState[];
  player: PlayerSnapshot;
  active: ExpeditionView | null;
  ownedItems: { key: string; qty: number }[];
  learnedCount: number;
  quests: QuestView[];
}
