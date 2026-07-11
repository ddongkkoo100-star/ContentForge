// Codex CLI 어댑터 — `codex exec --skip-git-repo-check`
// workspace 오염 방지: 빈 임시 디렉토리에서 실행 + 파일 생성 금지 지시.
import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { WriterAdapter } from "./base.js";
import { runCli, makeSandboxCwd } from "./cli.js";

const NO_FILE_GUARD =
  "중요: 답변 텍스트만 출력하세요. 파일을 생성/수정하지 말고, 셸 명령을 실행하지 마세요.";

export class CodexAdapter extends WriterAdapter {
  name = "codex";

  constructor({ timeoutMs = 300_000, bin = "codex" } = {}) {
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
            ? "codex CLI 미설치 — `npm i -g @openai/codex` 후 `codex login`"
            : `codex CLI 확인 실패: ${err.message.split("\n")[0]}`,
      };
    }
  }

  async generate({ system = "", prompt }) {
    const fullPrompt = [system, NO_FILE_GUARD, prompt].filter(Boolean).join("\n\n");
    const cwd = makeSandboxCwd("contentforge-codex-");
    // 마지막 메시지를 파일로 받는 편이 stdout 로그 섞임보다 안정적이다.
    const lastMessagePath = join(cwd, "last-message.txt");
    const args = [
      "exec",
      "--skip-git-repo-check",
      "--output-last-message",
      lastMessagePath,
      "-", // 프롬프트를 stdin으로
    ];
    const started = Date.now();
    const { stdout } = await runCli(this.bin, args, {
      input: fullPrompt,
      timeoutMs: this.timeoutMs,
      cwd,
    });
    const elapsedMs = Date.now() - started;
    let text = "";
    try {
      text = (await readFile(lastMessagePath, "utf-8")).trim();
    } catch {
      // 파일 미생성 → stdout 폴백
    }
    rm(cwd, { recursive: true, force: true }).catch(() => {});
    if (!text) text = stdout.trim();
    if (!text) throw new Error("codex CLI가 빈 응답을 반환했습니다");
    return { text, meta: { engine: this.name, elapsedMs } };
  }
}
