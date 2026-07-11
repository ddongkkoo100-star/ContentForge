import test from "node:test";
import assert from "node:assert/strict";
import { createWriter, WRITER_ENGINES } from "../src/writers/index.js";
import { MockAdapter } from "../src/writers/mock.js";
import { withRetries } from "../src/writers/base.js";

test("createWriter는 세 엔진을 모두 생성한다", () => {
  for (const engine of WRITER_ENGINES) {
    const w = createWriter({ engine });
    assert.equal(w.name, engine);
  }
});

test("알 수 없는 엔진은 명시적 에러", () => {
  assert.throws(() => createWriter({ engine: "gpt-9" }), /알 수 없는 writer 엔진/);
});

test("MockAdapter.isAvailable은 항상 가능", async () => {
  const res = await new MockAdapter().isAvailable();
  assert.equal(res.available, true);
});

test("claude/codex 어댑터 isAvailable은 불리언과 사유를 반환", async () => {
  for (const engine of ["claude", "codex"]) {
    const res = await createWriter({ engine }).isAvailable();
    assert.equal(typeof res.available, "boolean");
    if (!res.available) assert.ok(res.reason, `${engine} 미설치 시 reason 필요`);
  }
});

test("MockAdapter는 task별 스키마에 맞는 JSON을 반환", async () => {
  const mock = new MockAdapter();
  const outline = JSON.parse((await mock.generate({ prompt: "x", task: "outline" })).text);
  assert.ok(outline.title);
  assert.ok(Array.isArray(outline.sections) && outline.sections.length >= 3);

  const blog = JSON.parse((await mock.generate({ prompt: "x", task: "draft-blog" })).text);
  assert.equal(blog.titles.length, 3);
  assert.match(blog.body_md, /\[IMG-01\]/);
  assert.ok(blog.images.every((i) => i.id && i.prompt));

  const insta = JSON.parse((await mock.generate({ prompt: "x", task: "draft-insta" })).text);
  assert.ok(insta.caption.length > 0);
  for (const tier of ["popular", "mid", "niche"]) {
    assert.ok(insta.hashtags[tier].length >= 5, `${tier} 해시태그 부족`);
  }
  assert.ok(insta.slides.length >= 3);
});

test("withRetries는 지정 횟수만큼 재시도 후 성공값을 반환", async () => {
  let calls = 0;
  const result = await withRetries(
    async () => {
      calls++;
      if (calls < 3) throw new Error("일시 오류");
      return "ok";
    },
    { maxRetries: 2 },
  );
  assert.equal(result, "ok");
  assert.equal(calls, 3);
});

test("withRetries는 재시도 소진 시 마지막 에러를 던진다", async () => {
  await assert.rejects(
    withRetries(async () => {
      throw new Error("계속 실패");
    }, { maxRetries: 1 }),
    /계속 실패/,
  );
});
