// URL 자료 가져오기 / 톤 학습 / 릴스 모드 / ZIP 다운로드 E2E (mock)
import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtempSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "../src/config.js";
import { startServer } from "../src/server.js";
import { htmlToText } from "../src/intake/webpage.js";
import { makeZip } from "../src/export/zip.js";

async function bootServer() {
  const root = mkdtempSync(join(tmpdir(), "cf-feat-"));
  const config = loadConfig({
    root,
    env: { CONTENTFORGE_PORT: "0", CONTENTFORGE_WRITER: "mock", CONTENTFORGE_IMAGE: "mock" },
  });
  const { server } = await startServer(config, { log: () => {} });
  const base = `http://localhost:${server.address().port}`;
  const api = async (method, path, body) => {
    const r = await fetch(`${base}${path}`, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const ctype = r.headers.get("content-type") ?? "";
    return { status: r.status, headers: r.headers, ...(ctype.includes("json") ? { json: await r.json() } : { buffer: Buffer.from(await r.arrayBuffer()) }) };
  };
  return { server, api, config, root, base };
}

test("htmlToText — 스크립트/태그 제거, 제목·엔티티 처리", () => {
  const { title, text } = htmlToText(`
    <html><head><title>테스트 &amp; 페이지</title><style>.x{}</style></head>
    <body><script>evil()</script><nav>메뉴</nav>
    <h1>제목</h1><p>첫 문단 &quot;인용&quot;</p><ul><li>항목 하나</li></ul></body></html>`);
  assert.equal(title, "테스트 & 페이지");
  assert.match(text, /제목\n/);
  assert.match(text, /첫 문단 "인용"/);
  assert.doesNotMatch(text, /evil|메뉴|\.x\{\}/);
});

test("URL 자료 가져오기 — 로컬 페이지를 조사자료로 저장", async (t) => {
  const page = createServer((req, res) => {
    if (req.url === "/binary") {
      res.writeHead(200, { "Content-Type": "image/png" });
      return res.end("x");
    }
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(`<html><head><title>맛집 정보</title></head><body>
      <article><h2>영업시간</h2><p>${"매일 10시부터 22시까지 운영합니다. ".repeat(10)}</p></article></body></html>`);
  });
  await new Promise((r) => page.listen(0, r));
  const pageUrl = `http://localhost:${page.address().port}`;
  const { server, api } = await bootServer();
  t.after(() => { server.close(); page.close(); });

  let r = await api("POST", "/api/projects", { name: "url테스트" });
  const id = r.json.project.id;

  r = await api("POST", "/api/intake/url", { projectId: id, url: `${pageUrl}/post` });
  assert.equal(r.status, 200);
  assert.equal(r.json.title, "맛집 정보");
  assert.equal(r.json.project.materials.length, 1);
  assert.match(r.json.saved.filename, /^url-localhost-/);

  // 텍스트가 아닌 응답 거부
  r = await api("POST", "/api/intake/url", { projectId: id, url: `${pageUrl}/binary` });
  assert.equal(r.status, 415);
  // 잘못된 URL
  r = await api("POST", "/api/intake/url", { projectId: id, url: "ftp://x" });
  assert.equal(r.status, 400);
});

test("톤 학습 — mock writer로 커스텀 프리셋 생성·영속화", async (t) => {
  const { server, api, root } = await bootServer();
  t.after(() => server.close());

  // 샘플이 짧으면 400
  let r = await api("POST", "/api/presets/learn", { name: "내톤", samples: "짧음" });
  assert.equal(r.status, 400);

  r = await api("POST", "/api/presets/learn", { name: "내톤", samples: "가나다 ".repeat(100) });
  assert.equal(r.status, 200);
  assert.equal(r.json.key, "custom-내톤");
  assert.match(r.json.preset.prompt, /톤:/);

  // config.json에 영속화 + 프리셋 목록에 노출
  const fileCfg = JSON.parse(readFileSync(join(root, "config.json"), "utf-8"));
  assert.ok(fileCfg.presets["custom-내톤"]);
  r = await api("GET", "/api/presets");
  assert.equal(r.json.presets["custom-내톤"].label, "내톤");

  // 학습된 프리셋으로 프로젝트 생성 가능
  r = await api("POST", "/api/projects", { name: "커스텀톤 글", style: "custom-내톤" });
  assert.equal(r.status, 201);
});

test("릴스 모드 풀 라운드트립 — 대본/커버/패키지/품질/ZIP", async (t) => {
  const { server, api, config } = await bootServer();
  t.after(() => server.close());

  let r = await api("POST", "/api/projects", { name: "릴스", mode: "reels", style: "info", topic: "주말 나들이", disclosure: "self-paid" });
  assert.equal(r.status, 201);
  const id = r.json.project.id;

  await api("POST", "/api/intake", { projectId: id, files: [{ name: "자료.md", text: "조사 내용" }] });
  await api("POST", "/api/outline", { projectId: id });
  r = await api("POST", "/api/draft", { projectId: id });
  assert.ok(r.json.draft.scenes.length >= 4);
  assert.ok(r.json.draft.hook);
  // 이미지 계획 = 커버 1장 (세로)
  assert.equal(r.json.project.images.length, 1);
  assert.equal(r.json.project.images[0].role, "cover");

  // 품질 점검
  r = await api("GET", `/api/projects/${id}/quality`);
  const ids = r.json.checks.map((c) => c.id);
  for (const k of ["hook", "scenes", "duration", "overlay", "hashtags", "disclosure"]) {
    assert.ok(ids.includes(k), `${k} 점검 누락`);
  }

  // ZIP은 export 전 409
  r = await api("GET", `/api/projects/${id}/export.zip`);
  assert.equal(r.status, 409);

  await api("POST", "/api/images", { projectId: id });
  await api("POST", `/api/projects/${id}/stage`, { to: "PREVIEW" });
  await api("POST", `/api/projects/${id}/approve`, {});
  r = await api("POST", "/api/export", { projectId: id });
  assert.equal(r.status, 200);

  const dir = join(config.paths.output, `${id}-reels`);
  const script = readFileSync(join(dir, "script.md"), "utf-8");
  assert.match(script, /\| # \| 초 \| 화면 \| 자막 \| 내레이션 \|/);
  assert.match(script, /\*\*CTA\*\*/);
  const caption = readFileSync(join(dir, "caption.txt"), "utf-8");
  assert.ok(caption.length > 10);
  assert.ok(existsSync(join(dir, "cover", "cover.png")));
  const hashtags = readFileSync(join(dir, "hashtags.txt"), "utf-8");
  assert.match(hashtags, /#내돈내산/); // self-paid 선두 태그

  // ZIP 다운로드
  r = await api("GET", `/api/projects/${id}/export.zip`);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("content-type"), "application/zip");
  assert.equal(r.buffer.readUInt32LE(0), 0x04034b50); // PK\x03\x04
  // EOCD 시그니처 존재 + 파일 수 일치
  const eocd = r.buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  assert.ok(eocd > 0);
  assert.equal(r.buffer.readUInt16LE(eocd + 10), 4); // script.md/caption.txt/hashtags.txt/cover.png
});

test("makeZip — 파이썬 zipfile로 무결성 교차 검증", async (t) => {
  const zip = makeZip([
    { name: "a.txt", data: Buffer.from("hello") },
    { name: "dir/한글.md", data: Buffer.from("가나다") },
  ]);
  const { writeFileSync, mkdtempSync: mkd } = await import("node:fs");
  const dir = mkd(join(tmpdir(), "cf-zip-"));
  const path = join(dir, "t.zip");
  writeFileSync(path, zip);
  const { execFileSync } = await import("node:child_process");
  try {
    const out = execFileSync("python3", ["-c", `
import zipfile, sys
z = zipfile.ZipFile(sys.argv[1])
assert z.testzip() is None
assert z.read("a.txt") == b"hello"
assert z.read("dir/\\ud55c\\uae00.md").decode() == "\\uac00\\ub098\\ub2e4"
print("OK")`, path]).toString();
    assert.match(out, /OK/);
  } catch (err) {
    if (err.code === "ENOENT") t.skip("python3 없음"); // 구조 검증은 위 테스트에서 수행
    else throw err;
  }
});
