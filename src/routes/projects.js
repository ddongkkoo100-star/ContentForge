// 프로젝트 CRUD + 단계 수동 이동 + 승인 + 프리셋 (조회/톤 학습).
import { readFileSync, writeFileSync, existsSync, renameSync } from "node:fs";
import { join } from "node:path";
import { STYLE_PRESETS } from "../prompts/presets.js";
import { buildToneLearnPrompt } from "../prompts/learn.js";
import { extractJson } from "../prompts/parse.js";
import { withRetries } from "../writers/base.js";
import { DISCLOSURES, DISCLOSURE_LABELS } from "../export/disclosure.js";
import { runQualityChecks } from "../pipeline/quality.js";

/** 학습된 프리셋을 config.json에 영속화 (재시작 후에도 유지) */
function persistPreset(config, key, preset) {
  const path = join(config.root, "config.json");
  let fileCfg = {};
  if (existsSync(path)) {
    try {
      fileCfg = JSON.parse(readFileSync(path, "utf-8"));
    } catch {
      /* 깨진 config는 새로 구성 */
    }
  }
  fileCfg.presets = { ...(fileCfg.presets ?? {}), [key]: preset };
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(fileCfg, null, 2));
  renameSync(tmp, path);
  config.presets = { ...(config.presets ?? {}), [key]: preset }; // 런타임 반영
}

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);

export function registerProjectRoutes(app, ctx) {
  app.get("/api/projects", wrap((req, res) => {
    res.json({ projects: ctx.store.list() });
  }));

  app.post("/api/projects", wrap((req, res) => {
    const { name, mode = "blog", style = "info", topic = "", disclosure = "none" } = req.body ?? {};
    if (!["blog", "insta", "reels"].includes(mode)) throw Object.assign(new Error("mode는 blog|insta|reels"), { status: 400 });
    const presets = { ...STYLE_PRESETS, ...(ctx.config.presets ?? {}) };
    if (!presets[style]) throw Object.assign(new Error(`알 수 없는 스타일: ${style}`), { status: 400 });
    if (!DISCLOSURES.includes(disclosure)) {
      throw Object.assign(new Error(`disclosure는 ${DISCLOSURES.join("|")}`), { status: 400 });
    }
    const state = ctx.store.create({ name, mode, style, topic, disclosure });
    res.status(201).json({ project: state });
  }));

  // 표시문구 종류 변경 (작업 도중 협찬 여부가 확정되는 경우)
  app.patch("/api/projects/:id/disclosure", wrap((req, res) => {
    const { disclosure } = req.body ?? {};
    if (!DISCLOSURES.includes(disclosure)) {
      throw Object.assign(new Error(`disclosure는 ${DISCLOSURES.join("|")}`), { status: 400 });
    }
    const state = ctx.store.load(req.params.id);
    state.disclosure = disclosure;
    ctx.store.save(state);
    res.json({ project: state });
  }));

  // 발행 전 품질 점검 (승인 카드용)
  app.get("/api/projects/:id/quality", wrap((req, res) => {
    const state = ctx.store.load(req.params.id);
    res.json({ checks: runQualityChecks(state) });
  }));

  app.get("/api/projects/:id", wrap((req, res) => {
    res.json({ project: ctx.store.load(req.params.id) });
  }));

  // 단계 수동 이동 (IMAGES→PREVIEW, 재작업을 위한 뒤로 이동 등)
  app.post("/api/projects/:id/stage", wrap((req, res) => {
    const state = ctx.store.load(req.params.id);
    const { to } = req.body ?? {};
    try {
      ctx.store.transition(state, to);
    } catch (err) {
      throw Object.assign(err, { status: 400 });
    }
    res.json({ project: state });
  }));

  // 승인 도장 — PREVIEW에서만 가능, 이후 export가 열린다
  app.post("/api/projects/:id/approve", wrap((req, res) => {
    const state = ctx.store.load(req.params.id);
    try {
      ctx.store.transition(state, "APPROVED");
    } catch (err) {
      throw Object.assign(new Error(`승인 불가: 현재 단계가 PREVIEW가 아닙니다 (${state.stage})`), { status: 409 });
    }
    ctx.log(`승인됨: ${state.id} @ ${state.approvedAt}`);
    res.json({ project: state });
  }));

  // 내 글 톤 학습 — 샘플 글에서 문체 프리셋을 생성해 저장
  app.post("/api/presets/learn", wrap(async (req, res) => {
    const { name, samples } = req.body ?? {};
    if (typeof samples !== "string" || samples.trim().length < 200) {
      throw Object.assign(new Error("samples에 기존 글을 200자 이상 붙여넣어 주세요 (1~2편 권장)"), { status: 400 });
    }
    const writer = ctx.getWriter();
    const reqPrompt = buildToneLearnPrompt({ samples: samples.slice(0, 60_000), name });
    const { text } = await withRetries(() => writer.generate(reqPrompt), {
      maxRetries: ctx.config.writer.maxRetries,
    });
    const json = extractJson(text);
    if (!json || typeof json.prompt !== "string" || !json.prompt.trim()) {
      throw Object.assign(new Error("문체 분석 결과를 파싱하지 못했습니다 — 다시 시도해 주세요"), { status: 502 });
    }
    const label = String(name || json.label || "내 톤").slice(0, 30);
    const key = `custom-${label.toLowerCase().replace(/[^a-z0-9가-힣]+/g, "-").replace(/^-+|-+$/g, "") || "tone"}`;
    const preset = { label, prompt: json.prompt.trim() };
    persistPreset(ctx.config, key, preset);
    ctx.log(`톤 프리셋 저장: ${key} (${label})`);
    res.json({ key, preset });
  }));

  // 스타일 프리셋 조회 (UI 선택 목록)
  app.get("/api/presets", wrap((req, res) => {
    const presets = { ...STYLE_PRESETS, ...(ctx.config.presets ?? {}) };
    res.json({
      presets: Object.fromEntries(Object.entries(presets).map(([k, v]) => [k, { label: v.label ?? k }])),
      disclosures: DISCLOSURE_LABELS,
    });
  }));
}
