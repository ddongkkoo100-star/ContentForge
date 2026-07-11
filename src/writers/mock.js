// MockAdapter — 오프라인 데모/E2E용 결정적 고정 응답.
// 프롬프트 빌더가 넘기는 task 힌트에 따라 스키마에 맞는 JSON을 돌려준다.
import { WriterAdapter } from "./base.js";

const MOCK_OUTLINE = {
  title: "주말 나들이, 아이들과 함께한 하루",
  sections: [
    { heading: "가기 전에 알아둘 것", summary: "예약 방법, 주차, 준비물 등 방문 전 체크포인트" },
    { heading: "도착해서 처음 본 풍경", summary: "입구에서 받은 첫인상과 아이들의 반응" },
    { heading: "가장 좋았던 순간", summary: "핵심 체험 코스와 하이라이트 장면" },
    { heading: "아쉬웠던 점과 팁", summary: "동선/대기시간 등 아쉬움과 다음 방문자를 위한 팁" },
    { heading: "총평", summary: "재방문 의사와 별점, 추천 대상" },
  ],
};

const MOCK_BLOG_DRAFT = {
  titles: [
    "아이 셋과 다녀온 주말 나들이 솔직 후기",
    "주차부터 간식까지, 아이와 가기 전 꼭 알아야 할 5가지",
    "\"아빠 또 오자!\" 소리가 나온 주말 코스 공개",
  ],
  body_md: [
    "[IMG-01]",
    "",
    "## 가기 전에 알아둘 것",
    "주말 방문이라면 예약은 필수였어요. 조사해 보니 현장 발권은 30분 이상 대기가 기본이라, 미리 앱으로 예약하고 갔습니다.",
    "",
    "[IMG-02]",
    "",
    "## 도착해서 처음 본 풍경",
    "입구에 들어서자마자 첫째가 \"우와!\" 하고 소리를 질렀어요. 둘째와 막내도 손을 잡아끌더라고요.",
    "",
    "## 가장 좋았던 순간",
    "하이라이트는 단연 체험 코스였습니다. 아이들 눈높이에 맞춘 구성이라 1시간이 금방 지나갔어요.",
    "",
    "[IMG-03]",
    "",
    "## 아쉬웠던 점과 팁",
    "- 점심시간대 식당 대기가 길어요 → 11시 30분 전 입장 추천",
    "- 유모차 대여는 수량이 적으니 미리 확인",
    "",
    "## 총평",
    "다섯 식구 모두 만족한 하루였습니다. 재방문 의사 100%!",
  ].join("\n"),
  tags: ["주말나들이", "아이와가볼만한곳", "가족여행", "체험학습", "육아일상"],
  images: [
    { id: "IMG-01", role: "header", prompt: "따뜻한 오후 햇살 아래 가족 나들이 풍경, 밝고 화사한 사진 스타일" },
    { id: "IMG-02", role: "body", prompt: "체험 시설 입구의 활기찬 분위기, 자연광, 스냅 사진 스타일" },
    { id: "IMG-03", role: "body", prompt: "아이들이 체험 활동에 몰입한 장면, 아늑한 색감" },
  ],
  thumbnail: "IMG-01",
};

const MOCK_INSTA_DRAFT = {
  caption: [
    "아이 셋 아빠가 직접 다녀온 주말 코스 🧡",
    "",
    "예약 꿀팁부터 점심 대기 피하는 법까지,",
    "저장해 두면 주말 계획이 10분 만에 끝나요.",
    "",
    "👉 저장하고 이번 주말에 바로 써먹기!",
  ].join("\n"),
  hashtags: {
    popular: ["주말나들이", "아이와가볼만한곳", "가족여행", "육아스타그램", "주말데이트", "국내여행", "여행스타그램"],
    mid: ["아이와주말", "체험학습추천", "가족나들이", "아이랑여행", "주말계획", "육아일상공유", "키즈여행"],
    niche: ["세아이아빠", "1n3아빠로그", "다둥이나들이", "아빠육아일기", "우리동네나들이", "예약꿀팁", "주차꿀팁"],
  },
  slides: [
    { no: 1, text: "아이 셋과 주말 나들이, 이렇게 다녀왔어요", image_prompt: "밝은 가족 나들이 커버 이미지, 여백 있는 구성" },
    { no: 2, text: "예약은 앱으로 — 현장 대기 30분 아끼기", image_prompt: "스마트폰으로 예약하는 손, 클로즈업" },
    { no: 3, text: "11:30 전 점심 — 식당 웨이팅 제로", image_prompt: "한적한 식당 내부, 따뜻한 톤" },
    { no: 4, text: "하이라이트: 아이 눈높이 체험 코스", image_prompt: "체험 활동에 몰입한 아이들, 생동감" },
    { no: 5, text: "저장해 두고 이번 주말에 바로 가기", image_prompt: "CTA 마무리 이미지, 차분한 배경" },
  ],
};

export class MockAdapter extends WriterAdapter {
  name = "mock";

  async isAvailable() {
    return { available: true, version: "mock" };
  }

  async generate({ prompt = "", task = "" }) {
    const started = Date.now();
    let payload;
    switch (task) {
      case "outline":
        payload = JSON.stringify(MOCK_OUTLINE, null, 2);
        break;
      case "draft-blog":
        payload = JSON.stringify(MOCK_BLOG_DRAFT, null, 2);
        break;
      case "draft-insta":
        payload = JSON.stringify(MOCK_INSTA_DRAFT, null, 2);
        break;
      case "summarize":
        payload = `(mock 요약) 조사자료 ${prompt.length.toLocaleString()}자를 핵심 논점 5개로 요약했습니다.`;
        break;
      default:
        payload = `(mock 응답) task=${task || "unknown"}`;
    }
    return { text: payload, meta: { engine: this.name, elapsedMs: Date.now() - started, task } };
  }
}
