/**
 * 可选的 AI 能力（OpenAI 兼容接口）。未配置 key 时功能自动隐藏，不影响主流程。
 * 环境变量：AI_API_KEY / AI_BASE_URL / AI_MODEL
 */

export function aiEnabled(): boolean {
  return Boolean(process.env.AI_API_KEY && process.env.AI_BASE_URL);
}

export async function callAI(system: string, user: string): Promise<string> {
  const key = process.env.AI_API_KEY;
  const base = process.env.AI_BASE_URL;
  if (!key || !base) throw new Error("未配置 AI 服务（需要 AI_API_KEY 与 AI_BASE_URL）");
  const res = await fetch(`${base.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: process.env.AI_MODEL ?? "glm-4-flash",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0.3,
    }),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`AI 请求失败 ${res.status}`);
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  if (typeof text !== "string" || !text.trim()) throw new Error("AI 未返回内容");
  return text.trim();
}

const GRAMMAR_SYSTEM = `你是雅思阅读长难句精讲老师。给定一个英文句子，输出简明的中文解析，包含：
1. 句子主干（主语/谓语/宾语，一行）
2. 从句与修饰结构逐个拆解（标明类型：定语从句/状语从句/分词短语等）
3. 全句翻译
用紧凑的 Markdown 列表，不要客套话。`;

export async function analyzeSentence(quote: string): Promise<string> {
  return callAI(GRAMMAR_SYSTEM, quote);
}
