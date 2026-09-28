# 아키텍처: 프로세스 경계·디렉터리·IPC

데스크탑 앱(`apps/desktop`) 기준. 목차와 다른 주제는 `references/architecture.md`.

## 프로세스 경계

```
┌────────── renderer: 메인 창 (Chromium, React) ─────────────┐
│ 페이지: Onboarding / Home / Record / MeetingDetail / Settings │
│ 녹음은 직접 하지 않는다 — 명령을 보내고                     │
│ recording:state 이벤트로 상태를 구독만 한다                 │
│ 나머지는 window.api.* 호출 + 진행률 이벤트 구독             │
└───────────────────────────┬────────────────────────────────┘
┌────────── renderer: 녹음 호스트 (#/recorder, 숨은 창) ─────┐
│ 오디오 그래프의 유일한 소유자                               │
│ 녹음: getUserMedia → AudioContext(16kHz) → AudioWorklet    │
│       → Float32 PCM 청크를 IPC로 main에 전달               │
└───────────────────────────┬────────────────────────────────┘
                            │ contextBridge (preload, 타입 고정)
┌───────────────────────────┴──── main (Node) ───────────────┐
│ audio/   PCM 청크 → WAV 파일 append, 종료 시 헤더 확정      │
│          녹음 세션 상태(진행 중 회의·시작 시각·참석자 수) 보유 │
│ windows/ 메인 창·녹음 호스트 창 생성, Tray, 전역 단축키      │
│ pipeline/ 잡 큐(순차) → normalize → whisper(VAD 내장) → diarize → merge │
│ db/      better-sqlite3, 마이그레이션, 리포지토리           │
│ models/  모델 경로 해석, 다운로드(Range/체크섬), 존재 확인   │
│ bin/     플랫폼별 바이너리 경로 해석, spawn 래퍼            │
│ ipc/     handle 등록, 진행률·녹음 상태 send                 │
└────────────────────────────────────────────────────────────┘
```

- 파이프라인 실행은 UI 스레드와 분리한다. 1차는 main에서 `child_process.spawn`(비동기라 이벤트 루프를 막지 않음)으로 충분하며, 병합 로직이 무거워지면 `utilityProcess`로 옮긴다.
- renderer에서는 `fs`, `child_process`, `better-sqlite3`를 절대 import하지 않는다 (스캐폴드가 `sandbox: false`라도 규칙으로 금지).

## 디렉터리 배치 (목표)

워크스페이스 전체는 이렇게 생겼다 (`references/monorepo.md`).

```
apps/desktop/                 # 제품 Electron 앱 (패키지 이름 meeting-stt) — 아래 상세
apps/web/                     # 브라우저 추론 프로토타입 (docs/browser-prototype-plan.md)
packages/core/src/            # 순수 공용 로직 — types, merge, format, normalize(공식), speakerCount, audio
packages/models/src/          # 모델 카탈로그 — desktop.ts(동봉·다운로드 자산), web.ts(HF 저장소 id·dtype)
```

데스크탑 앱 내부:

```
scripts/                      # Phase 1 검증 스크립트 (`pnpm --filter meeting-stt exec tsx scripts/<name>.ts`)
  pipeline.ts                 # wav → normalize → whisper → diarize → merge → 콘솔/JSON 출력
  fixtures/                   # 테스트용 한국어 회의 WAV (git 제외)
resources/
  bin/darwin-arm64/whisper-cli, sherpa-onnx-offline-speaker-diarization, llama-cli (+ dylib)
src/
  shared/                     # 이 앱의 두 프로세스가 함께 쓰는 순수 TS (공용 로직은 @meeting-stt/core에 있다)
    types.ts                  # Meeting, MeetingDetail, Utterance, Speaker, AppSettings (+ core의 파이프라인 타입 재노출)
    ipc.ts                    # 채널 상수 + 요청/응답/이벤트 payload 타입
    audio.ts                  # 녹음 청크 크기·레벨 미터 (형식 상수 SAMPLE_RATE_HZ 등은 core에서 재노출)
    progress.ts               # 단계별 퍼센트 → 전체 진행률 (가중치, 순수 함수, vitest)
    summary.ts                # 요약 프롬프트·청킹 (Phase 5, 순수 함수)
    glossary.ts, refine.ts, phonetic.ts   # 용어 사전 초안·정리, 교정 후보·판정 프롬프트·쌍 적용·쌍 묶기, 자모 발음 유사도 (Phase 5-4, 순수 함수)
    llm.ts                    # LLM 공급자 라벨·준비 판정·CLI 인자 (순수 함수)
  main/
    index.ts                  # 앱 수명주기, 권한 요청, ipc 등록
    log.ts                    # 운영 로그 (console 직접 호출 금지)
    windows/{main,recorder,tray,shortcuts}.ts   # 메인 창·녹음 호스트 창·메뉴바·전역 단축키 (Phase 5-3)
    audio/{session,wavWriter,recordings}.ts   # 녹음 세션 상태·WAV append·파일 정리
    pipeline/{queue,run,normalize,whisper,diarize}.ts   # normalize는 RMS 게인 정규화(공식·상수는 @meeting-stt/core), vad는 whisper 내장이라 별도 단계 없음
    pipeline/{recluster,speakerEmbedding,embedWorker}.ts   # 화자 재군집 — CLI 구간 재임베딩(sherpa-onnx-node, utilityProcess) + k-means(@meeting-stt/core/cluster) (2026-09-25)
    types/sherpaOnnxNode.d.ts # sherpa-onnx-node에 타입 선언이 없어 쓰는 부분만 선언
    db/{connection,migrations,meetings,utterances,speakers,settings,refine}.ts   # refine은 자동 교정 결과 컬럼(refine_applied·refined_at) (Phase 5-4)
    models/{paths,download,recommend,service}.ts   # 경로 해석·다운로드·저사양 권장 (자산 목록은 @meeting-stt/models/desktop)
    summary/{llama,run,paths,transcript}.ts        # 요약 (Phase 5). LLM 호출은 llm/*을 거친다
    glossary/draft.ts, refine/{run,paths}.ts       # 용어 초안·회의록 자동 교정 (Phase 5-4). LLM 호출은 llm/*을 거친다
    llm/{provider,local,claudeApi,claudeCli,openaiApi,apiKey,check}.ts  # LLM 공급자 추상화 (아래 "LLM 공급자" 절)
    updater.ts                # electron-updater, 기본 꺼짐 (references/distribution.md)
    bin/{paths,spawn}.ts
    ipc/handlers.ts
  preload/index.ts            # window.api 타입 노출
  renderer/src/
    main.tsx, App.tsx
    assets/{main.css,layout.css}   # 진입 CSS(@meeting-stt/design의 fonts.css·base.css를 import)·데스크탑 레이아웃 치수 (아래 "화면 디자인" 절)
    worklet/pcmRecorder.js    # AudioWorkletProcessor (Vite `?url` import로 로드)
    pages/{Onboarding,Home,Record,MeetingDetail,Settings,RecorderHost}/index.tsx   # widgets 배치만
    shared/routes/{index.tsx,paths.ts,guards.tsx,layout.tsx}   # 라우터·경로 상수·온보딩 진입 가드·메인 창 레이아웃(정지 후 상세 이동)
    modules/widgets/{domain}/…    # section 단위 도메인 컴포넌트 (TranscriptSection, SettingsSection 등)
    modules/features/{domain}/…   # 작은 도메인 컴포넌트 (PipelineProgress 등)
    shared/api/{domain}/index.ts  # window.api 래퍼 (유일한 window.api 접점)
    shared/components/{primitives,composites}/…
    shared/hooks/{common,domain}/…   # useRecorder(녹음 호스트 전용), useRecordingState, useMeetings, usePipelineProgress
    shared/{provider,routes,utils,constants,types}/
    # 레이어·콜로케이션·세그먼트·훅 위치 규칙은 .claude/rules/*.md 를 따른다
```

## IPC 규약

`src/shared/ipc.ts` 한 곳에서 채널과 타입을 정의하고 양쪽이 import한다.

```ts
export const IPC = {
  // Phase 2
  recording: {
    requestPermission: 'recording:requestPermission',
    start: 'recording:start',
    chunk: 'recording:chunk',
    stop: 'recording:stop'
  },
  meetings:  { list: 'meetings:list', get: 'meetings:get' },
  events:    { progress: 'pipeline:progress' },
  // Phase 3
  //   meetings.rename / meetings.delete
  //   utterances.updateText / utterances.reassign
  //   speakers.rename / speakers.merge
  //   settings.get / settings.update
  //   clipboard.writeText
  // Phase 4 (references/distribution.md 3·7절)
  //   models.status / models.download / models.downloadSummary, events.modelDownload
  //   events.modelsChanged (다운로드가 끝나면 모든 창이 모델 상태를 다시 읽는다 — distribution.md 3절)
  //   update.check / update.download / update.install, events.updateAvailable
  // Phase 5
  //   summary.create, events.summary
  //   glossary.get / glossary.update / glossary.draft (Phase 5-4, 아래 "용어 사전" 절)
  //   refine.run, events.refine (Phase 5-4, 아래 "회의록 교정" 절 — 파이프라인 뒤 자동 실행, run은 수동 재실행)
  // Phase 5-3 (아래 "녹음 호스트 창 · 메뉴바 · 전역 단축키" 절)
  //   recording.state / recording.control / recording.setSpeakerCount / recording.reportError
  //   events.recordingState / events.recordingCommand
  //   shortcuts.setSuspended (단축키 설정, 아래 "전역 단축키" 절)
  // UI 리디자인 (아래 "화면 디자인" 절)
  //   meetings.search, events.meetingsChanged
  // 녹음본 재생·내보내기·다시 인식 (아래 같은 이름의 절)
  //   meetings.reprocess / meetings.exportAudio (재생은 IPC가 아니라 meeting-audio:// 프로토콜)
  // 결정 문서 전환 (test/usage-analytics 브랜치, references/decisions.md "IPC")
  //   decisions.list / get / ofMeeting / extract / search, decisionTypes.get / update, events.decisions
  //   main은 채널이 많아진 handlers.ts 대신 src/main/ipc/decisionHandlers.ts에 등록한다
  // 녹음 파일 가져오기 (아래 같은 이름의 절)
  //   meetings.import
  // LLM 공급자 선택 (아래 "LLM 공급자" 절)
  //   llm.status / llm.setProvider / llm.setApiKey / llm.setOpenaiModel / llm.check
  // 라이브 받아쓰기 (아래 같은 이름의 절)
  //   recording.setLiveTranscript (결과는 events.recordingState의 liveTranscript로 push)
  //   recording.setSystemAudio (결과는 events.recordingState의 systemAudio로 push, Phase 5-2)
  // 녹음 일시정지 (아래 "녹음 호스트 창 · 메뉴바 · 전역 단축키" > "일시정지·재개" 절)
  //   recording.setPaused (결과는 events.recordingState의 pausedAt으로 push)
  // 사용 정보 수집 (test/usage-analytics 브랜치 전용, references/telemetry.md)
  //   telemetry.track (renderer → main, 응답 없음. main이 이름 허용 목록·props 모양을 다시 거른다)
} as const
```

**Phase 5-3의 채널 문자열은 아래와 같이 고정한다.** 조회(invoke)와 push 이벤트가 같은 개념을 다루지만
채널 이름은 겹칠 수 없어 이벤트 쪽에 `Changed`를 붙인다.

| 키 | 채널 | 방향 | 용도 |
| --- | --- | --- | --- |
| `recording.state` | `recording:state` | invoke | 지금 녹음 중인지 조회. 늦게 열린 창이 현재 상태를 안다 |
| `recording.control` | `recording:control` | invoke | 메인 창이 보내는 시작/정지 요청. main이 호스트 창에 `recording:command`로 넘긴다 |
| `recording.setSpeakerCount` | `recording:setSpeakerCount` | invoke | 두 창의 참석자 수 입력을 main 세션에 모은다 |
| `recording.reportError` | `recording:reportError` | invoke | 호스트 창에서만 알 수 있는 실패(마이크 권한·그래프 생성)를 세션에 기록 |
| `shortcuts.setSuspended` | `shortcuts:setSuspended` | invoke | 설정 화면에서 단축키를 입력받는 동안 전역 단축키를 잠시 해제·복구 |
| `events.recordingState` | `recording:stateChanged` | push | 녹음 상태 브로드캐스트 |
| `events.recordingCommand` | `recording:command` | push | main → 호스트 창 지시 (전역 단축키·Tray·메인 창) |
| `recording.setLiveTranscript` | `recording:setLiveTranscript` | invoke | 녹음 화면의 파형 ↔ 라이브 받아쓰기 보기 전환 (2026-09-26, 아래 "라이브 받아쓰기" 절) |
| `recording.setSystemAudio` | `recording:setSystemAudio` | invoke | 온라인 회의 소리(스피커 출력) 함께 녹음 켜기/끄기. 켜면 도구를 1초 돌려 권한 창을 띄운다 (Phase 5-2, 아래 "시스템 오디오 캡처" 절) |
| `recording.setPaused` | `recording:setPaused` | invoke | 녹음 일시정지·재개 (2026-09-26, 아래 "일시정지·재개" 절) |

### 편집 채널의 응답 규약 (Phase 3)

**회의 상세를 바꾸는 모든 뮤테이션 채널은 갱신된 `MeetingDetail`을 그대로 돌려준다** (`meetings:get`과 같은 모양).
`meetings:delete`만 예외로 아무것도 돌려주지 않는다 — 지운 회의의 상세가 없기 때문이다.

- 이유: 화자 병합·재배정처럼 여러 행이 한꺼번에 바뀌는 작업도 renderer가 응답 하나로 상태를 정확히 맞출 수 있다.
  뮤테이션마다 "무엇이 바뀌었는지" 부분 응답을 설계하거나, 뮤테이션 뒤에 `meetings:get`을 한 번 더 부르는 왕복을 만들지 않는다.
- renderer는 응답을 `useMeeting`의 상세 상태에 그대로 덮어쓴다. 낙관적 업데이트는 하지 않는다 (로컬 SQLite라 왕복이 짧다).
- 요청 payload에는 대상 식별자와 함께 `meetingId`를 항상 넣는다. 응답을 만들 때 회의를 다시 찾지 않아도 되고, 핸들러가 "이 회의의 발화/화자인지"를 검증할 수 있다.

- `clipboard:writeText`는 main의 `electron.clipboard`로 텍스트를 복사한다. renderer의 `navigator.clipboard`를 쓰지 않는다 —
  패키징 빌드의 `file://` 문서와 `setPermissionRequestHandler`(마이크 외 전부 거부)에 걸릴 여지를 없애기 위해서다. 복사할 텍스트 조립은 renderer가 `@meeting-stt/core/format`으로 한다.

- 채널은 **그 Phase에서 실제로 쓰는 것만** 정의한다. 쓰지 않는 채널을 미리 선언해 두면 preload·renderer 래퍼까지 죽은 코드가 따라온다.
- `recording:requestPermission`은 마이크 권한 요청·확인 채널이다. renderer가 `getUserMedia`를 부르기 **전에** 호출하고,
  main이 `systemPreferences.askForMediaAccess('microphone')`(macOS) 결과를 돌려준다. 다른 플랫폼은 항상 허용으로 응답하고 실패는 `getUserMedia`에서 처리한다.
- `recording:chunk`도 `invoke`로 보낸다. `send`는 백프레셔가 없어 디스크 쓰기가 밀릴 때 큐가 무한정 쌓인다.

- 요청-응답: `ipcMain.handle(channel, (e, payload) => …)` ↔ `ipcRenderer.invoke`.
- 진행률/상태 push: main → `win.webContents.send(IPC.events.progress, { meetingId, stage, percent })`.
- preload는 채널별 함수를 `window.api`로 노출 (`api.meetings.list()` 등). `ipcRenderer` 객체 자체를 노출하지 않는다.
- PCM 청크 전송은 `ArrayBuffer`/`Uint8Array`로 보내고 main에서 즉시 파일에 append한다 (메모리 누적 금지).
