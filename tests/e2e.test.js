// Mock 모드 E2E — INTAKE→OUTLINE→DRAFT→IMAGES→PREVIEW→APPROVED→EXPORTED 풀 라운드트립.
// Writer/ImageEngine 모두 mock, 실제 HTTP 서버를 띄워 API 계약을 검증한다.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "../src/config.js";
import { startServer } from "../src/server.js";

async function bootServer() {
  const root = mkdtempSync(join(tmpdir(), "cf-e2e-"));
  const config = loadConfig({
    root,
    env: { CONTENTFORGE_PORT: "0", CONTENTFORGE_WRITER: "mock", CONTENTFORGE_IMAGE: "mock" },
  });
  const { server, ctx } = await startServer(config, { log: () => {} });
  const base = `http://localhost:${server.address().port}`;
  const api = async (method, path, body) => {
    const r = await fetch(`${base}${path}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: r.status, json: await r.json() };
  };
  return { server, ctx, api, config };
}

test("mock 모드 블로그 풀 라운드트립 + 승인 게이트", async (t) => {
  const { server, api, config } = await bootServer();
  t.after(() => server.close());

  // 프로젝트 생성
  let r = await api("POST", "/api/projects", {
    name: "주말 나들이", mode: "blog", style: "family-log", topic: "아이들과 주말 나들이",
  });
  assert.equal(r.status, 201);
  const id = r.json.project.id;

  // 자료 없이 개요 생성 → 409
  r = await api("POST", "/api/outline", { projectId: id });
  assert.equal(r.status, 409);

  // 자료 업로드 (텍스트 + 이미지 + 미지원 확장자 거부)
  r = await api("POST", "/api/intake", {
    projectId: id,
    files: [
      { name: "조사.md", text: "# 조사자료\n예약 필수. 출처: https://example.com/info" },
      { name: "사진.png", contentBase64: Buffer.from("fake").toString("base64") },
    ],
  });
  assert.equal(r.status, 200);
  assert.equal(r.json.project.materials.length, 2);
  r = await api("POST", "/api/intake", { projectId: id, files: [{ name: "evil.exe", text: "x" }] });
  assert.equal(r.status, 400);

  // 개요 생성 → OUTLINE
  r = await api("POST", "/api/outline", { projectId: id });
  assert.equal(r.status, 200);
  assert.ok(r.json.outline.sections.length >= 3);
  assert.equal(r.json.project.stage, "OUTLINE");

  // 초안 생성 → DRAFT + 이미지 계획 도출
  r = await api("POST", "/api/draft", { projectId: id });
  assert.equal(r.status, 200);
  assert.equal(r.json.project.stage, "DRAFT");
  assert.match(r.json.draft.body_md, /\[IMG-01\]/);
  assert.ok(r.json.project.images.length >= 2);

  // 개요 재생성 → history에 이전 버전 보관 (diff)
  r = await api("POST", "/api/outline", { projectId: id });
  assert.equal(r.json.project.outline.history.length, 1);

  // 승인 시도 (PREVIEW 아님) → 409, export도 409 (승인 게이트)
  r = await api("POST", `/api/projects/${id}/approve`, {});
  assert.equal(r.status, 409);
  r = await api("POST", "/api/export", { projectId: id });
  assert.equal(r.status, 409);
  assert.match(r.json.error, /승인 전/);

  // 이미지 생성 → IMAGES, 파일 생김
  r = await api("POST", "/api/images", { projectId: id });
  assert.equal(r.status, 200);
  assert.ok(r.json.results.every((x) => x.ok));
  assert.equal(r.json.project.stage, "IMAGES");
  const firstFile = r.json.project.images[0].file;
  assert.ok(existsSync(join(config.paths.workspace, id, "images", firstFile)));
  // PNG 시그니처 확인
  const png = readFileSync(join(config.paths.workspace, id, "images", firstFile));
  assert.equal(png.readUInt32BE(0), 0x89504e47);

  // 이미지 미리보기 서빙
  const imgRes = await fetch(`http://localhost:${server.address().port}/api/projects/${id}/images/${firstFile}`);
  assert.equal(imgRes.status, 200);

  // 프롬프트 편집 → stale 표시 → 개별 재생성
  r = await api("PATCH", "/api/images", { projectId: id, id: "IMG-02", prompt: "수정된 프롬프트" });
  assert.equal(r.json.image.status, "stale");
  r = await api("POST", "/api/images", { projectId: id, ids: ["IMG-02"] });
  assert.ok(r.json.results[0].ok);

  // PREVIEW → 승인 도장 → export
  r = await api("POST", `/api/projects/${id}/stage`, { to: "PREVIEW" });
  assert.equal(r.status, 200);
  r = await api("POST", `/api/projects/${id}/approve`, {});
  assert.equal(r.status, 200);
  assert.ok(r.json.project.approvedAt);

  r = await api("POST", "/api/export", { projectId: id });
  assert.equal(r.status, 200);
  assert.equal(r.json.project.stage, "EXPORTED");
  const outDir = join(config.paths.output, `${id}-blog`);
  for (const f of ["post.md", "post.html", "image-map.md", "meta.md"]) {
    assert.ok(existsSync(join(outDir, f)), `${f} 누락`);
  }
  const postHtml = readFileSync(join(outDir, "post.html"), "utf-8");
  assert.match(postHtml, /<h2>/);
  assert.doesNotMatch(postHtml, /<script|<style|class=/); // 단순 태그만

  // 마크다운 표 → <table> 변환 (상품리뷰 스펙 표)
  const { mdToHtml } = await import("../src/export/markdown.js");
  const tableHtml = mdToHtml("| 항목 | 내용 |\n| --- | --- |\n| 가격 | 1,000원 |\n\n일반 문단");
  assert.match(tableHtml, /<table[^>]*>[\s\S]*<th>항목<\/th>[\s\S]*<td>1,000원<\/td>[\s\S]*<\/table>/);
  assert.match(tableHtml, /<p>일반 문단<\/p>/);
  const imageMap = readFileSync(join(outDir, "image-map.md"), "utf-8");
  assert.match(imageMap, /\[IMG-01\]/);
  const metaMd = readFileSync(join(outDir, "meta.md"), "utf-8");
  assert.match(metaMd, /## 제목 후보/);
});

test("공정위 표시 — sponsored 블로그 export에 문구 삽입 + 품질 점검 API", async (t) => {
  const { server, api, config } = await bootServer();
  t.after(() => server.close());

  let r = await api("POST", "/api/projects", { name: "협찬 리뷰", mode: "blog", style: "product-review", topic: "제품 리뷰", disclosure: "sponsored" });
  const id = r.json.project.id;
  assert.equal(r.json.project.disclosure, "sponsored");
  // 잘못된 disclosure 거부
  r = await api("POST", "/api/projects", { name: "x", disclosure: "gift" });
  assert.equal(r.status, 400);

  await api("POST", "/api/intake", { projectId: id, files: [{ name: "자료.md", text: "협찬 제공받은 제품" }] });
  await api("POST", "/api/outline", { projectId: id });
  await api("POST", "/api/draft", { projectId: id });

  // 품질 점검 API
  r = await api("GET", `/api/projects/${id}/quality`);
  assert.equal(r.status, 200);
  const disclosureCheck = r.json.checks.find((c) => c.id === "disclosure");
  assert.equal(disclosureCheck.level, "pass"); // sponsored로 설정했으므로

  await api("POST", "/api/images", { projectId: id });
  await api("POST", `/api/projects/${id}/stage`, { to: "PREVIEW" });
  await api("POST", `/api/projects/${id}/approve`, {});
  await api("POST", "/api/export", { projectId: id });
  const postMd = readFileSync(join(config.paths.output, `${id}-blog`, "post.md"), "utf-8");
  assert.match(postMd, /제공받아 작성한 후기/); // 본문 상단 자동 삽입

  // disclosure 변경 API
  r = await api("PATCH", `/api/projects/${id}/disclosure`, { disclosure: "self-paid" });
  assert.equal(r.json.project.disclosure, "self-paid");
});

test("mock 모드 인스타 라운드트립 — 해시태그 3단 + 캐러셀", async (t) => {
  const { server, api, config } = await bootServer();
  t.after(() => server.close());

  let r = await api("POST", "/api/projects", { name: "인스타", mode: "insta", style: "info", topic: "나들이", disclosure: "sponsored" });
  const id = r.json.project.id;
  await api("POST", "/api/intake", { projectId: id, files: [{ name: "자료.txt", text: "조사 내용" }] });
  await api("POST", "/api/outline", { projectId: id });
  r = await api("POST", "/api/draft", { projectId: id });
  assert.ok(r.json.draft.slides.length >= 3);
  assert.ok(r.json.project.images.every((i) => i.role === "slide"));

  await api("POST", "/api/images", { projectId: id });
  await api("POST", `/api/projects/${id}/stage`, { to: "PREVIEW" });
  await api("POST", `/api/projects/${id}/approve`, {});
  r = await api("POST", "/api/export", { projectId: id });
  assert.equal(r.status, 200);

  const outDir = join(config.paths.output, `${id}-insta`);
  const caption = readFileSync(join(outDir, "caption.txt"), "utf-8");
  assert.match(caption, /^\[광고\]/); // sponsored → 캡션 첫 줄 표시
  const hashtags = readFileSync(join(outDir, "hashtags.txt"), "utf-8");
  assert.match(hashtags, /#광고/);
  assert.match(hashtags, /# 인기/);
  assert.match(hashtags, /# 틈새/);
  const combined = hashtags.split("전체 붙여넣기용")[1];
  const count = (combined.match(/#[^\s#]+/g) ?? []).length;
  assert.ok(count >= 20 && count <= 30, `해시태그 ${count}개 — 20~30 범위 밖`);
  assert.ok(existsSync(join(outDir, "slides.md")));
  assert.ok(existsSync(join(outDir, "carousel", "slide-01.png")));
});

test("status와 settings — 엔진 전환 가드", async (t) => {
  const { server, api } = await bootServer();
  t.after(() => server.close());

  let r = await api("GET", "/api/status");
  assert.equal(r.json.writer.engine, "mock");
  assert.equal(r.json.writer.available, true);
  assert.equal(r.json.image.available, true);

  // 없는 엔진 → 400
  r = await api("POST", "/api/settings", { writerEngine: "gpt-9" });
  assert.equal(r.status, 400);
  // codex 미설치 환경에서 전환 시도 → 409 (가용성 검사)
  r = await api("POST", "/api/settings", { writerEngine: "codex" });
  assert.ok([200, 409].includes(r.status)); // 설치 여부에 따라
});
