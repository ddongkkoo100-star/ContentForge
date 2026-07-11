import test from "node:test";
import assert from "node:assert/strict";
import { runQualityChecks } from "../src/pipeline/quality.js";
import { blogDisclosureText, instaDisclosure, DISCLOSURES } from "../src/export/disclosure.js";

const get = (checks, id) => checks.find((c) => c.id === id);

function blogState(overrides = {}) {
  return {
    mode: "blog",
    disclosure: "none",
    images: [
      { id: "IMG-01", status: "done" },
      { id: "IMG-02", status: "done" },
    ],
    draft: {
      current: {
        titles: ["아이 셋과 다녀온 주말 나들이 솔직 후기"],
        body_md: ["[IMG-01]", "## 하나", "가".repeat(400), "## 둘", "나".repeat(400), "[IMG-02]", "## 셋", "다".repeat(400)].join("\n"),
      },
    },
    ...overrides,
  };
}

test("블로그 품질 점검 — 정상 케이스는 전부 pass", () => {
  const checks = runQualityChecks(blogState());
  for (const id of ["title-len", "body-len", "headings", "images", "hype", "disclosure"]) {
    assert.equal(get(checks, id)?.level, "pass", `${id}가 pass가 아님: ${JSON.stringify(get(checks, id))}`);
  }
});

test("짧은 제목/본문/과장 표현은 warn", () => {
  const s = blogState();
  s.draft.current.titles = ["짧은 제목"];
  s.draft.current.body_md = "## 하나\n인생템! 최고예요. [IMG-01]";
  const checks = runQualityChecks(s);
  assert.equal(get(checks, "title-len").level, "warn");
  assert.equal(get(checks, "body-len").level, "warn");
  assert.equal(get(checks, "headings").level, "warn");
  assert.equal(get(checks, "hype").level, "warn");
  assert.match(get(checks, "hype").detail, /인생템/);
});

test("협찬 정황 + 표시 미설정은 fail", () => {
  const s = blogState();
  s.draft.current.body_md += "\n\n이 제품은 업체에서 제공받았습니다.";
  const checks = runQualityChecks(s);
  assert.equal(get(checks, "disclosure").level, "fail");
  // 표시 설정하면 pass
  s.disclosure = "sponsored";
  assert.equal(get(runQualityChecks(s), "disclosure").level, "pass");
});

test("인스타 품질 점검 — 캡션 제한/훅/해시태그/슬라이드", () => {
  const s = {
    mode: "insta",
    disclosure: "self-paid",
    images: [{ status: "done" }],
    draft: {
      current: {
        caption: "저장해 두면 주말 계획 끝!\n\n본문",
        hashtags: { popular: Array(8).fill("a"), mid: Array(8).fill("b"), niche: Array(7).fill("c") },
        slides: Array(6).fill({ text: "x" }),
      },
    },
  };
  const checks = runQualityChecks(s);
  for (const id of ["caption-len", "hook", "hashtags", "slides", "disclosure"]) {
    assert.equal(get(checks, id)?.level, "pass", `${id} 실패`);
  }
  s.draft.current.caption = "가".repeat(2300);
  assert.equal(get(runQualityChecks(s), "caption-len").level, "fail");
});

test("공정위 문구 — 종류별 텍스트와 인스타 첫 줄 규칙", () => {
  assert.equal(blogDisclosureText("none"), null);
  assert.match(blogDisclosureText("sponsored"), /제공받아/);
  assert.match(blogDisclosureText("self-paid"), /내돈내산/);
  assert.match(blogDisclosureText("loan"), /대여받아/);

  const sp = instaDisclosure("sponsored");
  assert.match(sp.captionPrefix, /^\[광고\]/);
  assert.ok(sp.leadHashtags.includes("광고"));
  assert.equal(instaDisclosure("none").captionPrefix, null);
  assert.equal(DISCLOSURES.length, 4);
});
