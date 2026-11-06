"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, LogIn, Sprout, TreePalm, UserPlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { loginAction, registerAction } from "@/server/actions";

export function LoginPanel() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = () => {
    setError(null);
    if (mode === "register" && password !== password2) {
      setError("两次输入的密码不一致");
      return;
    }
    startTransition(async () => {
      const res = mode === "login" ? await loginAction({ username, password }) : await registerAction({ username, password });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.replace("/");
      router.refresh();
    });
  };

  return (
    <div className="grid min-h-dvh place-items-center bg-gradient-to-br from-ocean-50 via-sand-50 to-leaf-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <span className="grid h-16 w-16 place-items-center rounded-3xl bg-gradient-to-br from-ocean-400 to-leaf-400 text-white shadow-lift">
            <TreePalm className="h-9 w-9" />
          </span>
          <h1 className="mt-4 text-2xl font-bold tracking-tight">Word Island · 单词岛屿</h1>
          <p className="mt-1 text-sm text-slate-500">登录你的小岛，继续背单词之旅</p>
        </div>

        <div className="rounded-3xl border border-slate-100 bg-white p-6 shadow-lift">
          <div className="mb-5 grid grid-cols-2 gap-1 rounded-2xl bg-slate-100 p-1">
            {(
              [
                { key: "login", label: "登录", icon: LogIn },
                { key: "register", label: "注册", icon: UserPlus },
              ] as const
            ).map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => {
                  setMode(t.key);
                  setError(null);
                }}
                className={cn("flex h-9 items-center justify-center gap-1.5 rounded-xl text-sm font-medium transition", mode === t.key ? "bg-white text-ink shadow-sm" : "text-slate-500")}
              >
                <t.icon className="h-4 w-4" />
                {t.label}
              </button>
            ))}
          </div>

          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">用户名</span>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                placeholder="2-20 位字母、数字或中文"
                className="h-11 w-full rounded-2xl border border-slate-200 px-3 text-sm outline-none focus:border-ocean-400"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">密码</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                placeholder={mode === "register" ? "至少 6 位" : "输入密码"}
                className="h-11 w-full rounded-2xl border border-slate-200 px-3 text-sm outline-none focus:border-ocean-400"
              />
            </label>
            {mode === "register" && (
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium">确认密码</span>
                <input
                  type="password"
                  value={password2}
                  onChange={(e) => setPassword2(e.target.value)}
                  autoComplete="new-password"
                  placeholder="再输入一遍密码"
                  className="h-11 w-full rounded-2xl border border-slate-200 px-3 text-sm outline-none focus:border-ocean-400"
                />
              </label>
            )}

            {error && <p className="rounded-xl bg-coral-50 px-3 py-2 text-sm text-coral-600">{error}</p>}

            <button
              type="submit"
              disabled={pending || !username.trim() || !password}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-2xl bg-ocean-500 text-sm font-medium text-white transition hover:bg-ocean-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {pending ? "请稍候…" : mode === "login" ? "登录" : "创建账号"}
            </button>
          </form>

          {mode === "register" && (
            <p className="mt-4 flex items-start gap-1.5 rounded-xl bg-ocean-50 px-3 py-2 text-xs leading-relaxed text-ocean-700">
              <Sprout className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              注册后会获得独立的词库与学习进度；第一个注册的账号自动成为管理员，并接管升级前遗留的数据。
            </p>
          )}
        </div>

        <p className="mt-5 flex items-center justify-center gap-1 text-center text-xs text-slate-400">
          <Check className="h-3.5 w-3.5" />
          数据保存在本地数据库，请记住自己的账号
        </p>
      </div>
    </div>
  );
}
