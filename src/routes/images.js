// POST /api/images — 초안의 이미지 계획을 실제 파일로 생성 (ima2-gen 프록시 또는 mock).
// 개별 재생성(ids 지정)과 프롬프트 편집을 지원한다.
import { writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { sizeFor, imageFilename } from "../image/presets.js";

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);

export function registerImageRoutes(app, ctx) {
  app.post("/api/images", wrap(async (req, res) => {
    const { projectId, ids } = req.body ?? {};
    if (!projectId) throw Object.assign(new Error("projectId가 필요합니다"), { status: 400 });
    const state = ctx.store.load(projectId);
    if (!state.draft.current) throw Object.assign(new Error("초안이 없습니다 — 먼저 초안을 생성하세요"), { status: 409 });
    if (!state.images.length) throw Object.assign(new Error("생성할 이미지 계획이 없습니다"), { status: 409 });

    const targets = state.images.filter((img) => !ids || ids.includes(img.id));
    if (targets.length === 0) throw Object.assign(new Error("대상 이미지가 없습니다"), { status: 400 });

    const engine = ctx.getImageEngine();
    const imagesDir = join(ctx.store.dirOf(projectId), "images");
    const results = [];
    for (const img of targets) {
      const index = state.images.indexOf(img);
      img.status = "generating";
      ctx.store.save(state);
      try {
        const size = sizeFor(state.mode, img.role);
        const { buffers, meta } = await engine.generate({ prompt: img.prompt, size, n: 1 });
        const filename = imageFilename(img.id, img.role, index);
        writeFileSync(join(imagesDir, filename), buffers[0]);
        img.file = filename;
        img.status = "done";
        img.generatedAt = new Date().toISOString();
        img.meta = meta;
        results.push({ id: img.id, file: filename, ok: true });
      } catch (err) {
        img.status = "error";
        img.error = err.message;
        results.push({ id: img.id, ok: false, error: err.message });
      }
      ctx.store.save(state);
    }
    // 전체 생성 완료 시 IMAGES 단계로 진입 (DRAFT에서 호출된 경우)
    if (state.stage === "DRAFT" && state.images.every((i) => i.status === "done")) {
      ctx.store.transition(state, "IMAGES");
    }
    res.json({ project: state, results });
  }));

  // 이미지 프롬프트 편집 (재생성 전 사용자 수정)
  app.patch("/api/images", wrap((req, res) => {
    const { projectId, id, prompt } = req.body ?? {};
    if (!projectId || !id || typeof prompt !== "string") {
      throw Object.assign(new Error("projectId, id, prompt가 필요합니다"), { status: 400 });
    }
    const state = ctx.store.load(projectId);
    const img = state.images.find((i) => i.id === id);
    if (!img) throw Object.assign(new Error(`이미지 없음: ${id}`), { status: 404 });
    img.prompt = prompt;
    img.status = img.file ? "stale" : "pending"; // 프롬프트가 바뀌면 재생성 필요 표시
    ctx.store.save(state);
    res.json({ project: state, image: img });
  }));

  // 생성된 이미지 파일 미리보기 서빙
  app.get("/api/projects/:id/images/:file", wrap((req, res) => {
    const file = req.params.file.replace(/[^a-zA-Z0-9._-]/g, "");
    const path = join(ctx.store.dirOf(req.params.id), "images", file);
    if (!existsSync(path)) return res.status(404).json({ error: "이미지 없음" });
    res.sendFile(path);
  }));
}
