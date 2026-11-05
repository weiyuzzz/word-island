"use client";

import { useEffect, useRef } from "react";
import {
  castTarget,
  clamp,
  easeOutCubic,
  hitToken,
  inCastZone,
  layoutTokens,
  type CastTarget,
  type TokenBox,
} from "./scene-math";

/**
 * P1：Canvas 2D 战斗层。
 *
 * 与 P0 的区别不是「换个画法」，而是把答案变成真正由渲染循环驱动的实体：
 *  - 词贝由 canvas 绘制，支持拖拽 + 命中检测（拖到怪物法阵 / 直接点击 / 键盘 1–4）
 *  - 粒子系统：环境浮尘、施法词弹、命中爆点、结算彩带
 *  - 精灵时间轴：presenting → aiming → resolving → reward → next
 *  - 镜头推进（背景层轻微 scale）与屏幕震动
 *
 * 判定仍全部走上层传进来的 onSubmit（最终调用原来的 server action），
 * 服务端一行未改；无新增运行时依赖。
 */

export type FxKind = "cast" | "hit" | "miss" | "reward" | null;
export type CanvasPhase = "question" | "feedback" | "reward" | "summary";

interface BattleCanvasProps {
  regionKey: string;
  phase: CanvasPhase;
  options: string[];
  chosen: string | null;
  correctAnswer: string | null;
  pending: boolean;
  fxKey: string;
  fxKind: FxKind;
  damage: number;
  onSubmit: (option: string) => void;
}

interface SceneState {
  regionKey: string;
  phase: CanvasPhase;
  options: string[];
  chosen: string | null;
  correctAnswer: string | null;
  pending: boolean;
  onSubmit: (option: string) => void;
}

type ParticleKind = "mote" | "spark" | "confetti";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
  kind: ParticleKind;
  gravity: number;
  rot: number;
  spin: number;
  rising: boolean;
}

interface DragState {
  index: number;
  grabX: number;
  grabY: number;
  x: number;
  y: number;
  startX: number;
  startY: number;
  moved: number;
}

interface ReturningState {
  index: number;
  x: number;
  y: number;
  at: number;
}

interface MotePalette {
  colors: string[];
  rising: boolean;
  speed: number;
}

const MOTE_PALETTES: Record<string, MotePalette> = {
  forest: { colors: ["#8fd18a", "#c8e6a0", "#fff3b0"], rising: true, speed: 9 },
  ruins: { colors: ["#d8cba8", "#efe3c4", "#fff8e6"], rising: false, speed: 7 },
  mountain: { colors: ["#ffffff", "#e6f0fa", "#cfe0f2"], rising: false, speed: 14 },
  beach: { colors: ["#fff6d0", "#ffe6a8", "#ffffff"], rising: true, speed: 8 },
  harbor: { colors: ["#d8f0ff", "#ffffff", "#b7dff0"], rising: true, speed: 10 },
  voyage: { colors: ["#d8f0ff", "#ffffff", "#b7dff0"], rising: true, speed: 10 },
};

const TOKEN_SKIN = {
  idle: { fill: "#fffdf6", border: "#d9b566", text: "#1d2433", badge: "#f7ecc9", badgeText: "#a8792c" },
  correct: { fill: "#effaf0", border: "#55bb6a", text: "#206632", badge: "#c8ebcf", badgeText: "#206632" },
  wrong: { fill: "#fde4dd", border: "#ef6a4f", text: "#d9553b", badge: "#f8cfc3", badgeText: "#d9553b" },
  dim: { fill: "#f3f5f7", border: "#c3cad2", text: "#8c96a2", badge: "#e2e6eb", badgeText: "#8c96a2" },
  chosen: { fill: "#fff4cd", border: "#f7c948", text: "#8a5f00", badge: "#ffe39a", badgeText: "#8a5f00" },
} as const;

type TokenSkin = keyof typeof TOKEN_SKIN;

const FONT = '600 13px "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", system-ui, sans-serif';
const BADGE_FONT = '700 11px system-ui, sans-serif';

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

/** 中英混排的简易折行：逐字符测量，超出 2 行时补省略号。 */
function wrapLabel(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines = 2): string[] {
  const chars = Array.from(text);
  const out: string[] = [];
  let line = "";
  for (const ch of chars) {
    if (ctx.measureText(line + ch).width > maxWidth && line) {
      out.push(line);
      line = ch;
      if (out.length >= maxLines) break;
    } else {
      line += ch;
    }
  }
  if (out.length < maxLines && line) out.push(line);
  if (Array.from(out.join("")).length < chars.length && out.length > 0) {
    let last = out[out.length - 1];
    while (last && ctx.measureText(last + "…").width > maxWidth) last = last.slice(0, -1);
    out[out.length - 1] = last + "…";
  }
  return out;
}

class SceneEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D | null;
  private state: SceneState;
  private mq: MediaQueryList | null = null;
  private reduced = false;
  private paused = false;
  private raf = 0;
  private last = 0;
  private time = 0;

  private w = 0;
  private h = 0;

  private boxes: TokenBox[] = [];
  private target: CastTarget = { x: 0, y: 0, r: 48 };
  private optionKey = "";
  private enterAt: number[] = [];
  private chosenAt = -100;

  private motes: Particle[] = [];
  private particles: Particle[] = [];
  private camera = 0;
  private shake = 0;
  private drag: DragState | null = null;
  private returning: ReturningState | null = null;

  constructor(canvas: HTMLCanvasElement, initial: SceneState) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.state = initial;
    this.mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    this.reduced = this.mq.matches;
    this.mq.addEventListener("change", this.onMotionChange);
    canvas.addEventListener("pointerdown", this.onPointerDown);
    canvas.addEventListener("pointermove", this.onPointerMove);
    canvas.addEventListener("pointerup", this.onPointerUp);
    canvas.addEventListener("pointercancel", this.onPointerCancel);
    canvas.addEventListener("lostpointercapture", this.onPointerCancel);
    document.addEventListener("visibilitychange", this.onVisibility);
  }

  destroy() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.mq?.removeEventListener("change", this.onMotionChange);
    this.canvas.removeEventListener("pointerdown", this.onPointerDown);
    this.canvas.removeEventListener("pointermove", this.onPointerMove);
    this.canvas.removeEventListener("pointerup", this.onPointerUp);
    this.canvas.removeEventListener("pointercancel", this.onPointerCancel);
    this.canvas.removeEventListener("lostpointercapture", this.onPointerCancel);
    document.removeEventListener("visibilitychange", this.onVisibility);
    this.particles = [];
    this.motes = [];
  }

  resizeFromElement() {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.w = rect.width;
    this.h = rect.height;
    this.canvas.width = Math.round(rect.width * dpr);
    this.canvas.height = Math.round(rect.height * dpr);
    this.ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.reflow();
    this.seedMotes();
    this.render();
  }

  start() {
    if (this.paused || this.reduced || this.raf || !this.w) return;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.tick);
  }

  pause() {
    this.paused = true;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  resume() {
    if (!this.paused) return;
    this.paused = false;
    this.start();
  }

  update(next: SceneState) {
    const prev = this.state;
    const key = next.options.join("\u0001");
    const optionsChanged = key !== this.optionKey;
    if (optionsChanged) {
      this.optionKey = key;
      this.enterAt = next.options.map((_, i) => this.time + i * 0.07);
      this.drag = null;
      this.returning = null;
      this.chosenAt = -100;
    }
    if (next.chosen && !prev.chosen) this.chosenAt = this.time;
    this.state = next;
    // 必须先写入新 state 再重排：reflow() 依赖 this.state.options.length。
    // 否则从拼写题（0 个词贝）切到选择题时，boxes 会一直是空数组，只画得出法阵。
    if (optionsChanged) this.reflow();
    this.render();
  }

  trigger(kind: Exclude<FxKind, null>, damage: number) {
    if (this.reduced) return;
    if (kind === "cast") {
      this.spawnCast();
      this.camera = Math.max(this.camera, 0.45);
    } else if (kind === "hit") {
      // 伤害越高，爆点粒子越多、震动越明显
      this.spawnBurst(this.target.x, this.target.y, "hit", clamp(damage / 25, 0.7, 1.6));
      this.spawnDamageRing();
      this.camera = 1;
      this.shake = 8 + clamp(damage / 10, 0, 5);
    } else if (kind === "miss") {
      this.spawnBurst(this.w * 0.15, this.h * 0.62, "miss", 1);
      this.shake = 5;
    } else {
      this.spawnConfetti();
    }
    this.render();
  }

  // ---------- 输入 ----------

  private point(e: PointerEvent) {
    const rect = this.canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  private canPick() {
    // reduced-motion 只关闭动画，不能关掉答题交互
    return (
      this.state.phase === "question" &&
      !this.state.pending &&
      !this.state.chosen &&
      this.state.correctAnswer === null &&
      this.state.options.length > 0 &&
      !this.drag
    );
  }

  private onPointerDown = (e: PointerEvent) => {
    if (!this.canPick()) return;
    const p = this.point(e);
    const index = hitToken(this.boxes, p.x, p.y);
    if (index < 0) return;
    const b = this.boxes[index];
    this.drag = {
      index,
      grabX: p.x - b.x,
      grabY: p.y - b.y,
      x: b.x,
      y: b.y,
      startX: p.x,
      startY: p.y,
      moved: 0,
    };
    this.returning = null;
    try {
      this.canvas.setPointerCapture(e.pointerId);
    } catch {
      // 某些浏览器在合成事件下不允许捕获，拖拽仍可用
    }
    e.preventDefault();
    this.render();
  };

  private onPointerMove = (e: PointerEvent) => {
    const d = this.drag;
    if (!d) return;
    const p = this.point(e);
    d.x = p.x - d.grabX;
    d.y = p.y - d.grabY;
    d.moved = Math.max(d.moved, Math.hypot(p.x - d.startX, p.y - d.startY));
    e.preventDefault();
    if (this.reduced) this.render();
  };

  private onPointerUp = (e: PointerEvent) => {
    const d = this.drag;
    if (!d) return;
    const box = this.boxes[d.index];
    // 轻点即作答；只看位移，长时间按住再松开也仍然算一次点击
    const quick = d.moved < 9;
    const dropped = inCastZone(box, d.x, d.y, this.target);
    this.drag = null;
    try {
      this.canvas.releasePointerCapture(e.pointerId);
    } catch {
      // 同上
    }
    if (quick || dropped) {
      this.state.onSubmit(this.state.options[d.index]);
    } else if (!this.reduced) {
      this.returning = { index: d.index, x: d.x, y: d.y, at: this.time };
    }
    this.render();
  };

  private onPointerCancel = () => {
    const d = this.drag;
    this.drag = null;
    if (d && !this.reduced) this.returning = { index: d.index, x: d.x, y: d.y, at: this.time };
    this.render();
  };

  private onVisibility = () => {
    if (document.hidden) this.pause();
    else this.resume();
  };

  private onMotionChange = () => {
    this.reduced = this.mq?.matches ?? false;
    if (this.reduced) {
      if (this.raf) cancelAnimationFrame(this.raf);
      this.raf = 0;
      this.particles = [];
      this.returning = null;
      this.shake = 0;
      this.camera = 0;
    }
    this.render();
    this.start();
  };

  // ---------- 循环 ----------

  private tick = (now: number) => {
    if (this.paused || this.reduced) {
      this.raf = 0;
      return;
    }
    const dt = clamp((now - this.last) / 1000, 0, 0.05);
    this.last = now;
    this.time += dt;
    this.camera *= Math.exp(-dt * 3.2);
    this.shake *= Math.exp(-dt * 9);
    this.step(dt);
    this.render();
    this.raf = requestAnimationFrame(this.tick);
  };

  private step(dt: number) {
    for (const m of this.motes) {
      m.x += m.vx * dt;
      m.y += m.vy * dt;
      if (m.rising) {
        if (m.y < -12) {
          m.y = this.h + 12;
          m.x = Math.random() * this.w;
        }
      } else if (m.y > this.h + 12) {
        m.y = -12;
        m.x = Math.random() * this.w;
      }
      if (m.x < -12) m.x = this.w + 12;
      if (m.x > this.w + 12) m.x = -12;
      m.rot += m.spin * dt;
      m.vx += Math.sin(this.time * 0.6 + m.y * 0.02) * dt * 3;
    }
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      p.vy += p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.spin * dt;
      p.vx *= 1 - dt * 0.8;
    }
    if (this.returning && this.time - this.returning.at > 0.28) this.returning = null;
  }

  private reflow() {
    this.boxes = layoutTokens(this.state.options.length, this.w, this.h);
    this.target = castTarget(this.w, this.h);
  }

  private seedMotes() {
    const palette = MOTE_PALETTES[this.state.regionKey] ?? MOTE_PALETTES.forest;
    const count = Math.round(clamp((this.w * this.h) / 14000, 14, 34));
    this.motes = Array.from({ length: count }, () => {
      const speed = palette.speed * (0.5 + Math.random());
      return {
        x: Math.random() * this.w,
        y: Math.random() * this.h,
        vx: (Math.random() - 0.5) * 7,
        vy: palette.rising ? -speed : speed,
        life: 1,
        max: 1,
        size: 1.5 + Math.random() * 2.6,
        color: palette.colors[Math.floor(Math.random() * palette.colors.length)],
        kind: "mote" as const,
        gravity: 0,
        rot: Math.random() * Math.PI,
        spin: (Math.random() - 0.5) * 1.4,
        rising: palette.rising,
      };
    });
  }

  private spawnCast() {
    const hx = this.w * 0.17;
    const hy = this.h * 0.62;
    const travel = 0.52;
    for (let i = 0; i < 26; i++) {
      const jitter = (Math.random() - 0.5) * 26;
      this.particles.push({
        x: hx + (Math.random() - 0.5) * 14,
        y: hy + jitter * 0.35,
        vx: ((this.target.x - hx) / travel) * (0.85 + Math.random() * 0.3),
        vy: ((this.target.y - hy + jitter) / travel) * (0.85 + Math.random() * 0.3),
        life: travel + Math.random() * 0.18,
        max: travel + 0.18,
        size: 2.5 + Math.random() * 3.6,
        color: Math.random() > 0.45 ? "#fff3c4" : "#f7c948",
        kind: "spark",
        gravity: 0,
        rot: 0,
        spin: 0,
        rising: true,
      });
    }
  }

  private spawnBurst(x: number, y: number, kind: "hit" | "miss", scale: number) {
    const count = Math.round((kind === "hit" ? 42 : 16) * scale);
    const colors = kind === "hit" ? ["#fff3c4", "#f7c948", "#ffffff", "#ffd08a"] : ["#cfe4f5", "#9cc7e8", "#ffffff"];
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.3;
      const speed = ((kind === "hit" ? 110 : 55) + Math.random() * (kind === "hit" ? 230 : 80)) * scale;
      const life = 0.45 + Math.random() * 0.5;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life,
        max: life,
        size: kind === "hit" ? 2.5 + Math.random() * 4 : 2 + Math.random() * 2.5,
        color: colors[Math.floor(Math.random() * colors.length)],
        kind: "spark",
        gravity: 150,
        rot: 0,
        spin: 0,
        rising: true,
      });
    }
  }

  private spawnDamageRing() {
    // 伤害数字仍由 DOM 渲染（文字更清晰）；这里补一圈扩散的光环粒子
    for (let i = 0; i < 12; i++) {
      const angle = (Math.PI * 2 * i) / 12;
      this.particles.push({
        x: this.target.x,
        y: this.target.y,
        vx: Math.cos(angle) * 70,
        vy: Math.sin(angle) * 70,
        life: 0.4,
        max: 0.4,
        size: 3.5,
        color: "#ffffff",
        kind: "spark",
        gravity: 0,
        rot: 0,
        spin: 0,
        rising: true,
      });
    }
  }

  private spawnConfetti() {
    const colors = ["#f7c948", "#55bb6a", "#4ea8e6", "#ef6a4f", "#ffffff"];
    for (let i = 0; i < 96; i++) {
      const life = 1.2 + Math.random() * 1.3;
      this.particles.push({
        x: Math.random() * this.w,
        // 一部分直接撒在可见区域，点击「继续」后立刻能看到彩带
        y: (Math.random() - 0.65) * this.h,
        vx: (Math.random() - 0.5) * 70,
        vy: 55 + Math.random() * 105,
        life,
        max: life,
        size: 5 + Math.random() * 6,
        color: colors[Math.floor(Math.random() * colors.length)],
        kind: "confetti",
        gravity: 30,
        rot: Math.random() * Math.PI,
        spin: (Math.random() - 0.5) * 8,
        rising: false,
      });
    }
  }

  // ---------- 绘制 ----------

  private render() {
    const ctx = this.ctx;
    if (!ctx || !this.w || !this.h) return;
    ctx.save();
    ctx.clearRect(0, 0, this.w, this.h);
    const s = this.reduced ? 0 : this.shake;
    if (s > 0.2) ctx.translate((Math.random() - 0.5) * s, (Math.random() - 0.5) * s);
    if (this.state.phase !== "reward") {
      this.drawAmbient(ctx);
      this.drawMotes(ctx);
      this.drawCastRing(ctx);
      this.drawParticles(ctx);
      this.drawTokens(ctx);
    } else {
      // 结算态画布会浮到弹窗之上，只画彩带，避免遮住奖励卡片
      this.drawParticles(ctx);
    }
    ctx.restore();
  }

  private drawAmbient(ctx: CanvasRenderingContext2D) {
    // 镜头推进：只缩放背景层，词贝坐标保持不动，命中检测不受影响
    const zoom = 1 + (this.reduced ? 0 : this.camera) * 0.045;
    ctx.save();
    ctx.translate(this.w / 2, this.h / 2);
    ctx.scale(zoom, zoom);
    ctx.translate(-this.w / 2, -this.h / 2);

    const drift = this.reduced ? 0 : this.time * 7;
    ctx.fillStyle = "rgba(255,255,255,0.2)";
    for (let i = 0; i < 3; i++) {
      const span = this.w + 240;
      const x = ((i * 360 + drift + 120) % span) - 120;
      const y = this.h * (0.09 + i * 0.045);
      ctx.beginPath();
      ctx.ellipse(x, y, 92 - i * 14, 15 - i * 2, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // 地面雾气带
    const mist = ctx.createLinearGradient(0, this.h * 0.74, 0, this.h);
    mist.addColorStop(0, "rgba(255,255,255,0)");
    mist.addColorStop(1, "rgba(255,255,255,0.12)");
    ctx.fillStyle = mist;
    ctx.fillRect(0, this.h * 0.74, this.w, this.h * 0.26);

    // 前景草叶随风摆动
    ctx.strokeStyle = "rgba(255,255,255,0.28)";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    const blades = Math.max(10, Math.round(this.w / 46));
    for (let i = 0; i < blades; i++) {
      const x = (i + 0.5) * (this.w / blades);
      const sway = this.reduced ? 0 : Math.sin(this.time * 1.3 + i * 0.9) * 5;
      const height = 9 + (i % 3) * 5;
      ctx.beginPath();
      ctx.moveTo(x, this.h - 6);
      ctx.quadraticCurveTo(x + sway * 0.5, this.h - 6 - height * 0.6, x + sway, this.h - 6 - height);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawMotes(ctx: CanvasRenderingContext2D) {
    for (const m of this.motes) {
      ctx.globalAlpha = this.reduced ? 0.35 : 0.55;
      ctx.fillStyle = m.color;
      ctx.beginPath();
      ctx.ellipse(m.x, m.y, m.size, m.size * 0.65, m.rot, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  private drawCastRing(ctx: CanvasRenderingContext2D) {
    if (this.state.phase !== "question" || this.state.chosen || this.state.pending || !this.state.options.length) return;
    const dragging = this.drag !== null;
    const pulse = this.reduced ? 0.5 : 0.5 + Math.sin(this.time * 2.6) * 0.18;
    const { x, y, r } = this.target;
    ctx.save();
    ctx.globalAlpha = dragging ? 0.95 : 0.45 + pulse * 0.25;
    ctx.strokeStyle = dragging ? "#f7c948" : "#e8b86a";
    ctx.lineWidth = dragging ? 4 : 2.5;
    ctx.setLineDash([9, 7]);
    ctx.lineDashOffset = this.reduced ? 0 : -this.time * 22;
    ctx.beginPath();
    ctx.arc(x, y, r + (dragging ? 6 : 0), 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha *= 0.7;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x, y, r * 0.62, 0, Math.PI * 2);
    ctx.stroke();
    if (dragging) {
      const glow = ctx.createRadialGradient(x, y, 0, x, y, r + 18);
      glow.addColorStop(0, "rgba(247,201,72,0.32)");
      glow.addColorStop(1, "rgba(247,201,72,0)");
      ctx.globalAlpha = 1;
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(x, y, r + 18, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  private drawParticles(ctx: CanvasRenderingContext2D) {
    for (const p of this.particles) {
      const alpha = clamp(p.life / p.max, 0, 1);
      ctx.save();
      ctx.globalAlpha = alpha;
      if (p.kind === "confetti") {
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      } else if (p.kind === "spark") {
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 9;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (0.6 + alpha * 0.4), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  private drawTokens(ctx: CanvasRenderingContext2D) {
    const { options, chosen, correctAnswer } = this.state;
    if (!options.length) return;
    const isFeedback = correctAnswer !== null;
    for (let i = 0; i < this.boxes.length; i++) {
      const box = this.boxes[i];
      const label = options[i];
      let skin: TokenSkin = "idle";
      if (isFeedback) {
        if (label === correctAnswer) skin = "correct";
        else if (label === chosen && label !== correctAnswer) skin = "wrong";
        else skin = "dim";
      } else if (label === chosen) {
        skin = "chosen";
      }

      const enter = this.reduced ? 1 : easeOutCubic((this.time - (this.enterAt[i] ?? 0)) / 0.42);
      let x = box.x;
      let y = box.y;
      let scale = 0.86 + 0.14 * enter;
      let alpha = enter;
      let tilt = 0;

      if (this.drag?.index === i) {
        x = this.drag.x;
        y = this.drag.y;
        scale = 1.06;
        tilt = -0.03;
      } else if (this.returning?.index === i) {
        const p = easeOutCubic((this.time - this.returning.at) / 0.28);
        x = this.returning.x + (box.x - this.returning.x) * p;
        y = this.returning.y + (box.y - this.returning.y) * p;
      } else if (skin === "chosen") {
        const p = easeOutCubic((this.time - this.chosenAt) / 0.45);
        x = box.x + (this.target.x - box.w / 2 - box.x) * p;
        y = box.y + (this.target.y - box.h / 2 - box.y) * p;
        scale *= 1 - p * 0.6;
        alpha *= 1 - p * 0.85;
      }
      if (skin === "wrong") x += this.reduced ? 0 : Math.sin(this.time * 38) * 2;
      if (skin === "dim") alpha *= 0.42;
      if (alpha <= 0.01) continue;

      const tone = TOKEN_SKIN[skin];
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(x + box.w / 2, y + box.h / 2);
      ctx.scale(scale, scale);
      ctx.rotate(tilt);
      ctx.translate(-box.w / 2, -box.h / 2);

      ctx.shadowColor = "rgba(29,36,51,0.18)";
      ctx.shadowBlur = this.drag?.index === i ? 18 : 9;
      ctx.shadowOffsetY = this.drag?.index === i ? 8 : 3;
      roundRectPath(ctx, 0, 0, box.w, box.h, 14);
      ctx.fillStyle = tone.fill;
      ctx.fill();
      ctx.shadowColor = "transparent";
      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 0;
      ctx.lineWidth = 2;
      ctx.strokeStyle = tone.border;
      ctx.stroke();

      // 序号徽标
      const badge = 22;
      roundRectPath(ctx, 8, (box.h - badge) / 2, badge, badge, 7);
      ctx.fillStyle = tone.badge;
      ctx.fill();
      ctx.fillStyle = tone.badgeText;
      ctx.font = BADGE_FONT;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(i + 1), 8 + badge / 2, box.h / 2 + 0.5);

      // 选项文本
      ctx.font = FONT;
      ctx.fillStyle = tone.text;
      ctx.textAlign = "left";
      const lines = wrapLabel(ctx, label, Math.max(40, box.w - 22 - 20));
      const lineH = 15;
      const startY = box.h / 2 - ((lines.length - 1) * lineH) / 2;
      lines.forEach((line, li) => ctx.fillText(line, 8 + badge + 8, startY + li * lineH));
      ctx.restore();
    }

    // 拖拽时把词贝和法阵连起来
    if (this.drag) {
      const d = this.drag;
      const b = this.boxes[d.index];
      ctx.save();
      ctx.globalAlpha = 0.6;
      ctx.strokeStyle = "#f7c948";
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.moveTo(d.x + b.w / 2, d.y + b.h / 2);
      ctx.lineTo(this.target.x, this.target.y);
      ctx.stroke();
      ctx.restore();
    }
  }
}

export function BattleCanvas({ regionKey, phase, options, chosen, correctAnswer, pending, fxKey, fxKind, damage, onSubmit }: BattleCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<SceneEngine | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const engine = new SceneEngine(canvas, { regionKey, phase, options, chosen, correctAnswer, pending, onSubmit });
    engineRef.current = engine;
    engine.resizeFromElement();
    const ro = new ResizeObserver(() => engine.resizeFromElement());
    ro.observe(canvas);
    engine.start();
    return () => {
      ro.disconnect();
      engine.destroy();
      engineRef.current = null;
    };
    // 引擎只创建一次；后续变化由下面的 effect 推送
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    engineRef.current?.update({ regionKey, phase, options, chosen, correctAnswer, pending, onSubmit });
  }, [regionKey, phase, options, chosen, correctAnswer, pending, onSubmit]);

  useEffect(() => {
    if (!fxKind) return;
    engineRef.current?.trigger(fxKind, damage);
    // fxKey 用来强制同类效果重放（例如连续答对两题）
  }, [fxKey, fxKind, damage]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={phase === "reward" ? "pointer-events-none absolute inset-0 z-[25] h-full w-full" : "absolute inset-0 z-[6] h-full w-full"}
      style={{ touchAction: "none" }}
    />
  );
}
