// POST /api/outline — 개요 생성/재생성 (Writer 어댑터)
import { runOutline } from "../pipeline/service.js";

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);

export function registerOutlineRoutes(app, ctx) {
  app.post("/api/outline", wrap(async (req, res) => {
    const { projectId } = req.body ?? {};
    if (!projectId) throw Object.assign(new Error("projectId가 필요합니다"), { status: 400 });
    const state = ctx.store.load(projectId);
    if (state.materials.filter((m) => m.type === "text").length === 0) {
      throw Object.assign(new Error("텍스트 조사자료가 없습니다 — 먼저 자료를 업로드하세요"), { status: 409 });
    }
    const writer = ctx.getWriter();
    const { outline, meta } = await runOutline({
      store: ctx.store,
      state,
      writer,
      config: ctx.config,
      presetOverrides: ctx.config.presets,
      log: ctx.log,
    });
    res.json({ project: state, outline, meta });
  }));
}
