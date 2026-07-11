// Ima2ImageEngine — ima2-gen(:3333) 프록시.
// 헬스체크 → 미기동이면 `npx ima2-gen serve`를 detached 서브프로세스로 기동.
import { spawn } from "node:child_process";

export class Ima2ImageEngine {
  name = "ima2";

  constructor({ baseUrl = "http://localhost:3333", autoStart = true, quality = "medium", startupTimeoutMs = 60_000 } = {}, log = () => {}) {
    this.baseUrl = baseUrl;
    this.autoStart = autoStart;
    this.quality = quality;
    this.startupTimeoutMs = startupTimeoutMs;
    this.log = log;
    this.child = null;
  }

  async #fetchHealth(timeoutMs = 3000) {
    const r = await fetch(`${this.baseUrl}/api/health`, { signal: AbortSignal.timeout(timeoutMs) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  }

  async health() {
    try {
      const h = await this.#fetchHealth();
      let oauth = "unknown";
      try {
        const r = await fetch(`${this.baseUrl}/api/oauth/status`, { signal: AbortSignal.timeout(10_000) });
        oauth = (await r.json()).status;
      } catch {
        /* oauth 상태만 실패해도 서버는 살아있음 */
      }
      return { available: true, detail: `ima2-gen v${h.version ?? "?"}`, oauth };
    } catch {
      return {
        available: false,
        detail: "ima2-gen 서버 미기동",
        oauth: null,
        hint: "생성 요청 시 자동 기동을 시도합니다 (수동: npx ima2-gen serve)",
      };
    }
  }

  /** 서버가 없으면 detached로 기동하고 준비될 때까지 폴링한다. */
  async ensureRunning() {
    try {
      await this.#fetchHealth();
      return true;
    } catch {
      /* 기동 필요 */
    }
    if (!this.autoStart) throw new Error("ima2-gen 서버 미기동 — `npx ima2-gen serve`를 먼저 실행하세요");
    if (!this.child) {
      this.log("ima2-gen 서브프로세스 기동: npx ima2-gen serve");
      this.child = spawn("npx", ["ima2-gen", "serve"], {
        detached: true,
        stdio: "ignore",
        env: process.env,
      });
      this.child.on("exit", (code) => {
        this.log(`ima2-gen 프로세스 종료 (code=${code})`);
        this.child = null;
      });
      this.child.unref();
    }
    const deadline = Date.now() + this.startupTimeoutMs;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 1500));
      try {
        await this.#fetchHealth();
        this.log("ima2-gen 준비 완료");
        return true;
      } catch {
        /* 재시도 */
      }
    }
    throw new Error(`ima2-gen 기동 타임아웃(${Math.round(this.startupTimeoutMs / 1000)}s) — 수동으로 npx ima2-gen serve 후 재시도하세요`);
  }

  /**
   * POST /api/generate 프록시. dataURL을 디코드해 Buffer 배열로 돌려준다.
   * @param {{prompt: string, size: string, n?: number}} req
   */
  async generate({ prompt, size = "1024x1024", n = 1, provider = "auto" }) {
    await this.ensureRunning();
    const r = await fetch(`${this.baseUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // provider "api"는 과금 모드 — UI 확인 다이얼로그를 거친 경우에만 전달된다
      body: JSON.stringify({ prompt, size, quality: this.quality, format: "png", n, provider }),
      signal: AbortSignal.timeout(600_000),
    });
    const payload = await r.json().catch(() => ({}));
    if (!r.ok) {
      const code = payload.code ? ` [${payload.code}]` : "";
      const hint =
        payload.code === "OAUTH_AUTH_REQUIRED" || /oauth|auth/i.test(String(payload.error))
          ? " — OAuth 세션 만료: `npx @openai/codex login` 실행 후 재시도"
          : "";
      throw new Error(`이미지 생성 실패(${r.status})${code}: ${payload.error ?? "unknown"}${hint}`);
    }
    // n=1 → {image}, n>1 → {images:[{image}]}
    const items = payload.images ?? (payload.image ? [payload] : []);
    if (items.length === 0) throw new Error("이미지 생성 실패: 응답에 이미지가 없습니다");
    const buffers = items.map((item) => {
      const m = String(item.image).match(/^data:image\/\w+;base64,(.+)$/s);
      if (!m) throw new Error("이미지 응답 형식 오류 (dataURL 아님)");
      return Buffer.from(m[1], "base64");
    });
    return {
      buffers,
      meta: { engine: this.name, size, elapsed: payload.elapsed ?? null, provider: payload.provider ?? null },
    };
  }

  async stop() {
    if (this.child && !this.child.killed) {
      try {
        process.kill(-this.child.pid, "SIGTERM");
      } catch {
        this.child.kill("SIGTERM");
      }
      this.child = null;
    }
  }
}
