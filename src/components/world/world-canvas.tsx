"use client";

import { useEffect, useRef, useState } from "react";
import { CloudRain, Moon, RotateCcw, Snowflake, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  clamp,
  clampCamera,
  clipNear,
  groundDragDelta,
  lightFor,
  makeCamera,
  mixHex,
  pickAnchor,
  projectPoint,
  shadeColor,
  skyColors,
  sortFaces,
  faceNormal,
  type Anchor,
  type Camera,
  type Face,
  type Weather,
  type WorldFrame,
} from "./low-poly";

interface CanvasProps {
  /** 每帧生成世界：返回按世界坐标描述的面与可交互锚点 */
  build: (time: number) => WorldFrame;
  onPick?: (id: string) => void;
  /** 传入后，按住锚点拖动会变成「挪动物体」；空白区域拖动仍是旋转视角 */
  onMove?: (id: string, dx: number, dz: number) => void;
  selectedId?: string | null;
  /** 读屏 / 键盘的等价控件 */
  a11yItems?: { id: string; label: string }[];
  /** 地平线以下的地面/海面渐变（上下两色） */
  groundColors?: [string, string];
  /** 该场景的默认相机（模块级常量，避免每次渲染刷新引擎） */
  camera?: Partial<Camera>;
  className?: string;
  hint?: string;
}

interface WeatherParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
}

interface EngineProps {
  build: (time: number) => WorldFrame;
  onPick?: (id: string) => void;
  onMove?: (id: string, dx: number, dz: number) => void;
  selectedId: string | null;
  dayT: number;
  weather: Weather;
  groundColors: [string, string];
  camera: Partial<Camera>;
}

interface DragState {
  mode: "orbit" | "move";
  id: string | null;
  lastX: number;
  lastY: number;
  startX: number;
  startY: number;
  moved: number;
}

/** 地平线以下的铺底渐变（模块级常量，避免每次渲染产生新数组触发引擎刷新） */
export const SEA_GROUND: [string, string] = ["#a8dcf2", "#7fb9e0"];
export const GRASS_GROUND: [string, string] = ["#b7e3a3", "#7cc46f"];
export const ISLAND_CAMERA: Partial<Camera> = { distance: 18, pitch: 0.38, yaw: 0.58 };
export const GARDEN_CAMERA: Partial<Camera> = { distance: 14, pitch: 0.5, yaw: 0.52, target: { x: 0, y: -1.2, z: 0 } };
const NO_CAMERA_OVERRIDE: Partial<Camera> = {};

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
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

class WorldEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D | null;
  private props: EngineProps;
  private cam: Camera;
  private mq: MediaQueryList | null = null;
  private reduced = false;
  private paused = false;
  private raf = 0;
  private last = 0;
  private time = 0;
  private w = 0;
  private h = 0;
  private anchors: Anchor[] = [];
  private hoverId: string | null = null;
  private drag: DragState | null = null;
  private weatherParticles: WeatherParticle[] = [];

  constructor(canvas: HTMLCanvasElement, props: EngineProps) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.props = props;
    this.cam = makeCamera(1, 1, props.camera);
    this.mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    this.reduced = this.mq.matches;
    this.mq.addEventListener("change", this.onMotionChange);
    canvas.addEventListener("pointerdown", this.onPointerDown);
    canvas.addEventListener("pointermove", this.onPointerMove);
    canvas.addEventListener("pointerup", this.onPointerUp);
    canvas.addEventListener("pointercancel", this.onPointerCancel);
    canvas.addEventListener("lostpointercapture", this.onPointerCancel);
    canvas.addEventListener("wheel", this.onWheel, { passive: false });
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
    this.canvas.removeEventListener("wheel", this.onWheel);
    document.removeEventListener("visibilitychange", this.onVisibility);
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
    this.cam = { ...this.cam, w: this.w, h: this.h };
    this.seedWeather();
    this.render();
  }

  resetView() {
    this.cam = makeCamera(this.w, this.h, this.props.camera);
    this.render();
  }

  setProps(next: EngineProps) {
    const weatherChanged = next.weather !== this.props.weather;
    this.props = next;
    if (weatherChanged) this.seedWeather();
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

  private tick = (now: number) => {
    if (this.paused || this.reduced) {
      this.raf = 0;
      return;
    }
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.time += dt;
    this.stepWeather(dt);
    this.render();
    this.raf = requestAnimationFrame(this.tick);
  };

  private seedWeather() {
    if (!this.w || !this.h) return;
    const count = this.props.weather === "clear" ? 0 : this.props.weather === "rain" ? 110 : 85;
    this.weatherParticles = Array.from({ length: count }, () => ({
      x: Math.random() * this.w,
      y: Math.random() * this.h,
      vx: this.props.weather === "rain" ? -26 : (Math.random() - 0.5) * 16,
      vy: this.props.weather === "rain" ? 320 + Math.random() * 180 : 20 + Math.random() * 28,
      size: this.props.weather === "rain" ? 8 + Math.random() * 9 : 2 + Math.random() * 2.6,
      alpha: 0.25 + Math.random() * 0.45,
    }));
  }

  private stepWeather(dt: number) {
    for (const p of this.weatherParticles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.y > this.h + 12) {
        p.y = -12;
        p.x = Math.random() * this.w;
      }
      if (p.x < -12) p.x = this.w + 12;
      if (p.x > this.w + 12) p.x = -12;
    }
  }

  // ---------- 输入 ----------

  private point(e: PointerEvent) {
    const rect = this.canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  private onPointerDown = (e: PointerEvent) => {
    const p = this.point(e);
    const hit = pickAnchor(this.anchors, this.cam, p.x, p.y);
    this.drag = {
      mode: this.props.onMove && hit ? "move" : "orbit",
      id: hit,
      lastX: p.x,
      lastY: p.y,
      startX: p.x,
      startY: p.y,
      moved: 0,
    };
    try {
      this.canvas.setPointerCapture(e.pointerId);
    } catch {
      // 合成事件下可能不允许捕获，交互仍可用
    }
    e.preventDefault();
    this.render();
  };

  private onPointerMove = (e: PointerEvent) => {
    const p = this.point(e);
    const d = this.drag;
    if (!d) {
      const next = pickAnchor(this.anchors, this.cam, p.x, p.y);
      if (next !== this.hoverId) {
        this.hoverId = next;
        if (this.reduced) this.render();
      }
      return;
    }
    const dx = p.x - d.lastX;
    const dy = p.y - d.lastY;
    d.lastX = p.x;
    d.lastY = p.y;
    d.moved += Math.abs(dx) + Math.abs(dy);
    if (d.mode === "orbit") {
      this.cam = clampCamera({
        ...this.cam,
        yaw: this.cam.yaw + dx * 0.007,
        pitch: this.cam.pitch - dy * 0.005,
      });
    } else if (d.id) {
      const delta = groundDragDelta(dx, dy, this.cam);
      this.props.onMove?.(d.id, delta.x, delta.z);
    }
    e.preventDefault();
    if (this.reduced) this.render();
  };

  private onPointerUp = (e: PointerEvent) => {
    const d = this.drag;
    this.drag = null;
    try {
      this.canvas.releasePointerCapture(e.pointerId);
    } catch {
      // 同上
    }
    if (d && d.mode === "orbit" && d.moved < 9) {
      const p = this.point(e);
      const id = pickAnchor(this.anchors, this.cam, p.x, p.y);
      if (id) this.props.onPick?.(id);
    }
    this.render();
  };

  private onPointerCancel = () => {
    this.drag = null;
    this.render();
  };

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    this.cam = clampCamera({ ...this.cam, distance: this.cam.distance + e.deltaY * 0.02 });
    if (this.reduced) this.render();
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
    }
    this.render();
    this.start();
  };

  // ---------- 绘制 ----------

  private drawFace(ctx: CanvasRenderingContext2D, face: Face, light: ReturnType<typeof lightFor>) {
    const projected = face.points.map((p) => projectPoint(p, this.cam));
    const pts = projected.some((p) => !p.visible) ? clipNear(projected, this.cam) : projected;
    if (pts.length < 3) return;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.closePath();
    ctx.globalAlpha = face.alpha ?? 1;
    ctx.fillStyle = face.emissive ? face.color : shadeColor(face.color, faceNormal(face), light.direction, light.ambient);
    ctx.fill();
    if (face.stroke) {
      ctx.strokeStyle = face.stroke;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  private drawSky(ctx: CanvasRenderingContext2D) {
    const t = this.props.dayT;
    const [top, bottom] = skyColors(t);
    // 无限远地面在透视下的地平线：h/2 - focal * tan(pitch)，随旋转实时变化
    const focal = this.h / 2 / Math.tan(this.cam.fov / 2);
    const horizon = clamp(this.h / 2 - focal * Math.tan(this.cam.pitch), this.h * 0.04, this.h * 0.62);

    const sky = ctx.createLinearGradient(0, 0, 0, Math.max(1, horizon));
    sky.addColorStop(0, top);
    sky.addColorStop(1, bottom);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, this.w, horizon);

    const ground = ctx.createLinearGradient(0, horizon, 0, this.h);
    ground.addColorStop(0, mixHex(this.props.groundColors[0], "#2b3a55", t * 0.6));
    ground.addColorStop(1, mixHex(this.props.groundColors[1], "#22304a", t * 0.6));
    ctx.fillStyle = ground;
    ctx.fillRect(0, horizon, this.w, this.h - horizon);

    // 地平线处一条柔和高光，避免天空与地面硬切
    ctx.fillStyle = "rgba(255,255,255,0.22)";
    ctx.fillRect(0, horizon - 2, this.w, 4);

    const cx = this.w * (0.78 - t * 0.12);
    const cy = horizon * (0.42 + t * 0.12);
    const radius = 24;
    const glow = ctx.createRadialGradient(cx, cy, 4, cx, cy, radius * 2.6);
    glow.addColorStop(0, t > 0.6 ? "rgba(240,244,255,0.55)" : "rgba(255,236,160,0.6)");
    glow.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 2.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = t > 0.6 ? "#f4f6ff" : "#ffe9a3";
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();
    if (t > 0.6) {
      ctx.fillStyle = "rgba(255,255,255,0.75)";
      for (let i = 0; i < 22; i++) {
        const x = ((i * 137.5) % 97) / 97 * this.w;
        const y = ((i * 71.3) % 61) / 61 * this.h * 0.55;
        ctx.fillRect(x, y, 1.6, 1.6);
      }
    }
  }

  private drawAnchorMarkers(ctx: CanvasRenderingContext2D, anchors: Anchor[]) {
    const showAllLabels = anchors.length <= 24;
    for (const a of anchors) {
      const p = projectPoint(a.position, this.cam);
      if (!p.visible) continue;
      const active = a.id === this.props.selectedId || a.id === this.hoverId;
      if (a.kind === "slot") {
        ctx.save();
        ctx.globalAlpha = active ? 0.95 : 0.3;
        ctx.strokeStyle = active ? "#2b8ad6" : "#ffffff";
        ctx.lineWidth = active ? 2.5 : 1.6;
        ctx.setLineDash([6, 5]);
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, 22 * Math.min(1.4, p.scale / 18), 9 * Math.min(1.4, p.scale / 18), 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      } else if (active) {
        ctx.save();
        ctx.strokeStyle = "#2b8ad6";
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, 20, 8, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
      if (a.label && (showAllLabels || active)) {
        ctx.save();
        ctx.font = '600 11px "PingFang SC", "Microsoft YaHei", system-ui, sans-serif';
        const tw = ctx.measureText(a.label).width;
        const bw = tw + 14;
        const bx = p.x - bw / 2;
        const by = p.y - 30;
        ctx.globalAlpha = active ? 1 : 0.86;
        roundRect(ctx, bx, by, bw, 19, 9);
        ctx.fillStyle = "rgba(255,255,255,0.92)";
        ctx.fill();
        ctx.fillStyle = "#26324a";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(a.label, p.x, by + 9.5);
        ctx.restore();
      }
    }
  }

  private drawWeather(ctx: CanvasRenderingContext2D) {
    if (this.props.weather === "clear") return;
    ctx.save();
    for (const p of this.weatherParticles) {
      ctx.globalAlpha = p.alpha * (this.props.dayT > 0.6 ? 0.8 : 1);
      if (this.props.weather === "rain") {
        ctx.strokeStyle = "#c8dcf0";
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x + p.vx * 0.028, p.y - p.size);
        ctx.stroke();
      } else {
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  private render() {
    const ctx = this.ctx;
    if (!ctx || !this.w || !this.h) return;
    ctx.clearRect(0, 0, this.w, this.h);
    this.drawSky(ctx);

    const frame = this.props.build(this.reduced ? 0 : this.time);
    this.anchors = frame.anchors;
    const light = lightFor(this.props.dayT);
    for (const { face } of sortFaces(frame.faces, this.cam)) this.drawFace(ctx, face, light);

    this.drawAnchorMarkers(ctx, frame.anchors);
    this.drawWeather(ctx);
  }
}

export function WorldCanvas({ build, onPick, onMove, selectedId, a11yItems = [], groundColors = GRASS_GROUND, camera = NO_CAMERA_OVERRIDE, className, hint }: CanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<WorldEngine | null>(null);
  const [dayT, setDayT] = useState(0);
  const [weather, setWeather] = useState<Weather>("clear");

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const engine = new WorldEngine(canvas, { build, onPick, onMove, selectedId: selectedId ?? null, dayT, weather, groundColors, camera });
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
    // 引擎只创建一次；后续参数由下面的 effect 推送
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    engineRef.current?.setProps({ build, onPick, onMove, selectedId: selectedId ?? null, dayT, weather, groundColors, camera });
  }, [build, onPick, onMove, selectedId, dayT, weather, groundColors, camera]);

  return (
    <div className={cn("relative overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-soft", className)}>
      <div className="relative w-full" style={{ aspectRatio: "1000 / 640", minHeight: 360, maxHeight: 500 }}>
        <canvas ref={canvasRef} aria-hidden="true" className="absolute inset-0 z-[1] h-full w-full" style={{ touchAction: "none" }} />

        <div className="pointer-events-none absolute left-3 top-3 z-[3] max-w-[62%] rounded-full bg-white/85 px-2.5 py-1 text-[10px] font-medium text-slate-600 shadow-sm backdrop-blur sm:text-[11px]">
          {hint ?? "拖拽旋转视角 · 滚轮缩放 · 点击场景中的物体"}
        </div>

        <div className="absolute right-3 top-3 z-[3] flex items-center gap-1 rounded-full bg-white/90 p-1 shadow-sm backdrop-blur">
          <button
            type="button"
            aria-label={dayT > 0.5 ? "切换到白天" : "切换到夜晚"}
            title="昼夜切换"
            onClick={() => setDayT((v) => (v > 0.5 ? 0 : 0.85))}
            className="grid h-7 w-7 place-items-center rounded-full text-slate-500 hover:bg-slate-100"
          >
            {dayT > 0.5 ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
          </button>
          {([
            ["clear", null, "晴朗"],
            ["rain", CloudRain, "雨天"],
            ["snow", Snowflake, "飘雪"],
          ] as const).map(([key, Icon, label]) => (
            <button
              key={key}
              type="button"
              aria-label={label}
              aria-pressed={weather === key}
              title={label}
              onClick={() => setWeather(key)}
              className={cn("grid h-7 w-7 place-items-center rounded-full text-xs font-semibold transition", weather === key ? "bg-ocean-500 text-white" : "text-slate-500 hover:bg-slate-100")}
            >
              {Icon ? <Icon className="h-4 w-4" /> : "晴"}
            </button>
          ))}
          <button
            type="button"
            aria-label="重置视角"
            title="重置视角"
            onClick={() => engineRef.current?.resetView()}
            className="grid h-7 w-7 place-items-center rounded-full text-slate-500 hover:bg-slate-100"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
        </div>

        {a11yItems.length > 0 && (
          <div className="sr-only" role="group" aria-label="场景中的可交互物体">
            {a11yItems.map((item) => (
              <button key={item.id} type="button" onClick={() => onPick?.(item.id)}>
                {item.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
