import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig, DEFAULTS } from "../src/config.js";

test("config.json이 없으면 기본값을 쓴다", () => {
  const root = mkdtempSync(join(tmpdir(), "cf-config-"));
  const cfg = loadConfig({ root, env: {} });
  assert.equal(cfg.server.port, DEFAULTS.server.port);
  assert.equal(cfg.writer.engine, "mock");
});

test("config.json 값이 기본값 위에 깊게 병합된다", () => {
  const root = mkdtempSync(join(tmpdir(), "cf-config-"));
  writeFileSync(join(root, "config.json"), JSON.stringify({ writer: { engine: "claude" } }));
  const cfg = loadConfig({ root, env: {} });
  assert.equal(cfg.writer.engine, "claude");
  assert.equal(cfg.writer.timeoutMs, DEFAULTS.writer.timeoutMs); // 병합 유지
});

test("환경변수가 config.json보다 우선한다", () => {
  const root = mkdtempSync(join(tmpdir(), "cf-config-"));
  writeFileSync(join(root, "config.json"), JSON.stringify({ server: { port: 5000 } }));
  const cfg = loadConfig({ root, env: { CONTENTFORGE_PORT: "6001", CONTENTFORGE_WRITER: "codex" } });
  assert.equal(cfg.server.port, 6001);
  assert.equal(cfg.writer.engine, "codex");
});

test("깨진 config.json은 명시적 에러", () => {
  const root = mkdtempSync(join(tmpdir(), "cf-config-"));
  writeFileSync(join(root, "config.json"), "{broken");
  assert.throws(() => loadConfig({ root, env: {} }), /config\.json 파싱 실패/);
});
