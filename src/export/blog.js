// 블로그 패키지 출력 — output/<project>-blog/
// post.md / post.html / images/ / image-map.md / meta.md
import { mkdirSync, writeFileSync, copyFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { mdToHtml } from "./markdown.js";

/** 본문에서 [IMG-XX] 주변 소제목을 찾아 매핑표 문맥으로 쓴다 */
function placeholderContexts(bodyMd) {
  const contexts = {};
  let currentHeading = "(도입부)";
  for (const line of bodyMd.split("\n")) {
    const h = line.match(/^#{1,4}\s+(.+)$/);
    if (h) currentHeading = h[1].trim();
    for (const m of line.matchAll(/\[(IMG-\d{2})\]/g)) {
      contexts[m[1]] = currentHeading;
    }
  }
  return contexts;
}

export async function exportBlogPackage({ store, state, outputDir }) {
  const draft = state.draft.current;
  if (!draft) throw new Error("초안이 없습니다");
  const dir = join(outputDir, `${state.id}-blog`);
  mkdirSync(join(dir, "images"), { recursive: true });

  const title = draft.titles[0] ?? state.topic;
  const files = [];

  // post.md
  const postMd = `# ${title}\n\n${draft.body_md}\n`;
  writeFileSync(join(dir, "post.md"), postMd);
  files.push("post.md");

  // post.html — [IMG-XX]는 눈에 띄는 안내 문단으로 유지 (네이버는 직접 업로드 필요)
  writeFileSync(join(dir, "post.html"), `<h1>${title}</h1>\n${mdToHtml(draft.body_md)}\n`);
  files.push("post.html");

  // images/ 복사 + image-map.md
  const contexts = placeholderContexts(draft.body_md);
  const mapRows = [];
  for (const img of state.images) {
    if (img.file) {
      const src = join(store.dirOf(state.id), "images", img.file);
      if (existsSync(src)) {
        copyFileSync(src, join(dir, "images", img.file));
        files.push(`images/${img.file}`);
      }
    }
    mapRows.push(
      `| [${img.id}] | ${img.file ? `images/${img.file}` : "(미생성)"} | ${contexts[img.id] ?? "(본문 외)"} | ${img.prompt.slice(0, 60)} |`,
    );
  }
  const imageMap = [
    "# 이미지 매핑표",
    "",
    "본문의 플레이스홀더 위치에 아래 파일을 직접 업로드하세요.",
    "",
    "| 플레이스홀더 | 파일 | 위치(소제목) | 프롬프트 요약 |",
    "|---|---|---|---|",
    ...mapRows,
    "",
  ].join("\n");
  writeFileSync(join(dir, "image-map.md"), imageMap);
  files.push("image-map.md");

  // meta.md — 제목 후보 3개, 태그, 썸네일
  const thumb = state.images.find((i) => i.id === draft.thumbnail) ?? state.images[0];
  const meta = [
    "# 발행 메타",
    "",
    "## 제목 후보",
    ...draft.titles.map((t, i) => `${i + 1}. ${t}`),
    "",
    "## 추천 태그",
    draft.tags.length ? draft.tags.map((t) => `#${t}`).join(" ") : "(없음)",
    "",
    "## 썸네일 지정",
    thumb ? `- [${thumb.id}] → ${thumb.file ? `images/${thumb.file}` : "(미생성)"}` : "(없음)",
    "",
    `> 승인: ${state.approvedAt ?? "-"} / 생성 엔진: writer=${state.draft.current?._fallback ? "폴백" : "정상"}`,
    "",
  ].join("\n");
  writeFileSync(join(dir, "meta.md"), meta);
  files.push("meta.md");

  return { dir, files };
}
