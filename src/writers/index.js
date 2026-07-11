// Writer 엔진 선택 팩토리 — config.writer.engine 값으로 어댑터를 고른다.
import { ClaudeCodeAdapter } from "./claude.js";
import { CodexAdapter } from "./codex.js";
import { MockAdapter } from "./mock.js";

export const WRITER_ENGINES = ["claude", "codex", "mock"];

export function createWriter(writerConfig = {}) {
  const { engine = "mock", timeoutMs = 300_000 } = writerConfig;
  switch (engine) {
    case "claude":
      return new ClaudeCodeAdapter({ timeoutMs });
    case "codex":
      return new CodexAdapter({ timeoutMs });
    case "mock":
      return new MockAdapter();
    default:
      throw new Error(`알 수 없는 writer 엔진: ${engine} (허용: ${WRITER_ENGINES.join(", ")})`);
  }
}
