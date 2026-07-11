// POST /api/export — 승인 게이트 뒤의 패키지 출력.
// 서버측에서 APPROVED 단계를 강제한다 (§5.1 — 승인 전 export 불가).
import { existsSync } from "node:fs";
import { join } from "node:path";
import { exportBlogPackage } from "../export/blog.js";
import { exportInstaPackage } from "../export/insta.js";
import { exportReelsPackage } from "../export/reels.js";
import { makeZip, zipDirectory } from "../export/zip.js";

function packageDirOf(config, state) {
  return join(config.paths.output, `${state.id}-${state.mode}`);
}

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);

export function registerExportRoutes(app, ctx) {
  app.post("/api/export", wrap(async (req, res) => {
    const { projectId } = req.body ?? {};
    if (!projectId) throw Object.assign(new Error("projectId가 필요합니다"), { status: 400 });
    const state = ctx.store.load(projectId);
    if (state.stage !== "APPROVED" && state.stage !== "EXPORTED") {
      throw Object.assign(
        new Error(`승인 전에는 export할 수 없습니다 (현재 단계: ${state.stage}) — 승인 도장을 먼저 찍으세요`),
        { status: 409 },
      );
    }
    const args = { store: ctx.store, state, outputDir: ctx.config.paths.output };
    const exporters = { blog: exportBlogPackage, insta: exportInstaPackage, reels: exportReelsPackage };
    const result = await exporters[state.mode](args);
    if (state.stage === "APPROVED") ctx.store.transition(state, "EXPORTED");
    ctx.log(`패키지 출력 완료: ${result.dir}`);
    res.json({ project: state, ...result });
  }));

  // 패키지 ZIP 다운로드 — export 완료 후에만
  app.get("/api/projects/:id/export.zip", wrap((req, res) => {
    const state = ctx.store.load(req.params.id);
    const dir = packageDirOf(ctx.config, state);
    if (state.stage !== "EXPORTED" || !existsSync(dir)) {
      throw Object.assign(new Error("아직 export된 패키지가 없습니다 — 승인 후 패키지 출력을 먼저 실행하세요"), { status: 409 });
    }
    const zip = makeZip(zipDirectory(dir));
    res.setHeader("Content-Type", "application/zip");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename*=UTF-8''${encodeURIComponent(`${state.id}-${state.mode}.zip`)}`,
    );
    res.send(zip);
  }));
}
