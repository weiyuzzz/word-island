"use client";

/** 手绘风怪物插画（SVG，随战斗状态切换姿势） */
export function MonsterArt({ art, hit, className }: { art: string; hit?: boolean; className?: string }) {
  const common = { className };
  switch (art) {
    case "crab":
      return (
        <svg viewBox="0 0 160 140" {...common} aria-hidden>
          <g className={hit ? "animate-shake origin-bottom-box" : "animate-float"}>
            <path d="M40 96 Q26 92 22 78" stroke="#c85b48" strokeWidth="7" fill="none" strokeLinecap="round" />
            <path d="M120 96 Q134 92 138 78" stroke="#c85b48" strokeWidth="7" fill="none" strokeLinecap="round" />
            <path d="M22 78 q-10 -6 -8 -18 q10 2 12 12 q8 -8 12 -2 q-4 10 -16 8z" fill="#ef7a62" stroke="#c85b48" strokeWidth="3" />
            <path d="M138 78 q10 -6 8 -18 q-10 2 -12 12 q-8 -8 -12 -2 q4 10 16 8z" fill="#ef7a62" stroke="#c85b48" strokeWidth="3" />
            <path d="M46 108 l-12 18 M66 112 l-6 18 M94 112 l6 18 M114 108 l12 18" stroke="#c85b48" strokeWidth="6" strokeLinecap="round" />
            <ellipse cx="80" cy="96" rx="46" ry="30" fill="#ef7a62" stroke="#c85b48" strokeWidth="3" />
            <ellipse cx="80" cy="104" rx="34" ry="18" fill="#f6a38d" opacity="0.7" />
            <path d="M52 74 q4 -18 14 -22 M108 74 q-4 -18 -14 -22" stroke="#c85b48" strokeWidth="4" fill="none" strokeLinecap="round" />
            <circle cx="66" cy="52" r="11" fill="#fff" stroke="#c85b48" strokeWidth="3" />
            <circle cx="94" cy="52" r="11" fill="#fff" stroke="#c85b48" strokeWidth="3" />
            <circle cx="68" cy="53" r="5" fill="#3b2a26" />
            <circle cx="92" cy="53" r="5" fill="#3b2a26" />
            <path d="M70 84 q10 8 20 0" stroke="#3b2a26" strokeWidth="3" fill="none" strokeLinecap="round" />
          </g>
        </svg>
      );
    case "slime":
      return (
        <svg viewBox="0 0 160 140" {...common} aria-hidden>
          <g className={hit ? "animate-shake origin-bottom-box" : ""}>
            <path d="M32 120 Q32 62 80 50 Q128 62 128 120 Q80 132 32 120Z" fill="#6cc07a" stroke="#3f9a52" strokeWidth="3" />
            <ellipse cx="62" cy="82" rx="14" ry="18" fill="#dff4dd" opacity="0.85" />
            <ellipse cx="62" cy="86" rx="6" ry="9" fill="#2c3b2c" />
            <ellipse cx="98" cy="86" rx="6" ry="9" fill="#2c3b2c" />
            <circle cx="60" cy="82" r="2.5" fill="#fff" />
            <circle cx="96" cy="82" r="2.5" fill="#fff" />
            <path d="M66 104 q14 12 28 0" stroke="#2c3b2c" strokeWidth="3" fill="none" strokeLinecap="round" />
            <path d="M80 44 q-4 -12 6 -16 q-2 10 8 12" fill="#84d393" stroke="#3f9a52" strokeWidth="2.5" />
            <circle cx="112" cy="70" r="6" fill="#9bd68f" opacity="0.9" />
            <circle cx="44" cy="98" r="5" fill="#9bd68f" opacity="0.9" />
          </g>
        </svg>
      );
    case "beast":
      return (
        <svg viewBox="0 0 160 140" {...common} aria-hidden>
          <g className={hit ? "animate-shake origin-bottom-box" : "animate-float"}>
            <path d="M42 120 Q52 92 80 92 Q108 92 118 120Z" fill="#5b6b82" stroke="#3c4a5e" strokeWidth="3" />
            <ellipse cx="80" cy="76" rx="34" ry="30" fill="#6e819c" stroke="#3c4a5e" strokeWidth="3" />
            <path d="M52 58 l-6 -26 l22 12 M108 58 l6 -26 l-22 12" fill="#6e819c" stroke="#3c4a5e" strokeWidth="3" />
            <ellipse cx="80" cy="92" rx="16" ry="12" fill="#c7d3e2" />
            <ellipse cx="66" cy="72" rx="8" ry="10" fill="#fff" />
            <ellipse cx="94" cy="72" rx="8" ry="10" fill="#fff" />
            <circle cx="66" cy="74" r="4.5" fill="#2c3542" />
            <circle cx="94" cy="74" r="4.5" fill="#2c3542" />
            <path d="M74 92 l6 6 l6 -6" stroke="#2c3542" strokeWidth="3" fill="none" strokeLinecap="round" />
            <path d="M72 102 q8 6 16 0" stroke="#2c3542" strokeWidth="2.5" fill="none" />
            <path d="M20 122 q18 -16 26 -2" stroke="#3c4a5e" strokeWidth="6" fill="none" strokeLinecap="round" />
          </g>
        </svg>
      );
    case "golem":
      return (
        <svg viewBox="0 0 160 140" {...common} aria-hidden>
          <g className={hit ? "animate-shake origin-bottom-box" : ""}>
            <rect x="52" y="66" width="56" height="56" rx="8" fill="#b8b2a4" stroke="#8d8677" strokeWidth="3" />
            <rect x="34" y="76" width="20" height="34" rx="6" fill="#c7c1b3" stroke="#8d8677" strokeWidth="3" />
            <rect x="106" y="76" width="20" height="34" rx="6" fill="#c7c1b3" stroke="#8d8677" strokeWidth="3" />
            <rect x="58" y="34" width="44" height="34" rx="8" fill="#c7c1b3" stroke="#8d8677" strokeWidth="3" />
            <rect x="66" y="46" width="10" height="8" rx="2" fill="#f7c948" />
            <rect x="84" y="46" width="10" height="8" rx="2" fill="#f7c948" />
            <path d="M62 86 h36 M62 98 h36 M62 110 h20" stroke="#8d8677" strokeWidth="3" strokeLinecap="round" />
            <path d="M70 20 l10 -8 l10 8 l-10 6z" fill="#e0d9c8" stroke="#8d8677" strokeWidth="2.5" />
            <circle cx="80" cy="96" r="4" fill="#8d8677" />
          </g>
        </svg>
      );
    case "serpent":
      return (
        <svg viewBox="0 0 160 140" {...common} aria-hidden>
          <g className={hit ? "animate-shake origin-bottom-box" : "animate-float"}>
            <path d="M30 122 Q60 96 46 74 Q36 56 60 46 Q92 34 112 58 Q128 78 108 96" stroke="#4aa3c7" strokeWidth="22" fill="none" strokeLinecap="round" />
            <path d="M30 122 Q60 96 46 74 Q36 56 60 46 Q92 34 112 58 Q128 78 108 96" stroke="#7fc9e6" strokeWidth="12" fill="none" strokeLinecap="round" />
            <ellipse cx="112" cy="52" rx="26" ry="20" fill="#4aa3c7" stroke="#2f7d9c" strokeWidth="3" />
            <circle cx="106" cy="46" r="6" fill="#fff" />
            <circle cx="106" cy="47" r="3" fill="#22333c" />
            <path d="M132 52 l16 -4 l-14 8z" fill="#e8735a" />
            <path d="M60 32 l6 -12 l6 12 M84 30 l6 -12 l6 12" stroke="#2f7d9c" strokeWidth="3" fill="none" strokeLinecap="round" />
            <path d="M52 92 q8 6 16 0 M74 104 q8 6 16 0" stroke="#2f7d9c" strokeWidth="3" fill="none" opacity="0.6" />
          </g>
        </svg>
      );
    case "dragon":
    default:
      return (
        <svg viewBox="0 0 160 140" {...common} aria-hidden>
          <g className={hit ? "animate-shake origin-bottom-box" : "animate-float"}>
            <path d="M44 118 Q28 92 44 70 Q56 52 80 52 Q104 52 116 70 Q132 92 116 118Z" fill="#7a5cc0" stroke="#5b429c" strokeWidth="3" />
            <path d="M46 76 Q16 62 12 34 Q42 44 56 62Z" fill="#a58ae0" stroke="#5b429c" strokeWidth="3" />
            <path d="M114 76 Q144 62 148 34 Q118 44 104 62Z" fill="#a58ae0" stroke="#5b429c" strokeWidth="3" />
            <path d="M62 52 l-4 -18 l16 10 M98 52 l4 -18 l-16 10" fill="#7a5cc0" stroke="#5b429c" strokeWidth="3" />
            <ellipse cx="80" cy="86" rx="20" ry="16" fill="#efe6ff" opacity="0.9" />
            <circle cx="68" cy="76" r="7" fill="#fff" />
            <circle cx="92" cy="76" r="7" fill="#fff" />
            <circle cx="69" cy="77" r="3.5" fill="#2c2145" />
            <circle cx="91" cy="77" r="3.5" fill="#2c2145" />
            <path d="M72 96 q8 7 16 0" stroke="#2c2145" strokeWidth="3" fill="none" strokeLinecap="round" />
            <path d="M70 106 l4 8 l4 -8 l4 8 l4 -8" stroke="#f7c948" strokeWidth="3" fill="none" strokeLinecap="round" />
            <path d="M36 122 q22 -10 44 0 q22 -10 44 0" stroke="#5b429c" strokeWidth="6" fill="none" strokeLinecap="round" />
          </g>
        </svg>
      );
  }
}
