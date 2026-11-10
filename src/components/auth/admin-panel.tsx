"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AudioLines, KeyRound, ShieldCheck, Trash2, UserPlus } from "lucide-react";
import type { AdminUserRow } from "@/server/auth";
import { adminCreateUserAction, adminDeleteUserAction, adminResetPasswordAction, backfillAudioAction } from "@/server/actions";
import { Button, Card, useToast } from "../ui";
import { ConfirmDialog, useConfirm } from "../confirm-dialog";
import { ReadingAdminCard } from "../reading/reading-admin";

export function AdminPanel({ currentUserId, initialUsers, pool }: { currentUserId: number; initialUsers: AdminUserRow[]; pool: { source: string; count: number }[] }) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [users, setUsers] = useState(initialUsers);
  const [newName, setNewName] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [pwd, setPwd] = useState<Record<number, string>>({});
  const [backfillMsg, setBackfillMsg] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const backfill = () => {
    setBackfillMsg("正在补齐，视词库大小需要一到几分钟…");
    startTransition(async () => {
      const res = await backfillAudioAction();
      if (!res.ok) return setBackfillMsg(res.error);
      setBackfillMsg(`补齐完成：本次下载 ${res.data.fetched} 个，此前已缓存 ${res.data.cached} 个，失败 ${res.data.failed.length} 个`);
    });
  };

  const reload = () => {
    router.refresh();
  };

  const createUser = () => {
    startTransition(async () => {
      const res = await adminCreateUserAction({ username: newName.trim(), password: newPassword });
      if (!res.ok) return toast({ kind: "error", title: res.error });
      toast({ kind: "success", title: `已创建账号「${newName.trim()}」` });
      setNewName("");
      setNewPassword("");
      reload();
    });
  };

  const resetPassword = (userId: number, username: string) => {
    const password = (pwd[userId] ?? "").trim();
    if (password.length < 6) return toast({ kind: "error", title: "新密码至少 6 位" });
    startTransition(async () => {
      const res = await adminResetPasswordAction(userId, password);
      if (!res.ok) return toast({ kind: "error", title: res.error });
      toast({ kind: "success", title: `「${username}」的密码已重置，其登录会话已失效` });
      setPwd((p) => ({ ...p, [userId]: "" }));
    });
  };

  const deleteUser = (userId: number, username: string) => {
    confirm.confirm({
      title: `删除账号「${username}」？`,
      description: "该用户的词库、学习进度、岛屿与成就等全部数据都会被删除，且无法恢复。",
      confirmLabel: "删除",
      variant: "danger",
      onConfirm: () => {
        startTransition(async () => {
          const res = await adminDeleteUserAction(userId);
          if (!res.ok) return toast({ kind: "error", title: res.error });
          toast({ kind: "success", title: `账号「${username}」已删除` });
          reload();
        });
      },
    });
  };

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight md:text-2xl">
          <ShieldCheck className="h-6 w-6 text-ocean-600" /> 后台管理
        </h1>
        <p className="mt-1 text-sm text-slate-500">管理本站账号：创建用户、重置密码、删除用户。每个用户拥有独立的词库与学习进度。</p>
      </div>

      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold">单词发音缓存</div>
            <p className="mt-1 text-xs text-slate-500">把词库中所有单词的发音预先下载到数据库，播放不再依赖在线接口（导入时会自动预取，这里可手动补齐存量）。</p>
          </div>
          <Button icon={<AudioLines className="h-4 w-4" />} loading={pending} onClick={backfill}>
            补齐全部发音
          </Button>
        </div>
        {backfillMsg && <p className="mt-3 rounded-xl bg-ocean-50 px-3 py-2 text-xs text-ocean-700">{backfillMsg}</p>}
      </Card>

      <ReadingAdminCard pool={pool} />

      <Card className="p-5">
        <div className="text-sm font-semibold">新建账号</div>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="用户名（2-20 位字母、数字或中文）"
            className="h-11 flex-1 rounded-2xl border border-slate-200 px-3 text-sm outline-none focus:border-ocean-400"
          />
          <input
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="初始密码（至少 6 位）"
            autoComplete="new-password"
            className="h-11 flex-1 rounded-2xl border border-slate-200 px-3 text-sm outline-none focus:border-ocean-400"
          />
          <Button icon={<UserPlus className="h-4 w-4" />} loading={pending} disabled={!newName.trim() || newPassword.length < 6} onClick={createUser}>
            创建
          </Button>
        </div>
      </Card>

      <div className="space-y-3">
        {users.map((u) => (
          <Card key={u.id} className="p-4">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <div className="min-w-40">
                <div className="flex items-center gap-2 text-sm font-bold">
                  {u.username}
                  {u.role === "admin" && <span className="rounded-full bg-sun-100 px-2 py-0.5 text-[10px] font-semibold text-sun-600">管理员</span>}
                  {u.id === currentUserId && <span className="rounded-full bg-ocean-50 px-2 py-0.5 text-[10px] font-semibold text-ocean-600">当前登录</span>}
                </div>
                <div className="mt-0.5 text-xs text-slate-400">注册于 {new Date(u.createdAt).toLocaleDateString("zh-CN")}</div>
              </div>
              <div className="flex flex-1 flex-wrap gap-x-5 gap-y-1 text-xs text-slate-500">
                <span>Lv.{u.level}</span>
                <span>{u.coins} 金币</span>
                <span>{u.totalWords} 词</span>
                <span>已学 {u.learned}</span>
                <span>掌握 {u.mastered}</span>
              </div>
            </div>
            <div className="mt-3 flex flex-col gap-2 border-t border-slate-100 pt-3 sm:flex-row">
              <div className="flex flex-1 items-center gap-2">
                <KeyRound className="h-4 w-4 shrink-0 text-slate-400" />
                <input
                  value={pwd[u.id] ?? ""}
                  onChange={(e) => setPwd((p) => ({ ...p, [u.id]: e.target.value }))}
                  placeholder="输入新密码重置"
                  autoComplete="new-password"
                  className="h-9 flex-1 rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-ocean-400"
                />
                <Button size="sm" variant="secondary" loading={pending} disabled={!(pwd[u.id] ?? "").trim()} onClick={() => resetPassword(u.id, u.username)}>
                  重置密码
                </Button>
              </div>
              {u.id !== currentUserId && (
                <Button size="sm" variant="danger" loading={pending} icon={<Trash2 className="h-4 w-4" />} onClick={() => deleteUser(u.id, u.username)}>
                  删除
                </Button>
              )}
            </div>
          </Card>
        ))}
      </div>

      <ConfirmDialog state={confirm.state} onClose={confirm.close} />
    </div>
  );
}
