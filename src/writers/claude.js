// Claude Code 헤드리스 어댑터 — `claude -p --output-format json`
// 프롬프트는 stdin으로 전달, JSON 파싱 실패 시 plain text 폴백.
import { WriterAdapter } from "./base.js";
import { runCli, makeSandboxCwd } from "./cli.js";

const NO_FILE_GUARD =
  "중요: 답변 텍스트만 출력하세요. 파일을 생성/수정하지 말고, 도구를 사용하지 마세요.";

export class ClaudeCodeAdapter extends WriterAdapter {
  name = "claude";

  constructor({ timeoutMs = 300_000, bin = "claude" } = {}) {
    super();
    this.timeoutMs = timeoutMs;
    this.bin = bin;
  }

  async isAvailable() {
    try {
      const { stdout } = await runCli(this.bin, ["--version"], { timeoutMs: 15_000 });
      return { available: true, version: stdout.trim() };
    } catch (err) {
      return {
        available: false,
        reason:
          err.code === "ENOENT"
            ? "claude CLI 미설치 — https://claude.com/claude-code 참고"
            : `claude CLI 확인 실패: ${err.message.split("\n")[0]}`,
      };
    }
  }

  async generate({ system = "", prompt }) {
    const fullPrompt = [system, NO_FILE_GUARD, prompt].filter(Boolean).join("\n\n");
    const args = ["-p", "--output-format", "json"];
    const cwd = makeSandboxCwd("contentforge-claude-");
    const started = Date.now();
    const { stdout } = await runCli(this.bin, args, {
      input: fullPrompt,
      timeoutMs: this.timeoutMs,
      cwd,
    });
    const elapsedMs = Date.now() - started;
    // --output-format json → { result: "...", is_error, ... } 형태. 실패 시 plain 폴백.
    try {
      const parsed = JSON.parse(stdout);
      if (parsed && typeof parsed.result === "string") {
        if (parsed.is_error) throw new Error(`claude 응답 오류: ${parsed.result.slice(0, 500)}`);
        return {
          text: parsed.result,
          meta: { engine: this.name, elapsedMs, sessionId: parsed.session_id ?? null },
        };
      }
    } catch (err) {
      if (err.message?.startsWith("claude 응답 오류")) throw err;
      // JSON 파싱 실패 → plain text 폴백
    }
    const text = stdout.trim();
    if (!text) throw new Error("claude CLI가 빈 응답을 반환했습니다");
    return { text, meta: { engine: this.name, elapsedMs, fallback: "plain-text" } };
  }
}
