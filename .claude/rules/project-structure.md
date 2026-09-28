---
paths:
  - "apps/desktop/src/**"
  - "apps/web/src/**"
  - "packages/*/src/**"
description: 워크스페이스 경계(apps / packages)와 프로세스 경계(main / preload / renderer / shared), 전체 폴더 구조, 레이어별 역할, 네이밍 원칙. 새 파일·폴더 생성이나 파일 위치 판단 전 필독.
---

# 프로젝트 폴더 구조 가이드라인

폴더 구조는 '변경에 유연함'을 판단 근거로 잡았기 때문에, 아래 모든 규칙은 **"코드가 어떤 이유로 함께 바뀌는가"** 를 따라 결정됨.
이 저장소는 pnpm 워크스페이스 모노레포이고 제품은 Electron 앱이라, React 레이어 규칙 위에 **워크스페이스 경계**와 **프로세스 경계**가 두 겹 더 있음. 워크스페이스 → 프로세스 → React 레이어 순으로 정함.

세부 규칙은 역할별 문서 참고.

- 컴포넌트 위치(추상화 레벨): `.claude/rules/component-abstract-pattern.md`
- 컴포넌트 폴더 구성(콜로케이션): `.claude/rules/component-colocation-pattern.md`
- 세그먼트 정의·배치·의존 규칙: `.claude/rules/segment-pattern.md`
- IPC·API 구조: `.claude/rules/ipc-api-guide.md`
- 훅: `.claude/rules/hook-guide.md`
- 테스트: `.claude/rules/test-strategy.md`

## 워크스페이스 경계 (먼저 판단)

pnpm 워크스페이스 모노레포다. **먼저 워크스페이스를 정하고**, 데스크탑 앱 안에서는 프로세스를, renderer 안에서는 React 레이어 규칙을 적용.

```
apps/desktop/      제품 Electron 앱 (패키지 meeting-stt)
apps/web/          브라우저 추론 프로토타입 (@meeting-stt/web)
apps/collector/    사용 정보 수집 서버 (@meeting-stt/collector, test/usage-analytics 전용, Node + Hono)
packages/core/     순수 공용 로직 (@meeting-stt/core)
packages/models/   모델 카탈로그 (@meeting-stt/models)
packages/design/   디자인 토큰·동봉 글꼴 (@meeting-stt/design, CSS·글꼴만)
packages/telemetry/ 사용 정보 계약 — 이벤트·envelope·스냅샷·수집 HTTP 규약 (@meeting-stt/telemetry, test/usage-analytics 전용)
```

| 새 코드가 이런 것이면 | 여기 |
| --- | --- |
| 두 앱이 **같은 값·같은 알고리즘**을 써야 하는 순수 TS (병합, 포맷, 정규화 공식·상수, 참석자 수 규칙, 오디오 형식, 용어 읽기 사전) | `packages/core/src/<역할>.ts` |
| 어느 모델을 쓰는지 (저장소·파일명·체크섬·양자화·용량) | `packages/models/src/{desktop,web}.ts` |
| 두 앱이 같이 쓰는 디자인 토큰(색·간격·반경·글자 크기)·글꼴 | `packages/design/src/{base,fonts}.css`, `packages/design/src/fonts/` |
| Electron·Node·SQLite·동봉 바이너리를 만지거나 앱 화면·IPC인 것 | `apps/desktop/src/…` |
| 브라우저 워커·transformers.js·WebGPU를 만지는 것 | `apps/web/src/…` |
| 수집 서버의 HTTP 라우트·저장 (이 브랜치 전용) | `apps/collector/src/…` (역할별 플랫 파일, React 레이어 규칙 없음) |

- 의존 방향은 `apps/* → packages/*` 한 방향. 패키지는 앱을, 패키지는 서로를 import하지 않음. 앱끼리도 import 금지.
- `packages/*`는 `electron`·`fs`·`child_process`·DOM·`react`를 import하지 않음 (Node·브라우저·vitest에서 같은 파일이 돈다).
- **아래 `src/…` 경로는 모두 `apps/desktop/src/…`** 를 줄여 쓴 것. 웹 앱은 `apps/web/` 접두어를 붙여 적음.
  워크스페이스 관리 규약은 `.claude/skills/meeting-stt-dev/references/monorepo.md`.

## 프로세스 경계

| 위치 | 런타임 | 역할 | 금지 |
| --- | --- | --- | --- |
| `packages/core/src` | 두 앱 전부 (순수 TS) | 파이프라인 중간 산출물 타입, 화자 배정·발화 병합, 복사 포맷, 정규화 공식·상수, 참석자 수 규칙, 오디오 형식 상수, 용어 읽기 사전 | 런타임 의존(`electron`, `fs`, `react`, DOM) 일체, 앱·다른 패키지 import |
| `packages/models/src` | 두 앱 전부 (순수 데이터) | 모델 카탈로그 — 데스크탑 자산(URL·sha256·용량), 웹 저장소 id·dtype·ONNX 파일명 | 같음. 다운로드·파일 IO는 앱에 둠 |
| `src/shared` | 이 앱의 양쪽 (순수 TS) | 도메인 타입, IPC 채널·payload 타입, 병합·포맷 같은 순수 함수 | 런타임 의존(`electron`, `fs`, `react`) 일체 |
| `src/main` | Node | 창 생성, 녹음 파일 쓰기, 파이프라인(spawn), SQLite, 모델 관리, IPC 핸들러 | `react`, 동기 IO(`spawnSync`, 요청 경로의 `readFileSync`) |
| `src/preload` | Node (contextBridge) | `window.api`에 타입 붙은 함수만 노출 | `ipcRenderer` 객체 직접 노출, 비즈니스 로직 |
| `src/renderer/src` | Chromium (React) | 화면, 녹음 오디오 수집(AudioWorklet), `window.api` 호출·이벤트 구독 | `fs`, `child_process`, `electron`, `better-sqlite3` import, 추론·DB 접근 |

- 의존 방향: `renderer → shared`, `main → shared`, `preload → shared`. `shared`는 아무것도 의존하지 않음.
- **`src/shared`(프로세스 공용)와 `src/renderer/src/shared`(renderer 전용 공용)는 다른 폴더.** 별칭으로 구분: `@shared/*` = 프로세스 공용, `@renderer/shared/*` = renderer 공용. renderer 공용 코드는 `@shared`를 import할 수 있지만 그 반대는 불가.
  - 공용 패키지는 별칭이 아니라 패키지 이름으로 import함: `@meeting-stt/core/merge`, `@meeting-stt/models/desktop`.
    파일 하나가 모듈 하나(`exports: { "./*": "./src/*.ts" }`)이므로 배럴 `index.ts`를 만들지 않음.
  - `@shared/*` 별칭은 `src/shared` 생성 시 `tsconfig.web.json`·`tsconfig.node.json`·`electron.vite.config.ts`(main/preload/renderer 모두)에 함께 추가.

## 전체 폴더 구조 (`apps/desktop`)

```
src/
├── shared/                              # 프로세스 공용 순수 TS (플랫 파일, vitest)
│   ├── types.ts                         # Meeting, MeetingDetail, Utterance, Speaker, SttSegment
│   ├── ipc.ts                           # IPC 채널 상수 + 요청/응답/이벤트 payload 타입
│   ├── audio.ts                         # 샘플레이트·청크 크기 (renderer/main 공용)
│   ├── merge.ts                         # assignSpeakers, mergeUtterances (순수 함수)
│   ├── merge.test.ts                    # 단위 테스트
│   ├── format.ts                        # 타임스탬프·복사용 텍스트 조립
│   └── format.test.ts
│
├── main/                                # Node 프로세스 (플랫 파일, 역할별 폴더)
│   ├── index.ts                         # 창 생성, 권한 요청, ipc 등록
│   ├── log.ts                           # 운영 로그 (console 직접 호출 금지)
│   ├── audio/wavWriter.ts
│   ├── pipeline/{queue,run,whisper,diarize}.ts
│   ├── db/{connection,migrations,meetings,utterances,speakers}.ts
│   ├── models/{registry,paths,download,recommend,service}.ts
│   ├── summary/{llama,run,paths,transcript}.ts
│   ├── updater.ts
│   ├── bin/{paths,spawn}.ts
│   └── ipc/handlers.ts
│
├── preload/
│   ├── index.ts                         # window.api (채널별 타입 붙은 함수)
│   └── index.d.ts                       # Window.api 타입 선언
│
└── renderer/
    ├── index.html
    └── src/
        ├── main.tsx
        ├── App.tsx
        ├── assets/                      # 진입 css(main.css)·레이아웃 치수(layout.css). 토큰·글꼴은 @meeting-stt/design
        ├── worklet/pcmRecorder.js       # AudioWorkletProcessor (`?url`로 import)
        │
        ├── pages/                       # 라우트 화면. widgets 배치만
        │   ├── Onboarding/index.tsx
        │   ├── Home/index.tsx
        │   ├── Record/index.tsx
        │   ├── MeetingDetail/index.tsx
        │   └── DecisionDetail/index.tsx     # 결정 문서 (test/usage-analytics 브랜치)
        │
        ├── modules/                     # 도메인 로직을 가진 컴포넌트
        │   ├── widgets/{domain}/AComponent/
        │   │   ├── index.tsx
        │   │   ├── index.module.css     # CSS Modules (세그먼트 아님, index.tsx 옆)
        │   │   ├── ui/
        │   │   │   ├── LoadingFallback.tsx
        │   │   │   └── ErrorFallback.tsx
        │   │   ├── model/
        │   │   │   └── use{Domain}.ts
        │   │   ├── context/
        │   │   │   └── {domain}Context.tsx
        │   │   ├── types/
        │   │   │   └── {domain}.ts
        │   │   └── test.tsx             # 통합 테스트
        │   └── features/{domain}/BComponent/
        │       ├── index.tsx
        │       ├── model/
        │       │   └── use{Domain}.ts
        │       └── utils/
        │           ├── formatDate.ts
        │           └── formatDate.test.ts
        │
        ├── shared/                      # renderer 전용 공용 코드
        │   ├── api/                     # window.api 래퍼 (유일한 window.api 접점)
        │   │   ├── meetings/index.ts
        │   │   ├── recording/index.ts
        │   │   ├── speakers/index.ts
        │   │   └── events/index.ts
        │   ├── components/
        │   │   ├── primitives/
        │   │   │   ├── ui/Button/index.tsx
        │   │   │   ├── layout/
        │   │   │   └── animation/
        │   │   └── composites/
        │   ├── hooks/
        │   │   ├── common/useInterval/index.ts
        │   │   └── domain/{domain}/useXxx/index.ts
        │   ├── provider/
        │   │   ├── context/{name}Context/index.tsx
        │   │   └── themeProvider/index.tsx
        │   ├── routes/{index.tsx,paths.ts,guards.tsx}   # 라우터 정의, path 상수, 가드
        │   ├── utils/
        │   │   └── formatDuration/
        │   │       ├── index.ts
        │   │       └── test.ts
        │   ├── constants/
        │   └── types/
        │
        └── __test__/                    # E2E (보류)
```

도메인 폴더 이름은 아래 중 하나로 통일. 새 도메인이 필요하면 이 목록에 추가.

| 도메인 | 다루는 것 |
| --- | --- |
| `meeting` | 회의 목록·상세·제목·삭제·복사 |
| `utterance` | 발화 텍스트 편집·화자 재배정 |
| `speaker` | 화자 이름 지정·병합 |
| `recording` | 마이크 녹음 시작/정지·레벨 |
| `pipeline` | 처리 진행률·상태·오류 |
| `model` | 모델 존재 확인·다운로드(온보딩) |
| `setting` | 앱 설정 조회·변경 (원본 WAV 보관, 업데이트 확인 등) |
| `update` | 새 버전 알림·다운로드·설치 (Phase 4, 기본 꺼짐) |
| `clipboard` | 시스템 클립보드 쓰기 (api 래퍼 전용 도메인, 컴포넌트 폴더는 만들지 않음) |
| `glossary` | 전역 용어 사전 조회·저장·초안 생성 (api 래퍼 전용 도메인. 화면은 `setting/GlossarySection`) |
| `llm` | LLM 공급자 상태 조회·공급자 저장·API 키 저장·연결 확인 (api 래퍼·`useLlmStatus` 훅. 화면은 `setting/LlmSection`) |
| `refine` | 회의록 자동 교정 — 진행률 구독·수동 재실행·고친 쌍 목록 (api 래퍼·`useRefine` 훅·`features/refine/RefinePanel`·외부 공급자 자동 교정 스위치 `features/refine/AutoRefineToggle`. 결과 자체는 회의 상세의 일부라 `useMeeting`이 든다) |
| `decision` | 결정 문서 (test/usage-analytics 브랜치, `references/decisions.md`) — 문서 화면 `widgets/decision/DecisionDocumentSection`(페이지 `pages/DecisionDetail`이 원문 패널 `meeting/TranscriptSection variant="panel"`을 `renderLayout`으로 끼움)·회의 상세 레일 카드 `widgets/decision/MeetingDecisionsCard`·추출 진행률 `features/decision/DecisionProgress`, 훅 `shared/hooks/domain/decision/*`, api 래퍼 `shared/api/{decisions,decisionTypes}`. 사이드 패널 결정 탭은 `meeting/MeetingSidebarSection` 안, 타입 설정 화면은 `setting/DecisionTypesSection` |
| `navigation` | 앱 셸 탐색 — 상단 GNB(알약 탭·목록 패널 토글·설정 버튼). 라우트 정의는 `shared/routes` (2026-09-28 knot 리디자인) |

## 레이어별 역할 (renderer)

### pages

라우트에 대응하는 화면 단위. widgets를 import해 **배치하는 레이아웃 역할만** 담당하며, 도메인 로직·데이터 요청은 갖지 않음. UI 단위가 크지 않은 경우에는 features를 page에서 바로 import 가능.

### modules/widgets

`<section />`으로 분류할 수 있을 만큼 규모가 큰, 화면의 독립적인 구획을 담당. 섹션 단위의 유저 플로우 전체(데이터 요청부터 액션까지)를 책임지는 지휘자. 예: `meeting/MeetingListSection`, `meeting/TranscriptSection`, `recording/RecorderSection`, `model/ModelDownloadSection`.

### modules/features

widgets 안에서 독립적으로 존재할 수 있는, 섹션이 되지 못하는 작은 도메인 단위. 필요한 데이터를 스스로 요청하고 할당받은 작업을 완결. 예: `recording/RecordButton`, `speaker/SpeakerRenameField`, `meeting/CopyTranscriptButton`.

### shared (renderer)

특정 도메인 컴포넌트에 강결합되지 않아 renderer 어디서든 쓸 수 있는 코드. `api`, `components`(primitives / composites), `hooks`(common / domain), `provider`, `routes`, `utils`, `constants`, `types`.

## Context / Provider / Routes

- `createContext`, `useContext`, `Provider` 세 가지는 파편화를 막기 위해 한 파일 안에 함께 작성.
- 전역 컨텍스트(테마, 설정, 토스트)는 `shared/provider`에서 관리.
- 특정 컴포넌트에서만 쓰이는 컨텍스트(컴파운드 패턴, prop drilling 제거용)는 `shared/provider`가 아니라 해당 컴포넌트 폴더의 `context` 세그먼트에 코로케이션 (`context/{이름}Context.tsx`).
- 라우트는 `shared/routes`에서 라우터 정의·path 상수·가드·리다이렉트를 함께 관리. 메모리/해시 라우터를 쓰므로 path 상수는 여기서만 참조.

## 네이밍 규칙 (폴더 구조 관점)

- renderer: 폴더명은 구현체 이름, 구현체 파일은 `index.ts(x)` (`Button/index.tsx`, `useRecorder/index.ts`). 코로케이션과 함께 변경에 유연함을 열어두기 위한 선택.
- **컴포넌트 세그먼트(`ui`/`model`/`utils`/`types`/`constants`/`context`) 내부는 예외**: 폴더 + `index.ts`를 다시 쓰지 않고 구현체 이름의 플랫 파일 (`ui/UtteranceRow.tsx`, `model/useTranscript.ts`).
- `src/shared`, `src/main`, `src/preload`, `packages/*/src`는 폴더 + `index.ts` 방식을 쓰지 않고 역할별 플랫 파일. React 레이어 규칙(widgets/features 등)도 적용하지 않음.
- 케밥 케이스 금지. 카멜(파스칼 포함)로 통일.
- 테스트 파일은 "인덱스 제외 나머지는 폴더" 규칙의 예외 (`test.ts`, `test.tsx`, `*.test.ts`).
