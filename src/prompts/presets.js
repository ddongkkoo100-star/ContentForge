// 스타일 프리셋 — config.json의 presets 키로 덮어쓸 수 있다 (수정 가능 요구사항).
export const STYLE_PRESETS = {
  "family-log": {
    label: "1+3 아빠 로그",
    prompt: [
      "톤: 아이 셋을 키우는 아빠의 체험 중심 기록.",
      "- 대화체로 편안하게, 현장감 있는 묘사",
      "- 아이들 시점의 인용을 1~2회 자연스럽게 삽입 (예: \"아빠, 또 오자!\")",
      "- 실패담/꿀팁을 솔직하게, 광고 느낌 배제",
    ].join("\n"),
  },
  info: {
    label: "정보성",
    prompt: [
      "톤: 검색 유입을 노리는 정보성 글.",
      "- 소제목(##) 구조를 명확히, 문단은 짧게",
      "- 핵심 요약 박스(> 인용 블록)를 도입부에 배치",
      "- 팁은 번호/불릿 리스트로 정리, 근거 있는 수치 우선",
    ].join("\n"),
  },
  review: {
    label: "리뷰",
    prompt: [
      "톤: 직접 써 본 사람의 균형 잡힌 리뷰.",
      "- 장점과 단점을 각각 별도 섹션으로",
      "- 5점 만점 별점과 그 이유를 명시",
      "- 재방문(재구매) 의사와 추천 대상으로 마무리",
    ].join("\n"),
  },
};

export const SYSTEM_BASE = [
  "당신은 한국어 콘텐츠 전문 작가입니다.",
  "주어진 조사자료의 사실만 사용하고, 자료에 없는 사실을 지어내지 마세요.",
  "응답은 요청된 형식만 출력하세요 — 설명이나 머리말/맺음말을 붙이지 마세요.",
].join("\n");

// 단계별 출력 형식 지시 (JSON 스키마)
export const TASK_TEMPLATES = {
  outline: {
    instruction: [
      "아래 조사자료를 바탕으로 글의 개요를 만드세요.",
      "다음 JSON 형식으로만 응답하세요:",
      '{"title": "가제", "sections": [{"heading": "소제목", "summary": "이 섹션에서 다룰 내용 1~2문장"}]}',
      "섹션은 4~6개로 구성하세요.",
    ].join("\n"),
  },
  "draft-blog": {
    instruction: [
      "개요와 조사자료를 바탕으로 네이버 블로그 본문을 작성하세요.",
      "다음 JSON 형식으로만 응답하세요:",
      JSON.stringify({
        titles: ["제목 후보 1", "제목 후보 2", "제목 후보 3"],
        body_md: "마크다운 본문. 이미지가 들어갈 위치에 [IMG-01], [IMG-02] 플레이스홀더를 삽입",
        tags: ["추천 태그 5~10개"],
        images: [{ id: "IMG-01", role: "header|body", prompt: "이 위치에 넣을 이미지의 생성 프롬프트(한국어, 사진 스타일 명시)" }],
        thumbnail: "썸네일로 쓸 이미지 id",
      }),
      "본문은 1500~2500자, 소제목(##) 구조를 지키세요.",
      "images의 첫 항목은 role=header로 하고, 섹션마다 1개 이내로 body 이미지를 배치하세요.",
    ].join("\n"),
  },
  "draft-insta": {
    instruction: [
      "개요와 조사자료를 바탕으로 인스타그램 캐러셀 패키지를 작성하세요.",
      "다음 JSON 형식으로만 응답하세요:",
      JSON.stringify({
        caption: "첫 줄 훅 + 본문 + CTA로 끝나는 캡션",
        hashtags: { popular: ["인기 해시태그 7~10개"], mid: ["중간 규모 7~10개"], niche: ["틈새 6~10개"] },
        slides: [{ no: 1, text: "슬라이드에 올릴 핵심 문구", image_prompt: "슬라이드 배경 이미지 생성 프롬프트" }],
      }),
      "슬라이드는 5~7장, 1장은 커버(훅), 마지막 장은 CTA로 구성하세요.",
      "해시태그는 # 없이 텍스트만 넣으세요.",
    ].join("\n"),
  },
  summarize: {
    instruction: [
      "아래 조사자료가 너무 깁니다. 글쓰기에 필요한 핵심만 남기고 요약하세요.",
      "- 사실/수치/고유명사/출처 URL은 반드시 보존",
      "- 중복과 군더더기 제거",
      "- 3000자 이내의 마크다운으로 출력",
    ].join("\n"),
  },
};

/** config.presets 오버라이드를 반영한 프리셋 조회 */
export function resolvePreset(styleKey, overrides = {}) {
  const merged = { ...STYLE_PRESETS, ...overrides };
  const preset = merged[styleKey];
  if (!preset) {
    const keys = Object.keys(merged).join(", ");
    throw new Error(`알 수 없는 스타일 프리셋: ${styleKey} (허용: ${keys})`);
  }
  return preset;
}
