import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Word Island · 单词岛屿",
    short_name: "Word Island",
    description: "在建设岛屿的过程中自然地记住英语单词。",
    start_url: "/",
    display: "standalone",
    background_color: "#f7f6f1",
    theme_color: "#2b8ad6",
    lang: "zh-CN",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icon-maskable.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
    ],
  };
}
