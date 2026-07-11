// 최소 마크다운 → HTML 변환기 — 네이버 스마트에디터 붙여넣기용.
// 단순 태그(h2,h3,p,ul,ol,blockquote,b,i,a,br)만 사용한다 (§6 호환성 리스크 대응).

function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function inline(s) {
  return escapeHtml(s)
    .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
    .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<i>$2</i>")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2">$1</a>');
}

const isTableRow = (line) => /^\s*\|.+\|\s*$/.test(line);
const isTableSep = (line) => /^\s*\|[\s:|-]+\|\s*$/.test(line);
const splitCells = (line) => line.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());

export function mdToHtml(md = "") {
  const lines = md.split("\n");
  const out = [];
  let list = null; // "ul" | "ol" | null
  const closeList = () => {
    if (list) {
      out.push(`</${list}>`);
      list = null;
    }
  };
  for (let li = 0; li < lines.length; li++) {
    const raw = lines[li];
    const line = raw.trimEnd();
    // 표: 헤더 | 구분선 | 데이터 행들 (상품리뷰 스펙 표 등)
    if (isTableRow(line) && isTableSep(lines[li + 1] ?? "")) {
      closeList();
      out.push("<table border=\"1\">");
      out.push(`<tr>${splitCells(line).map((c) => `<th>${inline(c)}</th>`).join("")}</tr>`);
      li += 2;
      while (li < lines.length && isTableRow(lines[li])) {
        out.push(`<tr>${splitCells(lines[li]).map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`);
        li++;
      }
      li--; // for 루프 증가 보정
      out.push("</table>");
      continue;
    }
    const h = line.match(/^(#{1,4})\s+(.+)$/);
    if (h) {
      closeList();
      const level = Math.min(Math.max(h[1].length, 2), 3); // 네이버용으로 h2/h3만
      out.push(`<h${level}>${inline(h[2])}</h${level}>`);
      continue;
    }
    const ul = line.match(/^\s*[-*]\s+(.+)$/);
    if (ul) {
      if (list !== "ul") {
        closeList();
        out.push("<ul>");
        list = "ul";
      }
      out.push(`<li>${inline(ul[1])}</li>`);
      continue;
    }
    const ol = line.match(/^\s*\d+[.)]\s+(.+)$/);
    if (ol) {
      if (list !== "ol") {
        closeList();
        out.push("<ol>");
        list = "ol";
      }
      out.push(`<li>${inline(ol[1])}</li>`);
      continue;
    }
    const bq = line.match(/^>\s?(.*)$/);
    if (bq) {
      closeList();
      out.push(`<blockquote>${inline(bq[1])}</blockquote>`);
      continue;
    }
    if (line.trim() === "") {
      closeList();
      continue;
    }
    closeList();
    out.push(`<p>${inline(line)}</p>`);
  }
  closeList();
  return out.join("\n");
}
