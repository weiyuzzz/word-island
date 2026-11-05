"use client";

/**
 * 所有建筑绘制在 120×120 的画布中，地面线 y=110，水平居中 x=60。
 * 不同等级通过条件渲染增加细节。
 */

const C = {
  wood: "#c98a4b",
  woodDark: "#9c6236",
  roof: "#e8735a",
  roofDark: "#c9533c",
  stone: "#e3ded2",
  stoneDark: "#bfb6a4",
  window: "#ffe9a8",
  dark: "#5b4636",
  leaf: "#6cc07a",
  leafDark: "#3f9a52",
  leafLight: "#9bd68f",
  water: "#7cc3f0",
  sun: "#f7c948",
  coral: "#f98b73",
  white: "#ffffff",
  blue: "#5b8fc7",
  grey: "#9aa3ad",
};

function Window({ x, y, w = 10, h = 10 }: { x: number; y: number; w?: number; h?: number }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={1.5} fill={C.window} stroke={C.dark} strokeWidth={1.2} />
      <line x1={x + w / 2} y1={y} x2={x + w / 2} y2={y + h} stroke={C.dark} strokeWidth={0.8} />
      <line x1={x} y1={y + h / 2} x2={x + w} y2={y + h / 2} stroke={C.dark} strokeWidth={0.8} />
    </g>
  );
}

function Cabin({ level }: { level: number }) {
  if (level >= 3) {
    return (
      <g>
        <rect x={74} y={30} width={9} height={22} fill={C.stoneDark} />
        <rect x={30} y={52} width={60} height={58} rx={2} fill={C.wood} />
        <polygon points="22,54 60,22 98,54" fill={C.roof} />
        <polygon points="30,54 60,29 90,54" fill={C.roofDark} opacity={0.25} />
        <Window x={38} y={60} />
        <Window x={72} y={60} />
        <Window x={38} y={84} />
        <rect x={54} y={84} width={13} height={26} rx={2} fill={C.dark} />
        <circle cx={64} cy={98} r={1.2} fill={C.sun} />
        <rect x={24} y={104} width={72} height={6} rx={1} fill={C.woodDark} />
        <rect x={26} y={82} width={3} height={22} fill={C.woodDark} />
        <rect x={91} y={82} width={3} height={22} fill={C.woodDark} />
        <rect x={24} y={80} width={72} height={3} fill={C.woodDark} />
        <rect x={36} y={94} width={14} height={3} fill={C.leafDark} />
        <circle cx={39} cy={93} r={2} fill={C.coral} />
        <circle cx={44} cy={93} r={2} fill={C.sun} />
        <circle cx={49} cy={93} r={2} fill={C.coral} />
      </g>
    );
  }
  return (
    <g>
      {level >= 2 && <rect x={72} y={48} width={8} height={18} fill={C.stoneDark} />}
      <rect x={35} y={70} width={50} height={40} rx={2} fill={C.wood} />
      <polygon points="28,72 60,42 92,72" fill={C.roof} />
      <polygon points="36,72 60,49 84,72" fill={C.roofDark} opacity={0.25} />
      <Window x={40} y={78} />
      {level >= 2 && <Window x={70} y={78} />}
      <rect x={54} y={86} width={12} height={24} rx={2} fill={C.dark} />
      <circle cx={63} cy={99} r={1.2} fill={C.sun} />
      {level >= 2 && (
        <g>
          <rect x={38} y={88} width={14} height={3} fill={C.leafDark} />
          <circle cx={41} cy={87} r={2} fill={C.coral} />
          <circle cx={46} cy={87} r={2} fill={C.sun} />
          <circle cx={50} cy={87} r={2} fill={C.coral} />
          <rect x={68} y={88} width={14} height={3} fill={C.leafDark} />
          <circle cx={71} cy={87} r={2} fill={C.sun} />
          <circle cx={76} cy={87} r={2} fill={C.coral} />
          <circle cx={80} cy={87} r={2} fill={C.sun} />
        </g>
      )}
    </g>
  );
}

function Tree({ level }: { level: number }) {
  return (
    <g>
      <rect x={56} y={84} width={8} height={26} rx={2} fill={C.woodDark} />
      <circle cx={60} cy={70} r={22} fill={C.leafDark} />
      <circle cx={47} cy={78} r={14} fill={C.leaf} />
      <circle cx={73} cy={76} r={15} fill={C.leaf} />
      <circle cx={60} cy={62} r={16} fill={C.leafLight} />
      {level >= 2 && (
        <g>
          <circle cx={50} cy={70} r={3} fill={C.coral} />
          <circle cx={66} cy={64} r={3} fill={C.coral} />
          <circle cx={72} cy={82} r={3} fill={C.coral} />
          <circle cx={58} cy={82} r={3} fill={C.coral} />
          <circle cx={44} cy={84} r={3} fill={C.coral} />
        </g>
      )}
    </g>
  );
}

function Palm() {
  const angles = [-165, -125, -80, -40, 0, 30];
  return (
    <g>
      <path d="M56 110 Q60 80 72 54" stroke={C.woodDark} strokeWidth={7} fill="none" strokeLinecap="round" />
      <g className="animate-sway origin-center-box">
        {angles.map((a) => {
          const rad = (a * Math.PI) / 180;
          return <ellipse key={a} cx={72 + 17 * Math.cos(rad)} cy={54 + 17 * Math.sin(rad)} rx={20} ry={6} fill={a % 2 === 0 ? C.leafDark : C.leaf} transform={`rotate(${a} ${72 + 17 * Math.cos(rad)} ${54 + 17 * Math.sin(rad)})`} />;
        })}
        <circle cx={70} cy={58} r={3.5} fill={C.woodDark} />
        <circle cx={76} cy={60} r={3.5} fill={C.woodDark} />
      </g>
    </g>
  );
}

function Flowers() {
  const items = [
    { x: 40, y: 92, c: C.coral },
    { x: 52, y: 86, c: C.sun },
    { x: 62, y: 94, c: C.white },
    { x: 74, y: 88, c: "#b48cf2" },
    { x: 84, y: 95, c: C.coral },
  ];
  return (
    <g>
      <ellipse cx={60} cy={106} rx={30} ry={6} fill={C.leafDark} opacity={0.5} />
      {items.map((f, i) => (
        <g key={i}>
          <line x1={f.x} y1={f.y} x2={f.x} y2={106} stroke={C.leafDark} strokeWidth={2} />
          <ellipse cx={f.x + 4} cy={f.y + 8} rx={4} ry={2} fill={C.leaf} transform={`rotate(-30 ${f.x + 4} ${f.y + 8})`} />
          {[0, 72, 144, 216, 288].map((a) => (
            <circle key={a} cx={f.x + 3.5 * Math.cos((a * Math.PI) / 180)} cy={f.y + 3.5 * Math.sin((a * Math.PI) / 180)} r={3} fill={f.c} />
          ))}
          <circle cx={f.x} cy={f.y} r={2} fill={C.sun} />
        </g>
      ))}
    </g>
  );
}

function Bench() {
  return (
    <g>
      <rect x={38} y={96} width={4} height={14} fill={C.dark} />
      <rect x={78} y={96} width={4} height={14} fill={C.dark} />
      <rect x={32} y={92} width={56} height={6} rx={2} fill={C.wood} />
      <rect x={38} y={78} width={4} height={16} fill={C.dark} />
      <rect x={78} y={78} width={4} height={16} fill={C.dark} />
      <rect x={32} y={76} width={56} height={5} rx={2} fill={C.wood} />
      <rect x={32} y={84} width={56} height={4} rx={2} fill={C.wood} />
    </g>
  );
}

function Library({ level }: { level: number }) {
  return (
    <g>
      {level >= 3 && (
        <g>
          <rect x={8} y={82} width={24} height={28} fill={C.stone} />
          <rect x={88} y={82} width={24} height={28} fill={C.stone} />
          <rect x={6} y={78} width={28} height={5} fill={C.stoneDark} />
          <rect x={86} y={78} width={28} height={5} fill={C.stoneDark} />
          <Window x={15} y={90} w={9} h={9} />
          <Window x={95} y={90} w={9} h={9} />
        </g>
      )}
      <rect x={30} y={70} width={60} height={40} fill={C.stone} />
      <rect x={26} y={66} width={68} height={7} fill={C.stoneDark} />
      {level >= 2 ? (
        <g>
          <path d="M40 66 A20 20 0 0 1 80 66 Z" fill={C.blue} />
          <rect x={58} y={40} width={4} height={8} fill={C.sun} />
          <circle cx={60} cy={40} r={3} fill={C.sun} />
        </g>
      ) : (
        <polygon points="26,66 60,46 94,66" fill="#eee9dd" stroke={C.stoneDark} strokeWidth={1.5} />
      )}
      {[36, 52, 68, 84].map((x) => (
        <rect key={x} x={x - 3} y={73} width={6} height={37} fill={C.white} stroke={C.stoneDark} strokeWidth={0.8} />
      ))}
      <rect x={54} y={88} width={12} height={22} rx={2} fill={C.dark} />
      <rect x={40} y={78} width={9} height={8} rx={1} fill={C.roof} />
      <rect x={71} y={78} width={9} height={8} rx={1} fill={C.blue} />
      <text x={60} y={60} textAnchor="middle" fontSize={8} fontWeight={700} fill={level >= 2 ? C.white : C.stoneDark}>
        ABC
      </text>
    </g>
  );
}

function Garden({ level }: { level: number }) {
  const pickets = Array.from({ length: 10 }, (_, i) => 24 + i * 8);
  return (
    <g>
      <ellipse cx={60} cy={102} rx={40} ry={9} fill="#8a5a3c" opacity={0.35} />
      {level >= 2 && (
        <g>
          <polygon points="22,96 22,76 36,66 50,76 50,96" fill="#d8ecf8" stroke={C.white} strokeWidth={1.5} opacity={0.9} />
          <line x1={36} y1={66} x2={36} y2={96} stroke={C.white} strokeWidth={1.2} />
          <line x1={22} y1={84} x2={50} y2={84} stroke={C.white} strokeWidth={1.2} />
        </g>
      )}
      {level >= 3 && (
        <g>
          <path d="M66 96 V80 A11 11 0 0 1 88 80 V96" fill="none" stroke={C.white} strokeWidth={4} />
          <circle cx={68} cy={84} r={3} fill={C.coral} />
          <circle cx={77} cy={71} r={3} fill={C.sun} />
          <circle cx={86} cy={84} r={3} fill="#b48cf2" />
        </g>
      )}
      {[32, 44, 56, 68, 80, 90].map((x, i) => (
        <g key={x}>
          <circle cx={x} cy={92} r={3.2} fill={[C.coral, C.sun, "#b48cf2", C.white][i % 4]} />
          <circle cx={x + 5} cy={98} r={3} fill={[C.sun, C.white, C.coral, "#b48cf2"][i % 4]} />
        </g>
      ))}
      {pickets.map((x) => (
        <rect key={x} x={x} y={90} width={3.5} height={16} rx={1} fill={C.white} stroke={C.stoneDark} strokeWidth={0.6} />
      ))}
      <rect x={22} y={96} width={78} height={2.5} fill={C.white} />
    </g>
  );
}

function Fountain() {
  return (
    <g>
      <ellipse cx={60} cy={102} rx={34} ry={9} fill={C.stoneDark} />
      <ellipse cx={60} cy={100} rx={30} ry={7} fill={C.water} />
      <rect x={56} y={70} width={8} height={30} fill={C.stoneDark} />
      <ellipse cx={60} cy={70} rx={14} ry={4} fill={C.stone} />
      <ellipse cx={60} cy={69} rx={11} ry={2.5} fill={C.water} />
      <g className="animate-float">
        <path d="M60 64 q-16 10 -24 32" stroke={C.water} strokeWidth={2.5} fill="none" strokeLinecap="round" />
        <path d="M60 64 q16 10 24 32" stroke={C.water} strokeWidth={2.5} fill="none" strokeLinecap="round" />
        <path d="M60 60 v8" stroke={C.water} strokeWidth={3} strokeLinecap="round" />
        <circle cx={60} cy={56} r={2.5} fill={C.water} />
      </g>
    </g>
  );
}

function Windmill({ level }: { level: number }) {
  return (
    <g>
      <polygon points="42,110 78,110 70,60 50,60" fill={level >= 2 ? C.stone : C.wood} />
      {level >= 2 && <rect x={38} y={96} width={44} height={14} fill={C.stoneDark} />}
      <polygon points="46,60 60,48 74,60" fill={C.roofDark} />
      <Window x={55} y={78} w={10} h={12} />
      <rect x={55} y={96} width={10} height={14} fill={C.dark} />
      <g className="animate-spin-slow origin-center-box">
        {[0, 90, 180, 270].map((a, i) => (
          <g key={a} transform={`rotate(${a} 60 58)`}>
            <rect x={57} y={22} width={6} height={36} rx={2} fill={level >= 3 ? [C.coral, C.sun, C.coral, C.sun][i] : C.white} stroke={C.dark} strokeWidth={0.8} />
          </g>
        ))}
        <circle cx={60} cy={58} r={4} fill={C.dark} />
      </g>
    </g>
  );
}

function Lighthouse({ level }: { level: number }) {
  const top = level >= 2 ? 26 : 40;
  const base = 110;
  const wTop = 12;
  const wBase = 24;
  const w = (y: number) => wTop + ((wBase - wTop) * (y - top)) / (base - top);
  const band = (y1: number, y2: number) => `${60 - w(y1) / 2},${y1} ${60 + w(y1) / 2},${y1} ${60 + w(y2) / 2},${y2} ${60 - w(y2) / 2},${y2}`;
  const h = base - top;
  const bands = [
    [top + h * 0.12, top + h * 0.3],
    [top + h * 0.48, top + h * 0.66],
    [top + h * 0.84, base],
  ];
  return (
    <g>
      <ellipse cx={60} cy={108} rx={34} ry={8} fill={C.grey} opacity={0.6} />
      {level >= 3 && (
        <g>
          <rect x={76} y={84} width={26} height={26} fill={C.wood} />
          <polygon points="73,86 89,70 105,86" fill={C.roof} />
          <Window x={84} y={92} w={8} h={8} />
        </g>
      )}
      <polygon points={band(top, base)} fill={C.white} />
      {bands.map(([a, b], i) => (
        <polygon key={i} points={band(a, b)} fill={C.roof} />
      ))}
      <rect x={60 - wTop / 2 - 3} y={top - 12} width={wTop + 6} height={12} fill={C.window} stroke={C.dark} strokeWidth={1.2} />
      <polygon points={`${60 - wTop / 2 - 4},${top - 12} 60,${top - 22} ${60 + wTop / 2 + 4},${top - 12}`} fill={C.roofDark} />
      <polygon points={`60,${top - 6} 118,${top - 26} 118,${top + 12}`} fill={C.sun} opacity={0.4} className="animate-beam" />
      <circle cx={60} cy={top - 6} r={3} fill={C.sun} />
      <rect x={56} y={96} width={8} height={14} fill={C.dark} />
    </g>
  );
}

function Stall({ x, w, color }: { x: number; w: number; color: string }) {
  const stripes = Math.max(2, Math.round(w / 9));
  const sw = w / stripes;
  return (
    <g>
      <rect x={x + 2} y={84} width={3} height={26} fill={C.woodDark} />
      <rect x={x + w - 5} y={84} width={3} height={26} fill={C.woodDark} />
      <rect x={x + 2} y={92} width={w - 4} height={18} fill={C.wood} />
      {Array.from({ length: stripes }, (_, i) => (
        <rect key={i} x={x + i * sw} y={74} width={sw} height={12} fill={i % 2 === 0 ? color : C.white} />
      ))}
      <polygon points={`${x},86 ${x + w},86 ${x + w - 3},90 ${x + 3},90`} fill={color} opacity={0.8} />
      <circle cx={x + w * 0.3} cy={90} r={3} fill={C.coral} />
      <circle cx={x + w * 0.5} cy={89} r={3} fill={C.sun} />
      <circle cx={x + w * 0.7} cy={90} r={3} fill={C.leaf} />
    </g>
  );
}

function Market({ level }: { level: number }) {
  return (
    <g>
      {level >= 3 && (
        <g>
          <path d="M14 60 Q60 72 106 60" stroke={C.dark} strokeWidth={1} fill="none" />
          {[22, 36, 50, 64, 78, 92].map((x, i) => (
            <polygon key={x} points={`${x},${63 + Math.sin((x / 106) * Math.PI) * 6} ${x + 8},${63 + Math.sin(((x + 8) / 106) * Math.PI) * 6} ${x + 4},${71 + Math.sin(((x + 4) / 106) * Math.PI) * 6}`} fill={[C.coral, C.sun, C.blue][i % 3]} />
          ))}
        </g>
      )}
      {level === 1 && <Stall x={30} w={60} color={C.coral} />}
      {level === 2 && (
        <g>
          <Stall x={14} w={44} color={C.coral} />
          <Stall x={62} w={44} color={C.blue} />
        </g>
      )}
      {level >= 3 && (
        <g>
          <Stall x={6} w={34} color={C.coral} />
          <Stall x={43} w={34} color={C.blue} />
          <Stall x={80} w={34} color={C.sun} />
        </g>
      )}
    </g>
  );
}

function Statue() {
  return (
    <g>
      <rect x={44} y={86} width={32} height={24} fill={C.stoneDark} />
      <rect x={40} y={82} width={40} height={6} rx={1} fill={C.stone} />
      <rect x={48} y={90} width={24} height={14} fill={C.stone} opacity={0.5} />
      <ellipse cx={60} cy={70} rx={9} ry={13} fill={C.stone} stroke={C.stoneDark} strokeWidth={1} />
      <circle cx={60} cy={52} r={7} fill={C.stone} stroke={C.stoneDark} strokeWidth={1} />
      <rect x={66} y={62} width={10} height={8} rx={1} fill={C.white} stroke={C.stoneDark} strokeWidth={1} />
      <circle cx={60} cy={44} r={9} fill={C.sun} opacity={0.3} />
    </g>
  );
}

function Tower({ x, top, w = 18 }: { x: number; top: number; w?: number }) {
  return (
    <g>
      <rect x={x} y={top} width={w} height={110 - top} fill={C.stone} stroke={C.stoneDark} strokeWidth={0.8} />
      <polygon points={`${x - 3},${top} ${x + w / 2},${top - 18} ${x + w + 3},${top}`} fill={C.roofDark} />
      <rect x={x + w / 2 - 2.5} y={top + 10} width={5} height={9} rx={2} fill={C.dark} />
    </g>
  );
}

function Castle({ level }: { level: number }) {
  const keepTop = level >= 3 ? 44 : 60;
  return (
    <g>
      {level >= 3 && <Tower x={51} top={34} />}
      {level >= 2 && (
        <g>
          <Tower x={18} top={50} />
          <Tower x={84} top={50} />
        </g>
      )}
      <rect x={34} y={keepTop} width={52} height={110 - keepTop} fill={C.stone} stroke={C.stoneDark} strokeWidth={0.8} />
      {[34, 46, 58, 70, 80].map((x) => (
        <rect key={x} x={x} y={keepTop - 7} width={6} height={8} fill={C.stone} stroke={C.stoneDark} strokeWidth={0.8} />
      ))}
      <path d="M52 110 V94 A8 8 0 0 1 68 94 V110 Z" fill={C.dark} />
      <rect x={44} y={keepTop + 12} width={5} height={10} rx={2} fill={C.dark} />
      <rect x={71} y={keepTop + 12} width={5} height={10} rx={2} fill={C.dark} />
      <line x1={60} y1={keepTop - 7} x2={60} y2={keepTop - 26} stroke={C.dark} strokeWidth={1.5} />
      <polygon points={`60,${keepTop - 26} 74,${keepTop - 22} 60,${keepTop - 18}`} fill={level >= 3 ? C.sun : C.coral} />
      {level >= 3 && (
        <g>
          <rect x={38} y={keepTop + 26} width={8} height={14} fill={C.sun} />
          <rect x={74} y={keepTop + 26} width={8} height={14} fill={C.sun} />
        </g>
      )}
    </g>
  );
}

function Campfire() {
  return (
    <g>
      <circle cx={60} cy={96} r={20} fill={C.sun} opacity={0.18} />
      {[0, 60, 120, 180, 240, 300].map((a) => (
        <circle key={a} cx={60 + 20 * Math.cos((a * Math.PI) / 180)} cy={102 + 6 * Math.sin((a * Math.PI) / 180)} r={3.5} fill={C.grey} />
      ))}
      <rect x={46} y={98} width={28} height={5} rx={2} fill={C.woodDark} transform="rotate(-20 60 100)" />
      <rect x={46} y={98} width={28} height={5} rx={2} fill={C.woodDark} transform="rotate(20 60 100)" />
      <g className="animate-flicker origin-bottom-box">
        <path d="M60 66 C50 78 50 92 60 98 C70 92 70 78 60 66Z" fill={C.coral} />
        <path d="M60 78 C55 85 55 93 60 97 C65 93 65 85 60 78Z" fill={C.sun} />
      </g>
    </g>
  );
}

function Boat() {
  return (
    <g>
      <rect x={59} y={44} width={3} height={40} fill={C.woodDark} />
      <polygon points="63,46 88,80 63,80" fill={C.white} stroke={C.stoneDark} strokeWidth={0.8} />
      <polygon points="57,52 40,80 57,80" fill={C.coral} />
      <path d="M28 90 Q60 114 92 90 L86 82 H34 Z" fill={C.wood} />
      <path d="M30 90 H90" stroke={C.woodDark} strokeWidth={2.5} />
      <polygon points="62,44 72,47 62,50" fill={C.sun} />
    </g>
  );
}

export function BuildingArt({ type, level }: { type: string; level: number }) {
  switch (type) {
    case "cabin":
      return <Cabin level={level} />;
    case "tree":
      return <Tree level={level} />;
    case "palm":
      return <Palm />;
    case "flowers":
      return <Flowers />;
    case "bench":
      return <Bench />;
    case "library":
      return <Library level={level} />;
    case "fountain":
      return <Fountain />;
    case "garden":
      return <Garden level={level} />;
    case "campfire":
      return <Campfire />;
    case "boat":
      return <Boat />;
    case "windmill":
      return <Windmill level={level} />;
    case "lighthouse":
      return <Lighthouse level={level} />;
    case "market":
      return <Market level={level} />;
    case "statue":
      return <Statue />;
    case "castle":
      return <Castle level={level} />;
    default:
      return <rect x={40} y={70} width={40} height={40} fill={C.stone} />;
  }
}

export function BuildingPreview({ type, level, className }: { type: string; level: number; className?: string }) {
  return (
    <svg viewBox="0 0 120 120" className={className} aria-hidden>
      <ellipse cx={60} cy={110} rx={34} ry={6} fill="#1d2433" opacity={0.08} />
      <BuildingArt type={type} level={level} />
    </svg>
  );
}
