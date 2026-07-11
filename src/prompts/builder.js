// 프롬프트 빌더 — system 템플릿 + 스타일 프리셋 + 조사자료 + 출력 형식 지시(JSON) 조립.
import { SYSTEM_BASE, TASK_TEMPLATES, resolvePreset } from "./presets.js";

const URL_RE = /https?:\/\/[^\s)\]>"'<]+/g;

/** 조사자료에서 출처 URL 추출 (참고자료 섹션 자동 포함용) */
export function extractSourceUrls(text = "") {
  const urls = text.match(URL_RE) ?? [];
  return [...new Set(urls.map((u) => u.replace(/[.,;:!?]+$/, "")))];
}

/** 조사자료가 임계치(기본 50KB)를 넘으면 사전 요약 단계가 필요하다 */
export function needsSummary(materialText = "", thresholdBytes = 50 * 1024) {
  return Buffer.byteLength(materialText, "utf-8") > thresholdBytes;
}

function materialBlock(materialText) {
  return `<조사자료>\n${materialText}\n</조사자료>`;
}

function sourcesBlock(materialText) {
  const urls = extractSourceUrls(materialText);
  if (urls.length === 0) return "";
  return [
    "",
    "조사자료에 아래 출처 URL이 포함되어 있습니다. 본문 말미에 \"## 참고자료\" 섹션을 만들어 그대로 나열하세요:",
    ...urls.map((u) => `- ${u}`),
  ].join("\n");
}

export function buildSummarizePrompt({ materialText }) {
  return {
    task: "summarize",
    system: SYSTEM_BASE,
    prompt: [TASK_TEMPLATES.summarize.instruction, "", materialBlock(materialText)].join("\n"),
  };
}

export function buildOutlinePrompt({ topic, mode = "blog", style = "info", materialText = "", presetOverrides }) {
  const preset = resolvePreset(style, presetOverrides);
  return {
    task: "outline",
    system: [SYSTEM_BASE, "", `<스타일>\n${preset.prompt}\n</스타일>`].join("\n"),
    prompt: [
      `주제: ${topic}`,
      `매체: ${mode === "insta" ? "인스타그램" : mode === "reels" ? "인스타그램 릴스" : "네이버 블로그"}`,
      "",
      TASK_TEMPLATES.outline.instruction,
      "",
      materialBlock(materialText),
    ].join("\n"),
  };
}

const DRAFT_TASKS = { blog: "draft-blog", insta: "draft-insta", reels: "draft-reels" };

export function buildDraftPrompt({ topic, mode = "blog", style = "info", materialText = "", outline, presetOverrides }) {
  const preset = resolvePreset(style, presetOverrides);
  const task = DRAFT_TASKS[mode] ?? "draft-blog";
  const outlineBlock = outline
    ? `<확정된 개요>\n${JSON.stringify(outline, null, 2)}\n</확정된 개요>\n`
    : "";
  return {
    task,
    system: [SYSTEM_BASE, "", `<스타일>\n${preset.prompt}\n</스타일>`].join("\n"),
    prompt: [
      `주제: ${topic}`,
      "",
      TASK_TEMPLATES[task].instruction,
      mode === "blog" ? sourcesBlock(materialText) : "",
      "",
      outlineBlock,
      materialBlock(materialText),
    ]
      .filter(Boolean)
      .join("\n"),
  };
}
