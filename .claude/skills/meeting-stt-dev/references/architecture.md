# 아키텍처: 프로세스 경계, 디렉터리, IPC

이 문서는 **데스크탑 앱(`apps/desktop`)** 내부를 다룬다. 아래 `src/…`, `scripts/…`, `resources/…`는 모두 `apps/desktop/` 기준이고, 워크스페이스 경계와 공용 패키지는 `references/monorepo.md`에 있다.

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

## 외부 바이너리·모델 확보 (커밋하지 않는다)

`whisper-cli`, `sherpa-onnx-offline-speaker-diarization` 같은 실행 파일과 `*.bin`/`*.onnx` 모델은
용량이 크고 재현 가능하므로 **git에 커밋하지 않는다**(`.gitignore`에 `resources/bin/`, `*.bin`, `*.onnx`).
대신 셋업 스크립트로 내려받아 배치한다.

| 스크립트 | 하는 일 | 배치 위치 |
| --- | --- | --- |
| `pnpm setup:bin` | 현재 플랫폼용 실행 파일 확보(다운로드 또는 로컬 설치본 복사), 실행 권한 부여, macOS 격리 속성 제거 | `resources/bin/<platform>-<arch>/` |
| `pnpm setup:models` | Whisper·diarization 모델 다운로드(Range 이어받기, SHA256 검증) | `scripts/fixtures/models/` (Phase 1 전용) |

- Phase 1 스크립트는 위 두 경로를 상수로 참조한다. 앱 런타임의 모델 경로는 `app.getPath('userData')/models`로 별개이며,
  Phase 4 온보딩 다운로더가 `scripts/setupModels.ts`와 같은 카탈로그(`@meeting-stt/models/desktop`)를 공유한다.
- 패키징·CI는 `electron-builder` 실행 **전에** `setupBin.ts`를 돌려 `resources/bin/`을 채운다. 비어 있으면 빌드를 중단한다.
- macOS에서 Homebrew 등 시스템에 이미 설치된 실행 파일이 있으면 복사해 쓸 수 있다. 단 동적 링크된 dylib에 의존하므로
  **배포용으로는 정적/동봉 빌드를 따로 확보**해야 한다(Phase 4). Phase 1 검증에는 시스템 설치본 복사로 충분하다.

## 외부 바이너리 실행

```ts
// src/main/bin/spawn.ts (개념)
spawn(binPath, args, { windowsHide: true })
  .stdout → 라인 단위 파싱 (whisper: --print-progress로 진행률, --output-json으로 결과 파일)
  .stderr → 로그 보관, 실패 시 사용자 안내 메시지에 포함
  exit code ≠ 0 또는 JSON 파싱 실패 → meetings.status = 'error', error_message 저장
```

- 바이너리 경로: 개발 시 `resources/bin/...`, 패키징 시 `process.resourcesPath` 아래 `app.asar.unpacked/resources/bin/...`. 경로 해석은 `src/main/bin/paths.ts`에서만 한다.
- whisper 호출 예: `whisper-cli -m <model> -f <wav> -l ko -mc 0 --output-json-full -of <out> --print-progress` (+ 단어 타임스탬프 옵션, VAD 옵션은 Phase 1 튜닝 결과 반영).
- diarization 호출 파라미터: **항상 `--clustering.num-clusters=<참석자 수, 모르면 12>`** 로 돌린다(참석자 수는 녹음 정지 시 사용자가 입력, `meetings.speaker_count`). 2026-09-25부터 CLI의 화자 라벨은 쓰지 않고 구간 경계만 쓴다 — 군집은 아래 "화자 재군집"이 다시 한다. 임계값(`--clustering.cluster-threshold`)은 스크립트 실험용으로만 남긴다(임계값 군집은 녹음 길이에 비례해 화자가 늘어난다, `docs/phase1-results.md` 6절). 참석자 수를 모를 때 12를 주는 이유는 임계값보다 구간이 덜 잘게 쪼개져 재임베딩 조각이 길어지고, 재군집이 실패했을 때의 폴백 결과도 32명보다 낫기 때문이다. 최소 지속 시간은 기본값 유지. 프로바이더는 CPU 고정(`coreml`은 훨씬 느림).
- 참석자 수가 있으면 병합 단계의 군소 화자 흡수(`absorbMinorSpeakers`)를 건너뛴다 — K개로 자른 클러스터는 전부 실제 화자로 보고, 짧게 한 마디 한 참석자를 지우지 않기 위해서다. 참석자 수가 없으면 과분할(K=12)에서 병합 보호로 되돌아오지 못한 몇십 초짜리 여분 클러스터가 남을 수 있어 흡수를 적용한다.
- 참석자 수를 실제보다 크게 넣어도 sherpa-onnx는 실패하지 않고 **K개 이하**로 나눈다(합성 3화자 115초에 `num-clusters=10` → 7개, 5초 녹음에 3 → 2개). 재군집의 k-means도 조각 수가 K보다 적으면 조각 수로 줄인다. 그래도 남는 과분할은 Phase 3의 화자 병합 UI로 고칠 수 있으므로 main에서 따로 막지 않는다.
- 음량 정규화: whisper·diarization을 spawn하기 **전에** `src/main/pipeline/normalize.ts`가 녹음 WAV의 PCM에 RMS 게인을 적용한 WAV를 만들고, 두 바이너리는 그 파일을 읽는다. 원본은 정규화본과 별개로 두며 삭제 정책은 원본에만 적용된다. 파라미터는 SKILL.md 결정 표 참고.

### 화자 재군집 (2026-09-25)

sherpa-onnx CLI는 분할(pyannote)·임베딩(ERes2Net)·군집(complete-linkage)을 한 번에 하지만 **군집만 품질을 깎는다.**
같은 임베딩으로 군집만 바꾸면 7명·103분 회의에서 화자 정확도 83.4% → **92.7%**(참석자 수 7), 참석자 수를 모를 때 63.8%(32명) → **92.9%**(9명, 여분은 20~80초짜리)다 — 앱과 같은 TS 코드로 잰 값.
임베딩 모델을 바꿔도 이득이 없다(상한 94~95%로 같음). 실측과 대안 비교는 `docs/diarization-clustering-results.md`(TS 검증은 11절), 채택한 것은 그 문서의 "안 A"다.
발표형 원거리 녹음(geumtoro)은 참석자 수 없이는 발표자가 여러 클러스터(10명)로 남는다 — 참석자 수 입력을 계속 권장하는 이유다.
CLI가 임베딩을 내보내지 않으므로 앱이 **구간을 다시 임베딩**한다. 분할·바이너리·온보딩 모델은 바꾸지 않는다.

흐름 (`src/main/pipeline/recluster.ts`, `diarize` 단계 안):

1. CLI 결과 구간(`SpeakerSegment[]`)에서 라벨을 버리고 각 구간을 **5초 이하 조각으로 균등 분할**한다 (`splitIntoChunks`, `@meeting-stt/core/cluster`).
   pyannote 창 조각(평균 1~2초)보다 길어 임베딩이 안정된다 — 1초 미만 조각은 정답 중심 최근접으로도 45%뿐이다. 3초로 잘라도 결과는 같다.
2. 조각마다 정규화본 WAV의 해당 샘플을 `sherpa-onnx-node`의 `SpeakerEmbeddingExtractor`(온보딩에서 받은 것과 같은 ERes2Net 모델 파일)에 넣어 임베딩을 뽑는다
   (`src/main/pipeline/speakerEmbedding.ts`, 순수 Node 함수 — 스크립트도 같은 함수를 쓴다). 준비되지 않은 조각(`isReady`가 false, 너무 짧음)은 건너뛴다.
   - 임베딩 계산은 **동기 API**라 main에서 부르면 70초 넘게 이벤트 루프가 멈춘다. `src/main/pipeline/embedWorker.ts`를 `utilityProcess.fork`로 띄워 그 안에서 돌리고
     (`import embedWorkerPath from './embedWorker?modulePath'`), 진행률·결과를 `parentPort` 메시지로 받는다 (`src/main/pipeline/embed.ts`).
     WAV 읽기는 워커가 `sherpa-onnx-node`의 `readWave`로 직접 한다 — main이 200MB 샘플을 워커로 복사하지 않는다.
   - 스레드 수는 화자 분리 CLI와 같은 `threadPlan().diarize`다 ('조용히 처리'도 그대로 적용).
3. 임베딩을 L2 정규화해 **k-means**(k-means++ 초기화, 고정 시드, 10회 재시작 중 관성 최소)로 K개로 묶는다.
   K는 참석자 수, 모르면 **12** (`OVERSPLIT_CLUSTER_COUNT`). 조각 수가 K보다 적으면 조각 수.
4. **중심 병합 보호**: 클러스터 중심(정규화 평균) 간 코사인이 **0.75 이상**인 쌍을 가까운 순으로 반복해 합친다 (`CENTROID_MERGE_MIN_COSINE`).
   k-means는 K가 실제보다 크면 큰 화자를 쪼개는데(K=9에서 79%), 쪼개진 조각의 중심은 서로 가깝고(0.7~0.9) 실제 화자끼리는 멀어서(정답 중심 최대 0.69, 5초 조각의 K=7 중심은 0.6 미만)
   이 값이면 조각만 되돌아간다. 0.7이 K를 크게 넣었을 때는 조금 더 좋지만(K=9에서 8명 → 7명, +1.3%p) K를 적게 넣었을 때 실제 화자를 하나 더 합친다(K=6: 92.7% → 87.0%). 0.75를 택한다 —
   **UI에 화자 병합은 있어도 분리는 없으므로** 덜 합쳐서 남은 여분 화자는 사용자가 고칠 수 있고, 목소리가 비슷한 두 사람을 합쳐 버리면 복구할 수 없다.
   임계값은 임베딩 모델에 묶인 값이다(eres2netv2·titanet은 0.75에서 실제 화자까지 합친다). 모델을 바꾸면 다시 잰다.
5. 라벨을 등장 순서로 `speaker_00`, `speaker_01`…로 다시 매기고 조각을 `SpeakerSegment[]`로 돌려준다. 이후 `assignSpeakers` → `mergeUtterances`는 그대로다.

건너뛰는 경우와 폴백:

- 참석자 수가 1이거나 조각이 2개 미만이면 재군집하지 않는다 (CLI 결과 그대로).
- 임베딩 애드온 로드 실패·모델 오류·워커 비정상 종료 등 **재군집이 실패하면 CLI 라벨로 폴백**하고 `warn` 로그를 남긴다. 회의록이 아예 안 나오는 것보다 낫다.
  잡은 `status='done'`으로 끝나며 사용자에게 따로 알리지 않는다 (폴백 품질은 2026-09-24까지의 앱과 같다).
- 진행률: 별도 `PipelineStage`를 두지 않는다 (정규화와 같은 이유 — IPC 계약·진행률 UI가 함께 바뀐다). `diarize` 단계 안에서 CLI 퍼센트를 **0~90%**, 임베딩 진행을 **90~100%** 로 매핑한다.
  재임베딩은 조각이 1,500~2,000개뿐이라 CLI 임베딩(창마다 겹쳐 8,000개 이상)의 10분의 1 시간이다 (103분 회의: CLI 864초 + 70초, 3스레드 기준).

의존성·배포:

- `sherpa-onnx-node`(1.13.8, N-API 애드온)를 `apps/desktop`의 `dependencies`에 둔다. 플랫폼 패키지 `sherpa-onnx-darwin-arm64`(약 34MB, 자체 `libonnxruntime.dylib` 포함)가 optionalDependency로 따라온다.
  N-API라 Electron ABI 리빌드가 필요 없고 install 스크립트도 없다(`onlyBuiltDependencies`에 넣지 않는다). 애드온은 `@loader_path` rpath로 옆의 dylib을 찾으므로 `DYLD_LIBRARY_PATH`가 필요 없다.
- 패키징에서 `.node`가 든 모듈은 electron-builder가 asar 밖으로 풀고 서명한다. 명시적으로 `asarUnpack`에 `node_modules/sherpa-onnx-darwin-arm64/**`를 적어 둔다 (`references/distribution.md` 5절).
- 순수 로직(조각 분할·k-means·병합·라벨 재배정)은 `packages/core/src/cluster.ts`에 두고 vitest로 검증한다. 브라우저 프로토타입도 같은 군집을 쓸 수 있다(현재는 complete-linkage 그대로).

## 가속·스레드 정책

대상은 Apple Silicon 하나뿐이므로 플랫폼 분기를 두지 않는다.

**GPU는 이미 쓰고 있다.** whisper.cpp는 Metal 백엔드가 기본으로 켜져 있고(`-ng`로 꺼야 CPU로 떨어진다),
llama.cpp도 `-ngl` 없이 전 레이어를 Metal에 올린다(`load_tensors: offloaded 37/37 layers to GPU`).
CPU만 쓰는 것은 sherpa-onnx 화자 분리뿐이다 — `coreml` 프로바이더가 CPU보다 훨씬 느려 CPU로 고정했다.

**문제는 스레드 수였다.** 셋 다 `os.cpus().length - 2`를 받고 있었는데, `os.cpus()`는 성능 코어와 효율 코어를
구분하지 않는다. M3 Pro(P6+E6)에서 10을 주면 효율 코어까지 잡아 **느려지면서 발열만 는다.**

측정: 120초 16kHz mono WAV, M3 Pro, 2026-08-26.

| 대상 | 설정 | 실행 시간 | CPU |
| --- | --- | --- | --- |
| whisper (turbo-q5, VAD 켬) | `-t 10` | 6.11초 | 44% |
| whisper | `-t 4` | 6.11초 | 42% |
| whisper | `-t 4 -ng` (GPU 끔) | 20.7초 | 294% |
| 화자 분리 | `-t 10` | 18.2초 | 915% |
| 화자 분리 | `-t 6` | **10.8초** | 593% |
| 화자 분리 | `-t 4` | 13.8초 | 397% |
| 요약 (Qwen3-4B-Q4_K_M, 4K 프롬프트·128토큰) | `-t 10` | 12.5초 (CPU 8.7초) | — |
| 요약 | `-t 4` | 10.6초 (CPU 3.3초) | — |
| 요약 | `-t 2` | 10.6초 (CPU 1.5초) | — |

읽는 법:

- **whisper는 스레드에 반응하지 않는다.** GPU가 일하고 CPU는 40%대에 머문다. 낮게 줘도 손해가 없고,
  화자 분리와 병렬로 돌 때 코어 경합만 줄어든다.
- **화자 분리가 유일한 열원이다.** 성능 코어 수(6)를 넘기면 그 순간부터 느려진다.
- **요약도 GPU 추론이라 스레드는 Metal 커맨드 버퍼 인코딩·스핀 대기에만 쓰인다.** `-t 2`와 `-t 4`가 같은 속도인데
  CPU 시간은 두 배 차이다.

파이프라인의 병렬 구간(STT + 화자 분리 동시 실행)을 같은 WAV로 전후 비교한 결과:

| 설정 | 실행 시간 | CPU | 누적 CPU 시간 |
| --- | --- | --- | --- |
| 이전 (`-t 10` / `-t 10`) | 18.0초 | 979% | 174.7초 |
| 현재 (`-t 4` / `-t 6`) | **13.9초** | 608% | **82.9초** |

정책 (`src/main/bin/threads.ts`가 단독으로 정한다):

| 대상 | 스레드 | 이유 |
| --- | --- | --- |
| 화자 분리 (`sherpa-onnx`) | 성능 코어 수 | 실측 최적. 유일하게 CPU로 도는 단계다 |
| STT (`whisper-cli`) | `min(4, 성능 코어 수)` | GPU가 일한다. 더 줘도 같은 속도라 화자 분리에 코어를 양보한다 |
| 요약 (`llama-cli`) | `min(2, 성능 코어 수)` | 같은 속도에 CPU 시간 1/6 |

- 성능 코어 수는 `sysctl -n hw.perflevel0.logicalcpu`로 얻고 프로세스 수명 동안 캐시한다.
  **`execSync`는 쓰지 않는다** — main에서 동기 spawn은 UI를 멈춘다(`references/pitfalls.md`). 비동기로 한 번 부르고 결과를 재사용한다.
  실패하면 `os.cpus().length`의 절반으로 떨어뜨린다 (Apple Silicon은 성능·효율 코어가 대체로 반반이다).
- **QoS를 낮춰 효율 코어로 밀어내지 않는다.** `taskpolicy -b`로 화자 분리를 돌리면 10.8초 → 116.7초로 **10배 느려진다.**
  조용해지는 대신 71분 회의의 화자 분리가 한 시간을 넘기므로 선택지가 아니다.
- STT와 화자 분리의 병렬 분기(`os.cpus().length >= 8`)는 그대로 둔다. whisper가 CPU를 거의 쓰지 않아 겹쳐도 경합이 없다.

### 조용히 처리 (`pipeline.quiet`, 기본 꺼짐)

위 정책은 **가장 빠른** 설정이고, 그 대가로 화자 분리가 녹음 1분당 약 6.5초 동안 성능 코어 전부를 100%로 쓴다.
한 시간짜리 회의면 7분 넘게 풀가동이라 팬이 크게 돈다. 속도보다 소음을 원하는 사용자를 위해 설정 토글을 둔다.

측정: 실제 녹음 10분 발췌(`geumtoro-10min-rmsnorm.wav`), `num-clusters=3`, M3 Pro(P6), 실행 사이 45~60초 휴지, 2026-09-18.

| 화자 분리 스레드 | 실행 시간 | CPU | 누적 CPU 시간 |
| --- | --- | --- | --- |
| 6 (기본) | 63.7초 | 583% | 371초 |
| 4 | 74.8초 (+17%) | 389% | 291초 |
| **3 (조용히)** | **91.9초 (+44%)** | **294%** | **270초** |
| 2 | 132.4초 (+108%) | 193% | 256초 |

- 6스레드를 연속 측정에서 처음 돌렸을 때는 77.0초가 나왔다. 앞선 측정의 열이 남아 있던 탓으로 보고, 4 → 6 순서로 다시 잰 값을 표에 적었다.
- **3스레드(성능 코어의 절반)를 고른다.** CPU 부하(발열)가 절반이 되고 시간은 44% 는다. 2스레드는 시간이 두 배가 되는데 누적 CPU 시간은 거의 줄지 않는다(270초 → 256초).

정책 (`src/main/bin/threads.ts`의 `planThreads`가 `isQuiet`를 받아 정한다):

| 대상 | 기본 | 조용히 처리 |
| --- | --- | --- |
| 화자 분리 | 성능 코어 수 | `ceil(성능 코어 수 / 2)` |
| STT | `min(4, 성능 코어 수)` | 같음 (GPU가 일한다) |
| 요약 | `min(2, 성능 코어 수)` | 같음 (요약은 이 설정을 보지 않는다) |
| STT와 화자 분리 | 코어 8개 이상이면 병렬 | **항상 순차** (STT → 화자 분리). GPU와 CPU 발열이 한 방열판에 겹치지 않게 한다 |

STT + 화자 분리 전체(같은 입력, 실행 전 60초 휴지):

| 설정 | 실행 시간 | CPU 평균 (최대) | GPU 평균 | 누적 CPU 시간 |
| --- | --- | --- | --- | --- |
| 기본 (병렬, `-t 4` / `-t 6`) | 69.7초 | 596% (678%) | 38% | 415초 |
| 조용히 처리 (순차, `-t 4` → `-t 3`) | 116.9초 (+68%) | **228% (301%)** | 22% | **266초** |

- 전체 시간은 1.7배가 되고, CPU 평균 부하는 40% 수준·최대 부하는 절반 이하로 내려간다. 한 시간 회의로 환산하면 약 7분 → 약 12분이다.

- 설정은 `queue.ts`가 **잡이 시작할 때** 한 번 읽어 `runPipeline({ isQuiet })`로 넘긴다. `run.ts`는 DB를 모른다. 진행 중인 잡에는 적용되지 않는다.
- 효율 코어로 밀어내는 방식(`taskpolicy -b`)은 여전히 쓰지 않는다 — 10배 느려진다.

### 화자 분리를 GPU(CoreML)로 돌리지 않는 이유

CoreML이 느린 원인은 **임베딩 모델 입력 길이가 호출마다 달라서**다 (2026-09-18 측정).

- 1분 녹음: 구간 분할 CPU 0.9초 / CoreML 1.1초로 비슷하고, 임베딩이 CPU 5.2초 / **CoreML 24.7초**로 병목이다.
- sherpa-onnx는 발화 조각마다 임베딩 모델(ERes2Net, 9.9M 파라미터, 입력 `[N, T, 80]`)을 한 번씩 부르고 `T`가 조각 길이를 따라 바뀐다.
  모델만 onnxruntime 1.30으로 30회 호출하면 길이 고정(5초)일 때 CoreML 86ms / CPU 149ms로 CoreML이 빠르지만,
  1~10초로 바꿔 가며 넣으면 **CoreML 315ms / CPU 137ms**로 뒤집힌다. 새 길이마다 CoreML의 첫 호출 비용(800~900ms)이 반복된다.
- 구간 분할 모델(pyannote)은 LSTM을 CoreML이 지원하지 않아 노드 50개 중 16개만 CoreML로 가고 7조각으로 나뉜다. 다만 이 단계는 1초 남짓이다.
- 입력 길이를 몇 개 크기로 패딩하면 CoreML이 빨라질 여지는 있지만, CLI에 옵션이 없어 sherpa-onnx를 고쳐야 하고
  임베딩이 시간축 평균이라 패딩이 값을 바꾼다. 채택하지 않는다.

## 앱 런타임 경로 (Phase 2)

| 대상 | 개발(`pnpm dev`) | 패키징 |
| --- | --- | --- |
| 바이너리 | `resources/bin/<platform>-<arch>/` | `process.resourcesPath/app.asar.unpacked/resources/bin/<platform>-<arch>/` |
| 모델 | `userData/models/` → 없으면 `scripts/fixtures/models/` 폴백 | `userData/models/` (Phase 4 온보딩이 채운다) |
| 녹음 WAV | `userData/recordings/<meetingId>.wav` | 같음 |
| DB | `userData/meetings.db` | 같음 |

- 경로 해석은 `src/main/bin/paths.ts`·`src/main/models/paths.ts`에서만 한다. 다른 모듈이 `app.getPath`를 직접 부르지 않는다.
- **모델 폴백은 개발 모드 전용이다.** Phase 4 온보딩 다운로더가 붙기 전까지 `pnpm setup:models`로 받아 둔 Phase 1 픽스처 모델을 그대로 쓰기 위한 장치이며, 패키징 빌드에서는 폴백하지 않는다.
- 시작 시 바이너리·모델이 없으면 앱은 뜨되 파이프라인 잡이 `status='error'`로 끝나고, 사용자에게 "모델이 준비되지 않았습니다" 안내를 남긴다.

## 파이프라인 잡 큐 (Phase 2)

- `src/main/pipeline/queue.ts`는 **동시성 1**의 메모리 큐다. 여러 회의를 동시에 돌리지 않는다 (`references/pitfalls.md`).
- 한 잡의 흐름: `status='processing'` → `normalize`(RMS 게인 WAV 생성) → whisper(`stt`) / diarization(`diarize`) → `merge` → `save`(트랜잭션 INSERT) → `status='done'`.
  코어가 8개 미만이면 STT와 화자 분리를 순차 실행한다.
- 정규화본은 원본 옆에 `<meetingId>.wav.norm.wav`로 만들고 whisper·diarization이 그 파일을 읽는다. 잡이 끝나면 **실패해도 지운다** — 원본에서 다시 만들 수 있는 파생물이다.
  정규화에는 별도 `PipelineStage`를 두지 않고 `stt` 0%에 묶는다. 단계를 늘리면 `src/shared/ipc.ts` 계약과 Phase 3 진행률 UI가 함께 바뀌는데, 정규화는 spawn 없이 끝나는 짧은 단계다.
- 실패하면 `status='error'`, `error_message`에 한국어 안내를 남기고 **원본 WAV는 지우지 않는다**(재시도용).
- 잡이 **성공**하면 설정 `audio.keep`(기본 꺼짐)에 따라 원본 WAV를 지우고 `meetings.audio_path`를 `NULL`로 만든다 (Phase 3).
  71분 16kHz mono WAV가 약 136MB라 기본값을 보관으로 두면 디스크가 빠르게 찬다.
  지운 회의는 재생·내보내기·다시 인식을 할 수 없다 — 그래서 실패한 잡에는 이 정책을 적용하지 않는다 (아래 "녹음본 재생·내보내기·다시 인식").
- 진행률은 각 단계 시작·종료와 whisper/sherpa의 퍼센트 로그를 `pipeline:progress`로 push한다. 마지막에 `stage='done'` 또는 `'error'`를 한 번 보낸다.
  `percent`는 **그 단계 안에서의 퍼센트**다. 여러 단계를 하나의 막대로 합치는 계산은 renderer가 `src/shared/progress.ts`로 한다.
  `diarize`는 CLI(0~90%)와 재임베딩(90~100%)을 한 단계로 묶는다 ("화자 재군집").
- 앱 시작 시 `status`가 `'recording'`·`'processing'`인 채로 남은 회의는 이전 실행이 비정상 종료된 것이므로 `'error'`로 정리한다. (미완료 녹음 복구는 Phase 3)
  같은 시점에 `recordings/`의 파생물(`*.norm.wav`, `*.whisper.json`)도 지운다 — 잡 중간에 앱이 죽으면 `finally`가 돌지 않아 남는다(2026-08-26 관통 검증에서 확인). 원본 `<meetingId>.wav`는 건드리지 않는다.
- **앱 인스턴스는 한 번에 하나만 띄운다.** 두 인스턴스가 같은 `userData/meetings.db`를 공유하면 나중에 뜬 인스턴스의 시작 정리가 먼저 뜬 인스턴스의 처리 중 회의를 `'error'`로 덮어쓴다. 개발 중 `pnpm dev`를 겹쳐 실행하지 않는다 (단일 인스턴스 강제는 Phase 4에서 `app.requestSingleInstanceLock`으로).

## 녹음본 재생·내보내기·다시 인식 (2026-09-25)

사용자 요청으로 "녹음본 재생은 요구사항 아님" 결정을 뒤집었다. **원본 WAV가 남아 있는 회의**(설정 `audio.keep`을 켠 뒤 녹음했거나, 파이프라인이 실패한 회의)에서만 동작한다.
보관 기본값(삭제)은 그대로다 — 디스크 사용량 판단은 바뀌지 않았다.

- **원본 유무**: `Meeting.hasAudio`(`audio_path IS NOT NULL`)로 renderer에 알린다. 목록 조회마다 파일을 `stat`하지 않는다 —
  경로는 있는데 파일이 사라진 경우는 재생 실패·다시 인식 실패(`status='error'`)로 드러난다.
- **재생**: 커스텀 프로토콜 `meeting-audio://recording/<meetingId>`를 `src/main/audio/playback.ts`가 처리한다.
  - `file://`을 쓰지 않는 이유: 개발 모드 renderer는 `http://localhost` 출처라 `file://`을 불러올 수 없고, renderer에 파일 경로를 노출하지 않기 위해서다.
    핸들러는 회의 ID만 받아 DB의 `audio_path`로 파일을 찾는다. 없는 회의·원본 없음은 404.
  - `<audio>`의 시킹은 `Range` 요청이다. 핸들러가 `Range: bytes=a-b`를 직접 해석해 `206` + `Content-Range`로 그 구간만 스트림한다 (파일 전체를 메모리에 올리지 않는다).
  - 스킴은 `app.whenReady()` **전에** `protocol.registerSchemesAsPrivileged`로 `standard·secure·stream·supportFetchAPI` 권한을 준다. renderer CSP에 `media-src 'self' meeting-audio:`를 더한다.
- **재생 UI**: 상세 본문의 **하단 고정 녹음 바**(`TranscriptSection/ui/RecordingBar`)에 `<audio>` 하나를 숨겨 두고, 브라우저 기본 `controls` 대신
  **디자인 토큰으로 그린 커스텀 플레이어**(재생/일시정지 버튼 + 현재 시각 + 시킹 슬라이더 + 전체 길이)를 쓴다 (2026-09-26 사용자 요청 — 기본 재생 막대는 "여백" 팔레트와 맞지 않는다).
  재생 상태는 `model/useAudioPlayer`가 `<audio>` 이벤트(`play`·`pause`·`timeupdate`·`durationchange`·`ended`·`error`)를 구독해 갖고, 슬라이더는 `<input type="range">`라 키보드로도 옮길 수 있다. 원본이 있으면 발화 행의 시각이 버튼이 되고, 누르면 그 발화의 `startSec`으로 이동해 재생한다.
  재생 중인 발화 강조는 범위 밖이다.
  - 바의 위치는 2026-09-26 사용자 요청으로 오른쪽 레일 패널에서 **본문 최하단**으로 옮겼다. 회의록·레일이 든 스크롤 영역(`.content`)의 **형제**로 그 아래에 두어
    좌우 전체 폭을 채우고, 회의록을 스크롤해도 창 바닥에 붙어 있다 (`position: sticky`가 아니라 `AppShellLayout`의 `main` flex 열에서 스크롤 영역 밖에 있기 때문이다).
    한 줄 가로 배치 — 제목·안내 문구 없이 플레이어가 남은 폭을 채우고, 오른쪽에 "WAV로 저장"·"다시 인식"만 둔다. 다시 인식 확인은 바 안에서 한 줄 더 펼친다.
- **내보내기**: `meetings:exportAudio`(invoke) → main이 `dialog.showSaveDialog`(메인 창에 붙은 시트)로 저장 위치를 받아 `copyFile`한다.
  기본 파일명은 `<회의 제목>.wav`(파일명에 못 쓰는 문자는 `_`). 응답 `{ isSaved }` — 사용자가 취소하면 `false`이고 오류가 아니다.
  저장 위치 선택은 확인 UI가 아니므로 "네이티브 대화상자 금지" 규칙(1절 확인 UI)의 대상이 아니다.
- **다시 인식**: `meetings:reprocess`(invoke, `{ meetingId, speakerCount: number | null }`) → 참석자 수를 저장하고(`null`이면 임계값 폴백)
  `status='processing'`으로 바꾼 뒤 파이프라인 잡을 큐에 넣는다. 응답은 편집 채널처럼 갱신된 `MeetingDetail`이다.
  - 거절 조건: 회의 없음, 원본 없음, `status`가 `recording`·`processing`(이미 처리 중이거나 줄 서 있음).
  - 성공하면 **회의록을 통째로 새로 만든다**: 발화 전체 교체 + **화자 행 전부 삭제 후 새 라벨로 생성**(새 군집의 라벨은 이전 라벨과 대응하지 않으므로 화자 이름이 초기화된다)
    + 자동 교정 결과(`refine_applied`·`refined_at`) 비움. 이후 자동 교정이 다시 돈다. **요약은 남긴다** — 같은 회의의 내용이고, 사용자가 원하면 다시 요약한다.
    이 교체는 한 트랜잭션이다 (`data-model.md` "다시 인식").
  - 실패하면 첫 처리와 같다 — `status='error'`, 원본 유지. 이전 회의록 행은 성공할 때까지 교체되지 않는다.
  - 성공 뒤에는 첫 처리와 같이 `audio.keep`을 적용한다. 보관을 끈 상태에서 실패 회의를 다시 시도해 성공하면 원본이 지워진다.
  - UI: 하단 녹음 바의 "다시 인식" → 2단계 인라인 확인(참석자 수 `Stepper` + "화자 이름·직접 고친 내용·교정 결과가 사라집니다" 안내).
    실패한 회의는 본문 오류 문구 아래 "다시 시도" 버튼(저장된 참석자 수 그대로, 확인 없음 — 잃을 회의록이 보이지 않는 상태다).
- 원본이 없는 회의의 녹음 바는 "원본 녹음을 보관하지 않아 재생·다시 인식을 할 수 없습니다"와 설정 안내만 보인다.

## 녹음 파일 가져오기 (2026-09-25)

사용자 요청으로 앱 밖에서 녹음한 파일(음성 메모 m4a, 회의 녹화 mp4 등)로도 회의록을 만든다. 브라우저 프로토타입의 파일 입력과 같은 기능이지만
**디코딩은 renderer의 `decodeAudioData`가 아니라 main에서 macOS 내장 `afconvert`로 한다.**

- **왜 `afconvert`인가**: ffmpeg를 동봉하지 않는다는 결정(1절 음량 정규화)은 그대로다. 대상 플랫폼이 macOS 전용이라 시스템 바이너리 `/usr/bin/afconvert`(Core Audio)가 항상 있고,
  서명·다운로드·라이선스 부담이 없다. renderer에서 디코딩하면 1시간 파일의 Float32 PCM(약 230MB)을 IPC로 넘겨야 하고 "무거운 작업은 main" 원칙에도 어긋난다.
  경로는 `/usr/bin/afconvert`로 고정한다 (GUI 앱의 PATH를 믿지 않는다).
- **변환 명령**: `afconvert -f WAVE -d LEI16@16000 -c 1 --mix --no-filler <원본> <recordings/<meetingId>.wav>`.
  `--mix`는 스테레오를 한 채널로 섞고(없으면 채널을 버린다), `--no-filler`는 `FLLR` 패딩 청크를 뺀다.
- **헤더는 앱이 44바이트로 다시 쓴다** (2026-09-26). `afconvert`는 원본에 채널 레이아웃이 있으면(음성 메모처럼 **모노 AAC**가 대표적) 출력 WAV를
  `WAVE_FORMAT_EXTENSIBLE`(fmt 40바이트, 태그 `0xFFFE`, `data`가 68바이트 위치)로 쓰고, 스테레오를 섞은 경우에만 16바이트 fmt의 44바이트 헤더가 나온다.
  `afconvert`에는 이를 끄는 옵션이 없다(`-l` 태그로도 유지). 변환 결과를 **RIFF 청크를 순서대로 걸어** 읽고(`parseImportedWav`: fmt가 PCM 또는 서브포맷 PCM인
  EXTENSIBLE, 16kHz·mono·16bit인지 확인), `data`가 44바이트 위치가 아니면 **PCM 본문을 새 44바이트 헤더 뒤로 스트림 복사해 같은 경로로 바꾼다**
  (`rewriteWithCanonicalHeader`, 임시 파일 → `rename`). 정규화의 `readWavPcm`이 `0xFFFE` 태그를 거부하고 sherpa-onnx의 WAV 리더도
  EXTENSIBLE을 보장하지 않으므로, 이후 단계(정규화·whisper·sherpa·재생·내보내기)가 **녹음한 회의와 똑같은 44바이트 헤더**만 보게 만드는 쪽이
  각 단계를 고치는 것보다 안전하다. 1시간 녹음(약 115MB)의 복사는 1초 안쪽이라 변환 시간에 묻힌다.
- **받는 형식**: `m4a mp3 wav aac aif aiff caf flac mp4 mov` (2026-09-25 실측, 영상 파일은 오디오 트랙만 읽는다). webm·ogg(Opus/Vorbis)는 `afconvert`가 못 읽어 목록에서 뺀다.
  확장자는 열기 대화상자의 필터일 뿐이고, 실제로 못 읽으면 변환 실패 안내로 끝난다.
- **흐름** (`src/main/audio/importRecording.ts`):
  1. `dialog.showOpenDialog`(메인 창 시트, 파일 하나) — 취소하면 `{ meeting: null }`, 오류 아님. 열기 대화상자는 확인 UI가 아니므로 "네이티브 대화상자 금지"의 대상이 아니다.
  2. 회의 ID를 정하고 `afconvert`로 변환. 실패하면 반쯤 쓴 출력 파일을 지우고 안내 문구를 던진다. **회의 행은 변환이 성공한 뒤에 만든다** — 못 읽은 파일로 빈 오류 회의가 목록에 남지 않는다.
  3. WAV 헤더의 `data` 크기로 길이를 계산한다. `MIN_RECORDING_SEC`(1초) 미만이면 녹음과 같은 "너무 짧음" 오류로 끝낸다(파일은 남기지 않는다).
  4. `insertMeeting` → `duration_sec`·참석자 수 저장 → `status='processing'` → 파이프라인 잡 큐. 큐에서 기다리는 동안 회의 목록이 "녹음 중"이 아니라 처리 대기로 보이도록 바로 `processing`으로 둔다.
- **제목**은 파일 이름(확장자 제외, 200자까지)이고 비어 있으면 녹음과 같은 기본 제목. **생성 시각**은 가져온 시각이다 — 파일의 수정 시각은 복사·동기화로 쉽게 바뀌어 녹음 날짜를 보장하지 않는다.
- **참석자 수**는 녹음 화면 스테퍼의 값, 즉 main 녹음 세션의 보관값을 그대로 쓴다. 같은 화면의 입력이 녹음과 가져오기에 함께 적용되고, 값의 출처는 여전히 하나다.
- **원본 파일은 건드리지 않는다.** 앱이 관리하는 것은 변환한 WAV뿐이고 `audio.keep` 보관 정책도 그 WAV에만 적용된다.
- 녹음 중에도 가져올 수 있다 — 변환은 짧고, 파이프라인은 큐가 순서대로 처리한다. 다만 UI는 녹음 중에 버튼을 비활성으로 둔다(아래).
- **IPC**: `meetings:import`(invoke, payload 없음) → `ImportMeetingAudioResponse = { meeting: Meeting | null }`.
- **UI**: 녹음 화면(`recording/RecorderSection`) 오른쪽 옵션 패널의 맨 위 그룹 "파일로 만들기"에 행 하나 — 제목 "녹음 파일 가져오기", 설명, 오른쪽 보조 버튼 "가져오기"(`features/meeting/ImportAudioButton`이 행 전체를 그린다).
  **녹음 중에는 숨기지 않고 비활성**으로 둔다 (2026-09-26, 숨기면 화면이 튄다 — "화면별 구성" > 녹음). 컴포넌트가 `useRecordingState`로 스스로 판단한다. 변환 중에는 비활성 + "가져오는 중…",
  성공하면 그 회의 상세로 이동하고, 실패 문구는 설명 자리에 빨간 글자로 바꾼다(높이 고정).
- **범위 밖**: 창에 파일을 끌어다 놓기, 여러 파일 한 번에 가져오기. 필요해지면 같은 `importRecording`에 경로를 넘기는 채널을 더한다.

## 진행률 표시 (Phase 3)

`PipelineProgressEvent`는 단계 하나의 퍼센트만 싣는다. 사용자에게 보여 줄 **하나의 진행률 막대**는 renderer가 만든다.

- 계산은 `src/shared/progress.ts`의 순수 함수로 두고 vitest로 검증한다. 단계 가중치는
  `stt 0.3 / diarize 0.6 / merge 0.05 / save 0.05` — Phase 1 측정에서 화자 분리가 병목(10분 발췌 기준 STT 35초 / 화자 분리 141초)이기 때문이다 (`docs/phase1-results.md`).
  체감용 근사치이며, 코어 수에 따라 STT·화자 분리가 병렬로 돌기 때문에 경과 시간과 정확히 비례하지는 않는다.
- 전체 퍼센트는 단계별 퍼센트의 가중합이고 **되돌아가지 않는다**(단계별로 최댓값 유지). `merge`·`save`·`done` 이벤트가 오면 그보다 앞선 단계는 100%로 본다 —
  병렬 실행이라 `stt`와 `diarize` 사이에는 순서가 없지만, `merge`는 둘 다 끝나야 시작하기 때문이다.
- 진행률 UI는 `modules/features/pipeline/PipelineProgress` 하나로 두고 홈 목록 카드와 회의 상세가 함께 쓴다.

## 녹음 (renderer)

**오디오 그래프의 소유자는 보이지 않는 녹음 호스트 창 하나뿐이다** (Phase 5-3, 아래 절). 메인 창은 녹음을 시작·정지하는
명령만 보내고 상태는 `recording:state`로 받는다. 아래 규칙은 그래프를 실제로 만드는 쪽(호스트 창)에 적용된다.

- `getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, deviceId? } })`.
  `deviceId`는 설정 `audio.inputDevice`가 있을 때만 `{ ideal: deviceId }`로 붙인다 (아래 "마이크 입력 장치와 테스트" 절).
  제약 객체는 `@renderer/shared/utils/microphone` 한 곳에서 만들고(`buildMicrophoneConstraints`·`openMicrophone`) 녹음·마이크 테스트가 같이 쓴다.
- `new AudioContext({ sampleRate: 16000 })` → `audioWorklet.addModule(workletUrl)` → 프로세서가 128프레임 단위로 받은 Float32를 `CHUNK_SAMPLES`(8192, 약 0.5초)씩 모아 `port.postMessage`.
- **워크릿 파일은 `src/renderer/src/worklet/pcmRecorder.js`에 두고 `import workletUrl from '@renderer/worklet/pcmRecorder.js?url'`로 로드한다.**
  `resources/` 아래에 두면 Vite 개발 서버가 서빙하지 않고 패키징 시에도 `process.resourcesPath`로 흩어져 renderer가 URL로 접근할 수 없다.
  `?url`은 개발 모드에서는 dev 서버 경로를, 빌드에서는 `out/renderer/assets/`에 복사된 경로를 준다.
  단 Vite는 작은 에셋을 `data:` URL로 인라인하는데, renderer의 CSP가 `script-src 'self'`라 인라인되면 `addModule`이 차단된다.
  `electron.vite.config.ts`의 renderer `build.assetsInlineLimit`에서 워크릿만 인라인 대상에서 빼 **항상 파일로 내보낸다**.
- 레벨 미터는 별도 `AnalyserNode`를 붙이지 않고 **main이 `recording:chunk`로 받은 청크의 RMS**를 계산해
  `recording:state`에 실어 보낸다 (노드를 하나 덜 만들고, 메인 창·메뉴바가 같은 값을 본다).
  RMS 계산은 `src/shared/audio.ts`의 순수 함수로 두고 vitest로 검증한다.
- 정지 시 `IPC.recording.stop` → main이 WAV 헤더를 확정하고 파이프라인 잡을 큐에 넣는다.
- **참석자 수(1~`MAX_SPEAKER_COUNT`=20, 정수)는 main의 녹음 세션이 들고 있는다.** 입력란은 메인 창에만 있지만
  녹음은 단축키·메뉴바로도 시작되므로, 입력이 바뀔 때마다 `recording:setSpeakerCount`로 main에 보내고 `recording:state`로 받는다.
  정지 시점에는 main이 보관값을 `meetings.speaker_count`에 저장해 화자 분리의 `num-clusters`로 쓴다.
  `StopRecordingRequest`에는 `speakerCount`를 싣지 않는다 — 두 경로가 생기면 "어느 쪽 값이 이겼는지"를 따져야 한다.
  비우면 임계값 폴백이며, 그 경우 화자가 과분할될 수 있다고 입력란 옆에 안내한다.
- Float32 → Int16 PCM 변환은 main의 `audio/wavWriter.ts`에서 수행 (renderer는 원본 Float32 `ArrayBuffer`만 전달).
- 샘플레이트·청크 크기 상수는 `src/shared/audio.ts`에 한 번만 정의해 renderer와 main이 함께 쓴다.
- `AudioContext`가 16kHz 요청을 무시할 수 있으므로 실제 `context.sampleRate`를 확인해 다르면 녹음을 시작하지 않고 안내한다 (`references/pitfalls.md`).

### 마이크 입력 장치와 테스트 (2026-09-25)

사용자 요청으로 설정 화면에 **입력 장치 선택**과 **마이크 테스트**를 둔다. 회의 직전에 "어느 마이크로, 소리가 들어오고 있는지"를
녹음을 시작하지 않고 확인하기 위해서다.

- **입력 장치는 `AppSettings.inputDevice`** (`{ deviceId, label } | null`, DB 키 `audio.inputDevice`, 기본 `null` = 시스템 기본 마이크)다.
  새 IPC 채널을 만들지 않는다 — 장치 목록은 renderer의 `navigator.mediaDevices.enumerateDevices()`가 주고, 값은 다른 설정과 함께 `settings:update`로 오간다.
  `label`을 함께 저장하는 이유는 장치를 뺀 뒤에도 설정 화면이 "무엇을 골라 뒀는지"를 보여주기 위해서다 (`deviceId`는 해시라 사람이 읽을 수 없다).
- **녹음 그래프는 시작할 때 설정을 읽어** `deviceId: { ideal }`로 요청한다. `exact`를 쓰지 않는다 — 골라 둔 마이크가 빠져 있으면
  녹음 자체가 실패하는 것보다 시스템 기본 마이크로 녹음되는 편이 낫다. 설정 화면의 설명 문구에 이 폴백을 적는다.
  Chromium의 `deviceId`는 origin별 해시이고 기본 세션(persist)에 소금이 저장되므로 앱을 다시 켜도 같은 값이다.
- **장치 목록**은 `useInputDevices`(domain 훅)가 `audioinput`만 골라 든다. Chromium의 `default`·`communications` 가상 항목은 뺀다 —
  "시스템 기본 마이크" 선택지(`null`)가 그 역할이다. 라벨이 비어 있으면(권한 전) `requestMicrophonePermission` 뒤 짧게 `getUserMedia`를 열었다 닫아 라벨을 받고,
  그래도 비면 `마이크 N`으로 표기한다. `devicechange` 이벤트로 목록을 다시 읽는다. 저장된 장치가 목록에 없으면 `"<label> (연결되지 않음)"`을 비활성 선택지로 보여준다.
  main은 `session.setPermissionCheckHandler`에서 `media`를 허용한다 — Chromium이 라벨을 줄지 결정할 때 이 핸들러를 본다.
- **마이크 테스트는 메인 창(설정 화면)에 짧게 사는 별도 그래프**다. "오디오 그래프 소유자는 호스트 창 하나"라는 규칙은 **녹음 그래프**에 대한 것이고,
  테스트 그래프는 청크를 보내지 않고 세션도 만들지 않는다. 구성은 `getUserMedia(같은 제약) → AudioContext(16kHz) → MediaStreamSource → AnalyserNode → gain 0 → destination`이며
  100ms마다 `getFloatTimeDomainData`의 RMS(`@shared/audio`의 `rmsOf`)를 `level`로 들고 레벨 미터(`LevelWaveform`)에 넘긴다.
  16kHz 확인·권한 요청은 녹음과 같은 경로를 타므로 **녹음이 실패할 환경이면 테스트도 같은 안내로 실패한다** — 그것이 테스트의 목적이다.
  - 녹음 중에는 테스트 버튼을 막는다 (마이크를 두 그래프가 잡아도 되지만 사용자가 헷갈린다). 장치 선택을 바꾸면 테스트를 정지한다.
  - 3초 넘게 피크가 `0.01` 아래면 "소리가 거의 잡히지 않습니다. 음소거되었거나 다른 장치가 선택됐을 수 있습니다"를, 그 위면 "소리가 잘 들어옵니다"를 보여준다.
  - 컴포넌트 언마운트·페이지 이탈 시 그래프를 닫는다 (`useEffect` cleanup).
- 화면은 설정 카테고리 **"마이크"** 하나에 두 행(입력 장치 select, 마이크 테스트 버튼 + 파형)이다. 훅은 `useInputDevices`·`useMicrophoneTest`
  (`shared/hooks/domain/recording`), 행 컴포넌트는 `SettingsSection/ui/{InputDeviceSelect,MicrophoneTest}.tsx`다.

## 녹음 호스트 창 · 메뉴바 · 전역 단축키 (Phase 5-3)

회의 중에 앱 창을 앞으로 꺼내지 않고도 녹음을 시작·정지하고, 녹음 중이라는 사실과 경과 시간을 볼 수 있게 한다.
구성은 **메뉴바(Tray) 시간 표시 + 전역 단축키**이고, 오디오 그래프는 **보이지 않는 녹음 호스트 창**이 들고 있다.

### 플로팅 위젯 패널 제거 (2026-09-28, `test/usage-analytics` 브랜치)

Phase 5-3에서는 화면 우측에 떠 있는 플로팅 패널(`type: 'panel'`, alwaysOnTop, 반투명)이 오디오 그래프 소유자이자
녹음 컨트롤이었다. 이 브랜치에서는 사용자 요청으로 **패널 UI를 없앤다** — 화면에 보이는 창, 위젯 설정(표시·반투명·불투명도·위치),
위젯 표시/숨김 단축키, 트레이의 "위젯 표시/숨김" 항목, `widget:setVisible` 채널이 모두 사라진다.

- **그래프 소유 창은 남긴다.** `getUserMedia`는 renderer 전용이고, 메인 창은 닫혀도 앱이 살아 있어 메뉴바·단축키로
  녹음할 수 있어야 한다. 메인 창에 그래프를 두면 창을 닫는 순간 녹음이 끊긴다. 그래서 창은 만들되 **한 번도 보이지 않는다**(`show: false`).
- 창은 `windows/recorder.ts`, 라우트는 `#/recorder`, 화면은 아무것도 그리지 않고 `useRecorder`만 도는 `recording/RecorderHostSection`이다.
- 메인 창 녹음 화면(`RecorderSection`)이 유일한 시각적 녹음 컨트롤이다. 참석자 수 입력도 여기에만 있다.
- 기존 사용자 DB에 남은 `widget.*`·`shortcut.widget` 키는 읽지 않을 뿐 지우지 않는다 (키-값 테이블이라 해가 없다).

### macOS WidgetKit 위젯을 만들지 않는 이유

알림 센터·데스크탑에 놓는 진짜 macOS 위젯은 SwiftUI로 작성한 **앱 확장(Widget Extension)** 이어야 한다.
확장마다 별도 서명·notarization 대상이 늘고(`references/distribution.md` 6절), 녹음 상태를 프로세스 밖으로 한 번 더
복제해야 하며, 버튼 동작은 `AppIntent`로 호스트 앱을 깨우는 우회가 필요하다. 얻는 것은 외형뿐이라 채택하지 않는다.

### 호스트 창 속성과 라우트

| 속성 | 값 | 이유 |
| --- | --- | --- |
| `show` | `false`, 이후에도 `show()`하지 않음 | 보이는 UI가 없다. 그래프만 든다 |
| `skipTaskbar` | `true` | Dock·앱 전환기에 창이 두 개로 보이지 않게 |
| `backgroundThrottling` | **`false`** | 숨겨진 창은 타이머·메시지 처리가 throttling된다. 그래프 소유자가 이 창이라 필수 |

- **별도 HTML 엔트리를 만들지 않고** 같은 `index.html`의 해시 라우트 `#/recorder`로 띄운다
  (`loadFile(..., { hash: '/recorder' })` / 개발 모드는 `loadURL(url + '#/recorder')`). **해시에 앞의 `/`를 빼면 `#recorder`가 되어 라우트가 맞지 않는다**.
- `/recorder`는 `RequireModels` 가드 **밖**에 둔다. 가드 안에 두면 모델이 없을 때 온보딩 화면이 마운트돼 훅이 돌지 않는다.
  대신 호스트가 `models:status`를 직접 조회해 준비 전이면 시작 명령을 오류(`modelNotReady`)로 돌려준다.
- 메인 창 참조를 `windows/main.ts`가 들고 있어야 한다. `BrowserWindow.getAllWindows()[0]`은 호스트 창이 0번이 될 수 있어
  **`app.on('activate')`의 재생성 조건과 `second-instance`의 포커스 대상이 깨진다.**
- 창이 둘이므로 진행률·업데이트 브로드캐스트(`broadcast`)는 그대로 두 창에 간다. 호스트는 자기가 쓰지 않는 이벤트를 구독하지 않으면 그만이다.

### 녹음 상태의 단일 출처

그래프(호스트 창)와 컨트롤(메인 창·메뉴바)이 떨어져 있으므로 **진행 중 녹음의 상태는 main의 세션(`src/main/audio/session.ts`)이 단일 출처**가 된다.

```ts
export interface RecordingStateEvent {
  meetingId: string | null
  /**
   * 경과 시간의 기준 시각(epoch ms) = 실제 시작 시각 + 지금까지 일시정지한 시간.
   * 경과 시간은 받는 쪽이 (pausedAt ?? Date.now()) - startedAt으로 계산한다 — 창마다 값이 어긋나지 않는다
   */
  startedAt: number | null
  /** 일시정지한 시각(epoch ms). 녹음 중이 아니거나 일시정지하지 않았으면 null */
  pausedAt: number | null
  /** 직전 청크의 RMS (0~1). 청크 주기(약 0.5초)로만 갱신된다 */
  level: number
  /** 세션에 보관 중인 참석자 수. 메인 창 입력란이 이 값을 보여 준다 */
  speakerCount?: number
  /** 정지가 끝난 순간 한 번만 실린다. 메인 창이 이 회의의 상세로 이동한다 */
  stoppedMeetingId?: string
  /**
   * 시작·정지가 실패한 순간 한 번만 실린다. 마이크 권한 거부나 그래프 생성 실패는 호스트 창에서만 일어나는데,
   * 시작을 누른 사람은 메인 창에 있을 수 있다. 실패를 세션에 모아 메인 창이 안내를 본다
   */
  errorMessage?: string
}
```

- **경과 시간을 이벤트로 보내지 않는다.** `startedAt`만 주고 각 창이 계산하면 IPC 횟수가 늘지 않고, 창이 가려져 렌더가 밀려도 값이 정확하다.
- 창이 새로 열렸을 때를 위해 조회 채널 `recording:state`(invoke)를 함께 둔다. 이벤트만 있으면 늦게 연 창이 현재 상태를 모른다.
- 전역 단축키·Tray 메뉴로 녹음을 시작하려면 main이 호스트 창에 지시해야 한다 (`getUserMedia`는 renderer에만 있다).
  이 방향의 push 채널이 `recording:command`(`{ kind: 'start' | 'stop' | 'toggle' }`)다. 호스트가 그래프를 만든 뒤 평소처럼 `recording:start`를 invoke한다.
  main → renderer → main으로 한 바퀴 도는 모양이지만, 마이크 접근이 renderer 전용이라 피할 수 없다.
- **메인 창의 시작·정지 버튼도 같은 경로를 탄다.** 메인 창은 `recording:control`(invoke)로 main에 요청하고,
  main이 호스트 창에 `recording:command`를 push한다. 메인 창이 `recording:start`를 직접 부르면 그래프 없는 녹음이 시작돼
  빈 WAV가 남는다.
- **호스트 창은 항상 만든다.** 이 창이 오디오 그래프의 소유자라, 창이 없으면 어느 경로로도 녹음할 수 없다
  (숨은 창이 그래프를 들고 있어도 되는 이유가 `backgroundThrottling: false`다).
- **참석자 수 보관값은 정지 후에도 남는다.** 다음 녹음이 같은 값으로 시작하지만 메인 창 입력란에 계속 보이므로 숨은 상태가 아니다.
  세션마다 지우면 단축키로 시작 → 메인 창에서 입력하는 흐름이 매번 초기화된다.

### 일시정지·재개 (2026-09-26)

사용자 요청으로 녹음을 멈췄다가 같은 회의로 이어 녹음할 수 있게 한다. 쉬는 시간·잡담처럼 회의록에 남기지 않을 구간을 빼는 용도다.

- **일시정지는 main 세션이 청크를 버리는 것으로 구현한다.** 호스트 창의 오디오 그래프는 그대로 돌고 청크도 계속 오지만,
  세션이 일시정지 상태면 WAV에 쓰지 않는다. 호스트에 새 명령(`recording:command`)을 보내지 않으므로 main → 호스트 → main 왕복이 없고,
  상태의 단일 출처가 여전히 세션 하나다. 마이크 사용 표시는 계속 켜져 있다 — 재개할 때 그래프를 다시 만들며 생기는 지연·권한 재확인을 피하는 값이다.
- 일시정지 중에는 시스템 오디오 버퍼도 같은 길이만큼 **꺼내서 버린다**(`take`). 버리지 않으면 재개 직후 멈춰 있던 동안의 상대방 소리가 섞여 들어간다.
  라이브 받아쓰기에는 넣지 않고, 레벨은 0으로 보낸다.
- 일시정지 구간은 WAV에 없으므로 **회의 길이(`duration_sec`)와 발화 타임스탬프는 녹음된 구간만 센다.** 이어 붙인 경계에 표시를 남기지 않는다.
- 경과 시간: 세션은 `pausedAt`을 들고, 재개할 때 `startedAt`을 멈춰 있던 시간만큼 뒤로 민다. 그래서 받는 쪽 계산식은
  `(pausedAt ?? Date.now()) - startedAt` 하나이고 누적 일시정지 시간을 따로 보내지 않는다. 회의 행의 `created_at`은 실제 시작 시각 그대로다.
- 요청은 `recording:setPaused`(`{ isPaused }`, 응답은 바뀐 녹음 상태) 하나다. 녹음 중이 아니면 오류, 이미 같은 상태면 그대로 돌려준다. 정지는 일시정지 중에도 할 수 있다.
- UI: 메인 창 녹음 화면의 정지 버튼 **왼쪽**에 **아이콘만 있는 원형 버튼**(`pause` ↔ `play`, `aria-label`로 "일시정지"/"재개")을 둔다.
  `Button` primitive의 `secondary`를 쓰고 지름은 옆 정지 버튼 높이와 같게 한다(녹음 화면 52px) — 따로 그린 버튼은 디자인 시스템과 어긋난다.
  상태 문구는 "일시정지됨"으로 바꾸고, 메뉴바 제목은 `‖ 12:34`로 멈춘 시간을 보여 준다. 트레이 메뉴·전역 단축키에는 추가하지 않는다.

### 메뉴바 (Tray)

- 아이콘은 `resources/trayTemplate.png`(+`@2x`). 파일명이 `Template`으로 끝나야 macOS가 다크/라이트에 맞춰 반전한다.
- 아이콘 원본은 SVG다: 앱 아이콘 `build/icon.svg`(→ `build/icon.{icns,png,ico}`, `resources/icon.png`), 메뉴바 `build/trayTemplate.svg`(→ 28×22 · 56×44 PNG).
  PNG·icns는 손으로 고치지 않고 SVG에서 다시 렌더링한다 (`rsvg-convert` + `iconutil`).
- 녹음 중에는 `tray.setTitle('● 12:34')`로 경과 시간을 1초마다 갱신하고, 녹음 중이 아니면 제목을 비워 아이콘만 남긴다.
  타이머는 **녹음 중에만** 돌리고 정지 시 `clearInterval`한다.
- 트레이 메뉴: 녹음 시작/정지 · 메인 창 열기 · 종료.

### 전역 단축키

- 기본값은 `⌥⌘R` 녹음 토글 하나(위젯 표시/숨김 `⌥⌘W`는 패널과 함께 제거). `app.whenReady` 이후 등록하고 `will-quit`에서 `unregisterAll`한다.
- **앱 시작 시 등록 실패(다른 앱이 선점)는 앱을 멈추지 않는다.** `globalShortcut.register`의 반환값이 거짓이면 경고 로그만 남기고 진행한다.
  단축키가 없어도 메인 창과 트레이로 모든 동작을 할 수 있다.
- **설정 화면에서 바꿀 수 있다** (2026-09-24 사용자 요청으로 "고정값" 결정을 뒤집음). 값은 Electron accelerator 문자열로
  `shortcut.recording`에 저장한다.
  - 허용 형식은 `src/shared/shortcut.ts`의 `isValidAccelerator` 하나가 정한다: 수식키 `Control`·`Alt`·`Shift`·`Command` 중
    `Control`·`Alt`·`Command`가 **하나 이상**(Shift만으로는 일반 타이핑과 겹친다) + 키 하나(`A`~`Z`, `0`~`9`, `F1`~`F12`, `Space`, 방향키).
    renderer의 키 입력 변환(`KeyboardEvent.code` 기준 — `key`는 ⌥ 조합에서 특수문자가 된다)과 main의 검증이 같은 함수를 쓴다.
  - 저장 순서: 검증 → **등록을 먼저 시도하고 실패하면 이전 단축키로 되돌린 뒤 한국어 오류를 throw** → 성공했을 때만 DB에 쓴다.
    앱 시작과 달리 설정 변경에서는 실패를 삼키지 않는다 — 사용자가 방금 고른 키가 동작하지 않는 걸 모르면 안 된다.
  - **입력받는 동안은 전역 단축키를 해제한다** (`shortcuts:setSuspended`). 해제하지 않으면 현재 단축키를 누르는 순간 녹음이 시작된다.
    입력이 끝나거나(확정·Esc·포커스 이탈) 설정 화면이 언마운트되면 복구한다.
  - 안내 문구의 단축키 표기는 `formatAccelerator`(`⌥⌘R`)로 현재 설정값을 보여준다. 설정을 모르는 화면은 키를 적지 않고 "전역 단축키"라고만 쓴다.

### 설정

위젯 패널을 없애면서(위 "플로팅 위젯 패널 제거" 절) 위젯 관련 설정(`isWidgetEnabled`·`isWidgetFadeEnabled`·`widgetFadeOpacity`·`widgetShortcut`)도 없앴다.
전역 단축키는 `recordingShortcut` 하나이고, 위 "전역 단축키" 절의 저장 순서를 따른다.

설정 화면은 **카테고리별로 묶는다** (2026-09-24 사용자 요청). 항목이 늘어 한 줄 나열로는 찾기 어려워졌기 때문이다.
페이지 제목(`h1` "설정")은 `pages/Settings`가 갖고, 각 카테고리는 `h2` 제목을 가진 `section`이다.

| 순서 | 카테고리 | 항목 | 위치 |
| --- | --- | --- | --- |
| 1 | 마이크 | 입력 장치(`inputDevice`), 마이크 테스트 (2026-09-25, 위 "마이크 입력 장치와 테스트" 절) | `SettingsSection` |
| 2 | 녹음·처리 | 원본 녹음 파일 보관(`isAudioKept`), 조용히 처리(`isQuietProcessing`) | `SettingsSection` |
| 3 | 단축키 | 녹음 시작·정지(`recordingShortcut`) | `SettingsSection` |
| 4 | 음성 인식 모델 | 음성 인식 모델 변경 | `ModelDownloadSection` (온보딩과 공유) |
| 5 | 요약 · 용어 초안 | 실행 방식(로컬 / Claude API 키 / Claude Code / OpenAI API 키), 로컬을 골랐을 때만 **로컬 요약 모델 파일** 다운로드, API 키(공급자별), GPT 모델 선택, CLI 상태, 연결 확인 | `setting/LlmSection` — 파일 다운로드 행 `model/SummaryModelSection`은 페이지가 `localModelSlot`으로 끼운다 (아래 "LLM 공급자" 절). 2026-09-24까지는 "모델" 카테고리에 음성 인식 모델과 나란히 있었는데, 로컬 실행 방식의 부속품이 별개 설정처럼 보여 옮겼다 |
| 6 | 용어 사전 | 팀 소개, 초안 만들기, 용어 목록 (Phase 5-4) | `setting/GlossarySection` (자기 채널로 따로 읽고 쓰므로 `SettingsSection`의 한 번 로드와 무관하다. 모델 위젯과 같이 `children`으로 끼운다) |
| 7 | 업데이트 | 업데이트 확인(`isUpdateCheckEnabled`), 지금 확인(`UpdateCheck`) | `SettingsSection` |
| 8 | 언어 | UI 언어(`locale`, 한국어 / 영어, 2026-09-25, 위 "UI 언어" 절) | `SettingsSection` |

- 설정값 로드는 한 번만 한다. 그래서 `SettingsSection`이 1~3과 7·8을 모두 그리고, 4~6은 `children`으로 받아 3과 7 사이에 끼운다.
  페이지는 `<SettingsSection><SettingGroup title="음성 인식 모델"><ModelDownloadSection /></SettingGroup><LlmSection localModelSlot={<SummaryModelSection />} /><GlossarySection /></SettingsSection>` 형태로 배치만 한다.
  widgets는 widgets를 import하지 않으므로(`.claude/rules/component-abstract-pattern.md`) `SummaryModelSection`은 페이지가 슬롯으로 넘긴다.
- **오른쪽에 목차(TOC)를 둔다** (2026-09-24 사용자 요청). 카테고리가 7개(지금은 8개)로 늘어 스크롤로 찾기 어려워졌기 때문이다.
  목차는 composite `PageToc`가 스크롤 영역 안의 `h2`를 **DOM에서 읽어** 만든다 — 카테고리가 여러 위젯에 흩어져 있고
  설정 로드 전후로 개수가 달라지므로, 제목 목록을 따로 들고 있으면 순서·문구가 어긋난다. `MutationObserver`로 다시 읽는다.
  항목을 누르면 그 카테고리로 부드럽게 스크롤하고, 스크롤 위치에 맞는 항목을 강조한다(`aria-current`).
  창이 좁으면(본문 + 목차가 들어가지 않으면) 목차를 숨긴다.

## 라이브 받아쓰기 (2026-09-26)

사용자 요청으로 녹음 화면(메인 창 `RecorderSection`)의 파형 영역을 **"라이브 받아쓰기" 보기**로 바꿀 수 있게 한다.
들리는 말을 1~2초 안에 글자로 보여 줘 "방금 무슨 말을 했는지"를 바로 확인하는 용도다. SKILL.md 4절 "범위 절제"(실시간 스트리밍 STT 금지)의 사용자 결정 예외다.

### 엔진: 기존 whisper-cli를 짧은 구간마다 다시 돌린다

- **새 모델·새 의존성 없이** 파이프라인과 같은 `whisper-cli` + silero VAD를 쓴다.
  실측(M3 Pro, `-t 4`, 8초 구간 한 번): turbo q5 **약 1.6초·최대 메모리 0.9GB**(모델 로드 0.4초 + 인코딩 0.6초 + 디코딩), large-v3 q5 **약 3.1초·2.1GB**.
- **모델은 속도 우선으로 turbo를 쓴다** (2026-09-26 사용자 결정). 회의록 처리 모델(`stt.model`)과 따로 정한다 — 회의록은 정지 후 한 번이라 정확도가 우선이고,
  라이브는 말하는 동안 계속 돌아 지연·메모리·발열이 우선이다. `main/models/paths.ts`의 `liveWhisperModelPath()`가 정한다:
  - 고른 모델이 저사양(`small-q5_1`)이면 그 모델 — 메모리가 적어 저사양을 고른 사용자에게 더 무거운 모델을 올리지 않는다.
  - 그 밖에는 turbo 파일(`LIVE_WHISPER_MODEL_ID`, `@meeting-stt/models/desktop`)이 있으면 turbo, 없으면 고른 모델(고품질만 받은 사용자). 라이브용으로 turbo를 따로 내려받지는 않는다.
- sherpa-onnx 한국어 streaming zipformer(진짜 스트리밍)는 쓰지 않는다 — 온보딩 다운로드 목록에 모델이 하나 더 늘고,
  다운로더가 아카이브에서 파일 하나만 꺼내는데 이 모델은 encoder·decoder·joiner·tokens 네 파일이 필요하다. 지연 1~2초면 요구("바로바로")를 채운다.
- `whisper-server`(상주 HTTP)도 쓰지 않는다 — 바이너리를 하나 더 동봉·서명해야 하고, 모델 로드 0.4초를 아끼는 것 외에 이득이 없다.

### 구간 나누기 (`src/main/audio/liveWindow.ts`, 순수 함수 + vitest)

main의 녹음 세션이 청크(약 0.5초)를 받을 때마다 **현재 구간**(마지막 확정 이후의 오디오)에 쌓는다.

| 상수 | 값 | 의미 |
| --- | --- | --- |
| `LIVE_STEP_SEC` | 1.5 | 직전 실행 이후 새 오디오가 이만큼 쌓여야 다시 인식한다 |
| `LIVE_MAX_WINDOW_SEC` | 12 | 구간이 이 길이에 닿으면 결과를 확정하고 구간을 비운다 (말이 끊기지 않아도) |
| `LIVE_COMMIT_SILENCE_SEC` | 1 | 구간 끝이 이만큼 조용하면 말이 끝난 것으로 보고 확정한다 |
| `LIVE_SPEECH_RATIO` | 3 (+9.5 dB) | 청크 RMS가 최근 소음 바닥의 이 배수를 넘으면 말소리로 본다 |
| `LIVE_NOISE_HISTORY_CHUNKS` | 40 (약 20초) | 소음 바닥 = 최근 이 개수 청크 RMS의 최솟값 (하한 `LIVE_MIN_NOISE_FLOOR_RMS` 0.0005) |

- 구간에 말소리 청크가 하나도 없으면 whisper를 부르지 않고 구간을 마지막 청크만 남기고 버린다 — 조용할 때 GPU를 쓰지 않는다.
- 한 번에 하나만 돈다. 도는 동안 들어온 청크는 다음 실행에 들어간다. 확정할 때는 **인식에 넣은 샘플까지만** 구간에서 빼고, 그 뒤에 들어온 샘플은 다음 구간 앞에 남긴다.
- 확정 조건은 인식을 시작할 때의 스냅샷으로 판단한다 (끝의 조용함 또는 최대 길이). 확정된 결과는 `lines`에, 아직 말하는 중인 구간의 결과는 `partial`에 둔다.

### 인식 한 번 (`src/main/audio/liveTranscript.ts`)

- 구간을 Int16으로 바꾸고 **파이프라인과 같은 RMS 게인 정규화**(`normalize.ts`의 `measureSpeechRmsDb`·`gainDbFor`·`applyGain`)를 적용한 뒤
  임시 WAV(`app.getPath('temp')/meeting-stt-live/`)로 쓴다. 원거리 마이크에서 whisper가 말을 놓치는 문제가 라이브에도 똑같이 있다.
- 인자: `-m <모델> -f <wav> -l ko -t <stt 스레드> -mc 0 -nt -np --vad --vad-model <silero> -otxt -of <경로>`.
  결과는 stdout이 아니라 `-otxt` 파일을 UTF-8로 읽는다 (stdout 청크 경계에서 한글 바이트가 잘릴 수 있다). 줄바꿈은 공백으로 합친다.
- 실패(바이너리·모델 없음, 비정상 종료)는 녹음을 막지 않는다. 경고 로그는 녹음마다 한 번만 남기고, 라이브 보기에 안내 문구(`errorMessage`)를 띄운 채 다음 구간에서 다시 시도한다.
- 녹음이 끝나거나 보기를 끄면 세대 번호를 올려 **도는 중인 실행의 결과를 버린다**. 프로세스는 죽이지 않는다 (길어야 2초, 정지 직후 파이프라인과 잠깐 겹친다).

### 상태와 IPC

- 보기 모드(`isEnabled`)는 참석자 수처럼 **세션 밖 main 메모리**에 둔다 — 녹음 전에 켜 둘 수 있고, 다음 녹음에도 이어진다. 앱을 다시 켜면 꺼진다(파형이 기본). 설정 DB에 저장하지 않는다.
- 결과는 새 push 채널 없이 `RecordingStateEvent.liveTranscript`로 싣는다. 이 이벤트는 청크마다(0.5초) 가므로 인식이 끝난 결과는 **다음 청크 이벤트에 실려 간다**(최대 0.5초 추가 지연). 인식이 끝날 때 따로 publish하지 않는 이유는, 0.5초 안에 어차피 실려 가는 값을 위해 이벤트 종류와 빈도를 늘릴 이유가 없기 때문이다. 늦게 연 창도 `recording:state` 조회로 현재 글자를 받는다.

```ts
export interface LiveTranscriptLine {
  /** 녹음 안에서 1부터 늘어나는 번호. 리스트 key로 쓴다 (DB 행이 아니다) */
  id: number
  text: string
}
export interface LiveTranscriptState {
  isEnabled: boolean
  /** 확정된 문장. 최근 LIVE_MAX_LINES(50)개만 싣는다 */
  lines: LiveTranscriptLine[]
  /** 아직 말하는 중인 구간의 인식 결과. 다음 실행에서 바뀔 수 있다 */
  partial: string
  errorMessage?: string
}
```

- 켜기·끄기: `recording:setLiveTranscript`(`{ isEnabled: boolean }`) → 응답은 `GetRecordingStateResponse`(`setSpeakerCount`와 같은 모양). 끄면 GPU를 쓰지 않고, 이미 확정된 줄은 남긴다.
- 새 녹음이 시작되면 `lines`·`partial`을 비운다. 녹음이 끝나면(정지) 비운다 — 정지 후에는 상세 화면의 진짜 회의록을 본다.
- **라이브 결과는 DB에 저장하지 않는다.** 저장되는 회의록은 정지 후 파이프라인(전체 정규화·VAD·화자 분리·병합·교정)이 만든다.

### 화면

- `RecorderSection`의 보기 카드 헤더에 **보기 전환 버튼 두 개**(파형 / 라이브 받아쓰기, `aria-pressed`)를 둔다. 녹음 전·중 모두 바꿀 수 있다.
- 라이브 보기는 보기 카드 본문을 채우는 스크롤 영역이다 (카드 크기는 화면이 정하므로 보기를 바꿔도 다른 요소가 움직이지 않는다 — "화면별 구성" > 녹음). 확정된 줄은 본문 색, `partial`은 옅은 색으로 이어 쓰고, 새 글자가 오면 맨 아래로 스크롤한다
  (사용자가 위로 스크롤해 읽는 중이면 따라가지 않는다). 녹음 전에는 "녹음을 시작하면 들리는 말이 여기에 바로 나타납니다" 안내를 보인다.
- 아래에 "미리보기입니다. 회의록은 녹음을 마친 뒤 더 정확하게 다시 만듭니다" 한 줄을 둔다.
- 그 아래에 **자원 사용 안내**를 한 줄 더 둔다 (2026-09-26 사용자 요청): "말하는 동안 GPU를 계속 써서 발열과 배터리 소모가 늘 수 있습니다. 필요 없을 때는 파형으로 바꿔 두세요".
  말하는 동안 인식이 쉬지 않고 이어져 GPU를 70~100% 쓰고, 한 번에 메모리 약 0.9GB를 잡기 때문이다. 인식 실패 안내가 떠 있어도 이 줄은 남긴다.

## 시스템 오디오 캡처 (Phase 5-2, 2026-09-26)

온라인 회의(Zoom·Meet·Teams·브라우저)의 **상대방 목소리는 마이크가 아니라 스피커로 나온다.** 이를 회의록에 넣으려면 스피커로 나가는 소리를
앱이 직접 잡아야 한다. 사용자 결정: **앱 밖에서 해야 하는 설정은 두지 않는다** — BlackHole 같은 가상 오디오 드라이버 설치·집계 장치 구성을 안내하는 방식은 쓰지 않는다.

### 방식: Core Audio Taps + 동봉 Swift 도구

- macOS 14.2+의 **Core Audio Taps**(`CATapDescription` + `AudioHardwareCreateProcessTap`)를 쓴다. 권한은 **"시스템 오디오 녹음"** 하나뿐이고
  화면 녹화 권한·보라색 화면 녹화 표시가 없다. 대상 플랫폼(macOS 14+)과 거의 겹친다 — 14.0·14.1은 지원하지 않고 안내만 한다.
- Electron 내장 `getDisplayMedia` + `audio: 'loopback'`(Electron 39+)은 쓰지 않는다. macOS에서는 네이티브 화면 공유 피커(`useSystemPicker: true`)를 거쳐야만
  소리가 들어오고(커스텀 피커는 트랙이 바로 끝나는 버그, electron#52738), 녹음마다 창을 고르고 "화면 및 시스템 오디오 녹음" 권한을 받아야 한다.
- 외부 npm 패키지(`audiotee`, `electron-audio-loopback`)도 들이지 않는다 — 릴리스 바이너리가 없어 어차피 Swift를 빌드해야 하고, 필요한 코드가 200줄 남짓이라 직접 갖는 편이 관리가 쉽다.
- 도구는 **`apps/desktop/native/systemAudioTap/main.swift`** 한 파일이고 `scripts/setupBin.ts`가 `swiftc -O -target arm64-apple-macos14.2`로
  `resources/bin/darwin-arm64/systemAudioTap`을 만든다 (Xcode 또는 Command Line Tools 필요. 없으면 경고만 남기고 이 기능만 막힌다).
  다른 동봉 바이너리처럼 `asarUnpack` 대상이고 서명·공증도 같이 받는다 (`references/distribution.md` 5절).
  `Info.plist`에 `NSAudioCaptureUsageDescription`(한국어)을 `electron-builder.yml` `extendInfo`로 넣는다 — 없으면 권한 창이 뜨지 않는다.

### 도구 규약 (`systemAudioTap`)

| 항목 | 값 |
| --- | --- |
| 인자 | 없음 (16kHz mono 고정, `@shared/audio`의 `SAMPLE_RATE_HZ`와 같은 값) |
| stdout | Float32LE mono PCM 16kHz, 연속 스트림 |
| stderr | 한 줄씩. `ready`(집계 장치 시작), `format: …`, `restarted: …`, `warn: …`, `error: …` |
| 종료 | stdin이 닫히거나 SIGTERM → 탭·집계 장치 정리 후 0. 시작 실패는 `error:` 한 줄 뒤 1 |

- 탭은 `CATapDescription(monoGlobalTapButExcludeProcesses: [])`(모든 프로세스 mono 믹스다운, 제외 없음) + `isPrivate` + `muteBehavior = .unmuted`.
  비공개 집계 장치에 기본 출력 장치를 서브 장치로, 탭을 `kAudioAggregateDeviceTapListKey`로 물린다. 채널·샘플 형식은 `kAudioTapPropertyFormat`에서 읽되
  **샘플레이트는 집계 장치의 `kAudioDevicePropertyNominalSampleRate`를 쓴다** — 탭 형식 속성은 만들 때 값(48kHz)에 머무는데 실제 콜백 데이터는 출력 장치 속도(실측 24kHz)를 따라서,
  탭 형식대로 변환하면 소리가 절반 속도로 들어와 길이가 어긋난다. 속도가 재생 중에 바뀌므로 그 속성의 리스너에서 `AVAudioConverter`를 다시 만든다.
- **벽시계 기준 연속 스트림.** 실측(M3 Pro, macOS 26.5)에서 IOProc은 무음에도 512프레임씩 계속 오지만, **첫 실행은 탭이 만들어진 뒤 몇 초 동안 버퍼가 오지 않았다.**
  도구는 프로세스 시작 시각을 기준으로 "지금까지 내보냈어야 할 샘플 수"를 계산해 부족분(`GAP_FILL_THRESHOLD_SEC` 0.1 이상)을 0으로 채운다. 콜백이 멈춰도 0.5초 타이머가 같은 일을 한다.
  main은 그래서 시스템 스트림을 마이크와 같은 속도의 연속 스트림으로 볼 수 있다.
- 기본 출력 장치가 바뀌면(이어폰 연결·해제) 집계 장치의 시계가 끊기므로 `kAudioHardwarePropertyDefaultOutputDevice` 리스너가 탭·집계 장치를 통째로 다시 만든다. 그 사이 구간은 위 규칙으로 0이 채워진다.
- **권한 거부 시 동작은 검증하지 못했다** (개발 기기에서 TCC를 초기화하지 않는다). 탭 생성이 실패하면 `error:`로, 성공한 채 무음이면 그대로 무음이 녹음된다.
  녹음 화면 안내 문구가 시스템 설정 경로(개인정보 보호 및 보안 → 화면 및 시스템 오디오 녹음)를 적는다.

### main: 섞기는 세션 안에서, 파이프라인은 그대로

- **켜기/끄기는 녹음 화면의 스위치**(`recording:setSystemAudio`, `{ isEnabled }` → `GetRecordingStateResponse`)이고 값은 DB 키 `audio.systemCapture`(기본 꺼짐)에 남아 앱을 다시 켜도 유지된다.
  `AppSettings`에 넣지 않는 이유는 켜는 행위가 값 저장이 아니라 **프로브**를 동반하기 때문이다 — 켜는 순간 `src/main/audio/systemAudio.ts`가 도구를 띄워 `ready`까지 기다렸다가(최대 `PROBE_TIMEOUT_MS` 15초 — 첫 실행은 시스템 권한 창이 떠 있는 동안 멈춰 있을 수 있다) 끝낸다.
  회의 시작 전에 시스템 권한 창을 미리 띄우고 바이너리·OS 버전 문제를 그 자리에서 알리기 위해서다. 실패하면 스위치는 켜지지 않고 `systemAudio.errorMessage`를 싣는다.
- 상태는 `RecordingStateEvent.systemAudio: { isEnabled: boolean; errorMessage?: string }`로 두 창에 push한다. 값은 참석자 수처럼 **세션 밖 main 메모리**(DB에서 한 번 읽어 캐시)에 있고 녹음 중에 바꾸면 다음 녹음부터 적용된다 (스위치는 녹음 중 비활성).
- `startRecording`이 켜져 있으면 도구를 spawn한다. 실패(바이너리 없음·비정상 종료)해도 **녹음은 마이크만으로 계속**하고 `systemAudio.errorMessage`로 알린다 — 회의 중에 녹음이 통째로 실패하는 것보다 낫다.
- `appendRecordingChunk`가 마이크 청크(`CHUNK_SAMPLES` 8192)를 받을 때마다 시스템 FIFO에서 같은 개수를 꺼내 **샘플별로 더하고 ±1로 클립**한 뒤 WAV·레벨(RMS)·라이브 받아쓰기에 넘긴다.
  섞은 결과가 파이프라인 입력이므로 정규화·VAD·STT·화자 분리·병합은 손대지 않는다. 상대방이 여러 명이면 화자 분리가 그쪽 목소리도 나눈다.
  `src/main/audio/systemAudioMix.ts`(순수 함수, vitest): FIFO는 부족하면 0으로 채우고(도구 시작 지연·재시작 구간), 꺼낸 뒤 남은 양이 `MAX_BACKLOG_SAMPLES`(1.5초)를 넘으면 오래된 것을 버려 시계 차이로 밀리는 것을 막는다.
  시작 시점의 0 채움만큼 시스템 소리가 마이크보다 뒤로 밀리지만(보통 0.5초 미만, 첫 실행은 몇 초) 한 스트림 안의 순서는 그대로라 STT·화자 분리에는 영향이 없다.
- `stopRecording`은 FIFO에 남은 시스템 샘플(최대 0.5초, 상대방의 마지막 말)을 한 청크 더 쓰고 도구의 stdin을 닫아 끝낸다. 앱 종료(`finalizeActiveRecording`)도 같은 경로다.
- **에코.** 스피커로 회의를 들으면 상대방 목소리가 마이크에도 들어와 두 번 섞인다(수 ms 차이라 잔향처럼 들린다). `getUserMedia`의 `echoCancellation`은 Chromium이 재생한 소리만 지우므로 Zoom 소리에는 효과가 없다.
  스위치 행의 안내 문구에 **이어폰 권장**을 적는다. 마이크 쪽에서 겹치는 구간을 지우는 처리는 하지 않는다 (완료 기준에서 품질을 보고 결정).

### 화면

- `RecorderSection` 오른쪽 옵션 패널 "녹음 설정" 그룹의 참석자 수 행 아래에 같은 모양의 행 하나: 제목 "온라인 회의 소리 함께 녹음", 설명 "Zoom·Meet 상대방 목소리도 회의록에 넣습니다. 이어폰을 쓰면 더 정확합니다. 시작 전에 켜 두세요", 오른쪽에 `Switch`.
  녹음 중에는 **비활성**(숨기지 않는다)이고, `systemAudio.errorMessage`가 있으면 설명 자리에 빨간 문구로 바꾼다(설명 높이는 세 줄로 고정, "화면별 구성" > 녹음).
- 녹음 중 상태 표시 옆에 켜져 있음을 알리는 짧은 배지("상대방 소리 포함")를 둔다 — 회의 중 "지금 저쪽 소리도 잡히고 있나"를 한눈에 알기 위해서다.

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

## 로컬 LLM 요약 (Phase 5)

STT·화자 분리와 **같은 방식**(외부 바이너리 spawn)으로 붙인다. 서버·HTTP·추가 런타임을 들이지 않는다.

- 엔진은 llama.cpp의 **`llama-cli`** 를 `child_process.spawn` 한다. `llama-server`(HTTP)는 쓰지 않는다 —
  단발 요약에 상주 서버·포트·프로세스 수명 관리가 필요 없고, "네트워크를 쓰지 않는다"는 원칙을 코드로도 지키기 쉽다.
- 호출 형태:

  ```
  llama-cli -m <gguf> -sysf <system.txt> -f <prompt.txt> -o <out.txt>
            -st --no-display-prompt --no-escape --no-warmup
            -c <ctxSize> -n <maxPredict> --temp <temp> -t <threads>
  ```

  - **프롬프트·시스템 프롬프트·출력은 전부 파일로 주고받는다.** 71분 회의록은 수만 자라 argv에 넣으면 길이 제한에 걸리고,
    `-e`(escape)가 기본 켜져 있어 본문의 `\n`·`\t` 같은 문자열이 제어문자로 바뀐다. `--no-escape`를 함께 준다.
  - `-st`(single-turn)로 한 턴만 돌고 종료한다. 대화 모드로 들어가면 프로세스가 stdin을 기다리며 끝나지 않는다.
  - `--no-display-prompt` + `-o`로 **결과 파일만 읽는다**. stdout에는 로드 로그·타이밍이 섞이므로 파싱하지 않는다.
  - 임시 파일은 `userData/summaries/<meetingId>/`에 만들고 잡이 끝나면 **실패해도 지운다** (정규화본과 같은 규칙).
- **긴 회의록은 map-reduce로 나눈다.** `src/shared/summary.ts`가 회의록을 발화 줄 경계로 청크 예산만큼 자르고,
  청크마다 부분 요약을 만든 뒤 부분 요약들을 이어 붙여 한 번 더 요약한다. 청크가 하나면 reduce 단계를 건너뛴다.
  분할·출력 정리는 순수 함수라 vitest로 검증한다. 청크 예산은 컨텍스트를 통째로 채우지 않고 여유를 둔다(아래 상수 절).
- **파이프라인이 자동으로 요약하지 않는다.** 디테일 화면의 "요약 만들기" 버튼이 `summary:create`를 보낸다.
  요약 모델이 없거나 요약이 실패해도 회의록 자체는 이미 `status='done'`이어야 하기 때문이다.
- 저장은 `meetings.summary` 한 컬럼. **진행 상태용 컬럼은 만들지 않는다** — 진행은 이벤트로만 알리고,
  앱이 꺼져 진행 상태가 사라지면 사용자가 버튼을 다시 누르면 된다.

### 잡 큐 통합

요약도 STT와 같은 CPU·GPU를 쓰므로 **`src/main/pipeline/queue.ts`의 같은 큐(동시성 1)** 에 넣는다.
요약 전용 큐를 따로 두면 STT와 요약이 동시에 돌아 둘 다 느려진다 (`references/pitfalls.md`).

- 큐 항목은 `string`이 아니라 `{ kind: 'pipeline' | 'summary'; meetingId: string }`이고, `drain`이 종류에 따라
  `runPipeline` 또는 `runSummary`를 부른다.
  Phase 5-4의 용어 초안은 회의에 묶이지 않고 결과를 돌려받아야 하므로 `{ kind: 'glossary'; run }` 항목으로 넣는다 (아래 "용어 사전" 절).
- 실패 처리는 종류마다 다르다. 파이프라인 실패는 `meetings.status='error'`로 남기지만,
  **요약 실패는 회의 상태를 건드리지 않는다** — 회의록은 멀쩡하고 요약만 없는 상태이므로 이벤트로만 알린다.

### IPC (Phase 5)

```ts
summary: { create: 'summary:create' },
events: { progress: 'pipeline:progress', summary: 'summary:progress' }
```

- `summary:create`는 큐에 넣기만 하고 즉시 반환한다(응답 없음). 요약은 수 분이 걸려 `invoke`를 매달아 둘 수 없다.
  Phase 3의 "뮤테이션은 갱신된 `MeetingDetail`을 돌려준다" 규약의 예외다 — 이 채널은 값을 바꾸는 게 아니라 **잡을 예약**한다.
- 진행은 `summary:progress`로 push한다: `{ meetingId, stage, percent, summary?, errorMessage? }`.
  `stage='done'`일 때 **요약 텍스트를 함께 실어 보내** renderer가 다시 조회하지 않게 한다.
- `stage='error'`이면 `errorMessage`(한국어)를 함께 보낸다. 회의 상태는 그대로 `done`이다.

### 화면

| 경로 | 페이지 | 추가되는 widget |
| --- | --- | --- |
| `/meetings/:meetingId` | `pages/MeetingDetail` | `meeting/SummarySection` (`TranscriptSection` 위) |

- `SummarySection`은 회의가 `done`이고 발화가 있을 때만 버튼을 활성화한다. 요약이 이미 있으면 본문을 보여주고 "다시 만들기"를 제공한다.
- 요약 텍스트는 마크다운으로 렌더링하지 않는다. 라이브러리를 들이지 않기 위해 **줄바꿈을 보존한 일반 텍스트**로 표시한다.

### 바이너리·모델 확보 (Phase 5)

| 대상 | 확보 방법 | 배치 위치 |
| --- | --- | --- |
| `llama-cli` + 의존 dylib | `ggml-org/llama.cpp` 릴리스의 `llama-<build>-bin-macos-arm64.tar.gz`를 받아 필요한 파일만 꺼낸다 | `resources/bin/darwin-arm64/` |
| 요약 모델 | `Qwen3-4B-Instruct-2507-Q4_K_M.gguf` (Hugging Face, Apache-2.0) | `scripts/fixtures/models/` (Phase 1 규칙과 동일), 앱은 `userData/models/` |

- llama.cpp 실행 파일의 rpath는 `@loader_path`라 **바이너리와 dylib을 같은 폴더에** 두면 그대로 동작한다 (sherpa-onnx와 같은 구조).
- 아카이브가 `tar.gz`라 `scripts/shell.ts`의 `extractArchive`는 압축 방식을 고정하지 않고 `tar -xf`로 자동 판별한다.
- 릴리스 빌드 번호(`b10622` 등)는 `scripts/assets.ts`에 상수로 고정한다. 최신 빌드를 자동 추적하면 체크섬이 매번 바뀐다.

## LLM 공급자 (2026-09-24)

요약과 용어 초안은 **LLM을 부르는 방식이 같고 프롬프트만 다르다.** 사용자가 이미 구독하거나 발급받은 Claude·GPT를 쓸 수 있게
LLM 호출을 `src/main/llm/*`의 **공급자 추상화** 뒤로 모으고, 설정에서 공급자를 고른다. 지원 외부 LLM은 Claude와 GPT다 (SKILL.md 1절).

### 네 공급자

| `LlmProvider` | 실행 | 준비 조건 | 비용·전송 |
| --- | --- | --- | --- |
| `local` (기본) | `llama-cli` spawn (기존 방식 그대로) | `llama-cli` + 요약 모델 | 없음. 회의록이 기기 밖으로 나가지 않는다 |
| `claude-api` | `@anthropic-ai/sdk`로 Messages API 호출 (main 프로세스) | 설정에 저장한 Anthropic API 키 | Anthropic 콘솔 토큰 요금. 회의록이 Anthropic 서버로 전송된다 |
| `claude-cli` | 설치된 Claude Code `claude -p`를 `child_process.spawn` | `claude` 실행 파일 + CLI에 로그인된 구독 계정 | 구독 사용량. 회의록이 Anthropic 서버로 전송된다 |
| `openai-api` | `openai` SDK로 Responses API 호출 (main 프로세스) | 설정에 저장한 OpenAI API 키 | OpenAI 플랫폼 토큰 요금. 회의록이 OpenAI 서버로 전송된다 |

- **회의록 전송 사실은 설정 화면의 공급자 설명에 그대로 적는다.** 로컬 우선 약속의 예외를 사용자가 알고 고르게 한다.
  외부 공급자의 자동 교정은 별도 스위치(기본 꺼짐)로 켜고, 켜면 회의가 끝날 때마다 회의록이 전송된다는 것을 스위치 설명에 적는다 (2026-09-28, "회의록 교정" 절).
- 파이프라인(STT·화자 분리)은 공급자와 무관하게 로컬이다. 공급자는 요약·용어 초안·교정에만 적용된다. 교정은 공급자에 따라 방식이 다르다 ("회의록 교정" 절).
- **API 키는 회사(`LlmApiVendor = 'anthropic' | 'openai'`) 단위로 따로 저장한다.** 공급자를 오가며 써도 키를 다시 넣지 않는다.
  키가 필요한 공급자와 회사의 대응은 `apiVendorOf(provider)` 한 곳에 둔다 (`claude-api` → `anthropic`, `openai-api` → `openai`, 나머지 null).
- **모델**: Claude API는 `claude-opus-5` 고정, 적응형 사고(`thinking: { type: 'adaptive' }`) + `output_config.effort: 'medium'`(요약은 정형 작업이라 높은 노력이 필요 없다).
  CLI는 `--model`을 넘기지 않고 **사용자가 CLI에 설정한 기본 모델**을 쓴다 — 구독 등급마다 쓸 수 있는 모델이 달라 앱이 고르면 실패할 수 있다.
  OpenAI는 **GPT-6 계열 셋 중 사용자가 고른다** (`OpenaiModelId = 'gpt-6-astra' | 'gpt-6-sol' | 'gpt-6-luna'`, 기본 `gpt-6-sol`) —
  요금이 모델마다 크게 달라 앱이 하나로 고정하면 비싼 쪽(Astra)이나 부족한 쪽(Luna)을 강요하게 된다. `reasoning.effort`는 `'low'`.
  GPT 모델 목록은 `src/shared/llm.ts`의 `OPENAI_MODELS` 한 곳에만 둔다.
- **컨텍스트 예산은 공급자가 정한다.** `local`은 기존 `CHUNK_BUDGET_CHARS`(8K 컨텍스트)로 map-reduce하고, 외부 API는 컨텍스트가 커서
  `API_CHUNK_BUDGET_CHARS`(40만 자, 약 28만 토큰)까지 한 번에 넣는다. 실무 회의록은 전부 한 번에 들어가 reduce 단계가 없다.
  `splitTranscript`의 `budgetChars` 인자로 넘기므로 순수 로직은 바뀌지 않는다.
- **생성 상한의 하한(`API_MIN_MAX_TOKENS`, 16K)도 외부 API 공통이다.** Claude의 적응형 사고와 GPT-6의 추론 토큰이 모두 출력 상한에 포함되므로 로컬용 상한(1200)을 그대로 주면 사고만 하다 잘린다.
- **GBNF 문법은 `local`에서만 쓸 수 있다.** 용어 초안은 외부 API에서는 문법 대신 출력 형식 지시문을 프롬프트 끝에 붙이고, 파싱(`parseGlossaryDraft`)이
  형식에 맞지 않는 줄을 버리는 것으로 같은 결과를 얻는다.

### 파일과 인터페이스

```
src/shared/llm.ts            # LlmProvider 유니온·기본값·한국어 라벨, API 키 회사(LlmApiVendor)·GPT 모델 목록, 준비 여부 판정(isLlmReady·llmMissingMessage),
                             # claude CLI 인자 조립·JSON 출력 파싱, 외부 API 청크 예산 (순수 함수, vitest)
src/main/llm/types.ts        # LlmClient·LlmCompleteParams 인터페이스
src/main/llm/provider.ts     # 설정을 읽어 LlmClient 하나를 만든다(createLlmClient)·현재 상태(getLlmStatus). 요약·용어 초안은 이것만 부른다
src/main/llm/local.ts        # llama-cli (기존 summary/llama.ts의 인자 조립·답변 추출을 그대로 쓴다)
src/main/llm/claudeApi.ts    # Anthropic SDK. 스트리밍으로 받아 finalMessage()만 쓴다 (긴 출력에서 HTTP 타임아웃 회피)
src/main/llm/claudeCli.ts    # claude 실행 파일 탐색·spawn. 프롬프트는 stdin, 시스템 프롬프트는 --system-prompt
src/main/llm/openaiApi.ts    # OpenAI SDK Responses API. instructions=시스템 프롬프트, input=프롬프트, output_text만 쓴다
src/main/llm/apiKey.ts       # 회사별 API 키 저장·조회 (safeStorage 암호화)
src/main/llm/check.ts        # 설정 화면 "연결 확인" — 짧은 프롬프트 한 번
```

```ts
interface LlmCompleteParams {
  system: string
  prompt: string
  /** 생성 상한. local은 -n, 외부 API는 max_tokens의 하한(사고·추론 토큰이 포함되므로 16K 아래로 내리지 않는다) */
  maxTokens: number
  /** 임시 파일 이름과 로그에 쓰는 꼬리표 */
  label: string
  /** local이 프롬프트·출력 파일을 두는 폴더. 만들고 지우는 것은 호출하는 쪽(요약·용어 초안)의 몫 */
  workDir: string
  /** local 전용. GBNF 문법, 컨텍스트 크기, 온도. 외부 API 공급자는 무시한다 */
  grammar?: string
  contextTokens?: number
  temperature?: number
}

interface LlmClient {
  provider: LlmProvider
  /** 회의록 한 조각의 최대 글자 수. splitTranscript의 budgetChars로 넘긴다 */
  chunkBudgetChars: number
  /** 답변 본문만 돌려준다. llama의 `Assistant:` 표시 제거는 local 구현이 한다 */
  complete: (params: LlmCompleteParams) => Promise<string>
}
```

- `createLlmClient()`는 잡이 **시작할 때** 설정을 한 번 읽는다. 진행 중인 잡의 공급자는 바뀌지 않는다 (조용히 처리 옵션과 같은 규칙).
- 준비되지 않았으면 spawn·요청 전에 한국어 메시지로 멈춘다 (`llmMissingMessage`). 메시지는 renderer의 `SummarySection`도 같은 함수로 만들어 두 곳이 같은 문구를 보여준다.
- 외부 API를 써도 **잡 큐는 그대로 하나**다 (`pipeline/queue.ts`, 동시성 1). 외부 API는 GPU를 쓰지 않아 STT와 동시에 돌 수 있지만,
  큐를 둘로 나누면 "회의 처리 중이면 그 뒤에 만든다"는 화면 안내와 실패 처리가 공급자마다 갈린다. 단순함을 택했다.

### Claude Code CLI 호출

```
claude -p --output-format json --tools "" --no-session-persistence --setting-sources "" --system-prompt <system>
  (프롬프트는 stdin으로)
```

- **`--bare`를 쓰지 않는다.** 키체인 읽기를 끄기 때문에 구독 로그인이 풀려 "Not logged in"이 된다 (2026-09-24 실측). 대신
  `--tools ""`(도구 전부 끔), `--no-session-persistence`(세션 파일 남기지 않음), `--setting-sources ""`(사용자·프로젝트 설정 무시)로 최소 모드를 만든다.
- **`cwd`는 `userData/llm/`** 같은 빈 폴더로 둔다. 프로젝트 폴더에서 돌리면 그곳의 CLAUDE.md가 시스템 프롬프트에 섞인다.
- 프롬프트는 **stdin**으로 준다. 회의록은 수만 자라 argv에 넣을 수 없다 (llama와 같은 이유). 시스템 프롬프트는 수백 자라 `--system-prompt`로 넘긴다.
- 출력은 `--output-format json` 한 덩어리다. `type: 'result'`이고 `is_error`가 거짓일 때 `result` 문자열이 답변이다.
  `is_error`가 참이면 `result`가 오류 문장이다 (예: `Not logged in · Please run /login`) — 그대로 한국어 안내 뒤에 붙인다.
- **실행 파일 탐색**: Finder에서 띄운 Electron 앱의 `PATH`는 `/usr/bin:/bin:/usr/sbin:/sbin`뿐이라 `claude`가 안 잡힌다.
  `~/.local/bin/claude` → `/opt/homebrew/bin/claude` → `/usr/local/bin/claude` → `~/.claude/local/claude` 순서로 존재를 보고,
  없으면 로그인 셸(`$SHELL -ilc 'command -v claude'`)로 한 번 찾아 캐시한다. spawn할 때 `PATH`도 로그인 셸의 값으로 바꿔 준다
  (npm 설치본은 `node`를 PATH에서 찾는다). 결과(`path`·`version`)는 `llm:status`로 설정 화면에 보여준다.

### Claude API 호출

- `new Anthropic({ apiKey })` → `client.messages.stream({...}).finalMessage()`. 스트리밍은 화면에 흘리지 않고 타임아웃 회피용이다.
- `stop_reason === 'refusal'`이면 "요청을 처리하지 않았습니다"로, `max_tokens`면 "답변이 잘렸습니다"로 안내한다.
- 오류는 SDK의 타입으로 나눈다: `AuthenticationError`(키 오류) → `RateLimitError`(한도) → `APIConnectionError`(네트워크) → `APIError`(그 외, 상태 코드 포함).
- **API 키는 `safeStorage.encryptString`으로 암호화해 settings 테이블에 base64로 저장한다** (`llm.claudeApiKey`·`llm.openaiApiKey`). renderer에는 키를 돌려주지 않고
  회사별 유무와 마지막 4자(`apiKeys[vendor].isSaved`·`.tail`)만 준다. `safeStorage.isEncryptionAvailable()`이 거짓이면 저장을 거절한다 — 평문으로 남기지 않는다.

### OpenAI API 호출

- `new OpenAI({ apiKey })` → `client.responses.create({ model, instructions: system, input: prompt, max_output_tokens, reasoning: { effort: 'low' } })`.
  Chat Completions는 쓰지 않는다 — OpenAI가 Responses API를 기본 인터페이스로 안내한다. 응답은 `output_text`만 쓴다.
- `status === 'incomplete'`이면 `incomplete_details.reason`을 본다: `max_output_tokens`면 "답변이 잘렸습니다", `content_filter`면 "요청을 처리하지 않았습니다".
  Claude의 `stop_reason`과 같은 이유로 빈 요약·잘린 요약이 저장되지 않게 오류로 바꾼다.
- 오류는 SDK의 타입으로 나눈다: `AuthenticationError`(키 오류) → `RateLimitError`(한도·잔액) → `APIConnectionError`(네트워크) → `APIError`(그 외, 상태 코드 포함). Claude와 같은 순서·같은 문구 형식이다.
- 스트리밍은 쓰지 않는다. SDK 기본 타임아웃(10분)이 요약 한 번에 충분하다.

### IPC

| 키 | 채널 | 방향 | 용도 |
| --- | --- | --- | --- |
| `llm.status` | `llm:status` | invoke | `LlmStatus` 조회 — 공급자, 로컬 모델 준비 여부, 회사별 키 유무·꼬리, GPT 모델, `claude` 경로·버전 |
| `llm.setProvider` | `llm:setProvider` | invoke | 공급자 저장. 갱신된 `LlmStatus`를 돌려준다 |
| `llm.setApiKey` | `llm:setApiKey` | invoke | 회사(`vendor`)의 키 저장(`apiKey: string`) 또는 삭제(`null`). 갱신된 `LlmStatus`를 돌려준다 |
| `llm.setOpenaiModel` | `llm:setOpenaiModel` | invoke | GPT 모델 저장(`model: OpenaiModelId`). 갱신된 `LlmStatus`를 돌려준다 |
| `llm.check` | `llm:check` | invoke | 현재 공급자로 짧은 프롬프트 한 번. 성공 메시지를 돌려주고 실패는 reject |

- 공급자는 `AppSettings`에 넣지 않는다 — 키 저장·CLI 탐색·연결 확인 같은 비동기 동작이 붙어 있어 용어 사전과 같은 이유로 **자기 채널**을 쓴다 (`references/data-model.md`).
- `llm:check`는 큐를 거치지 않는다. 짧고, 로컬 공급자는 spawn 대신 모델 존재만 확인해 돌려준다.

### 화면

- `setting/LlmSection` — 설정의 **"요약 · 용어 초안"** 카테고리. 용도로 이름을 짓는다 — "언어 모델"은 음성 인식 모델과 겹쳐 들린다.
  "실행 방식" 라디오 네 개(제목·설명·전송 안내), 고른 방식에 따라 아래 행이 바뀐다:
  `local`이면 **로컬 요약 모델 파일** 다운로드 행(`model/SummaryModelSection`, 페이지가 `localModelSlot`으로 넘긴다),
  `claude-api`·`openai-api`면 그 회사의 API 키 입력(`type="password"`, 같은 `ApiKeyField`에 라벨·안내·자리표시자만 다르게)·저장·삭제와 저장 상태(`…abcd`),
  `openai-api`면 그 아래 GPT 모델 선택(`OpenaiModelSelect`, `<select>` 하나 — 셋 중 하나라 라디오를 또 쌓지 않는다),
  `claude-cli`면 찾은 경로·버전 또는 설치 안내.
  "연결 확인" 버튼은 외부 공급자에서만 보인다. 로컬 파일 행은 파일이라는 점을 제목에 드러내고, 외부 공급자를 쓰면 필요 없다고 설명에 적는다.
- `meeting/SummarySection`은 `useModelStatus` 대신 `useLlmStatus`로 준비 여부를 본다. 준비되지 않았을 때의 문구는 공급자별로 다르고(`llmMissingMessage`), 설정 링크는 같다.
  캡션 "로컬 모델"은 공급자 라벨로 바뀐다(위치는 헤더의 제목 아랫줄 — "화면별 구성"의 회의 상세).
- `setting/GlossarySection`의 "초안에는 요약 모델이 필요합니다" 안내는 공급자 라벨을 쓰도록 바꾼다 (그 위젯을 손대는 작업이 끝난 뒤).

## 용어 사전 (Phase 5-4)

교정(발음 유사도 후보 + O/X 판정)과 인식(whisper `--prompt`)은 둘 다 **정답 용어 목록**이 있어야 한다 (`docs/phase5-refine-results.md`).
용어 사전은 **전역 한 층**이다 (2026-09-25 사용자 결정으로 회의별 층 폐기 — 자동 교정에는 회의마다 용어를 적는 단계가 맞지 않는다). 이 절은 그 전역 층을 설정에서 만드는 방법이다.

### 초안은 LLM, 확정은 사람

- 설정의 **팀 소개**(예: "프론트엔드 개발팀, 공용 UI 라이브러리와 패키지 배포를 다룸")를 받아 요약과 같은 `llama-cli` + 요약 모델로 **용어 초안**을 만든다.
- 초안은 저장하지 않는다. renderer가 편집 중인 목록 뒤에 **새 용어만 덧붙이고**(`=` 앞부분 기준, 대소문자 무시) 사용자가 고친 뒤 저장한다.
  모델 초안에는 틀린 읽기(Yarn=와이어너)와 일반어가 섞이고, 일반어 하나가 교정 오탐 수십 개를 만든다 (측정 문서).
- 프롬프트는 "음성 인식이 틀리는 종류(영어 기술 용어·제품·도구 이름·약어·외래어)만, 일반어 제외"로 좁히고 읽기 예시를 준다.
  출력 형식은 GBNF 문법으로 못박는다 (아래). 문법 파일·프롬프트는 `src/shared/glossary.ts`에 둔다.
- **초안은 `영어 표기 = 한글 읽기` 줄만 받는다** (GBNF에서 한글 줄 제거, 2026-09-24). 한글 줄을 허용하면 모델이 문장을 줄 단위로 끊어 적거나
  "버전 관리·소스 코드·기록 템플릿" 같은 일반어로 목록을 채웠다. 한국어 용어(모노레포, 임상시험)는 사용자가 직접 적는다. 저장 형식은 그대로 `용어` 줄도 받는다.
- 프롬프트는 "한국 회의에서 영어 이름 그대로 부르는 말만, 읽기는 뜻이 아니라 소리"를 못박는다. 없으면 `ad performance = 광고 성과`처럼
  한국어 개념을 영어로 번역한 줄이 나오고, 이런 줄은 교정에서 한국어를 영어로 바꾸자는 오탐이 된다.
- **읽기 예시는 기술 용어(Kubernetes·GitHub·React·npm)를 유지한다.** 일상 제품 이름(YouTube·Excel)으로 바꾸면 예시 누출은 줄지만 읽기가 크게 나빠졌다
  (React = 레이크트, Kubernetes = 크로노스). 누출은 한글 줄 제거·줄 수 축소로 대부분 사라졌다.
- **초안은 3~25줄**로 받는다. 5~40줄로 받으면 짧은 팀 소개에서 그 분야의 흔한 이름(프론트엔드 팀에 Nginx·Redis·MongoDB)으로 빈자리를 채운다.
- **팀 소개에 영어로 적힌 이름은 초안 맨 앞에 둔다.** 모델이 적은 줄이면 그 줄을, 빠뜨렸으면 약어는 코드 읽기로, 그 외는 읽기 없이 이름만 넣어 사용자가 읽기를 채우게 한다.
  팀 소개 안내 문구도 "쓰는 기술·도구·제품 이름을 영어 그대로 적어 달라"고 요청한다 — 팀 소개가 짧으면 모델은 실제 회의 용어를 알 수 없다.
- **대문자 약어의 읽기는 코드가 만든다** (`CI/CD` → `씨아이 씨디`). 모델은 약어를 자주 틀리게 읽는다. 대문자·숫자만으로 된 2~6자 토큰(대문자 1자 이상)을 `/`로 나눈 것이 약어다.
  숫자는 영어로 읽는다 (`S3` → `에스쓰리`, `GA4` → `지에이포`).
- **`.js`로 끝나는 이름은 읽기 끝을 `제이에스`로 고친다** (`Next.js = 넥스트 포인트` → `넥스트 제이에스`). 모델이 점을 "포인트·닷"으로 읽는다.
  읽기가 여러 단어면 마지막 단어를 바꾸고, 한 단어면 뒤에 붙인다.
- **사람이 검수한 읽기 사전이 모델 읽기를 덮어쓴다** (2026-09-24). 약어·`.js` 밖의 단어 읽기(Jira=재자, Git=기트, Redux=레덕스, Tailwind=타일윈드, ESLint=엔엘식)는
  4B 모델의 한계라 프롬프트로 못 고친다 (`docs/phase5-refine-results.md` "초안 품질 보강"). 자주 쓰는 개발·제품 용어의 `영어 표기 = 한글 읽기`를
  **`@meeting-stt/core/termReadings`** 에 상수(`TERM_READINGS`)로 두고, `parseGlossaryDraft`가 사전에 있는 용어는 모델 읽기 대신 사전 읽기를 쓴다 — 약어 코드 읽기와 같은 방식이다.
  - 적용 순서는 **사전 → 약어 → `.js`**. 사전은 사람이 검수한 값이라 약어 규칙보다 우선한다 (`SQL = 시퀄`처럼 약어 모양이어도 통째로 부르는 이름을 사전에 적을 수 있다).
  - 찾기는 **대소문자 무시**이고, 맞으면 **표기도 사전 표기로 맞춘다** (`Github = 깃헙` → `GitHub = 깃허브`). 교정·인식은 표기를 그대로 쓰므로 정식 표기가 낫다.
  - 사전은 **읽기만 바꾸고 용어를 더하지 않는다.** 모델이 적지 않은 용어를 사전에서 끌어오면 고정 목록과 같아져 모든 회의를 한 분야로 끌고 간다 (`docs/phase5-results.md`).
    예외는 팀 소개에 적힌 이름(`prependTeamTerms`)이다 — 모델이 빠뜨렸으면 약어와 마찬가지로 사전 읽기를 채운다.
  - 사전에 넣는 것은 **한국 회의에서 영어 이름 그대로 부르는 도구·제품·언어·프레임워크·서비스 이름과 개발·제품 관용어**다. 읽기는 실제로 부르는 소리 하나(흔한 변형이 있으면 쉼표로 2개까지)이고,
    번역어로 부르는 말(배포, 검색)은 넣지 않는다. 사전에 없는 용어는 지금처럼 모델 읽기를 쓰고 사용자가 고친다.
  - 사전은 `packages/core`에 둔다 — 브라우저 프로토타입도 같은 용어 사전 형식을 쓰게 될 때 읽기 값이 갈라지면 안 되고, 런타임 의존이 없는 순수 데이터라서다.
    테스트(`termReadings.test.ts`)는 표기 중복(대소문자 무시)·읽기가 한글뿐인지·찾기 규칙을 본다.
- 요약 모델이 없으면 "초안 만들기"를 막고 요약 모델을 먼저 받으라고 안내한다. 직접 입력은 모델 없이도 된다.

### 실행과 큐

- `glossary:draft`는 **초안을 결과로 돌려주는 invoke**다 (`{ teamDescription }` → `{ terms: string[] }`). 요약과 달리 10~20초로 짧고,
  결과를 DB가 아니라 편집 중인 화면에 넣으므로 push 이벤트·진행률을 두지 않는다.
- 요약과 같은 GPU를 쓰므로 **같은 큐(동시성 1)** 에 `kind: 'glossary'`로 넣고, 잡이 끝나면 invoke가 풀린다.
  회의 처리 중이면 그 뒤에 돈다 — 화면은 "다른 작업이 끝난 뒤 만듭니다"를 함께 보여준다. 실패는 invoke reject(한국어 메시지)로만 알린다.
- 임시 파일은 `userData/glossary/`에 만들고 끝나면 실패해도 지운다 (요약과 같은 규칙).

### IPC

| 키 | 채널 | 방향 | 용도 |
| --- | --- | --- | --- |
| `glossary.get` | `glossary:get` | invoke | `GlossarySettings` 조회 |
| `glossary.update` | `glossary:update` | invoke | `GlossarySettings` 전체 저장. 정리(공백·빈 줄·중복 제거)한 값을 돌려준다 |
| `glossary.draft` | `glossary:draft` | invoke | 팀 소개로 초안 생성. 저장하지 않는다 |

### 화면

- `setting/GlossarySection` — 팀 소개 `textarea`(최대 500자, placeholder에 영어 도구 이름을 섞은 예), "초안 만들기" 버튼, **행 단위 용어 목록**, "저장" 버튼.
- **용어 목록은 한 행에 `용어` 입력 + `한글 읽기(선택)` 입력 + 삭제 버튼**으로 편집한다 (2026-09-24 사용자 결정, 이전의 한 줄 텍스트 `textarea`를 대체).
  텍스트 방식은 사용자가 `=`·쉼표 구분자를 직접 지켜야 했고, `:`·`->`·전각 쉼표를 쓰면 경고 없이 한 용어로 뭉쳤다.
  - 읽기는 **선택**이다. 한글 용어는 그 자체가 발음이고, 읽기가 빈 영어 용어는 교정 때 모델이 읽기를 채운다 (`src/shared/refine.ts`). 적어 두면 모델 읽기보다 정확하다는 점만 안내한다.
  - 읽기가 여러 개면 한 칸에 쉼표로 적는다. `,`·`，`·`、`를 모두 구분자로 받는다. 용어 칸에는 `=`를 입력받지 않는다.
  - 읽기가 빈 대문자 약어는 코드 읽기(`acronymReading`)를 placeholder로 보여 주고, 저장할 때 그 읽기를 채운다.
  - 읽기 칸에서 Enter를 누르면 아래에 새 행을 만들고 그 용어 칸으로 이동한다. 빈 용어 행은 저장하지 않는다.
  - **목록 복사 버튼**을 용어 목록 아래 "용어 추가" 옆에 두고, **붙여넣기는 버튼이 아니라 입력 칸의 실제 붙여넣기(⌘V)** 로 받는다 (2026-09-28 사용자 요청). 다른 기기·다른 사람과 목록을 통째로 주고받기 위해서다.
    - 복사는 **편집 중인 목록**(저장 전 포함)을 저장 형식 줄(`용어` / `용어 = 읽기1, 읽기2`)로 `\n`로 이어 `clipboard:writeText`로 보낸다. 빈 약어 읽기는 저장할 때처럼 코드 읽기로 채운 줄이다.
    - 붙여넣기 형식은 **복사 형식과 같다** (`scripts/refine.ts`의 용어 파일도 같은 형식이라 그대로 옮겨진다). 용어 칸이든 읽기 칸이든 여러 줄 또는 `=`가 든 텍스트를 붙여 넣으면 `parseTermLines`로 줄마다 행을 만들어 **붙여 넣은 행 자리부터** 쭉 채운다 (그 행이 비어 있으면 대신하고, 아니면 바로 아래에 끼운다). 한 줄짜리 일반 텍스트는 평소처럼 그 칸에 들어간다.
    - 목록에 이미 있는 용어(`=` 앞부분, 대소문자 무시)와 붙여 넣은 텍스트 안의 중복은 건너뛴다 — 복사한 목록을 같은 화면에 다시 붙여도 행이 두 배가 되지 않는다. 저장하지 않고 "저장하지 않은 변경" 표시로 확인을 맡긴다.
  - **저장·IPC 형식은 바꾸지 않는다.** 행은 renderer 안에서만 쓰고, 저장할 때 `용어` 또는 `용어 = 읽기1, 읽기2` 줄(`GlossarySettings.terms: string[]`)로 직렬화한다.
- 저장은 버튼으로 한다 (blur 저장 아님). 초안을 덧붙인 직후 사용자가 훑어보고 고칠 시간을 준다. 저장하지 않은 변경이 있으면 버튼 옆에 표시한다.


## 회의록 교정 (Phase 5-4)

**전역 용어 사전**을 근거로 회의록의 오인식을 찾아 **자동으로 고친다**. 방식은 검증에서 확정한 그대로다 (`docs/phase5-refine-results.md`):
코드가 자모 발음 유사도로 치환 후보를 만들고, LLM은 후보마다 문맥상 뜻이 통하는지 O/X만 답하며, 치환은 코드가 한다.

**2026-09-25 사용자 결정으로 두 가지를 바꿨다.** (1) 회의별 용어 층을 없애고 **전역 용어 사전만** 쓴다 — 회의마다 용어를 적는 단계가 자동 교정과 맞지 않는다.
(2) 수정 **제안**을 만들어 사용자가 쌍 단위로 수락·거절하던 흐름을 버리고, 파이프라인이 회의록을 저장한 직후 **교정 잡을 자동으로 이어 돌려 통과한 쌍을 바로 `utterances.text`에 반영**한다.
검증에서 측정한 판정 정밀도는 52%라 틀린 치환도 함께 들어간다 — 그래서 **무엇을 고쳤는지 상세 화면에 남기고**, 잘못 고친 곳은 발화 인라인 편집으로 되돌린다.
인식 단계(`--prompt`)는 여전히 건드리지 않는다 (`roadmap.md` 5-4).

**2026-09-28 사용자 결정으로 교정 방식이 공급자에 따라 둘로 나뉜다.** 용어 사전에 없는 오인식("차 통지를" → "차 정지를")까지 문장 뜻을 보고 고친다.
측정(`docs/phase5-refine-results.md` "문장 교정")에서 외부 공급자는 이것을 해냈고 로컬 4B는 여전히 못 했다.

| 공급자 | 교정 방식 | 근거 | 용어 사전 |
| --- | --- | --- | --- |
| `local` | **용어 교정** — 코드가 발음 후보를 만들고 LLM이 O/X 판정 (아래 "실행과 큐"의 1~5, 변경 없음) | 로컬 4B의 문장 교정은 10분 회의에서 8개 전부 틀림 | 필수 |
| `claude-api`·`claude-cli`·`openai-api` | **문장 교정** — LLM이 고친 줄을 내고 코드가 발음 가드로 거른다 (아래 "문장 교정") | 10분 17개 모두 맞음, 71분 123개 중 명백한 오류 0 | 선택 (있으면 프롬프트에 넣는다) |

- 문장 교정은 용어 교정이 하던 일(카볼→tarball, 기터브→GitHub)을 포함하므로 외부 공급자에서는 **용어 교정을 돌리지 않는다.** 두 방식을 겹쳐 돌리지 않는다.
- 어느 방식이든 교정이 본문을 바꾸면 **발화의 교정 전 원문을 `utterances.original_text`에 보관**하고, 상세 화면에서 발화별로 원문을 보고 되돌릴 수 있다
  (`data-model.md` "자동 교정 결과 저장"). 문장 교정은 고치는 범위가 넓어 잘못 고쳤을 때 인라인 편집만으로 되돌리기 어렵기 때문이다.

### 실행과 큐

- **자동 실행**: 파이프라인 잡이 `status='done'`으로 저장을 끝낸 뒤 `scheduleAutoRefine`이 조건을 보고 **같은 잡 큐(동시성 1)** 에
  `{ kind: 'refine', meetingId }`를 넣는다. 조건은 LLM 공급자가 준비돼 있고(`isLlmReady(await getLlmStatus())`), 공급자별로 다음을 만족하는 것이다.
  - 로컬: 전역 용어가 하나 이상 있다(`getGlossarySettings().terms`).
  - 외부: 설정 **"회의록을 만들면 자동으로 교정"** 스위치(`AppSettings.isAutoRefineExternal`, DB 키 `refine.autoExternal`, **기본 꺼짐**)가 켜져 있다. 용어 사전은 필요 없다.
    자동 교정은 회의가 끝날 때마다 회의록을 그 회사 서버로 보내므로, 요약(버튼으로만 전송)과 달리 사용자가 명시적으로 켜야 한다 (2026-09-28 사용자 결정).
    이 결정 전에는 외부 공급자 + 용어 사전이면 자동으로 돌았는데, 이제 스위치를 켜야 돈다.
    스위치는 설정의 LLM 공급자 섹션에서 외부 공급자를 골랐을 때만 보인다(`LlmSection`의 `externalSlot` ← `features/refine/AutoRefineToggle`).
  조건이 아니면 **조용히 건너뛰고 로그만 남긴다** — 회의마다 오류를 띄우지 않기 위해서다. 회의록은 교정 없이도 `done`이다.
  스위치가 꺼져 있어도 상세의 "다시 교정"은 돈다(사용자가 그 회의를 보내겠다고 누른 것이다).
- **수동 실행**: 상세 레일의 "다시 교정" 버튼이 `refine:run { meetingId }`를 보낸다. 용어 사전을 고친 뒤 기존 회의를 다시 돌리는 용도다.
  이때는 조건을 건너뛰지 않고 실패로 알린다 (로컬인데 용어가 없으면 "전역 용어 사전이 비어 있습니다", LLM 미준비는 `createLlmClient`의 메시지).
  같은 회의의 교정 잡이 이미 줄 서 있으면 다시 넣지 않는다. 다시 교정은 **지금 본문**(이전 교정·사용자 편집이 들어간 것)을 입력으로 쓴다.
- 잡은 `src/main/refine/run.ts`가 돈다. 공급자를 잡 시작 시 한 번 읽어 로컬이면 `runRefine`(용어 교정), 외부면 `runSentenceRefine`(문장 교정)으로 간다.
  용어 교정의 순서는 스크립트(`scripts/refine.ts`)와 같다:
  1. 용어 사전 = `normalizeGlossaryTerms(전역 용어)`.
  2. `read` 단계: 읽기가 없는 라틴 문자 용어가 있으면 LLM에 한글 읽기를 한 번 묻는다 (`buildReadingPrompt`). 없으면 건너뛴다.
  3. 코드가 후보를 만든다 (`findRefineCandidates`). 후보가 없으면 판정 없이 빈 결과로 끝난다.
  4. `verify` 단계: 후보를 `VERIFY_BATCH_SIZE`(40)개씩 잘라 배치마다 LLM에 O/X를 묻는다. 진행률은 배치 수로 잰다.
  5. 통과한 쌍을 `applyRefinePairs`(순수 함수)로 발화에 적용하고, 바뀐 발화 본문과 결과(`refine_applied`, `refined_at`)를 **한 트랜잭션**으로 저장한다.
     결과는 통째로 덮어쓴다 — 다시 돌리면 새 결과가 이전 것을 대체한다.
- LLM 호출은 요약·용어 초안과 같은 **공급자 추상화**(`createLlmClient()`)를 거친다. 로컬은 읽기·판정 모두 GBNF 문법으로 형식을 못박고,
  외부 공급자(Claude·GPT)는 문법이 없으므로 프롬프트 끝에 같은 형식의 지시문을 붙이고 형식에 맞지 않는 줄은 파서가 버린다 (용어 초안과 같은 규칙).
  판정 온도는 `REFINE_TEMPERATURE`(0.1, 로컬 전용).
- 임시 파일은 `userData/refine/<meetingId>/`에 두고 잡이 끝나면 실패해도 지운다 (요약과 같은 규칙).
- **교정 실패는 회의 상태와 본문을 건드리지 않는다.** `refine:progress`의 `'error'`로만 알리고 이전 결과는 그대로 둔다.

### 문장 교정 (외부 공급자, 2026-09-28)

역할 분담을 용어 교정과 반대로 둔다 — **LLM이 고친 줄을 내고, 코드가 거른다.** 순수 로직은 `src/shared/sentenceRefine.ts`(vitest), 호출은 `runSentenceRefine`.

1. 발화를 `SENTENCE_CHUNK_CHARS`(12,000자) 조각으로 자른다. 요약의 외부 예산(40만 자)을 쓰지 않는 이유는 출력이 고친 줄 전체를 다시 적어 길어지기 때문이다
   (71분 회의 = 3조각, Claude CLI 174초). 진행률은 조각 수로 잰다(`stage: 'sentence'`).
2. 프롬프트(`buildSentencePrompt`)는 용어 사전(`표기 = 읽기`, 있을 때만) + 조각 안에서 1부터 매긴 번호의 발화. 발화 id(uuid)는 모델에 보내지 않는다.
   시스템 프롬프트(`SENTENCE_SYSTEM_PROMPT`)의 규칙: 소리가 비슷한 말로만 바꾼다 / 더하거나 빼지 않는다 / 말투·군말·반복·끊긴 문장을 다듬지 않는다 /
   **사람 이름·숫자는 바꾸지 않는다** / 용어 사전은 잘못 적힌 말을 고칠 때만 사전 표기로 쓴다(맞게 말한 "시맨틱 버저닝"을 semver로 바꾸지 않는다) / 확신이 없으면 고치지 않는다.
   출력은 고친 줄만 `[번호] 고친 줄 전체`, 없으면 `없음`. 외부 공급자라 문법이 없으므로 형식 지시는 프롬프트에 있고, 형식에 맞지 않는 줄은 파서가 버린다.
   생성 상한은 `SENTENCE_MAX_TOKENS`(32K) — 적응형 사고·추론 토큰과 다시 적는 줄이 함께 들어간다.
3. **발음 가드**(`guardSentence`): 원문과 수정문을 어절 LCS로 맞춰 바뀐 덩어리를 찾고, 덩어리마다 자모 발음 유사도를 잰다.
   `SENTENCE_MIN_SIMILARITY`(0.5) 이상인 덩어리만 반영하고 나머지 자리에는 원문 어절을 남긴다. 어절을 넣기만 하거나 빼기만 한 덩어리는 유사도 0이라 반영되지 않는다.
   영문은 용어 사전 읽기 → `@meeting-stt/core/termReadings` → `acronymReading`(E2E → 이투이) 순으로 한글 읽기로 바꿔 비교하고, 원래 표기끼리도 비교한다(CIE → CI).
   여러 단어 용어(peer dependency)는 쪼개기 전에 통째로 읽는다. 읽기를 모르는 영어 단어("false negative")는 소리로 확인할 수 없어 떨어진다 — 의도한 동작이다.
4. 반영된 덩어리가 곧 `RefinePair`(`from`, `to`, `similarity`)다. 결과 저장은 용어 교정과 같다(`applyRefineResult`) — 결과 형식·화면을 새로 만들지 않는다.

### 결과 기록

- `MeetingDetail.refineResult`에 마지막 교정 결과가 실린다: `{ refinedAt, appliedPairs }`. 한 번도 교정하지 않았으면 `null`.
  `appliedPairs`는 실제로 본문을 바꾼 쌍(`RefinePair[]`)이고, 비어 있으면 "고칠 곳을 찾지 못했다"는 뜻이다.
- 같은 쌍(from → to)이 여러 발화에 반복되므로(기터브→GitHub 8곳) 화면은 **쌍 단위로 묶어**(`groupRefinePairs`) "무엇을 몇 곳 고쳤는지"만 보여 준다.
- **되돌리기는 발화 단위다** (2026-09-28, 문장 교정과 함께). 교정이 본문을 바꾼 발화는 `Utterance.originalText`(교정 전 원문)를 갖고,
  발화 행에 "교정됨" 표시가 붙는다. 표시를 누르면 원문이 펼쳐지고 "원문으로 되돌리기"로 본문을 원문으로 돌린다(`utterances:revertRefine`).
  되돌리면 그 발화의 쌍은 `refine_applied`에서도 빠진다 — 레일 목록이 본문과 어긋나지 않게 한다.
  쌍 단위 되돌리기는 두지 않는다. 한 발화에 여러 쌍이 겹치고, 사용자가 원문과 비교해 판단하는 단위는 발화다.
- `original_text`는 **처음 교정되기 전 원문**이다. 다시 교정해도, 교정 뒤 사용자가 인라인 편집해도 바뀌지 않는다. 되돌리기는 사용자 편집도 함께 버린다(원문을 펼쳐 보여 주므로 누르기 전에 알 수 있다).
- `done` 이벤트에 결과를 싣지 않는다. 결과는 상세의 일부라 `useMeeting`이 `done`에서 상세를 다시 읽는다 (파이프라인 `done`과 같은 규칙).
  교정이 본문을 바꾸므로 어차피 발화 전체를 main에서 다시 받아야 한다.

### IPC

| 키 | 채널 | 방향 | 용도 |
| --- | --- | --- | --- |
| `refine.run` | `refine:run` | invoke (응답 없음) | `{ meetingId }`. 교정 잡을 큐에 예약한다 (수동 재실행) |
| `events.refine` | `refine:progress` | push | `{ meetingId, stage: 'read' \| 'verify' \| 'sentence' \| 'done' \| 'error', percent, errorMessage? }` |
| `utterances.revertRefine` | `utterances:revertRefine` | invoke | `{ meetingId, utteranceId }` → `MutateMeetingResponse`(회의 상세 — 본문과 `refineResult`가 함께 바뀐다). 한 트랜잭션으로 `text = original_text`, `original_text = NULL`, 그 발화의 쌍을 `refine_applied`에서 뺀다 (2026-09-28) |

### 화면

- `features/refine/RefinePanel` — 상세 오른쪽 레일에서 요약 아래, 화자 목록 위. `TranscriptSection`이 `useMeeting`의 `refineResult`를 넘긴다
  (본문과 결과가 같은 상태여야 하므로 패널이 `useMeeting`을 따로 부르지 않는다). LLM 준비 여부(`useLlmStatus`)·전역 용어(`useGlossary`)·진행률(`useRefine`)은 패널이 스스로 구독한다.
- 본문 구성:
  - 진행 중: 단계 문구("용어 읽기를 정하는 중" / "후보를 판정하는 중" / "문장을 교정하는 중") + 진행률 막대.
  - 로컬 공급자일 때는 "로컬 모델은 용어 사전의 단어만 고칩니다. 문장까지 고치려면 설정에서 외부 공급자를 고르세요"를 한 줄로 보여 준다.
  - 결과가 있을 때: 고친 쌍 목록. 행마다 `«from» → to`와 걸린 발화 수. 쌍이 없으면 "고칠 곳을 찾지 못했습니다".
  - 결과가 없을 때(`null`): 아직 교정하지 않았다는 안내. **로컬 공급자이고** 전역 용어가 없으면 설정 링크와 함께 "용어를 저장하면 회의록이 만들어질 때 자동으로 교정합니다"를 보여 준다.
    LLM이 준비되지 않았으면 요약과 같은 문구(`llmMissingMessage`)와 설정 링크.
  - 아래에 "다시 교정" 버튼. LLM이 준비되지 않았거나, 로컬 공급자인데 전역 용어가 없거나, 진행 중이면 막는다.
- 발화 행(`TranscriptSection/ui/UtteranceRow`): `originalText`가 있으면 "교정됨" 표시 버튼(`aria-expanded`)을 두고, 펼치면 원문과 "원문으로 되돌리기" 버튼을 보여 준다.
  되돌리기는 바로 실행한다 — 되돌린 뒤에도 "다시 교정"으로 복구할 수 있어 2단계 확인 대상(회의 삭제·화자 병합)이 아니다.
