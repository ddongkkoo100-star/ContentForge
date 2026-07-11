// CLI 실행 공통 유틸 — execFile + 타임아웃 + stdin 전달.
// 긴 조사자료는 argv 길이 한계를 피하기 위해 항상 stdin으로 넘긴다.
import { execFile } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * @param {string} cmd
 * @param {string[]} args
 * @param {{input?: string, timeoutMs?: number, cwd?: string, env?: object}} opts
 * @returns {Promise<{stdout: string, stderr: string}>}
 */
export function runCli(cmd, args, { input, timeoutMs = 300_000, cwd, env } = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = execFile(
      cmd,
      args,
      {
        timeout: timeoutMs,
        cwd,
        env: env || process.env,
        maxBuffer: 64 * 1024 * 1024,
        killSignal: "SIGKILL",
      },
      (err, stdout, stderr) => {
        if (err) {
          const e = new Error(
            err.killed
              ? `${cmd} 타임아웃(${Math.round(timeoutMs / 1000)}s)`
              : `${cmd} 실행 실패: ${err.message}\n${String(stderr).slice(0, 2000)}`,
          );
          e.stdout = String(stdout ?? "");
          e.stderr = String(stderr ?? "");
          e.code = err.code;
          return reject(e);
        }
        resolvePromise({ stdout: String(stdout ?? ""), stderr: String(stderr ?? "") });
      },
    );
    if (input !== undefined && child.stdin) {
      child.stdin.on("error", () => {}); // EPIPE 무시 (조기 종료 시)
      child.stdin.end(input);
    }
  });
}

/** CLI가 파일을 건드리지 못하도록 빈 임시 디렉토리를 작업 디렉토리로 쓴다. */
export function makeSandboxCwd(prefix = "contentforge-writer-") {
  return mkdtempSync(join(tmpdir(), prefix));
}
