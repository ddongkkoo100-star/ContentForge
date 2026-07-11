// 설정 로더 — config.json(프로젝트 루트)을 읽어 기본값과 병합한다.
// 모든 서버/라이브러리 코드는 이 모듈의 loadConfig()를 단일 진실로 사용한다.
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const packageRoot = resolve(__dirname, "..");

export const DEFAULTS = {
  server: {
    port: 4444,
  },
  writer: {
    // "claude" | "codex" | "mock"
    engine: "mock",
    timeoutMs: 300_000,
    maxRetries: 2,
  },
  image: {
    // "ima2" | "mock"
    engine: "mock",
    baseUrl: "http://localhost:3333",
    autoStart: true,
    quality: "medium",
    // API Key 모드는 과금 위험 — UI에서 명시적 확인 후에만 켠다.
    allowApiKeyMode: false,
    startupTimeoutMs: 60_000,
  },
  paths: {
    workspace: "workspace",
    output: "output",
  },
  limits: {
    // 조사자료가 이 크기를 넘으면 사전 요약 단계를 자동 삽입한다.
    summarizeThresholdBytes: 50 * 1024,
    uploadMaxBytes: 30 * 1024 * 1024,
  },
};

function deepMerge(base, override) {
  if (override === undefined || override === null) return base;
  if (Array.isArray(base) || Array.isArray(override)) return override;
  if (typeof base === "object" && typeof override === "object") {
    const out = { ...base };
    for (const key of Object.keys(override)) {
      out[key] = key in base ? deepMerge(base[key], override[key]) : override[key];
    }
    return out;
  }
  return override;
}

export function loadConfig({ root = packageRoot, env = process.env } = {}) {
  const configPath = join(root, "config.json");
  let fileCfg = {};
  if (existsSync(configPath)) {
    try {
      fileCfg = JSON.parse(readFileSync(configPath, "utf-8"));
    } catch (err) {
      throw new Error(`config.json 파싱 실패: ${err.message}`);
    }
  }
  const merged = deepMerge(DEFAULTS, fileCfg);
  // 환경변수 오버라이드 (테스트/포트 충돌 대응)
  if (env.CONTENTFORGE_PORT) merged.server.port = Number(env.CONTENTFORGE_PORT);
  if (env.CONTENTFORGE_WRITER) merged.writer.engine = env.CONTENTFORGE_WRITER;
  if (env.CONTENTFORGE_IMAGE) merged.image.engine = env.CONTENTFORGE_IMAGE;
  if (env.CONTENTFORGE_WORKSPACE) merged.paths.workspace = env.CONTENTFORGE_WORKSPACE;
  if (env.CONTENTFORGE_OUTPUT) merged.paths.output = env.CONTENTFORGE_OUTPUT;
  // 상대 경로는 루트 기준으로 해석
  merged.paths.workspace = resolve(root, merged.paths.workspace);
  merged.paths.output = resolve(root, merged.paths.output);
  merged.root = root;
  return merged;
}
