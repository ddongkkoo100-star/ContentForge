// GET /api/status — 엔진 헬스체크 (상태바 배지용) + 런타임 엔진 전환
import { createWriter, WRITER_ENGINES } from "../writers/index.js";
import { IMAGE_ENGINES } from "../image/index.js";

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);

export function registerStatusRoutes(app, ctx) {
  app.get("/api/status", wrap(async (req, res) => {
    const writer = ctx.getWriter();
    const writerHealth = await writer.isAvailable();
    const imageEngine = ctx.getImageEngine();
    const imageHealth = await imageEngine.health();
    res.json({
      writer: { engine: ctx.settings.writerEngine, ...writerHealth },
      image: { engine: ctx.settings.imageEngine, ...imageHealth },
      settings: ctx.settings,
    });
  }));

  // UI 엔진 전환 — API Key 모드 진입은 별도 확인 플래그 필요 (과금 방지 가드)
  app.post("/api/settings", wrap(async (req, res) => {
    const { writerEngine, imageEngine } = req.body ?? {};
    if (writerEngine) {
      if (!WRITER_ENGINES.includes(writerEngine)) {
        throw Object.assign(new Error(`알 수 없는 writer 엔진: ${writerEngine}`), { status: 400 });
      }
      // 전환 전 가용성 검사 — 미설치 CLI로의 전환을 사전 차단
      const check = await createWriter({ ...ctx.config.writer, engine: writerEngine }).isAvailable();
      if (!check.available) {
        throw Object.assign(new Error(`${writerEngine} 사용 불가: ${check.reason}`), { status: 409 });
      }
      ctx.settings.writerEngine = writerEngine;
    }
    if (imageEngine) {
      if (!IMAGE_ENGINES.includes(imageEngine)) {
        throw Object.assign(new Error(`알 수 없는 image 엔진: ${imageEngine}`), { status: 400 });
      }
      ctx.settings.imageEngine = imageEngine;
    }
    const { imageProvider } = req.body ?? {};
    if (imageProvider) {
      if (!["oauth", "api"].includes(imageProvider)) {
        throw Object.assign(new Error("imageProvider는 oauth|api"), { status: 400 });
      }
      // 과금 방지 가드 — API Key 모드는 클라이언트가 확인 다이얼로그를 거쳐 confirm을 보내야 한다
      if (imageProvider === "api" && req.body.confirmBilling !== true) {
        throw Object.assign(new Error("API Key 모드는 과금됩니다 — confirmBilling: true 필요"), { status: 409 });
      }
      ctx.settings.imageProvider = imageProvider;
    }
    res.json({ settings: ctx.settings });
  }));
}
