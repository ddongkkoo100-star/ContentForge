// 이미지 크기 프리셋 — 결정적 로직 (§5.3)
export const SIZE_PRESETS = {
  "blog-header": "1536x1024",
  "blog-body": "1024x1024",
  "insta-square": "1024x1024",
  // 4:5는 ima2-gen이 직접 지원하지 않아 세로 원본으로 생성한다.
  // (후처리 크롭은 이미지 라이브러리 의존이 필요해 스코프 외 — slides.md에 안내 기록)
  "insta-portrait": "1024x1536",
};

/** 프로젝트 모드 + 이미지 역할 → 크기 프리셋 결정 */
export function sizeFor(mode, role) {
  if (mode === "insta") return role === "portrait" ? SIZE_PRESETS["insta-portrait"] : SIZE_PRESETS["insta-square"];
  return role === "header" ? SIZE_PRESETS["blog-header"] : SIZE_PRESETS["blog-body"];
}

/** [IMG-01] → 01-header.png 같은 결정적 파일명 */
export function imageFilename(imageId, role, index) {
  const num = String(index + 1).padStart(2, "0");
  return `${num}-${role}.png`;
}
