---
paths:
  - "apps/**"
  - "packages/**"
description: 모든 코드에 적용되는 전역 규칙(네이밍, 타입, 컴포넌트·훅·함수 작성 방식, React 원칙, 품질 기준). 코드 작성·수정·리뷰 시 항상 적용.
---

# 전역 코드 컨벤션

워크스페이스(apps/desktop · apps/web · packages/*)와 프로세스(main / preload / renderer / shared)에 무관하게 모든 코드에 적용됨.
아래 `src/…` 경로는 데스크탑 앱(`apps/desktop/`) 기준.
폴더 배치는 `.claude/rules/project-structure.md`, React 컴포넌트 규칙은 `component-abstract-pattern.md` / `component-colocation-pattern.md` / `segment-pattern.md` 참고.

포매팅은 프로젝트 prettier 설정(`singleQuote`, `semi: false`, `printWidth: 100`, `trailingComma: none`)을 따르며, 손으로 맞추지 않고 `pnpm run format`으로 맞춤. 이 문서의 예시 코드도 같은 스타일.

## 네이밍

### 폴더 및 파일명

- 폴더명: `camelCase` (도메인 폴더 `meeting`, `recording`). 컴포넌트·훅 폴더는 구현체 이름 그대로 (`MeetingListSection`, `useRecorder`)
- 파일명: 컴포넌트는 `PascalCase.tsx`, 그 외는 `camelCase.ts`
- 케밥 케이스 금지. 정적 파일(AudioWorklet, css)도 카멜로 통일 (`src/renderer/src/worklet/pcmRecorder.js`)
- renderer의 컴포넌트·훅·유틸은 폴더 + `index.ts(x)` 형태. 단, 컴포넌트 세그먼트 내부는 플랫 파일 (`.claude/rules/segment-pattern.md`)
- `src/shared`, `src/main`, `src/preload`(Node 쪽)와 공용 패키지 `packages/*/src`는 폴더 + `index.ts`를 쓰지 않고 역할별 플랫 파일 (`src/main/pipeline/whisper.ts`, `packages/core/src/merge.ts`)
- 타입 파일은 항상 `types/` 폴더 안에 내용을 나타내는 이름 (`types/meeting.ts`). `types.ts` 단일 파일·`types/index.ts` 금지 (프로세스 공용 `src/shared/types.ts`만 예외)

### 변수 및 함수명

- 함수·변수: `camelCase`
  - Boolean은 `is`로 시작 (`isRecording`, `isEditing`)
  - 여러 요소를 담으면 `s` 접미 (`utterances`, `speakers`)
  - UI가 리스트 형태면 `List` 접미 (`MeetingList`)
- 커스텀 훅: `use` + 이름 (`useRecorder`, `usePipelineProgress`)
- 컨텍스트: 이름 + `Context` (`transcriptContext`). 상태 관리 라이브러리를 쓰지 않으므로 `store` 네이밍 금지
- IPC 요청 함수: 목적 + 메서드 + `Api` (`getMeetingsApi`, `renameSpeakerApi`). 상세는 `.claude/rules/ipc-api-guide.md`

### 핸들러 함수

- **props로 전달되는** 핸들러: `on`으로 시작 (`onClick`, `onCommit`)
- **컴포넌트 내부** 핸들러: `handle`로 시작 (`handleClick`, `handleCommit`)

### 스타일(레이아웃) 요소 네이밍

- `Container`: **2개 이상**의 요소를 감쌀 때
- `Wrapper`: **1개**의 요소를 감쌀 때 (`<LevelMeterWrapper />`)

## 스타일

- **CSS Modules**를 쓴다. 컴포넌트 폴더의 `index.tsx` 옆에 `index.module.css`를 두고 `import styles from './index.module.css'`로 가져옴.
  UI 라이브러리·CSS-in-JS는 도입하지 않음 (의존성 없이 스코프가 격리되고, 코로케이션 규칙과도 맞기 때문).
- `index.module.css`는 세그먼트가 아니라 `index.tsx` 옆의 플랫 파일. 세그먼트 안의 서브 컴포넌트(`ui/UtteranceRow.tsx`)가 자기 스타일이 필요하면
  같은 이름의 `ui/UtteranceRow.module.css`를 옆에 둠.
- 색·간격·반경 같은 값은 `@meeting-stt/design/base.css`(`packages/design/src/base.css`)의 CSS 변수(`--color-*`, `--space-*`)로만 쓰고 컴포넌트에 하드코딩하지 않음. 웹 앱도 같음.
- 클래스명은 카멜 (`.utteranceRow`). 인라인 `style`은 값이 런타임에 계산되는 경우(레벨 미터 너비, 진행률 바)에만 사용.

## 상수

- 모듈 레벨 상수: `SNAKE_CASE`, 함수 **내부** 상수: `camelCase`
- **매직 넘버 금지.** `16000`, `4096`, `0.5` 같은 값은 이름 붙인 상수로 두고, 단위를 이름에 포함 (`SAMPLE_RATE_HZ`, `CHUNK_SAMPLES`, `PROGRESS_POLL_MS`, `MIN_UTTERANCE_SEC`)
- 프로세스 양쪽에서 쓰는 상수(IPC 채널, 샘플레이트)는 `src/shared`에 한 번만 정의

## 타입

- `any` 금지. 외부 입력(바이너리 stdout JSON, IPC payload, DB row)은 `unknown`으로 받아 좁힌 뒤 사용
- **type vs interface**: 객체는 `interface`, 유니온·별칭·튜플은 `type`
- **리턴 타입은 명시하지 않음** — 추론에 맡김. 예외: `src/shared/ipc.ts`의 요청/응답 타입은 양 프로세스의 계약이므로 명시
- 초기값에 타입을 지정해 이후 추론을 타입 시스템에 맡김
- 컴포넌트 props 타입: `컴포넌트명 + Props` **interface**
- 훅·함수의 인자 타입: `함수명 + Params` **interface**
- IPC 요청/응답 타입: `Request`, `Response` 접미 (`RenameSpeakerRequest`, `GetMeetingResponse`)
- 파이프라인 중간 산출물 타입(`SttSegment`, `SpeakerSegment`, `SpeakerPiece`, `MergedUtterance`)은 `packages/core/src/types.ts`에서만 정의하고 두 앱이 그것을 import함. 제품 타입(`Meeting`, `Utterance`, `Speaker`, `AppSettings`)은 `src/shared/types.ts`에서만 정의. 프로세스·워크스페이스별로 재정의하지 않음

```tsx
interface UtteranceEditorProps {
  utteranceId: number
  initialText: string
}

export default function UtteranceEditor({ utteranceId, initialText }: UtteranceEditorProps) {
  const handleCommit = () => {
    // ...
  }
  // ...
}
```

```ts
interface UsePipelineProgressParams {
  meetingId: number
}

const usePipelineProgress = ({ meetingId }: UsePipelineProgressParams) => {
  // ...
  return { stage, percent }
}

export default usePipelineProgress
```

## 컴포넌트 · 훅 · 함수 작성

- 컴포넌트는 `export default function` 형식
- 커스텀 훅은 화살표 함수로 선언하고 파일 끝에서 `export default`. **객체 반환** (배열 X — 확장성)
- 파라미터가 **2개 이상**이면 객체 구조 분해로 받기

  ```ts
  export const formatTimestamp = ({ sec, withHours }: FormatTimestampParams) => {}
  ```

- **불변성**: 상태·props·인자를 직접 변경하지 않음. spread / `map` / `filter` / `toSorted` / `with`로 새 값을 만듦. 상태 배열에 `push`·`sort`·`splice` 금지
- 함수는 50줄, 파일은 400줄을 넘기지 않음. 넘으면 분리 신호
- 중첩 4단계 이상 금지. 조기 반환(early return)으로 평탄화
- 디버그용 `console.log`는 커밋 전 제거. main의 운영 로그는 한 곳의 로거 유틸을 통해서만 출력
- **에러 처리**: IPC 호출·spawn·파일 IO처럼 실패할 수 있는 작업은 호출 지점에서 처리하고, 사용자에게는 한국어 안내 문구를 보여줌. 빈 `catch` 금지, 삼킨 에러는 최소한 로그
- 주석은 "왜"만 적음. 코드가 "무엇"을 하는지 반복하는 주석 금지. 이모지 금지
- JSDoc은 공개 API에만 필수: `src/shared/*` export, `window.api` 함수, IPC 요청 함수
- `TODO`는 Phase 번호나 이슈 없이 남기지 않음 (`// TODO(Phase 3): 미완료 녹음 복구`)

## React 원칙

- 상태는 그것을 쓰는 곳에 가장 가깝게 둠. 상태 끌어올리기보다 컴포넌트가 자기 상태를 갖도록 (composites는 컴파운드 / FACC 패턴)
- 파생값은 상태로 두지 않고 렌더 중 계산
- `useEffect`는 **외부 시스템 동기화**(IPC 이벤트 구독, `AudioContext`, DOM 측정)에만 사용. 상태→상태 동기화, 데이터 변환에 쓰지 않음
- 구독·타이머·`AudioContext`는 반드시 cleanup 반환
- `useMemo` / `useCallback` / `memo`는 리렌더 문제가 **실제로 확인된 뒤**에만. 먼저 상태 위치 조정·컴포넌트 분리로 해결
- 리스트 `key`는 DB id. index 금지
- 조건부 렌더 분기가 3개 이상이면 `SwitchCase` 같은 composite나 early return으로 정리
- 접근성: 아이콘 전용 버튼에 `aria-label`, 인라인 편집 요소는 키보드로 진입·확정·취소 가능
- 무거운 작업(추론, 파일 IO, DB)은 renderer에서 하지 않음. renderer는 `window.api` 호출과 진행률 수신만

## 임포트 경로

- 경로 별칭을 사용하고 상대 경로 남용 금지
  - `@renderer/*` → `src/renderer/src/*`
  - `@shared/*` → `src/shared/*` (한 앱의 프로세스 공용, 순수 TS)
  - `@meeting-stt/core/*`, `@meeting-stt/models/*` → 워크스페이스 공용 패키지. 별칭이 아니라 패키지 이름이라 두 앱에서 같은 경로로 import함
- 상대 경로는 **같은 폴더 또는 하위 폴더**에서만 (`./model/useTranscript`, `./ui/UtteranceRow`)
- 절대 경로 그룹과 상대 경로 그룹 사이는 빈 줄로 구분

```tsx
// src/renderer/src/modules/widgets/meeting/TranscriptSection/index.tsx
import type { Utterance } from '@shared/types'
import Button from '@renderer/shared/components/primitives/ui/Button'

import UtteranceRow from './ui/UtteranceRow'
import useTranscript from './model/useTranscript'
```

- **프로세스 경계 임포트 금지 목록**
  - renderer: `fs`, `path`, `child_process`, `electron`, `better-sqlite3` import 금지 (`sandbox: false`여도 규칙으로 금지)
  - main / preload / shared: `react`, `react-dom` import 금지
  - `packages/*`: `electron`, `fs`, `path`, `child_process`, `react`, DOM API(`window`, `AudioContext`) import 금지. 앱과 다른 패키지도 import하지 않음 (`references/monorepo.md`)
  - 런타임은 Node 22+ (Electron). Node 전용 API는 main/preload에서만, 브라우저 전용 API(`window`, `AudioContext`)는 renderer에서만 사용
