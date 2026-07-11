// 인스타 패키지 출력 — output/<project>-insta/
// caption.txt / hashtags.txt(3단) / carousel/ / slides.md
import { mkdirSync, writeFileSync, copyFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { instaDisclosure } from "./disclosure.js";

/** 해시태그 3단 구성 — 20~30개 범위로 정돈하는 결정적 로직 */
export function composeHashtags({ popular = [], mid = [], niche = [] }, { min = 20, max = 30 } = {}) {
  const clean = (arr) => [...new Set(arr.map((t) => String(t).replace(/^#/, "").trim()).filter(Boolean))];
  const tiers = { popular: clean(popular), mid: clean(mid), niche: clean(niche) };
  let total = tiers.popular.length + tiers.mid.length + tiers.niche.length;
  // 초과 시 각 단을 골고루 잘라 max에 맞춘다
  const order = ["popular", "mid", "niche"];
  while (total > max) {
    const largest = order.sort((a, b) => tiers[b].length - tiers[a].length)[0];
    tiers[largest].pop();
    total--;
  }
  return { tiers, total, underMin: total < min };
}

export async function exportInstaPackage({ store, state, outputDir }) {
  const draft = state.draft.current;
  if (!draft) throw new Error("초안이 없습니다");
  const dir = join(outputDir, `${state.id}-insta`);
  mkdirSync(join(dir, "carousel"), { recursive: true });
  const files = [];

  // 공정위 표시 — 광고/협찬은 캡션 첫 줄에 명시해야 한다
  const { captionPrefix, leadHashtags } = instaDisclosure(state.disclosure);
  const caption = captionPrefix ? `${captionPrefix}\n\n${draft.caption}` : draft.caption;

  // caption.txt
  writeFileSync(join(dir, "caption.txt"), `${caption}\n`);
  files.push("caption.txt");

  // hashtags.txt — 3단 구성 주석 + 붙여넣기용 한 줄 (표시 태그를 맨 앞에)
  const { tiers, total, underMin } = composeHashtags({
    ...draft.hashtags,
    popular: [...leadHashtags, ...(draft.hashtags?.popular ?? [])],
  });
  const hashtagsTxt = [
    `# 인기 (${tiers.popular.length})`,
    tiers.popular.map((t) => `#${t}`).join(" "),
    "",
    `# 중간 (${tiers.mid.length})`,
    tiers.mid.map((t) => `#${t}`).join(" "),
    "",
    `# 틈새 (${tiers.niche.length})`,
    tiers.niche.map((t) => `#${t}`).join(" "),
    "",
    `# 전체 붙여넣기용 (${total}개${underMin ? " — 20개 미만, 보강 권장" : ""})`,
    [...tiers.popular, ...tiers.mid, ...tiers.niche].map((t) => `#${t}`).join(" "),
    "",
  ].join("\n");
  writeFileSync(join(dir, "hashtags.txt"), hashtagsTxt);
  files.push("hashtags.txt");

  // carousel/ 이미지 복사
  for (const img of state.images) {
    if (img.file) {
      const src = join(store.dirOf(state.id), "images", img.file);
      if (existsSync(src)) {
        const dst = `slide-${img.id.replace(/\D/g, "").padStart(2, "0")}.png`;
        copyFileSync(src, join(dir, "carousel", dst));
        files.push(`carousel/${dst}`);
      }
    }
  }

  // slides.md — 문구는 이미지에 굽지 않는다 (편집 자유도)
  const slidesMd = [
    "# 슬라이드 문구",
    "",
    "> 문구는 이미지에 직접 굽지 않았습니다. 편집 앱에서 아래 텍스트를 올려 쓰세요.",
    "> 세로(4:5) 게시가 필요하면 1024x1536 원본을 4:5로 크롭해 사용하세요.",
    "",
    ...(draft.slides ?? []).flatMap((s) => [
      `## 슬라이드 ${s.no}`,
      `- 문구: ${s.text}`,
      `- 이미지 프롬프트: ${s.image_prompt}`,
      "",
    ]),
  ].join("\n");
  writeFileSync(join(dir, "slides.md"), slidesMd);
  files.push("slides.md");

  return { dir, files };
}
