// 공정위(표시광고법) 표시문구 — 결정적 로직 (§5.3).
// 협찬/대여 글의 미표기는 제재 대상이므로 export 시 자동 삽입한다.
export const DISCLOSURES = ["none", "self-paid", "sponsored", "loan"];

export const DISCLOSURE_LABELS = {
  none: "해당 없음",
  "self-paid": "내돈내산",
  sponsored: "협찬 (제품/원고료 제공)",
  loan: "대여 (체험 후 반납)",
};

/** 블로그 본문 상단에 넣을 표시 문단. none이면 null. */
export function blogDisclosureText(kind) {
  switch (kind) {
    case "sponsored":
      return "※ 이 포스팅은 업체로부터 제품(또는 원고료)을 제공받아 작성한 후기입니다.";
    case "loan":
      return "※ 이 포스팅은 제품을 대여받아 체험 후 작성한 후기이며, 제품은 반납했습니다.";
    case "self-paid":
      return "※ 이 글은 직접 구매하여 작성한 내돈내산 후기입니다.";
    default:
      return null;
  }
}

/**
 * 인스타 캡션/해시태그 표시 규칙.
 * 공정위 지침상 광고는 첫 줄에 명확히 표기해야 한다.
 * @returns {{captionPrefix: string|null, leadHashtags: string[]}}
 */
export function instaDisclosure(kind) {
  switch (kind) {
    case "sponsored":
      return { captionPrefix: "[광고] 제품(원고료)을 제공받아 작성한 콘텐츠입니다.", leadHashtags: ["광고", "협찬"] };
    case "loan":
      return { captionPrefix: "[광고] 제품을 대여받아 체험 후 작성한 콘텐츠입니다.", leadHashtags: ["광고"] };
    case "self-paid":
      return { captionPrefix: null, leadHashtags: ["내돈내산"] };
    default:
      return { captionPrefix: null, leadHashtags: [] };
  }
}
