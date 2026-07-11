import test from "node:test";
import assert from "node:assert/strict";
import {
  extractSourceUrls,
  needsSummary,
  buildOutlinePrompt,
  buildDraftPrompt,
} from "../src/prompts/builder.js";
import { extractJson, parseOutline, parseBlogDraft, parseInstaDraft } from "../src/prompts/parse.js";
import { resolvePreset } from "../src/prompts/presets.js";

test("extractSourceUrls는 중복 제거 + 꼬리 문장부호 제거", () => {
  const urls = extractSourceUrls("참고 https://a.com/x. 그리고 https://a.com/x 또 https://b.kr/y?z=1,");
  assert.deepEqual(urls, ["https://a.com/x", "https://b.kr/y?z=1"]);
});

test("needsSummary는 50KB 임계치를 지킨다", () => {
  assert.equal(needsSummary("짧은 자료"), false);
  assert.equal(needsSummary("가".repeat(20000)), true); // 한글 3바이트 → 60KB
});

test("outline 프롬프트는 스타일/주제/자료/JSON 지시를 모두 포함", () => {
  const { system, prompt, task } = buildOutlinePrompt({
    topic: "주말 나들이",
    style: "family-log",
    materialText: "자료 본문입니다",
  });
  assert.equal(task, "outline");
  assert.match(system, /아빠의 체험 중심/);
  assert.match(prompt, /주제: 주말 나들이/);
  assert.match(prompt, /<조사자료>/);
  assert.match(prompt, /"sections"/);
});

test("draft 프롬프트는 모드에 따라 task와 출처 지시가 달라진다", () => {
  const blog = buildDraftPrompt({ topic: "t", mode: "blog", style: "info", materialText: "출처: https://ref.com/a" });
  assert.equal(blog.task, "draft-blog");
  assert.match(blog.prompt, /참고자료.*섹션/);
  assert.match(blog.prompt, /https:\/\/ref\.com\/a/);

  const insta = buildDraftPrompt({ topic: "t", mode: "insta", style: "info", materialText: "출처: https://ref.com/a" });
  assert.equal(insta.task, "draft-insta");
  assert.doesNotMatch(insta.prompt, /참고자료.*섹션/);
});

test("resolvePreset은 config 오버라이드를 반영하고 모르는 키는 거부", () => {
  const custom = resolvePreset("my-style", { "my-style": { label: "커스텀", prompt: "톤" } });
  assert.equal(custom.label, "커스텀");
  assert.throws(() => resolvePreset("없는스타일"), /알 수 없는 스타일 프리셋/);
});

test("extractJson: 통짜 / 펜스 / 잡담 섞임 모두 파싱", () => {
  assert.deepEqual(extractJson('{"a":1}'), { a: 1 });
  assert.deepEqual(extractJson('설명입니다\n```json\n{"a":2}\n```\n끝'), { a: 2 });
  assert.deepEqual(extractJson('머리말 {"a":{"b":"중괄호 } 포함 문자열"}} 꼬리'), {
    a: { b: "중괄호 } 포함 문자열" },
  });
  assert.equal(extractJson("JSON이 전혀 없음"), null);
});

test("parseOutline: JSON 실패 시 마크다운 헤딩 폴백", () => {
  const r = parseOutline("# 큰제목\n## 첫 섹션\n내용\n## 둘째 섹션");
  assert.equal(r._fallback, true);
  assert.equal(r.sections.length, 2);
  assert.equal(r.sections[0].heading, "첫 섹션");
  assert.throws(() => parseOutline("구조가 전혀 없는 텍스트"), /개요 파싱 실패/);
});

test("parseBlogDraft: JSON 실패 시 전체를 본문으로 폴백", () => {
  const r = parseBlogDraft("## 소제목\n그냥 마크다운 응답");
  assert.equal(r._fallback, true);
  assert.equal(r.titles[0], "소제목");
  assert.match(r.body_md, /그냥 마크다운/);
});

test("parseInstaDraft: 해시태그 # 접두어 제거", () => {
  const r = parseInstaDraft(JSON.stringify({
    caption: "훅",
    hashtags: { popular: ["#여행", "맛집"], mid: [], niche: [] },
    slides: [{ no: 1, text: "a", image_prompt: "b" }],
  }));
  assert.deepEqual(r.hashtags.popular, ["여행", "맛집"]);
});
