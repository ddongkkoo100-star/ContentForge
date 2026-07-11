// contentforge doctor — writer/image 엔진 진단.
// claude/codex CLI, ima2-gen 서버·OAuth 세션, node 버전을 점검한다.
import { createWriter } from "./writers/index.js";

const MIN_NODE_MAJOR = 18;

async function checkNode() {
  const major = Number(process.versions.node.split(".")[0]);
  return {
    name: "node",
    ok: major >= MIN_NODE_MAJOR,
    detail: `v${process.versions.node}`,
    hint: major >= MIN_NODE_MAJOR ? null : `Node.js ${MIN_NODE_MAJOR} 이상이 필요합니다`,
  };
}

async function checkWriterCli(engine) {
  const adapter = createWriter({ engine });
  const res = await adapter.isAvailable();
  return {
    name: engine,
    ok: res.available,
    detail: res.available ? res.version : "미사용 가능",
    hint: res.available ? null : res.reason,
  };
}

export async function checkIma2(baseUrl, { fetchImpl = fetch } = {}) {
  const result = { name: "ima2-gen", ok: false, detail: "", hint: null, oauth: null };
  try {
    const r = await fetchImpl(`${baseUrl}/api/health`, { signal: AbortSignal.timeout(3000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const health = await r.json();
    result.ok = health.ok === true;
    result.detail = `v${health.version ?? "?"} @ ${baseUrl}`;
  } catch {
    result.detail = "서버 미기동";
    result.hint = `serve 시 자동 기동됩니다 (수동: npx ima2-gen serve)`;
    return result;
  }
  try {
    const r = await fetchImpl(`${baseUrl}/api/oauth/status`, { signal: AbortSignal.timeout(10_000) });
    const s = await r.json();
    result.oauth = s.status;
    if (s.status !== "ready") {
      result.hint = `OAuth 세션 ${s.status} — \`npx @openai/codex login\` 실행 후 재시도`;
    }
  } catch {
    result.oauth = "unknown";
  }
  return result;
}

export async function runDoctor(config, { fetchImpl = fetch } = {}) {
  const checks = await Promise.all([
    checkNode(),
    checkWriterCli("claude"),
    checkWriterCli("codex"),
    checkIma2(config.image.baseUrl, { fetchImpl }),
  ]);
  return {
    checks,
    config: {
      writerEngine: config.writer.engine,
      imageEngine: config.image.engine,
      port: config.server.port,
    },
  };
}

export function formatDoctorReport(report) {
  const lines = ["ContentForge doctor", ""];
  for (const c of report.checks) {
    const mark = c.ok ? "✓" : "✗";
    lines.push(`  ${mark} ${c.name.padEnd(10)} ${c.detail}${c.oauth ? `  (oauth: ${c.oauth})` : ""}`);
    if (c.hint) lines.push(`      → ${c.hint}`);
  }
  lines.push("");
  lines.push(
    `  설정: writer=${report.config.writerEngine}, image=${report.config.imageEngine}, port=${report.config.port}`,
  );
  return lines.join("\n");
}
