// 파이프라인 서비스 — Writer 어댑터로 개요/초안을 생성하고 상태에 반영한다.
// 결정적 로직(상태 전이, 파싱, 요약 게이트)은 여기서, LLM은 텍스트 생성만.
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { withRetries } from "../writers/base.js";
import {
  buildOutlinePrompt,
  buildDraftPrompt,
  buildSummarizePrompt,
  needsSummary,
} from "../prompts/builder.js";
import { parseOutline, parseBlogDraft, parseInstaDraft } from "../prompts/parse.js";

/** 프로젝트의 텍스트 조사자료를 하나로 합친다 (이미지 자료는 제외). */
export function collectMaterialText(store, state) {
  const parts = [];
  for (const m of state.materials) {
    if (m.type !== "text") continue;
    const path = join(store.dirOf(state.id), "materials", m.filename);
    if (existsSync(path)) parts.push(`### 자료: ${m.filename}\n${readFileSync(path, "utf-8")}`);
  }
  return parts.join("\n\n");
}

/**
 * 조사자료가 임계치를 넘으면 동일 Writer로 사전 요약을 만들어 캐시한다.
 * @returns {Promise<string>} 프롬프트에 넣을 자료 텍스트
 */
export async function resolveMaterialText({ store, state, writer, config, log = () => {} }) {
  const full = collectMaterialText(store, state);
  const threshold = config.limits.summarizeThresholdBytes;
  if (!needsSummary(full, threshold)) return full;
  if (state.summary) return state.summary; // 이미 요약됨
  log(`조사자료 ${Buffer.byteLength(full, "utf-8").toLocaleString()}B > ${threshold.toLocaleString()}B — 사전 요약 실행`);
  const req = buildSummarizePrompt({ materialText: full });
  const { text } = await withRetries(() => writer.generate(req), {
    maxRetries: config.writer.maxRetries,
  });
  state.summary = text.trim();
  store.save(state);
  return state.summary;
}

export async function runOutline({ store, state, writer, config, presetOverrides, log }) {
  const materialText = await resolveMaterialText({ store, state, writer, config, log });
  const req = buildOutlinePrompt({
    topic: state.topic,
    mode: state.mode,
    style: state.style,
    materialText,
    presetOverrides,
  });
  const { text, meta } = await withRetries(() => writer.generate(req), {
    maxRetries: config.writer.maxRetries,
  });
  const outline = parseOutline(text);
  store.setVersioned(state, "outline", outline);
  if (state.stage === "INTAKE") store.transition(state, "OUTLINE");
  return { outline, meta };
}

export async function runDraft({ store, state, writer, config, presetOverrides, log }) {
  if (!state.outline.current) throw new Error("개요가 없습니다 — 먼저 개요를 생성하세요");
  const materialText = await resolveMaterialText({ store, state, writer, config, log });
  const req = buildDraftPrompt({
    topic: state.topic,
    mode: state.mode,
    style: state.style,
    materialText,
    outline: state.outline.current,
    presetOverrides,
  });
  const { text, meta } = await withRetries(() => writer.generate(req), {
    maxRetries: config.writer.maxRetries,
  });
  const draft = state.mode === "insta" ? parseInstaDraft(text) : parseBlogDraft(text);
  store.setVersioned(state, "draft", draft, text);
  // 초안에서 이미지 프롬프트 목록을 결정적으로 도출
  state.images = deriveImagePlan(state.mode, draft);
  if (state.stage === "OUTLINE") store.transition(state, "DRAFT");
  store.save(state);
  return { draft, meta };
}

/** 초안에서 이미지 생성 계획 도출 (블로그: images[], 인스타: slides[]) */
export function deriveImagePlan(mode, draft) {
  if (mode === "insta") {
    return (draft.slides ?? []).map((s, i) => ({
      id: `SLIDE-${String(s.no ?? i + 1).padStart(2, "0")}`,
      role: "slide",
      prompt: s.image_prompt || s.text,
      file: null,
      status: "pending",
    }));
  }
  return (draft.images ?? []).map((img) => ({
    id: img.id,
    role: img.role,
    prompt: img.prompt,
    file: null,
    status: "pending",
  }));
}
