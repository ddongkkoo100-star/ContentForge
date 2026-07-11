// 발행 전 품질 점검 — 순수 결정적 로직 (§5.3), LLM 미사용.
// 승인 카드(⑤)에 표시되어 사람의 최종 판단을 돕는다. 차단하지 않는다 —
// 단, sponsored/loan 미표기(fail)는 법적 리스크이므로 UI에서 danger로 강조된다.
// 과장 광고로 지적되기 쉬운 표현 (근거 없이 쓰면 심의 리스크)
const HYPE_WORDS = ["최고", "인생템", "무조건", "100%", "완벽", "국내 유일", "최저가", "부작용 없"];

const check = (id, level, label, detail = "") => ({ id, level, label, detail });

function checkBlog(state, draft) {
  const checks = [];
  const body = draft.body_md ?? "";
  const title = draft.titles?.[0] ?? "";

  // 제목 길이 — 네이버 검색 노출 기준 15~40자 권장
  checks.push(
    title.length >= 15 && title.length <= 40
      ? check("title-len", "pass", "제목 길이", `${title.length}자`)
      : check("title-len", "warn", "제목 길이", `${title.length}자 — 15~40자 권장`),
  );

  // 본문 분량
  const len = body.replace(/\s+/g, " ").length;
  checks.push(
    len >= 1000
      ? check("body-len", "pass", "본문 분량", `약 ${len.toLocaleString()}자`)
      : check("body-len", "warn", "본문 분량", `약 ${len.toLocaleString()}자 — 1,000자 이상 권장`),
  );

  // 소제목 구조
  const headings = (body.match(/^#{2,3}\s/gm) ?? []).length;
  checks.push(
    headings >= 3
      ? check("headings", "pass", "소제목 구조", `${headings}개`)
      : check("headings", "warn", "소제목 구조", `${headings}개 — 3개 이상 권장`),
  );

  // 이미지 배치 — 생성 완료 여부 + 본문 대비 밀도
  const placeholders = (body.match(/\[IMG-\d{2}\]/g) ?? []).length;
  const done = state.images.filter((i) => i.status === "done").length;
  if (placeholders === 0) {
    checks.push(check("images", "warn", "이미지 배치", "본문에 이미지 플레이스홀더가 없습니다"));
  } else if (done < state.images.length) {
    checks.push(check("images", "warn", "이미지 배치", `${done}/${state.images.length}장 생성됨 — 미생성 이미지 있음`));
  } else {
    const per = Math.round(len / Math.max(placeholders, 1));
    checks.push(
      per <= 1200
        ? check("images", "pass", "이미지 배치", `${placeholders}장, 약 ${per.toLocaleString()}자당 1장`)
        : check("images", "warn", "이미지 배치", `약 ${per.toLocaleString()}자당 1장 — 800~1,000자당 1장 권장`),
    );
  }
  return checks;
}

function checkInsta(state, draft) {
  const checks = [];
  const caption = draft.caption ?? "";

  // 캡션 — 인스타 제한 2,200자, 첫 줄 훅
  checks.push(
    caption.length <= 2200
      ? check("caption-len", "pass", "캡션 길이", `${caption.length}자`)
      : check("caption-len", "fail", "캡션 길이", `${caption.length}자 — 인스타 제한 2,200자 초과`),
  );
  const hook = caption.split("\n")[0] ?? "";
  checks.push(
    hook.length > 0 && hook.length <= 40
      ? check("hook", "pass", "첫 줄 훅", `${hook.length}자`)
      : check("hook", "warn", "첫 줄 훅", `${hook.length}자 — 40자 이내 권장 (미리보기 잘림)`),
  );

  // 해시태그 20~30개
  const ht = draft.hashtags ?? {};
  const total = (ht.popular?.length ?? 0) + (ht.mid?.length ?? 0) + (ht.niche?.length ?? 0);
  checks.push(
    total >= 20 && total <= 30
      ? check("hashtags", "pass", "해시태그", `${total}개 (3단 구성)`)
      : check("hashtags", "warn", "해시태그", `${total}개 — 20~30개 권장`),
  );

  // 슬라이드 수 + 이미지 생성 여부
  const slides = draft.slides?.length ?? 0;
  const done = state.images.filter((i) => i.status === "done").length;
  checks.push(
    slides >= 5 && slides <= 7
      ? check("slides", "pass", "슬라이드", `${slides}장`)
      : check("slides", "warn", "슬라이드", `${slides}장 — 5~7장 권장`),
  );
  if (done < state.images.length) {
    checks.push(check("slide-images", "warn", "슬라이드 이미지", `${done}/${state.images.length}장 생성됨`));
  }
  return checks;
}

function checkReels(state, draft) {
  const checks = [];
  const hook = draft.hook ?? "";
  checks.push(
    hook.length > 0 && hook.length <= 30
      ? check("hook", "pass", "훅", `${hook.length}자`)
      : check("hook", "warn", "훅", `${hook.length}자 — 30자 이내 한 문장 권장`),
  );
  const scenes = draft.scenes?.length ?? 0;
  checks.push(
    scenes >= 4 && scenes <= 8
      ? check("scenes", "pass", "장면 수", `${scenes}개`)
      : check("scenes", "warn", "장면 수", `${scenes}개 — 4~8개 권장`),
  );
  const totalSec = (draft.scenes ?? []).reduce((s, x) => s + (x.seconds || 0), 0);
  checks.push(
    totalSec > 0 && totalSec <= 60
      ? check("duration", "pass", "총 길이", `약 ${totalSec}초`)
      : check("duration", totalSec > 90 ? "fail" : "warn", "총 길이", `약 ${totalSec}초 — 60초 이내 권장`),
  );
  const longOverlays = (draft.scenes ?? []).filter((s) => (s.overlay ?? "").length > 12).length;
  checks.push(
    longOverlays === 0
      ? check("overlay", "pass", "자막 길이", "전부 12자 이내")
      : check("overlay", "warn", "자막 길이", `${longOverlays}개 장면의 자막이 12자 초과`),
  );
  const ht = draft.hashtags ?? {};
  const total = (ht.popular?.length ?? 0) + (ht.mid?.length ?? 0) + (ht.niche?.length ?? 0);
  checks.push(
    total >= 20 && total <= 30
      ? check("hashtags", "pass", "해시태그", `${total}개`)
      : check("hashtags", "warn", "해시태그", `${total}개 — 20~30개 권장`),
  );
  return checks;
}

export function runQualityChecks(state) {
  const draft = state.draft?.current;
  if (!draft) return [check("no-draft", "warn", "초안 없음", "점검할 초안이 없습니다")];

  const checkers = { blog: checkBlog, insta: checkInsta, reels: checkReels };
  const checks = (checkers[state.mode] ?? checkBlog)(state, draft);
  const text = state.mode === "blog" ? (draft.body_md ?? "") : (draft.caption ?? "");

  // 과장 표현 — 심의/신뢰도 리스크
  const hits = HYPE_WORDS.filter((w) => text.includes(w));
  checks.push(
    hits.length === 0
      ? check("hype", "pass", "과장 표현", "감지되지 않음")
      : check("hype", "warn", "과장 표현", `발견: ${hits.join(", ")} — 근거 제시 또는 완화 권장`),
  );

  // 공정위 표시 — 협찬/대여인데 표시 설정이 none이면 fail
  if (state.disclosure === "none") {
    const adLike = /협찬|제공받|원고료|대여받/.test(text);
    checks.push(
      adLike
        ? check("disclosure", "fail", "공정위 표시", "본문에 협찬 정황이 있는데 표시문구 설정이 '해당 없음'입니다")
        : check("disclosure", "pass", "공정위 표시", "해당 없음"),
    );
  } else {
    const label = state.mode === "blog" ? "본문 상단에 자동 삽입됨" : "캡션 첫 줄에 자동 삽입됨";
    checks.push(check("disclosure", "pass", "공정위 표시", `${state.disclosure} — export 시 ${label}`));
  }
  return checks;
}
