// CLI 응답 파서 — JSON 우선, 실패 시 plain text 폴백 (리스크 대응 §6).
// CLI 출력에는 종종 ```json 펜스나 앞뒤 잡담이 섞이므로 방어적으로 추출한다.

/** 텍스트에서 첫 번째 유효 JSON 객체를 추출한다. 실패 시 null. */
export function extractJson(text = "") {
  const trimmed = text.trim();
  // 1) 통짜 JSON
  try {
    return JSON.parse(trimmed);
  } catch {
    /* 계속 */
  }
  // 2) ```json ... ``` 펜스
  const fence = trimmed.match(/```(?:json)?\s*\n([\s\S]*?)\n\s*```/);
  if (fence) {
    try {
      return JSON.parse(fence[1]);
    } catch {
      /* 계속 */
    }
  }
  // 3) 첫 { 부터 균형 잡힌 닫는 } 까지
  const start = trimmed.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < trimmed.length; i++) {
    const ch = trimmed[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      escaped = true;
      continue;
    }
    if (ch === '"') inString = !inString;
    if (inString) continue;
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(trimmed.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

/** 개요 파싱 — JSON 실패 시 마크다운 헤딩 폴백 */
export function parseOutline(text) {
  const json = extractJson(text);
  if (json && Array.isArray(json.sections) && json.sections.length > 0) {
    return {
      title: String(json.title ?? "제목 없음"),
      sections: json.sections.map((s) => ({
        heading: String(s.heading ?? s.title ?? ""),
        summary: String(s.summary ?? ""),
      })),
      _fallback: false,
    };
  }
  // 폴백: "## 소제목" 또는 "1. 소제목" 라인을 섹션으로
  const lines = text.split("\n");
  const sections = [];
  for (const line of lines) {
    const m = line.match(/^\s*(?:#{2,3}|\d+[.)])\s+(.+)$/);
    if (m) sections.push({ heading: m[1].trim(), summary: "" });
  }
  if (sections.length === 0) throw new Error("개요 파싱 실패 — JSON도 헤딩 구조도 찾지 못했습니다");
  return { title: lines.find((l) => l.trim())?.replace(/^#\s*/, "").trim() ?? "제목 없음", sections, _fallback: true };
}

/** 블로그 초안 파싱 — JSON 실패 시 전체 텍스트를 본문으로 취급 */
export function parseBlogDraft(text) {
  const json = extractJson(text);
  if (json && typeof json.body_md === "string" && json.body_md.trim()) {
    return {
      titles: Array.isArray(json.titles) && json.titles.length ? json.titles.map(String) : ["제목 없음"],
      body_md: json.body_md,
      tags: Array.isArray(json.tags) ? json.tags.map(String) : [],
      images: Array.isArray(json.images)
        ? json.images.map((img, i) => ({
            id: String(img.id ?? `IMG-${String(i + 1).padStart(2, "0")}`),
            role: img.role === "header" ? "header" : "body",
            prompt: String(img.prompt ?? ""),
          }))
        : [],
      thumbnail: typeof json.thumbnail === "string" ? json.thumbnail : null,
      _fallback: false,
    };
  }
  const body = text.trim();
  if (!body) throw new Error("초안 파싱 실패 — 빈 응답");
  const firstHeading = body.match(/^#{1,2}\s+(.+)$/m);
  return {
    titles: [firstHeading ? firstHeading[1].trim() : "제목 없음"],
    body_md: body,
    tags: [],
    images: [],
    thumbnail: null,
    _fallback: true,
  };
}

/** 릴스 대본 파싱 — JSON 실패 시 전체 텍스트를 대본으로 취급 */
export function parseReelsDraft(text) {
  const json = extractJson(text);
  if (json && Array.isArray(json.scenes) && json.scenes.length > 0) {
    const tier = (arr) => (Array.isArray(arr) ? arr.map((t) => String(t).replace(/^#/, "")) : []);
    return {
      hook: String(json.hook ?? ""),
      cover_text: String(json.cover_text ?? ""),
      scenes: json.scenes.map((s, i) => ({
        no: Number(s.no ?? i + 1),
        seconds: Number(s.seconds ?? 5),
        scene: String(s.scene ?? ""),
        overlay: String(s.overlay ?? ""),
        voiceover: String(s.voiceover ?? ""),
      })),
      cta: String(json.cta ?? ""),
      caption: String(json.caption ?? json.hook ?? ""),
      hashtags: {
        popular: tier(json.hashtags?.popular),
        mid: tier(json.hashtags?.mid),
        niche: tier(json.hashtags?.niche),
      },
      cover_image_prompt: String(json.cover_image_prompt ?? ""),
      _fallback: false,
    };
  }
  const raw = text.trim();
  if (!raw) throw new Error("릴스 대본 파싱 실패 — 빈 응답");
  return {
    hook: raw.split("\n")[0] ?? "",
    cover_text: "",
    scenes: [{ no: 1, seconds: 30, scene: "(파싱 폴백 — 대본 전문 참고)", overlay: "", voiceover: raw }],
    cta: "",
    caption: raw,
    hashtags: { popular: [], mid: [], niche: [] },
    cover_image_prompt: "",
    _fallback: true,
  };
}

/** 인스타 초안 파싱 — JSON 실패 시 전체 텍스트를 캡션으로 취급 */
export function parseInstaDraft(text) {
  const json = extractJson(text);
  if (json && typeof json.caption === "string" && json.caption.trim()) {
    const tier = (arr) => (Array.isArray(arr) ? arr.map((t) => String(t).replace(/^#/, "")) : []);
    const slides = Array.isArray(json.slides)
      ? json.slides.map((s, i) => ({
          no: Number(s.no ?? i + 1),
          text: String(s.text ?? ""),
          image_prompt: String(s.image_prompt ?? ""),
        }))
      : [];
    return {
      caption: json.caption,
      hashtags: {
        popular: tier(json.hashtags?.popular),
        mid: tier(json.hashtags?.mid),
        niche: tier(json.hashtags?.niche),
      },
      slides,
      _fallback: false,
    };
  }
  const caption = text.trim();
  if (!caption) throw new Error("인스타 초안 파싱 실패 — 빈 응답");
  return { caption, hashtags: { popular: [], mid: [], niche: [] }, slides: [], _fallback: true };
}
