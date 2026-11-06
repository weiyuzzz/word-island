import { Award, BookOpen, Brain, Crown, Flame, Hammer, Sailboat, Star, Trophy, type LucideIcon } from "lucide-react";
import type { AchievementView, Reward } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Card, SectionTitle } from "./ui";

const ICONS: Record<string, LucideIcon> = {
  sail: Sailboat,
  trophy: Trophy,
  book: BookOpen,
  star: Star,
  brain: Brain,
  flame: Flame,
  hammer: Hammer,
  crown: Crown,
};

function AchievementIcon({ icon, unlocked }: { icon: string; unlocked: boolean }) {
  const Cmp = ICONS[icon] ?? Award;
  return (
    <span className={cn("grid h-12 w-12 place-items-center rounded-2xl transition", unlocked ? "bg-gradient-to-br from-ocean-400 to-leaf-400 text-white shadow-soft" : "bg-slate-100 text-slate-300")}>
      <Cmp className="h-6 w-6" />
    </span>
  );
}

function RewardPill({ reward }: { reward: Reward }) {
  return (
    <div className="flex flex-wrap gap-1.5 text-[11px]">
      {reward.coins > 0 && <span className="rounded-full bg-sun-50 px-2 py-0.5 font-medium text-sun-700">+{reward.coins} 金币</span>}
      {reward.xp > 0 && <span className="rounded-full bg-ocean-50 px-2 py-0.5 font-medium text-ocean-700">+{reward.xp} 经验</span>}
      {reward.coins === 0 && reward.xp === 0 && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-400">荣誉奖励</span>}
    </div>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function AchievementsView({ achievements }: { achievements: AchievementView[] }) {
  const unlocked = achievements.filter((a) => a.unlockedAt).length;
  const total = achievements.length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight md:text-2xl">成就</h1>
        <p className="mt-1 text-sm text-slate-500">
          已解锁 {unlocked} / {total} 项成就
        </p>
      </div>

      <Card className="p-4">
        <ProgressBarInline value={unlocked} max={Math.max(1, total)} />
        <div className="mt-1 flex justify-between text-xs text-slate-400">
          <span>继续努力，点亮全部成就</span>
          <span>
            {unlocked}/{total}
          </span>
        </div>
      </Card>

      <section>
        <SectionTitle>全部成就</SectionTitle>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {achievements.map((a) => {
            const isUnlocked = Boolean(a.unlockedAt);
            return (
              <Card key={a.key} className={cn("flex gap-3 p-4", !isUnlocked && "opacity-90")}>
                <AchievementIcon icon={a.icon} unlocked={isUnlocked} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className={cn("truncate text-sm font-bold", !isUnlocked && "text-slate-500")}>{a.title}</h3>
                    {isUnlocked ? (
                      <span className="shrink-0 rounded-full bg-leaf-50 px-2 py-0.5 text-[10px] font-medium text-leaf-600">已解锁</span>
                    ) : (
                      <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-400">未解锁</span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{a.description}</p>
                  <div className="mt-2">
                    <RewardPill reward={a.reward} />
                  </div>
                  {isUnlocked && a.unlockedAt && <div className="mt-2 text-[11px] text-slate-400">解锁于 {formatDate(a.unlockedAt)}</div>}
                </div>
              </Card>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function ProgressBarInline({ value, max }: { value: number; max: number }) {
  const pct = max <= 0 ? 0 : Math.round((value / max) * 100);
  return (
    <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
      <div className="h-full rounded-full bg-gradient-to-r from-ocean-400 to-leaf-400 transition-all" style={{ width: `${pct}%` }} />
    </div>
  );
}
