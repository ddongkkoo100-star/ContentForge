// 내 글 톤 학습 — 기존 발행글 샘플에서 문체 지시문(프리셋)을 추출한다.
// LLM은 분석·요약만, 프리셋 저장은 결정적 로직 (§5.3).
import { SYSTEM_BASE } from "./presets.js";

export function buildToneLearnPrompt({ samples, name = "" }) {
  return {
    task: "learn-tone",
    system: SYSTEM_BASE,
    prompt: [
      "아래는 한 작성자가 실제로 발행한 글 샘플입니다.",
      "이 작성자의 문체를 분석해, 다른 글을 쓸 때 같은 문체를 재현할 수 있는 스타일 지시문을 만드세요.",
      "분석 관점: 어미(습니다/해요/반말), 문장 길이, 이모지·감탄사 사용, 도입/마무리 습관,",
      "1인칭 표현, 독자 호칭, 리스트/소제목 활용 습관, 자주 쓰는 연결어.",
      "",
      "다음 JSON 형식으로만 응답하세요:",
      JSON.stringify({
        label: name ? `${name}` : "짧은 프리셋 이름 (예: 담백한 존댓말)",
        prompt: "톤: 한 줄 요약.\n- 구체적 지시 4~7개 (불릿)",
      }),
      "",
      "<글 샘플>",
      samples,
      "</글 샘플>",
    ].join("\n"),
  };
}
