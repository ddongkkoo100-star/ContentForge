// 릴스 패키지 출력 — output/<project>-reels/
// script.md(타임라인 대본) / caption.txt / hashtags.txt / cover/cover.png
import { mkdirSync, writeFileSync, copyFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { instaDisclosure } from "./disclosure.js";
import { composeHashtags } from "./insta.js";

export async function exportReelsPackage({ store, state, outputDir }) {
  const draft = state.draft.current;
  if (!draft) throw new Error("대본이 없습니다");
  const dir = join(outputDir, `${state.id}-reels`);
  mkdirSync(join(dir, "cover"), { recursive: true });
  const files = [];

  // script.md — 촬영·편집용 타임라인 표
  const totalSec = (draft.scenes ?? []).reduce((sum, s) => sum + (s.seconds || 0), 0);
  const scriptMd = [
    `# 릴스 대본 — ${state.topic || state.name}`,
    "",
    `- 훅 (0~3초): **${draft.hook}**`,
    `- 커버 문구: ${draft.cover_text || "(없음)"}`,
    `- 총 길이: 약 ${totalSec}초`,
    "",
    "| # | 초 | 화면 | 자막 | 내레이션 |",
    "|---|---|---|---|---|",
    ...(draft.scenes ?? []).map(
      (s) => `| ${s.no} | ${s.seconds}s | ${s.scene} | ${s.overlay} | ${s.voiceover} |`,
    ),
    "",
    `**CTA**: ${draft.cta}`,
    "",
  ].join("\n");
  writeFileSync(join(dir, "script.md"), scriptMd);
  files.push("script.md");

  // caption.txt — 공정위 표시 규칙 동일 적용
  const { captionPrefix, leadHashtags } = instaDisclosure(state.disclosure);
  const caption = captionPrefix ? `${captionPrefix}\n\n${draft.caption}` : draft.caption;
  writeFileSync(join(dir, "caption.txt"), `${caption}\n`);
  files.push("caption.txt");

  // hashtags.txt
  const { tiers, total } = composeHashtags({
    ...draft.hashtags,
    popular: [...leadHashtags, ...(draft.hashtags?.popular ?? [])],
  });
  writeFileSync(
    join(dir, "hashtags.txt"),
    [
      `# 전체 (${total}개)`,
      [...tiers.popular, ...tiers.mid, ...tiers.niche].map((t) => `#${t}`).join(" "),
      "",
    ].join("\n"),
  );
  files.push("hashtags.txt");

  // cover/
  for (const img of state.images) {
    if (img.file) {
      const src = join(store.dirOf(state.id), "images", img.file);
      if (existsSync(src)) {
        copyFileSync(src, join(dir, "cover", "cover.png"));
        files.push("cover/cover.png");
      }
    }
  }
  return { dir, files };
}
