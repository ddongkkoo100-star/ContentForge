// POST /api/draft — 본문 생성/재생성 (블로그/인스타 모드)
import { runDraft } from "../pipeline/service.js";

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);

export function registerDraftRoutes(app, ctx) {
  app.post("/api/draft", wrap(async (req, res) => {
    const { projectId } = req.body ?? {};
    if (!projectId) throw Object.assign(new Error("projectId가 필요합니다"), { status: 400 });
    const state = ctx.store.load(projectId);
    const writer = ctx.getWriter();
    let result;
    try {
      result = await runDraft({
        store: ctx.store,
        state,
        writer,
        config: ctx.config,
        presetOverrides: ctx.config.presets,
        log: ctx.log,
      });
    } catch (err) {
      if (/개요가 없습니다/.test(err.message)) err.status = 409;
      throw err;
    }
    res.json({ project: state, draft: result.draft, meta: result.meta });
  }));

  // 초안 본문 부분 수정 (사람이 직접 고친 텍스트 반영)
  app.patch("/api/draft", wrap((req, res) => {
    const { projectId, body_md, caption } = req.body ?? {};
    if (!projectId) throw Object.assign(new Error("projectId가 필요합니다"), { status: 400 });
    const state = ctx.store.load(projectId);
    if (!state.draft.current) throw Object.assign(new Error("수정할 초안이 없습니다"), { status: 409 });
    const edited = { ...state.draft.current };
    if (typeof body_md === "string") edited.body_md = body_md;
    if (typeof caption === "string") edited.caption = caption;
    ctx.store.setVersioned(state, "draft", edited, state.draft.rawText);
    res.json({ project: state, draft: edited });
  }));
}
