# 아키텍처: 화면 디자인·라우트·편집 UI·UI 언어

데스크탑 앱(`apps/desktop`) 기준. 목차와 다른 주제는 `references/architecture.md`.

## UI 언어 (2026-09-25)

사용자 요청으로 설정에 **UI 언어** 항목을 둔다. 기본은 한국어이고 영어를 고를 수 있다. 이 설정은 **화면 문구·메뉴바·main이 renderer로 보내는 오류 문구**의 언어이지,
인식·요약 언어가 아니다 — whisper의 `-l ko`, 요약·용어 초안 프롬프트, 교정의 한글 읽기 판정은 어느 언어를 골라도 한국어 회의를 전제로 그대로 돈다.
문서·커밋 메시지·코드 주석도 계속 한국어다.

### 사전과 타입

- 문구는 **`src/shared/locales/<domain>.ts`** 에 도메인별로 둔다. 한 파일이 `ko`와 `en`을 **나란히** export하고, `ko`가 타입을 정의하며 `en`은 `typeof ko`로 묶인다.
  한쪽 언어에만 키를 추가하면 타입 오류가 난다 — 번역 누락을 컴파일로 잡는다. 두 언어를 한 파일에 두는 이유는 문구를 고칠 때 대응하는 번역이 바로 옆에 보여야 하기 때문이다.
- 값이 들어가는 문구는 문자열 템플릿이 아니라 **함수**다 (`deletedCount: ({ count }) => `${count}개 삭제됨``). 어순이 언어마다 달라 `{count}` 치환 규약을 따로 만들지 않는다.
- 도메인 파일: `common`(버튼·공통 오류), `sidebar`(회의 목록·검색·날짜 묶음), `transcript`(회의록·화자·하단 녹음 바), `summary`, `refine`, `pipeline`(단계 라벨), `recording`(녹음 화면), `models`(온보딩·모델 다운로드), `settings`(설정 카테고리·토글·단축키), `llm`, `glossary`, `update`, `main`(메뉴바·main 프로세스 오류).
  `src/shared/i18n.ts`가 이들을 `MESSAGES: Record<Locale, Messages>`로 모으고 `Locale`(`'ko' | 'en'`)·`DEFAULT_LOCALE`·`isLocale`을 정의한다.
- 사전 파일은 데이터라 **400줄 제한의 예외**다. 대신 도메인이 커지면 파일을 나눈다.
- i18n 라이브러리(i18next 등)는 도입하지 않는다 — 두 언어·수백 문구에 키 문자열 조회·복수형 규칙·지연 로드가 필요 없고, 타입으로 누락을 잡는 쪽이 낫다.

### renderer

- 전역 컨텍스트 `shared/provider/context/localeContext`(`.claude/rules/project-structure.md` "Context / Provider / Routes")가 `LocaleProvider`·`useLocale`을 한 파일에 둔다.
  `useLocale()`은 `{ locale, t }`를 돌려주고 `t`는 그 언어의 `Messages`다. 컴포넌트는 `t.settings.title`처럼 읽는다.
- 컨텍스트 기본값은 한국어 사전이다. 그래서 통합 테스트는 Provider 없이도 한국어 문구를 그대로 검증한다.
- Provider는 마운트 시 `settings:get`으로 언어를 읽고, 이후에는 push 채널 **`settings:changed`** 를 구독한다. 녹음 호스트 창은 메인 창과 다른 창이라 설정 화면이 바꾼 값을 push로만 알 수 있다(오류 문구 언어).
  Provider는 `document.documentElement.lang`도 함께 맞춘다 (`index.html`의 기본은 `ko`).
- 날짜·경과 시간 포맷터(`shared/utils/formatMeetingDate`, `meetingDateGroup`, `formatDuration`)는 `locale`을 인자로 받는다. "오늘"·"어제" 같은 묶음 라벨은 사전에서 읽는다.

### main

- `src/main/locale.ts`의 `t()`가 현재 언어의 사전을 돌려준다. 이 모듈은 DB를 읽지 않는다 — 앱 시작 시 `setCurrentLocale(getAppSettings().locale)`로 넣고
  `settings:update` 핸들러가 바꾼다. 순수 로직(파이프라인·업데이트 결과 해석)이 오류 문구 하나 때문에 DB·electron에 묶이면 단위 테스트가 깨지기 때문이다. 메뉴바 메뉴·저장 대화상자·**renderer가 그대로 보여 주는 오류 메시지**(`throw new Error(...)`)는 던지는 시점에 이 사전으로 만든다.
  파이프라인 오류처럼 DB(`meetings.error_message`)에 남는 문구는 그 시점 언어로 저장되고 언어를 바꿔도 다시 번역하지 않는다 — 오류는 재시도하면 새로 쓰인다.
- `settings:update`가 언어를 바꾸면 main은 메뉴바 메뉴를 다시 만들고(`refreshTray`) 모든 창에 `settings:changed`를 push한다.
- 운영 로그(`src/main/log.ts`)와 LLM 프롬프트는 번역하지 않는다.

### 범위 밖

- `apps/web` 브라우저 프로토타입은 한국어만 유지한다.
- macOS 시스템 대화상자 문구(`NSMicrophoneUsageDescription`)는 `electron-builder.yml`의 한국어 하나다. 영어 `InfoPlist.strings`는 후속 과제다.

## 화면 디자인 (knot 리디자인, 2026-09-28)

2026-09-28 사용자 요청으로 Figma `knot` 파일의 "UI/UX Policy Guidelines" 페이지(knot v2 정책 보드)를 근거로 다시 그렸다.
2026-09-24 "여백" 시안(흰 바탕·인디고 강조·사이드바 두 칸)을 대체한다. 시안은 참고 자료이고, 값·구조의 근거는 이 절이다.
사용자 결정: **비주얼 + 레이아웃**을 가져오고(화면 흐름 전체는 아님), **다크 모드는 없앤다**.
knot의 계정·워크스페이스·팀원 초대·문서 확인·AI 탐색은 서버·계정이 필요해 가져오지 않는다 (SKILL.md 4절 "범위 절제").

### 디자인 토큰 (`packages/design/src/base.css`)

색·간격·반경·그림자·글꼴은 `:root` CSS 변수로만 쓴다 (`.claude/rules/general-code-convention.md`). 기존 변수 이름은 유지하고 값만 바꾸며, 모자란 것만 추가한다.

**토큰과 글꼴은 `@meeting-stt/design` 패키지가 단일 정의다** (`references/monorepo.md` "디자인 패키지"). 브라우저 프로토타입(`apps/web`)도 같은 토큰·글꼴을 import한다.
데스크탑 전용 레이아웃 치수(`--gnb-top` 24px, `--gnb-height` 44px, `--dock-zone` 108px, `--sidebar-width` 240px, `--rail-width` 300px)는 `assets/layout.css`에 둔다. `--rail-width`는 기본값이고, 회의 상세에서 사용자가 끌어 바꾼 폭이 인라인 변수로 덮어쓴다 ("화면별 구성").

knot 변수 이름(`Neutral/50`~`900`, `Primary`, `Sub/Accent-500`, `Sub/Warning-600`)을 괄호에 적는다.

| 변수 | 값 | 용도 |
| --- | --- | --- |
| `--color-bg` | `#FAF9F7` (Neutral/50) | 창 바탕. 카드는 흰색으로 그 위에 뜬다 |
| `--color-sidebar` | `#F4F2EE` (Neutral/100) | 옅은 면 — 선택·hover 행, 길이 칩, 스테퍼 버튼, 배지. 이름은 역사적이다 (사이드바 바탕이 아님) |
| `--color-surface` | `#FFFFFF` (Neutral/0) | 카드·입력·GNB·목록 패널 |
| `--color-surface-hover` | `#F4F2EE` (Neutral/100) | hover |
| `--color-border` | `#E9E6E1` (Neutral/200) | 선, 보조 버튼 테두리 |
| `--color-border-strong` | `#D8D4CD` (Neutral/300) | 입력 테두리, 파형 빈 칸 |
| `--color-divider` | `#E9E6E1` (Neutral/200) | 행 구분선 |
| `--color-disabled` | `#D8D4CD` (Neutral/300) | 꺼진 스위치, 비활성 버튼 |
| `--color-text` | `#1F1E1C` (Neutral/900) | 제목·본문 |
| `--color-text-secondary` (추가) | `#55524D` (Neutral/700) | 빈 상태 본문, 선택된 알약 탭 바탕 |
| `--color-text-muted` | `#6B6862` (Neutral/600) | 보조 글자, 메타 (흰 바탕 대비 5.5:1) |
| `--color-text-subtle` (추가) | `#8C8880` (Neutral/500) | 개수·캡션처럼 없어도 되는 글자만 (3.5:1 — 본문에 쓰지 않는다) |
| `--color-text-inverse` | `#FFFFFF` | 주요 버튼·독 글자 |
| `--color-primary` (추가) | `#3C3B39` (Primary) | 주요 버튼 바탕, 하단 독, 켜진 스위치 |
| `--color-accent` | `#2E85A3` (Sub/Accent-500) | 포커스 외곽선, "복사했어요" 같은 완료 피드백, 검색 `mark` 둘레. **버튼 바탕에 쓰지 않는다** (knot에는 색 버튼이 없다) |
| `--color-accent-text` | `#FFFFFF` | 강조 위 글자 |
| `--color-accent-soft` | `#E3F0F4` | 검색 `mark` 바탕 |
| `--color-recording` (추가) | `#BF3B2C` (Sub/Warning-600) | 녹음 중 점·문구 |
| `--color-danger` | `#BF3B2C` (Sub/Warning-600) | 오류 글자·회의 삭제 |
| `--color-danger-soft` | `#FBECE9` | 오류 배지·삭제 버튼 바탕 |
| `--color-success` | `#2E85A3` | 완료 체크 (knot은 완료를 청록으로 알린다) |
| `--color-success-soft` | `#E3F0F4` | 완료 표시 바탕 |
| `--color-thumb` | `#FFFFFF` | 스위치 손잡이 |
| `--color-disabled-text` | `#FFFFFF` | 비활성 버튼 글자 |
| `--color-speaker-1`~`8` | 이전 값 그대로 | 화자 점·이름. 모두 `#FAF9F7` 바탕에서도 4.5:1 이상 |
| `--shadow-1` (추가) | `0 1px 1px rgb(31 30 28 / 4%), 0 2px 6px -1px rgb(31 30 28 / 8%)` (Shadow01) | GNB 알약·원형 버튼 |
| `--shadow-2` (추가) | `0 1px 2px rgb(31 30 28 / 4%), 0 6px 16px -4px rgb(31 30 28 / 8%)` (Shadow02) | 카드 |
| `--shadow-3` (추가) | `0 2px 4px rgb(31 30 28 / 4%), 0 8px 24px rgb(31 30 28 / 7%)` (Shadow03) | 독·목록 패널·팝오버 |
| `--font-sans` | `'Pretendard', -apple-system, sans-serif` | 전체. knot은 라틴도 Pretendard다 (Google Sans는 스택에서 뺀다) |
| `--font-mono` | `'Google Sans Code', 'Pretendard', monospace` + `tabular-nums` | 타임스탬프·퍼센트·단축키. 큰 타이머는 knot처럼 `--font-sans` 굵게 + `tabular-nums` |

- 글자 크기: `--font-xs` 12(Caption01) · `--font-sm` 14(Caption02) · `--font-base` 15 · `--font-md` 16(Body01·Label01, 본문 기본) · `--font-lg` 18(Body02) · `--font-xl` 22 · `--font-title` 28 · `--font-display` 40(Title01, 자간 −2%) · `--font-hero` 44 · `--font-timer` 72.
- 간격 4·8·12·16·24·32는 `--space-1`~`6`을 그대로 쓰고 카드 사이 28은 `--space-7`(추가)로 둔다.
- 반경: `--radius-xs` 4(길이 칩, 추가) · `--radius-sm` 8 · `--radius-md` 12(버튼 S) · `--radius-lg` 16(목록 행·녹음 바·안쪽 칸) · `--radius-xl` 24(카드, 추가) · `--radius-full`.
- 포커스 표시는 모든 컨트롤이 `:focus-visible`에 `2px solid var(--color-accent)` 외곽선 + 2px 간격으로 통일한다.

### 다크 모드 없음 (2026-09-28)

같은 날 넣었던 다크 모드(`@media (prefers-color-scheme: dark)` 블록)와 테마 설정(`AppSettings.theme`, `src/shared/theme.ts`, 설정 "화면" 카테고리)을
knot 리디자인과 함께 **제거했다** (사용자 결정 — knot 시안에 다크가 없고, 새 팔레트의 다크 값을 근거 없이 지어내지 않는다).

- `base.css`는 `color-scheme: light`만 선언한다. 새 토큰에 다크 값을 두지 않는다.
- main은 창을 만들기 전에 `nativeTheme.themeSource = 'light'`로 고정한다 — macOS가 다크여도 스크롤바·폼 컨트롤이 라이트로 그려진다.
- DB에 남은 `ui.theme` 행은 읽지 않는다 (지우는 마이그레이션은 두지 않는다 — 해가 없고, 되살릴 때 사용자의 값이 남는다).

### 공통 컴포넌트 (`shared/components/primitives/ui`)

도메인 로직 없이 UI만 다룬다. 색은 위 토큰만 쓴다.
**이 표가 두 앱의 계약이다.** 패키지는 `react`를 import하지 않으므로 브라우저 프로토타입은 같은 계약을 `apps/web/src/components/*`에 따로 구현한다 (`Button`·`Badge`·`Icon`·`Switch`·`Stepper`·`ProgressBar`·`LevelWaveform`). 계약을 바꾸면 두 구현을 같이 고친다. 아래 레이아웃 컴포넌트는 데스크탑 창 구조 전용이라 웹에 두지 않는다.

| 컴포넌트 | 계약 |
| --- | --- |
| `Button` | `variant`: `primary`(차콜 `--color-primary` 바탕 + 흰 글자, **기본값** — 화면의 주 동작) · `secondary`(흰 바탕 + `--color-border` 테두리 + 차콜 글자) · `danger`(`--color-danger-soft` 바탕 + 빨간 글자 — 삭제 확인에만). `size`: `md`(기본, 높이 40 · 반경 12 · 16px 굵게 — knot Button/CTA/S) · `sm`(높이 32 · 반경 8 · 14px — 행 안·헤더). 비활성은 `--color-disabled` 바탕. **`accent` 변형은 없앴다** (2026-09-28, knot에는 색 버튼이 없다 — 녹음 시작도 `primary`). **녹음 정지에 `danger`를 쓰지 않는다** — 녹음 화면은 `primary` |
| `Badge` | `tone`: `neutral`(`--color-sidebar` 바탕 + 보조 글자, 반경 4 — knot Chip/Duration) · `accent`(`--color-accent-soft` 바탕 + 강조 글자) · `success`(청록 글자) · `danger`(`--color-danger-soft` 바탕 + 빨간 글자). 바탕을 칠한 강한 배지는 두지 않는다 |
| `Switch` | `<button role="switch" aria-checked>`. props `isChecked`, `onChange(next)`, `ariaLabel` 또는 `ariaLabelledBy`(설정 행 제목의 id), `disabled`. 켜짐은 차콜(`--color-primary`), 꺼짐은 `--color-disabled`. Space·Enter는 네이티브 버튼 동작으로 토글된다 |
| `Stepper` | 숫자 입력 + −/+ 버튼. **값은 문자열**(`value`, `onChange(text)`) — 입력 중 비어 있거나 잘못된 값을 부모가 그대로 들고 검증하기 때문이다 (`useSpeakerCount`). props `min`, `max`, `label`(입력 이름), `placeholder`, `isInvalid`. 동작: 빈 값(또는 정수가 아닌 값)에서 + 는 `min`, − 는 비활성. `min`에서 − 는 **값을 비운다**("모름"). `max`에서 + 는 비활성. 범위를 넘는 값에서 −/+ 는 범위 안으로 끌어온다 |
| `LevelWaveform` | 이퀄라이저형 레벨 미터. `LevelMeter`(가로 막대)를 대체한다. props `level`(0~1, 현재 세기), `barCount`. **모든 막대가 현재 레벨에 함께 반응**한다 — 가운데가 높고 양끝이 낮은 종 모양 포락선에 막대별 고정 계수를 곱하고, 레벨에 비례한 진폭으로 막대마다 다른 주기의 CSS `transform` 흔들림을 준다(노래방 이퀄라이저 느낌, 2026-09-26 사용자 요청). 무음이면 점만 남는다. 처음 구현은 0.5초마다 오는 레벨을 왼쪽부터 칸에 쌓는 이력형이었는데 24초 동안 채워지는 모양이 진행 바로 읽혀 바꿨다. 이력·타이머·오디오 분석이 없고 새 레벨이 올 때만 리렌더하며 흔들림은 컴포지터 애니메이션이라 추가 비용이 없다. `prefers-reduced-motion`이면 흔들림을 끈다 |

레이아웃 공통 컴포넌트는 `shared/components/primitives/layout`에 둔다. 여러 위젯이 같은 모양을 써야 해서 위젯의 `ui` 세그먼트가 아니라 공용이다.

| 컴포넌트 | 계약 |
| --- | --- |
| `Card` (추가) | knot 카드 — 흰 바탕, 반경 24, `--shadow-2`, 안쪽 여백 20. props `title`, `count`(제목 옆 회색 숫자, 선택), `action`(헤더 오른쪽, 선택), `children`. 헤더는 16px 굵게. 홈 카드와 회의 상세 레일 카드가 같은 모양을 쓴다 |
| `PageColumn` (추가) | 가운데 정렬 본문 열. props `width`(`'narrow'` 720 · `'medium'` 880 · `'wide'` 1080, 기본 `wide`). 좌우 여백 32, 위는 GNB 아래(`--gnb-top` + `--gnb-height` + 24), 아래는 `--dock-zone` |
| `SettingGroup` | 설정 카테고리 — 회색 소제목(`h2`) + 행 목록. `aria-labelledby`로 제목과 묶는다 |
| `SettingRow` | 설정 한 행 — 왼쪽 제목·설명, 오른쪽 `control`, 아래 `children`(펼침 영역). 제목 id를 `titleId`로 받아 `Switch`의 `ariaLabelledBy`에 넘긴다. 행 사이는 `--color-divider` 선 |

### 글꼴 동봉

- Google Sans(라틴·숫자), **Pretendard(한글)**, Google Sans Code(숫자·시간)를 `packages/design/src/fonts/`에 넣고 `packages/design/src/fonts.css`의 `@font-face`로 로드한다. 두 앱이 같은 파일을 쓴다.
  Google Sans에는 한글 글리프가 없어 한글은 스택의 다음 글꼴인 Pretendard로 떨어진다.
- 셋 다 **SIL OFL**이다. 배포처가 준 파일을 **수정하지 않고** 동봉한다 (OFL의 예약 글꼴 이름 조항 때문에 서브셋·변환한 파일은 원래 이름을 쓸 수 없다).
  각 글꼴의 `OFL.txt`를 같은 폴더에 둔다. 폴더는 글꼴마다 하나(`fonts/googleSans`, `fonts/googleSansCode`, `fonts/pretendard`)다.
- 파일 **이름**만 카멜 규칙에 맞춰 바꾼다 (`GoogleSans[GRAD,opsz,wght].ttf` → `googleSansVariable.ttf`). 대괄호·쉼표가 CSS `url()`과 번들러 경로에서 말썽을 부린다.
  파일 내용과 글꼴 이름(name 테이블)은 건드리지 않으므로 OFL 조항과 무관하다. 출처: Google Sans·Google Sans Code는 `google/fonts` 저장소의 `ofl/`, Pretendard는 npm `pretendard@1.3.9`의 가변 woff2.
- 오프라인 앱이라 Google Fonts CDN을 쓰지 않는다. CSP도 외부 글꼴 출처를 열지 않는다. 브라우저 프로토타입도 같은 동봉 파일을 정적 자산으로 배포한다 (CDN 없음).

### 메인 창 레이아웃: 상단 GNB · 하단 독 · 회의 목록 패널 (knot, 2026-09-28)

2026-09-24의 "사이드바 272px + 본문" 두 칸을 대체한다. 본문은 창 전체 폭을 쓰고 그 위에 세 가지가 떠 있다.

- 메인 창 기본 크기 **1280×800**, 최소 **1040×640** (그대로). `titleBarStyle: 'hiddenInset'`으로 신호등이 창 왼쪽 위에 겹친다.
- 라우터: `RequireModels` 아래 `AppShellLayout`이 GNB + 목록 패널 + `<Outlet />` + 독을 그린다. 홈·회의록 목록·녹음·상세·설정이 그 자식이다. 온보딩·녹음 호스트는 셸 밖이다.
  `UpdateBanner`는 GNB 바로 아래, 본문 위에 둔다 (어느 화면에서든 보이도록).
- **GNB** (`widgets/navigation/GnbSection`, knot GNB/Floating): 창 위 24px에 높이 44 한 줄. 줄 전체가 `-webkit-app-region: drag`이고 안의 버튼만 `no-drag`다.
  - 왼쪽: **목록 버튼**(36×36 흰 원 + `--shadow-1`, 아이콘 `list`, `aria-label` "회의 목록 열기/닫기", `aria-expanded`). 신호등(약 70px)과 겹치지 않게 왼쪽 여백을 **88px**로 둔다 (knot은 24px — 웹 앱이라 신호등이 없다).
  - 가운데: **알약 탭** — "홈"(`/`) · "회의록"(`/meetings`, 상세 화면에서도 이 탭이 선택). 흰 알약(테두리 `--color-border`, `--shadow-1`, 안쪽 6) 안에 높이 32 탭, 선택 탭은 `--color-text-secondary` 바탕 + 흰 글자. `<nav>` + `NavLink`.
  - 오른쪽: **설정 버튼**(36×36 흰 원, 아이콘 `settings`, 설정 화면에서 선택 표시). knot의 아바타 자리다 — 계정이 없어 설정이 그 자리를 쓴다.
- **회의 목록 패널** (`widgets/meeting/MeetingSidebarSection`, knot "사이드바 열림"): 목록 버튼으로 여닫는 흰 카드(폭 `--sidebar-width` 240, 반경 24, `--shadow-3`)가 GNB 아래 왼쪽(위 68 + 12, 왼쪽 24)에 뜬다.
  내용은 이전 사이드바와 같다 — 검색 입력 → 회의 목록(오늘·이번 주·이전 묶음, 처리 중이면 `PipelineProgress`, 오류면 한 줄) — 새 녹음 버튼과 설정 링크는 독·GNB로 옮겨 뺀다.
  **열리면 본문을 밀어낸다**: 셸이 본문 왼쪽 여백을 패널 폭 + 24만큼 늘린다(겹치지 않게 — 최소 창 1040에서 본문 720 열이 패널에 가려지지 않는다).
  열림 상태는 창 단위 화면 선호라 `localStorage`에 둔다(`meetingSidebar.isOpen`, 기본 닫힘, 읽기·쓰기 실패 시 닫힘으로 동작). Esc로 닫는다. 목록 갱신 규칙(`meetings:changed`)은 아래 그대로다.
- **하단 독** (`widgets/recording/DockSection`, knot Dock/Bar): 창 아래 24px 가운데에 높이 60 차콜 알약(`--color-primary`, `--shadow-3`). 독은 녹음만 맡는다.
  - 대기: **마이크 버튼**(40×40, `aria-label` "새 녹음") → `/record`로 이동한다. knot처럼 바로 녹음을 시작하지 않는 이유: 녹음 화면에서 참석자 수·상대방 소리 포함·파일 가져오기를 먼저 고를 수 있어야 한다.
  - 녹음 중·일시정지: **시간 칩**(`--color-text-secondary` 바탕 알약: 빨간 점(일시정지면 회색) + 경과 시간 + `›`, 누르면 `/record`) + 칩 안 오른쪽 **정지 버튼**(32×32 흰 원 + 차콜 사각형, `aria-label` "녹음 끝내기") → `controlRecordingApi({ kind: 'stop' })`.
  - `/record`에서는 독을 숨긴다 — 녹음 화면에 같은 조작이 크게 있다 (knot "녹음 화면처럼 마이크를 숨기는 곳").
- 본문 여백: 모든 페이지는 위를 `--gnb-top + --gnb-height`(68) 아래에서, 아래를 `--dock-zone`(108 = 독 60 + 위아래 24) 위에서 끝낸다. 높이를 채우는 화면(녹음·상세·설정)은 이 사이에서 스스로 스크롤한다.
- `TopBar`(본문 상단 52px 바)는 없앤다. 화면 제목은 본문 안 큰 제목이 맡고, 창 끌기는 GNB 줄이 맡는다.
- **목록 갱신**: 회의 목록 패널·홈·회의록 목록은 화면을 옮겨도 최신이어야 한다.
  main이 회의 목록에 영향을 주는 변경(녹음 시작·정지, 제목 변경, 삭제, 파이프라인 처리 시작·`done`·`error`) 뒤에 **`meetings:changed` push**를 보내고,
  `useMeetings`가 받으면 `meetings:list`(패널 검색 중이면 `meetings:search`)를 다시 부른다. payload는 없다 — 목록 전체를 다시 읽어도 로컬 SQLite라 싸다.
  녹음 정지·처리 시작을 넣은 이유: 정지 직후 행은 `recording`, 큐가 잡으면 `processing`으로 바뀌는데 이 둘을 놓치면 처리 중 진행률 대신 "녹음 중"을 계속 보여준다.
  main은 `src/main/meetingsChanged.ts`의 리스너 하나로 모으고(`notifyMeetingsChanged`), `index.ts`가 모든 창에 브로드캐스트한다 — 진행률 리스너와 같은 모양이다.

### 화면별 구성

> **결정 문서 전환 (2026-09-28, 이 브랜치)**: 회의 목록 패널에 [결정 문서 | 회의록] 탭, 결정 문서 화면(`/decisions/:decisionId`), 회의 상세 레일의 "결정 문서" 카드가 더해진다. 아래 구성과 다르면 `references/decisions.md` "화면"이 우선한다.

- **홈** (knot "홈/기본", 2026-09-28): 가운데 1080 열. 인사 제목(`--font-display` 40 · 500 · 자간 −2%, 가운데 정렬, "오늘 회의를 기록해 볼까요") 아래 카드 2×2 그리드(간격 28).
  왼쪽 칸은 남은 폭, 오른쪽 칸은 400px. 위 줄 카드 높이 312, 아래 줄 214 고정(knot 값).
  - 왼쪽 위 **"최근 회의"** (knot Card/ConfirmRequests 자리): 제목 옆 전체 개수, 헤더 오른쪽 "전체 보기 ›"(`/meetings`). 최근 3개 행 — 제목(16 굵게) + 날짜 · 길이 칩, 오른쪽 "열기" 보조 버튼. 처리 중이면 메타 자리에 `PipelineProgress`, 오류면 빨간 한 줄. 없으면 빈 상태 문구.
  - 오른쪽 위 **"이번 주"**: 이번 주(`meetingDateGroup`이 `today`·`thisWeek`) 회의 수와 총 녹음 시간을 큰 숫자 두 줄로. 회의 목록에서 파생하는 값이라 새 IPC가 없다.
  - 왼쪽 아래 **"진행 중인 녹음"** (knot Card/RecordingList): 카드 안 한 칸(`--color-sidebar`, 반경 16)이 상태를 보여 준다 — 녹음 중(빨간 점 · 경과 시간, "녹음 화면으로") · 일시정지(회색 점) · 없음(빈 상태 "진행 중인 녹음이 없어요" + "아래 마이크로 녹음을 시작하면 여기에서 볼 수 있어요").
    처리 중·실패 회의는 이 카드가 아니라 "최근 회의" 행이 보여 준다 (knot은 정리 중을 여기 두지만, 이 앱은 여러 회의가 큐에서 동시에 기다릴 수 있다).
  - 오른쪽 아래 **"녹음 파일 가져오기"** (knot Card/InviteMember 자리): 아이콘 칸(40, 반경 14, `--color-border` 바탕) + `ImportAudioButton` 행(제목·설명·버튼). 행이 제목을 가져 카드 헤더는 두지 않는다.
  - 카드는 각각 위젯이고(`meeting/RecentMeetingsCard`·`meeting/WeeklyStatsCard`·`recording/CurrentRecordingCard`·`meeting/ImportAudioCard`) 페이지는 배치만 한다. 데이터는 `useMeetings`·`useRecordingState`만 쓴다. 인사 제목은 사용자 이름이 없어 고정 문구다.
- **회의록 목록** (`/meetings`, knot "문서 목록/기본", 2026-09-28): 가운데 880 열. 제목 "회의록"(28 굵게) + 설명 한 줄, 날짜 묶음(오늘·이번 주·이전)마다 소제목(16 굵게 + 회색 개수) 아래 흰 카드(반경 16, `--shadow-2`) 하나에 행을 구분선으로 쌓는다.
  행: 왼쪽 제목(16 굵게) + 상태 줄(처리 중 진행률·오류일 때만), 오른쪽 날짜 · 길이 칩 · `›`. 행 전체가 상세로 가는 링크다. 빈 상태는 "아직 회의록이 없어요" + 독 안내.
  회의 목록 패널과 같은 `useMeetings`·`groupMeetingsByDate`를 쓴다 (`widgets/meeting/MeetingListSection` — 2026-09-24에 없앤 이름을 이 화면으로 되살린다).
- **회의 상세**: (2026-09-28부터 상단 바 없음 — GNB 아래 본문이 바로 시작하고, 카드·레일은 knot 카드 모양) 전체 폭 헤더(제목·메타, 제목과 같은 줄 오른쪽에 복사·마크다운 복사·더보기) + 헤더 아래 두 칸 — 가운데 회의록, 오른쪽 레일 300px에 요약 카드·교정 결과·화자 목록 — + **하단 고정 녹음 바**(두 칸 아래 전체 폭, "녹음본 재생·내보내기·다시 인식" 절).
  복사 버튼을 창 오른쪽 위가 아니라 제목 줄에 두고 레일을 헤더 아래에서 시작하게 한 이유(2026-09-28 사용자 요청): 복사 대상인 회의록 제목 옆에 있어야 무엇을 복사하는지 분명하고, 레일이 제목 옆까지 올라오면 제목 폭이 레일에 눌린다.
  화자 목록은 회의록과 **같은 `useMeeting` 상태**를 써야 하므로(훅 인스턴스마다 상태가 따로다) `TranscriptSection`이 레일까지 그리고,
  요약은 `aside` 슬롯으로 받는다: `<TranscriptSection meetingId aside={<SummarySection meetingId />} />`. 기존 `SpeakerBar`는 레일의 화자 목록으로 바뀐다.
  레일 폭은 회의록과 레일 사이의 **세로 핸들을 끌어** 바꾼다(2026-09-24 사용자 요청). 기본 300px, 최소 240px, 최대 560px이면서 본문 폭의 절반을 넘지 않는다(회의록이 레일에 밀려 사라지지 않게 — CSS도 `min(var(--rail-width), 50%)`로 같은 상한을 건다).
  핸들은 `role="separator"`(`aria-orientation="vertical"`, `aria-valuenow/min/max`)이고 키보드 ←/→로 16px씩 조절, 더블클릭하면 기본 폭으로 돌아간다.
  폭은 창 단위 화면 선호라 SQLite 설정에 넣지 않고 renderer `localStorage`에 저장한다(읽기·쓰기 실패 시 기본 폭으로 동작). 로직은 `TranscriptSection`의 `model/useRailResize`, 핸들은 `ui/RailResizer`에 둔다.
  요약 카드의 헤더는 접기/펼치기 토글(`aria-expanded`)이다 — 기본은 펼침이고, 접으면 본문·버튼이 숨고 헤더만 남는다. 요약이 진행 중일 때 접으면 헤더 캡션에 진행률을 대신 보여 준다. 접힘 상태는 저장하지 않는다(회의를 옮기면 다시 펼침).
  공급자 라벨(무엇으로 요약하는지)은 헤더의 "요약" 제목 바로 아랫줄에 작은 글씨로 적고, "요약 복사" 버튼은 헤더 오른쪽에 둔다(2026-09-28 사용자 요청). 버튼 안에 버튼을 둘 수 없으므로 헤더는 접기 버튼(셰브런·제목·라벨, 남는 폭을 채움)과 복사 버튼을 형제로 나란히 둔다. 복사 버튼은 요약이 있고 진행 중이 아닐 때만 보이고, 접힌 채 진행 중이면 라벨 자리에 진행률이 나온다. 본문 아래 버튼 줄에는 만들기/다시 요약만 남는다.
  회의 삭제는 더보기 안으로 들어가지만 2단계 인라인 확인 규칙은 그대로다. 더보기는 창 오른쪽 위 상단 바가 아니라 복사 버튼 바로 오른쪽에 둔다(2026-09-28 사용자 요청) — 회의 단위 동작을 한 줄에 모아 찾기 쉽게 한다.
  (2026-09-28) 상단 바가 없어져 날짜 묶음 제목("회의록 · 오늘")도 뺐다 — 헤더 메타 줄의 날짜가 같은 정보다.
  발화 행은 시각 열 · (화자 + 본문) · 복사 버튼 세 칸이고, 복사 버튼은 행에 마우스를 올리거나 포커스가 들어올 때만 보인다. 화자는 색 점 + 이름의 `<select>`로 바꾼다.
  화자 색은 화자 목록 순서대로 `--color-speaker-1`~`8`을 돌려 쓴다. 화자 목록의 "화자 합치기"는 합치기 모드를 켜고, 모드 안에서 행마다 "합치기" → 대상 선택의 기존 두 단계를 거친다.
- **녹음**: (2026-09-28 knot — 상단 바 없음, 녹음 중 문구·점은 `--color-recording` 빨강, 타이머는 `--font-sans` 굵게 + `tabular-nums`) 큰 타이머, 파형형 레벨 미터, 참석자 수 **스테퍼**(−/+와 숫자 입력, "모름"은 값을 비운다), 정지 버튼("녹음 정지하고 회의록 만들기").
  스테퍼는 `shared/components/primitives/ui/Stepper`로 만든다. 참석자 수 범위·검증은 지금처럼 `@meeting-stt/core/speakerCount`.
  **2026-09-26 재배치**(사용자 요청: 녹음 직전 화면이 스크롤되고 상태가 바뀔 때마다 요소가 튄다). 두 원칙 — **페이지 스크롤 없음**(최소 창 높이 640에서 전부 들어간다)과
  **레이아웃 시프트 없음**(대기 ↔ 녹음 ↔ 일시정지, 파형 ↔ 라이브, 오류 표시 어느 전환에서도 요소가 움직이지 않는다) — 을 지키기 위해 구성을 다음처럼 고정한다.
  - **헤더**(왼쪽 정렬): 상태 점·문구, 녹음 중에 켜져 있으면 그 옆에 "상대방 소리 포함" 배지, 아래 큰 타이머(`--font-timer`). 왼쪽 정렬이라 배지가 붙거나 타이머가 `1:00:00`으로 길어져도 아무것도 밀리지 않는다.
  - 헤더 아래는 **두 칸**. 왼쪽 **무대**는 보기 카드 + 제어 행 + 안내 두 줄이다. 보기 카드는 헤더(파형 / 라이브 받아쓰기 토글)와 본문으로 나뉘고 **본문 크기는 남은 높이가 정한다** —
    파형은 본문 가운데에, 라이브 받아쓰기는 본문을 채우는 스크롤 영역(앱에서 유일하게 스크롤되는 곳)이라 보기를 바꿔도 카드 크기가 같다.
    제어 행은 높이 52px 고정이고 **버튼이 무대 폭을 꽉 채운다** (2026-09-26 사용자 요청): 대기 중 주요(차콜) "녹음 시작" 하나, 녹음 중 일시정지 원형 버튼 + 남은 폭을 채우는 "녹음 정지하고 회의록 만들기".
    안내("창을 닫아도 계속", 단축키)는 두 줄 높이 고정. **명령·녹음 오류는 이 안내 자리에 대신** 빨간 글자로 쓴다 — 안내는 없어도 되는 정보라 오류가 있는 동안 잠시 비켜도 되고, 같은 높이라 별도 줄을 끼워 넣지 않는다.
  - 오른쪽 **옵션 패널**(340px, `aside`, 설정 화면과 같은 `SettingGroup`/`SettingRow`)이 사용자가 입력하는 것을 카테고리로 모은다.
    위 그룹 **"파일로 만들기"**: 녹음 파일 가져오기 행(녹음 중 **비활성**) — 2026-09-26 사용자 요청으로 맨 위에 둔다.
    아래 그룹 **"녹음 설정"**: 참석자 수 행(설명 + 스테퍼. 별도 "모름" 버튼은 두지 않는다 — 최솟값에서 −가 값을 비우고 placeholder가 "모름"이다), 온라인 회의 소리 행(설명 + `Switch`, 녹음 중 **비활성**, 숨기지 않는다).
    설명이 길어질 수 있는 온라인 회의 소리 행(시스템 오디오 오류 문구)이 패널의 **마지막**이라, 넘치면 아래 빈 공간으로 흘러나갈 뿐 다른 행이 밀리지 않는다.
  - **고정 규칙**: 상태에 따라 요소를 숨기거나 끼워 넣지 않고 비활성으로 바꾼다. 문구가 바뀌는 자리(행 설명·오류·안내)는 줄 수를 정해 `height`를 고정하고, 넘치면 `overflow: visible`로 여백에 흘러나가게 둔다 —
    드물게 긴 오류가 여백을 침범하는 쪽이 매번 화면이 튀는 것보다 낫다. 폭 계산: 최소 창(1040)에서 본문 768 − 패딩 64 − 패널 340 − 칸 사이 32 = 무대 332px이고 일시정지(52) + 정지 버튼(약 270) 행이 들어간다.
- 위젯 패널은 2026-09-28 이 브랜치에서 제거했다 ("녹음 호스트 창 · 메뉴바 · 전역 단축키" 절).
  목록 패널·독에는 단축키 안내를 넣지 않는다 — 모두 언마운트되지 않아 설정에서 단축키를 바꾸면 틀린 키를 보여준다 (설정 변경 push가 없다). 녹음 화면은 들어올 때마다 설정을 읽으므로 안내한다.
- **설정**: 카테고리 제목 + 행(제목·설명 왼쪽, 컨트롤 오른쪽). 켜기/끄기는 `role="switch"` 버튼인 `primitives/ui/Switch`로 바꾼다. 용어 사전 카테고리도 같은 행 규칙을 따른다.
- **온보딩**: 왼쪽 안내, 오른쪽 모델 선택 카드와 다운로드 목록("함께 받는 모델": 완료·퍼센트·대기)의 두 칸. 제목 문구는 "인터넷 사용, 비용, 시간 제한 없는 회의록"(시안).
  설정의 음성 인식 모델은 같은 `ModelDownloadSection`을 `variant="setting"`으로 그려 한 행(현재 모델 · 설치됨 + "모델 바꾸기")으로 접어 두고, 누르면 선택 카드가 펼쳐진다.
- 제목은 굵은 산세리프(명조 없음). 아이콘은 인라인 stroke SVG(stroke 1.5, knot 아이콘과 같은 굵기)이고 아이콘 전용 버튼에는 `aria-label`을 붙인다. knot 전용 아이콘(Icon/Mic의 매듭 받침, Icon/RAG Explore)은 브랜드 글리프라 가져오지 않는다.

### 회의록 검색 (`meetings:search`)

| 키 | 채널 | 방향 | 요청 → 응답 |
| --- | --- | --- | --- |
| `meetings.search` | `meetings:search` | invoke | `{ query: string }` → `MeetingSearchResult[]` |
| `events.meetingsChanged` | `meetings:changed` | push | 없음 (위 "목록 갱신") |

- `MeetingSearchResult = { meeting: Meeting; match: { utteranceId: string; text: string; startSec: number } | null }`.
  제목으로만 걸리면 `match`는 `null`, 발화로 걸리면 **순서(`ord`)가 가장 앞선 발화 하나**를 준다.
- 대상은 **회의 제목과 발화 텍스트**. 화자 이름·요약은 넣지 않는다 (필요해지면 추가).
- main은 `query`를 trim하고 비면 빈 배열을 돌려준다. `LIKE '%' || ? || '%' ESCAPE '\'`로 찾고 `%`·`_`·`\`는 이스케이프한다.
  SQLite `LIKE`는 ASCII 대소문자를 구분하지 않아 영문 용어도 그대로 찾힌다. 정렬은 `created_at DESC`, 최대 50개(`SEARCH_RESULT_LIMIT`).
  이스케이프 함수(`toLikePattern`)는 `src/main/searchQuery.ts`에 두고 `searchQuery.test.ts`로 검증한다 — `src/main/db/*`는 `better-sqlite3` 때문에 vitest가 import할 수 없다.
- **FTS5를 쓰지 않는 이유**: 기본 `unicode61` 토크나이저는 띄어쓰기로만 나눠 "회의록을"에서 "회의록"을 못 찾고,
  `trigram`은 3글자 미만 질의를 못 찾는다 (한국어 검색어는 2글자가 흔하다). 데이터가 한 사람의 로컬 회의라 전체 스캔으로 충분하다.
  느려지면(수천 회의) 그때 측정하고 바꾼다. 스키마 변경은 없다.
- renderer: 입력 200ms 디바운스(`SEARCH_DEBOUNCE_MS`), 검색 중에는 회의 목록 패널의 목록이 결과로 바뀌고 발화 조각의 일치 부분을 `<mark>`로 강조한다.
  결과를 누르면 그 회의 상세로 간다. **해당 발화로 스크롤하는 것은 후속 과제**다. Esc·지우기 버튼으로 검색을 끝내면 원래 목록으로 돌아간다.

## 화면 라우트 (Phase 2)

`file://`에서도 동작해야 하므로 `createHashRouter` + `RouterProvider`를 쓴다. 라우팅 관련 코드는 `src/renderer/src/shared/routes/`에만 두고, 다른 코드는 경로 문자열을 직접 쓰지 않는다.

- `routes/paths.ts` : 경로 상수와 경로 조립 함수(`meetingDetailPath`). **컴포넌트는 여기만 import한다.**
- `routes/index.tsx` : 페이지를 물린 라우터 정의. 페이지를 import하므로, 컴포넌트가 이 파일에서 경로 상수를 가져오면 `widget → routes → page → widget` 순환 import가 된다.

knot 리디자인(위 "화면 디자인" 절)부터 홈·회의록 목록·녹음·상세·설정은 **GNB·독 셸**(`shared/routes/layout.tsx`의 `AppShellLayout`) 안에 그려진다.
회의 목록은 여닫는 패널(`meeting/MeetingSidebarSection`)과 `/meetings` 화면(`meeting/MeetingListSection`) 두 곳에 있다.

| 경로 | 페이지 | 배치하는 widget |
| --- | --- | --- |
| `/` | `pages/Home` | 인사 제목 + 카드 2×2: `meeting/RecentMeetingsCard` · `meeting/WeeklyStatsCard` · `recording/CurrentRecordingCard` · `meeting/ImportAudioCard` |
| `/meetings` | `pages/Meetings` | `meeting/MeetingListSection` (날짜 묶음 카드 목록) |
| `/record` | `pages/Record` | `recording/RecorderSection` |
| `/meetings/:meetingId` | `pages/MeetingDetail` | `meeting/TranscriptSection` (오른쪽 레일에 `meeting/SummarySection`을 슬롯으로 받음) |
| `/settings` | `pages/Settings` | `setting/SettingsSection` (카테고리 묶음, 모델·LLM·용어 사전 위젯을 `children`으로 받음), `model/ModelDownloadSection`, `setting/LlmSection` (`model/SummaryModelSection`을 슬롯으로 받음), `setting/GlossarySection`, 오른쪽 목차 `composites/PageToc` |
| `/onboarding` | `pages/Onboarding` | `model/ModelDownloadSection` |
| `/recorder` | `pages/RecorderHost` | `recording/RecorderHostSection` (녹음 호스트 창 전용, 그리는 것 없음, 가드 밖) |

- `/settings`는 Phase 3에서 원본 WAV 보관 옵션과 함께 추가했다. Phase 4에서 업데이트 확인 옵션(`SettingsSection`),
  음성 인식 모델 변경(`ModelDownloadSection`, 온보딩과 같은 위젯), 요약 모델 다운로드(`SummaryModelSection`)를 붙였다.
  이후 발열·팬 소음을 줄이는 '조용히 처리' 옵션(`SettingsSection`, `pipeline.quiet`)을 붙였다.
- 온보딩(`/onboarding`)은 Phase 4에서 추가했다. **진입 가드**는 `shared/routes/guards.tsx`의 `RequireModels`가 맡는다 —
  홈·녹음·상세·설정을 자식으로 갖는 경로 없는 레이아웃 라우트로, `models:status`의 `isReady`가 거짓이면 `/onboarding`으로 보낸다.
  온보딩 페이지 자체는 가드 밖에 있고, 다운로드가 끝나면 홈으로 이동한다. 가드는 레이아웃이 처음 마운트될 때 한 번만 조회한다
  (모델은 온보딩 밖에서 사라지지 않는다).
- `features/update/UpdateBanner`는 `update:available` 이벤트를 받았을 때만 나타난다 (`references/distribution.md` 7절). 리디자인부터 홈이 아니라 셸 본문 위에 둔다.
- 흐름: 하단 독의 마이크(리디자인 전에는 사이드바)에서 "새 녹음" → `/record`(또는 메뉴바·단축키) → 정지 → main이 잡을 큐에 넣고 `/meetings/:meetingId`로 이동 → 처리 중 상태를 보여주다가 `pipeline:progress`의 `done`을 받으면 회의록을 다시 불러온다.
- **Phase 5-3부터 `/record`를 벗어나도 녹음은 계속된다.** 오디오 그래프가 녹음 호스트 창으로 옮겨 갔기 때문이다
  (그 전에는 `useRecorder`가 언마운트될 때 녹음을 정지했다). 대신 **앱이 종료될 때**(`before-quit`) 진행 중 녹음이 있으면
  WAV 헤더를 확정하고 잡을 큐에 넣는다. 헤더가 확정되지 않은 WAV는 파이프라인이 읽지 못한다.
- 메뉴바·단축키로 정지하면 메인 창을 앞으로 가져오고 그 회의의 상세로 이동한다 (`stoppedMeetingId`). 녹음을 끝낸 직후에 보고 싶은 것은 결과 화면이다.
- Phase 2에서 진행률 **막대**는 만들지 않았다. Phase 3에서 `modules/features/pipeline/PipelineProgress`로 추가했다 (위 "진행률 표시" 절).

## 편집 UI 규칙 (Phase 3)

- **인라인 편집**은 `shared/components/composites/InlineEditableText` 하나로 통일한다 (회의 제목, 발화 텍스트, 화자 이름).
  표시 상태는 `<button>`이라 키보드로 진입할 수 있고, blur·Enter로 확정, Escape로 취소한다.
  빈 문자열은 저장하지 않고 원래 값으로 되돌린다 — 발화 텍스트나 화자 이름이 빈 채로 남으면 회의록이 읽히지 않기 때문이다.
- **되돌릴 수 없는 동작(회의 삭제, 화자 병합)은 2단계로 만든다.** `window.confirm` 같은 모달 대화상자를 쓰지 않는다 —
  renderer를 멈추지 않고, 스타일을 맞출 수 있고, happy-dom 통합 테스트에서 그대로 검증할 수 있기 때문이다.
  - 회의 삭제: "삭제" → 안내 문구 + "삭제"/"취소"
  - 화자 병합: "합치기" → 합칠 대상 화자 목록 → 대상 클릭 (대상을 고르는 행위 자체가 확인 단계)
- **화자 재배정**은 발화 행의 `<select>`로 한다. 재배정 후 앞뒤 발화가 같은 화자가 되어도 자동으로 합치지 않는다 —
  병합은 파이프라인 결과를 만들 때의 규칙이고, 사용자가 고친 뒤에 문단이 임의로 재구성되면 편집 위치를 잃는다.
