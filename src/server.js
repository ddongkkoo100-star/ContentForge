// Express 서버 조립 — 라우트는 src/routes/* 에서 등록한다.
import express from "express";
import { join } from "node:path";
import { ProjectStore } from "./pipeline/state.js";
import { createWriter } from "./writers/index.js";
import { createImageEngine } from "./image/index.js";
import { packageRoot } from "./config.js";
import { registerProjectRoutes } from "./routes/projects.js";
import { registerIntakeRoutes } from "./routes/intake.js";
import { registerOutlineRoutes } from "./routes/outline.js";
import { registerDraftRoutes } from "./routes/draft.js";
import { registerImageRoutes } from "./routes/images.js";
import { registerExportRoutes } from "./routes/export.js";
import { registerStatusRoutes } from "./routes/status.js";

export function createApp(config, overrides = {}) {
  const app = express();
  app.use(express.json({ limit: config.limits.uploadMaxBytes }));

  const store = overrides.store ?? new ProjectStore(config.paths.workspace);
  // 런타임 엔진 전환(UI 지원) — config는 기본값, settings가 현재값
  const settings = {
    writerEngine: config.writer.engine,
    imageEngine: config.image.engine,
    // "oauth"(기본, 과금 없음) | "api"(과금 — UI 확인 다이얼로그 필수)
    imageProvider: "oauth",
  };
  const ctx = {
    config,
    store,
    settings,
    log: overrides.log ?? ((msg) => console.log(`[contentforge] ${msg}`)),
    getWriter() {
      return overrides.writer ?? createWriter({ ...config.writer, engine: settings.writerEngine });
    },
    getImageEngine() {
      return overrides.imageEngine ?? createImageEngine({ ...config.image, engine: settings.imageEngine }, ctx.log);
    },
  };

  registerProjectRoutes(app, ctx);
  registerIntakeRoutes(app, ctx);
  registerOutlineRoutes(app, ctx);
  registerDraftRoutes(app, ctx);
  registerImageRoutes(app, ctx);
  registerExportRoutes(app, ctx);
  registerStatusRoutes(app, ctx);

  app.use(express.static(join(packageRoot, "public")));

  // 공통 에러 응답 — UI 에러 스트립이 그대로 표시할 수 있는 형태
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    ctx.log(`오류: ${err.message}`);
    res.status(err.status ?? 500).json({ error: err.message });
  });

  return { app, ctx };
}

export function startServer(config, overrides = {}) {
  const { app, ctx } = createApp(config, overrides);
  return new Promise((resolve, reject) => {
    const server = app.listen(config.server.port, (err) => {
      if (err) return reject(err);
      resolve({ server, app, ctx });
    });
  });
}
