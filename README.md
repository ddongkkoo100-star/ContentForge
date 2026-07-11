# ContentForge

조사자료(md/txt/이미지)를 넣으면 **구독 기반 CLI**(Claude Code / Codex)로 글을 쓰고, **ima2-gen(OAuth 모드)**으로 이미지를 생성해 **네이버 블로그 초안 + 인스타그램 패키지**를 만들어주는 로컬 웹 앱.

- **API 과금 없음** — 글쓰기는 CLI 구독(Claude Max / ChatGPT), 이미지는 ima2-gen OAuth(ChatGPT Plus/Pro)
- **자동 발행 없음** — 승인 도장을 찍기 전에는 export가 열리지 않습니다 (사람 최종 승인 게이트)
- **Mock 모드 우선** — CLI/OAuth 없이도 전체 흐름 데모 가능 (기본값)

## 설치 & 실행

```bash
npm install
npm start           # http://localhost:4444
npm run doctor      # 엔진 진단 (claude/codex/ima2-gen/node)
npm test            # 전체 테스트 (mock E2E 포함)
```

요구사항: Node.js ≥ 18. 실 엔진 사용 시:

| 엔진 | 준비 |
|---|---|
| `claude` | [Claude Code](https://claude.com/claude-code) 설치 + 로그인 (Max 구독) |
| `codex` | `npm i -g @openai/codex` + `codex login` (ChatGPT 구독) |
| `ima2` | 자동 기동됨 (`npx ima2-gen serve`) + `npx @openai/codex login` (OAuth) |

## 사용 흐름 (제작 라인)

```
① 자료 → ② 개요 → ③ 초안 → ④ 이미지 → ⑤ 승인 → Export
```

1. **새 작업** 생성 (매체: 블로그/인스타, 스타일: `family-log`/`info`/`review`/`product-review`, 협찬 여부)
2. 조사자료를 드롭존에 끌어다 놓기 (md/txt/이미지, 50KB 초과 시 자동 사전 요약)
3. 각 단계는 확인 후 직접 진행 — 개요/초안은 **재생성**(diff 하이라이트)과 **직접 수정** 가능
4. 이미지 셀에 마우스를 올려 **재생성 / 프롬프트 편집**
5. 승인 단계의 **발행 전 품질 점검**(제목 길이·분량·이미지 배치·과장 표현·공정위 표시)을 확인하고 **승인 도장**을 찍으면 Export가 활성화 → `output/` 아래 패키지 생성

### 공정위 표시문구 자동 삽입

새 작업에서 협찬 여부(내돈내산/협찬/대여)를 선택하면 export 시 자동 삽입됩니다:

- 블로그: 본문 최상단에 표시 문단 (예: "※ 이 포스팅은 업체로부터 제품을 제공받아…")
- 인스타: 캡션 첫 줄 `[광고]` 표기 + `#광고` `#협찬` 해시태그를 맨 앞에 배치
- 본문에 협찬 정황이 있는데 설정이 "해당 없음"이면 품질 점검에서 **fail**로 경고

### 출력 패키지

```
output/<project>-blog/            output/<project>-insta/
├── post.md                       ├── caption.txt
├── post.html   (스마트에디터용)   ├── hashtags.txt (인기/중간/틈새 3단)
├── images/01-header.png …        ├── carousel/slide-01.png …
├── image-map.md ([IMG-01] 매핑)  └── slides.md (문구는 이미지에 굽지 않음)
└── meta.md     (제목 3안/태그/썸네일)
```

## 설정

`config.json` (환경변수 `CONTENTFORGE_PORT/WRITER/IMAGE/WORKSPACE/OUTPUT`이 우선):

```json
{
  "server": { "port": 4444 },
  "writer": { "engine": "mock", "timeoutMs": 300000, "maxRetries": 2 },
  "image": { "engine": "mock", "baseUrl": "http://localhost:3333", "quality": "medium" },
  "presets": { "my-style": { "label": "커스텀", "prompt": "톤 지시…" } }
}
```

- 엔진은 UI 우상단 **엔진 설정**에서도 전환 가능 (미설치 CLI로는 전환이 차단됨)
- 이미지 **API Key 모드**는 장당 과금 — danger 확인 다이얼로그를 거쳐야만 켜집니다 (기본 OAuth)
- 스타일 프리셋은 `presets` 키로 추가/덮어쓰기

## 프라이버시 & 안전

- 조사자료는 로컬 `workspace/`에만 저장, 외부 전송은 Writer CLI 호출과 ima2-gen(localhost)뿐
- Writer CLI는 빈 임시 디렉토리에서 실행 + "파일 생성 금지" 지시 — 프로젝트 오염 방지
- CLI JSON 출력 불안정 대비: plain text 폴백 + 재시도 2회

## 로컬 수동 검증 체크리스트

개발 환경(원격 컨테이너)에서 검증하지 못한 항목 — 로컬에서 1회 확인 필요:

- [ ] **ima2-gen OAuth 실 이미지 생성** — `npx @openai/codex login` 후 이미지 엔진을 `ima2`로 전환해 1장 생성 (상태바 OAuth 배지가 앰버인지 확인)
- [ ] **codex CLI 어댑터** — `codex login` 후 글쓰기 엔진을 `codex`로 전환해 개요 1회 생성
- [ ] **네이버 스마트에디터 붙여넣기** — `post.html`을 브라우저에서 열어 전체 복사 → 붙여넣기, 서식(소제목/리스트/인용) 유지 확인
- [x] claude CLI 어댑터 — 실 검증 완료 (개요 + 본문 + 프리셋 3종)
- [x] mock 모드 풀 라운드트립 — 자동 테스트 + 브라우저 스모크 완료

## 개발

```
src/writers/    Writer 어댑터 (claude/codex/mock) — base.js 인터페이스
src/prompts/    프리셋·프롬프트 빌더·JSON 파서(폴백)
src/pipeline/   상태 머신(INTAKE→…→EXPORTED) + state.json 영속화
src/image/      ima2-gen 프록시(자동 기동) + mock PNG 생성기
src/export/     블로그/인스타 패키지 출력 (결정적 로직)
public/         편집실(Editorial Desk) 다크 UI — §디자인 토큰 9색만 사용
tests/          node:test — 유닛 + mock E2E
```
