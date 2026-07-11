// URL → 조사자료 변환 — 의존성 없이 HTML에서 본문 텍스트를 추출한다.
// 조사 단계 단축용. 로컬에서 직접 fetch하므로 외부 전송은 대상 페이지뿐 (§5.5).

const MAX_BYTES = 2 * 1024 * 1024;
const BLOCK_TAGS = "p|div|section|article|li|br|h[1-6]|tr|blockquote|pre|figcaption";

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", middot: "·", hellip: "…", rsquo: "'", lsquo: "'", rdquo: '"', ldquo: '"' };

function decodeEntities(s) {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-zA-Z]+);/g, (m, name) => ENTITIES[name] ?? m);
}

/** HTML → 제목 + 본문 텍스트 */
export function htmlToText(html) {
  const title = decodeEntities(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "").trim();
  let body = html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style|noscript|svg|nav|header|footer|aside|form)[\s\S]*?<\/\1>/gi, "")
    .replace(new RegExp(`</?(?:${BLOCK_TAGS})[^>]*>`, "gi"), "\n")
    .replace(/<[^>]+>/g, " ");
  body = decodeEntities(body)
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
  return { title, text: body };
}

/**
 * URL을 가져와 조사자료 마크다운으로 변환.
 * @returns {Promise<{filename: string, markdown: string, title: string}>}
 */
export async function fetchUrlAsMaterial(url, { fetchImpl = fetch } = {}) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw Object.assign(new Error(`올바른 URL이 아닙니다: ${url}`), { status: 400 });
  }
  if (!/^https?:$/.test(parsed.protocol)) {
    throw Object.assign(new Error("http/https URL만 지원합니다"), { status: 400 });
  }
  let res;
  try {
    res = await fetchImpl(url, {
      signal: AbortSignal.timeout(15_000),
      redirect: "follow",
      headers: { "User-Agent": "Mozilla/5.0 (ContentForge; local research tool)" },
    });
  } catch (err) {
    throw Object.assign(new Error(`페이지를 가져오지 못했습니다: ${err.message}`), { status: 502 });
  }
  if (!res.ok) throw Object.assign(new Error(`페이지 응답 오류: HTTP ${res.status}`), { status: 502 });
  const ctype = res.headers.get("content-type") ?? "";
  if (!/text\/html|text\/plain|application\/xhtml/.test(ctype)) {
    throw Object.assign(new Error(`텍스트 페이지가 아닙니다 (${ctype || "unknown"})`), { status: 415 });
  }
  const raw = Buffer.from(await res.arrayBuffer());
  if (raw.length > MAX_BYTES) {
    throw Object.assign(new Error(`페이지가 너무 큽니다 (${Math.round(raw.length / 1024)}KB > 2MB)`), { status: 413 });
  }
  const html = raw.toString("utf-8");
  const { title, text } = ctype.includes("plain") ? { title: "", text: html } : htmlToText(html);
  if (text.replace(/\s/g, "").length < 80) {
    throw Object.assign(
      new Error("본문 추출 실패 — 스크립트 렌더링 페이지일 수 있습니다. 내용을 복사해 md/txt로 넣어주세요"),
      { status: 422 },
    );
  }
  const host = parsed.hostname.replace(/^www\./, "").replace(/[^a-z0-9.-]/gi, "");
  const filename = `url-${host}-${Date.now().toString(36)}.md`;
  const markdown = [`# ${title || host}`, "", `출처: ${url}`, "", text].join("\n");
  return { filename, markdown, title: title || host };
}
