# 로드맵 보관 (완료했거나 수동 확인·후속만 남은 작업)

`roadmap.md`에서 옮겨 온 절이다. 체크박스는 여기서 그대로 갱신한다. 미완료 항목이 남은 절은 `roadmap.md` "보관된 작업" 표에 적혀 있다.

## Phase 0: 개발 환경 정리
- [x] `pnpm install` 성공 (`pnpm.onlyBuiltDependencies`에 `electron`, `esbuild`, `electron-winstaller`, `better-sqlite3` 등록, `electron-builder install-app-deps` 동작 확인)
- [x] `package.json` scripts 내부 호출을 `pnpm run`으로 통일, README 설치 안내도 pnpm 기준으로 수정, `packageManager` 필드·`.npmrc`(hoisted) 추가
- [x] `vitest`(단위 테스트)·`tsx`(스크립트 실행) devDependency 추가, `pnpm test` 스크립트 등록
- [x] `pnpm dev`로 스캐폴드 창이 뜨는지 확인 (`pnpm build`·`pnpm lint`도 통과)
- [x] `.gitignore`에 `scripts/fixtures/`, `*.wav`, 모델 파일(`*.bin`, `*.onnx`), `resources/bin/` 추가
- [x] `electron-builder.yml`: `appId`, `NSMicrophoneUsageDescription` 한국어 문구, 불필요한 카메라/폴더 권한 문구 제거
- [x] `build/entitlements.mac.plist`에 `com.apple.security.device.audio-input` 추가 (하드닝 런타임에서 마이크 접근 필수)

## Phase 1: 파이프라인 검증 (스크립트, UI 없음)
- [x] `scripts/setupBin.ts`: macOS(arm64) 용 `whisper-cli`(Metal 빌드)와 `sherpa-onnx-offline-speaker-diarization`을 `resources/bin/darwin-arm64/`에 배치 (git 커밋 안 함, `references/architecture.md` 참고)
- [x] `scripts/setupModels.ts`: `ggml-large-v3-turbo-q5_0.bin`, `sherpa-onnx-pyannote-segmentation-3-0`, `3dspeaker_speech_eres2net_base_sv`, Silero VAD를 `scripts/fixtures/models/`에 다운로드 (Range 이어받기 + SHA256)
- [x] 합성 픽스처: `scripts/makeFixture.ts`가 macOS `say`로 2~3인 한국어 대화 WAV를 만든다 → **배관(경로·파싱·병합) 검증 전용**
- [x] 실제 한국어 회의 WAV 픽스처 확보 → 품질·`cluster_threshold` 튜닝은 이걸로만 판단한다 (2026-08-26, 음성 메모 71분 발표·Q&A 녹음 `scripts/fixtures/audio/geumtoro*.wav`, git 제외)
- [x] 실제 녹음으로 재측정한 결론 반영: 음량 정규화 단계 추가(`src/main/pipeline/normalize.ts`), `cluster-threshold` 0.6 → 0.8, 군소 화자 흡수(`assignSpeakers`) → `docs/phase1-results.md`
      → **2026-08-26 일부 뒤집힘**: 임계값 군집은 71분 전체·앱 26분 회의에서 화자가 115·129개로 늘어난다(6·7절). 참석자 수 `num-clusters`가 기본 경로로 바뀜
- [x] `scripts/pipeline.ts`: WAV → (VAD) → whisper JSON → diarization 출력 → `@meeting-stt/core/merge` → 회의록 텍스트 출력
- [x] 병합·포맷(현 `packages/core/src/`)·`main/pipeline/{whisper,diarize}.ts` 단위 테스트 통과 (`pnpm test`, 45개)
- [x] 튜닝 결과 기록: 모델별(turbo-q5 / large-v3 / small) 처리 시간·체감 정확도, `cluster_threshold` 값, VAD 사용 유무 차이, 단어 타임스탬프 옵션 효과 → `docs/phase1-results.md`
- [x] 결론: 기본 모델·파라미터 확정 후 SKILL.md 결정 표 갱신 (실제 회의 WAV로 재확인 완료)

## Phase 2: 앱 골격 (관통)
- [x] `src/shared/{types,ipc}.ts` 정의, preload에 타입 노출
- [x] 녹음: AudioWorklet PCM 수집 → IPC 청크 전송 → main WAV append → 정지 시 헤더 확정 (워크릿은 `data:` URL 인라인 금지 — `electron.vite.config.ts`)
- [x] macOS 마이크 권한 요청 및 거부 시 안내 (`recording:requestPermission` → 거부 시 RecorderSection이 한국어로 안내)
- [x] SQLite 초기화·마이그레이션, meetings/utterances/speakers 리포지토리 (`pnpm dev`에서 `userData/meetings.db` 생성 확인)
- [x] 파이프라인 잡 큐(순차) + Phase 1 로직 이식(`normalize` → whisper/diarize → merge), 완료 시 `status='done'`, 실패 시 `'error'` (정규화본은 잡이 끝나면 삭제, 원본 WAV는 재시도용으로 보관)
- [x] 홈(리스트, 상태 표시) → 디테일(발화 리스트) 라우팅 (해시 라우터, `pipeline:progress` 수신 시 목록·상세 자동 갱신, 위젯 통합 테스트 포함)
- [x] 완료 기준: 앱에서 녹음 → 정지 → 잠시 후 홈에서 회의록이 열린다 (**2026-09-18 사용자 수동 확인 완료**) → **Phase 2 종료**

## Phase 3: 편집·복사·화자 관리

계약(IPC 채널·응답 규약·편집 UI 규칙)은 `references/architecture.md`, SQL과 설정 키는 `references/data-model.md`에 먼저 정의해 두었다.
남은 수동 확인·커밋 정리·Phase 4 인계 사항은 `docs/phase3-handoff.md`에 모아 두었다 (전부 처리되면 지운다).

- [x] IPC 계약: `meetings.rename/delete`, `utterances.updateText/reassign`, `speakers.rename/merge`, `settings.get/update`, `clipboard.writeText` (뮤테이션 응답은 갱신된 `MeetingDetail`)
- [x] main: `db/settings.ts` 신설, `db/{meetings,utterances,speakers}.ts`에 편집 함수 추가, 핸들러 payload 검증(길이 제한·회의 소속 확인), `audio/recordings.ts`로 원본 삭제 일원화
- [x] 발화 인라인 편집 (blur·Enter 확정, Escape 취소, 빈 값 저장 금지) — `shared/components/composites/InlineEditableText`
- [x] 화자 관리: 이름 변경(전체 반영) / 발화별 다른 화자로 재배정(`<select>`) / 화자 병합(2단계 인라인 확인)
- [x] 전체 복사(플레인/마크다운), 발화 단위 복사 — main `electron.clipboard` 경유. 발화 하나만 복사해도 화자 번호가 유지된다
- [x] 처리 진행률 표시 — `src/shared/progress.ts`(가중치·단조 증가, 단위 테스트 9개) + `modules/features/pipeline/PipelineProgress`를 홈 카드·상세가 공유
- [x] 회의 제목 변경, 삭제(2단계 인라인 확인 + 원본 WAV 삭제)
- [x] 원본 WAV 보관 설정(`audio.keep`, 기본 삭제) — `/settings` 화면, 잡 성공 시 적용
- [x] 참석자 수 입력 → `num-clusters` (녹음 화면 숫자 입력, `recording:stop` payload `speakerCount`, `meetings.speaker_count`, 참석자 수가 있으면 군소 화자 흡수 생략) — 임계값 군집이 긴 녹음에서 파탄나는 문제 대응 (`docs/phase1-results.md` 6·7절)
- [x] 통합 테스트: TranscriptSection 19개, SettingsSection 4개, MeetingListSection 7개 (`pnpm test` 139개 통과)
- [x] 완료 기준: 회의록을 열어 텍스트·화자 이름·제목을 고치고 복사한 결과가 앱을 다시 켜도 그대로 남는다 (**2026-09-18 사용자 수동 확인 완료**) → **Phase 3 종료**

## Phase 4: 배포 품질

결정과 계약은 `references/distribution.md`가 SSOT다.

- [x] 모델 카탈로그(`@meeting-stt/models/desktop`, 스크립트와 공유) + 다운로더(Range 이어받기, SHA256, `tar -xf` 아카이브 해제, 동시성 1)
- [x] 온보딩: 모델 선택(권장 turbo-q5 / 고품질 large-v3 / 저사양 small, 권장값 미리 선택) → 총 용량 → 항목별 진행률 → 완료 시 홈
      (`modules/widgets/model/ModelDownloadSection`, `pages/Onboarding`, `shared/routes/guards.tsx`의 `RequireModels` 가드)
- [x] "네트워크는 모델 다운로드 한 번뿐" 문구 노출 (온보딩·설정의 `ModelDownloadSection`)
- [x] 저사양 감지(`recommend.ts`, 단위 테스트) + 저사양 장비에서 다른 모델을 고르면 "시간이 오래 걸릴 수 있다" 안내
- [x] `/settings`에서 음성 인식 모델 변경(같은 위젯 재사용), 요약 모델 다운로드(`SummaryModelSection`), 업데이트 확인 옵션
- [x] macOS 배포용 whisper 정적 빌드(`scripts/buildWhisper.ts`, v1.8.4, Metal 내장), 서명·notarization 설정(옵트인)
- [x] electron-updater — 기본 꺼짐, `update.check` 설정으로 켬, 새 버전은 알리기만(`features/update/UpdateBanner`) → 사용자가 받기·설치
- [x] GitHub Actions: macOS(arm64) 검증 빌드만 (릴리스는 로컬 `pnpm run build:mac:release` + 자산 개별 업로드, `references/distribution.md` 6·8절)
- [x] 단일 인스턴스 잠금(`app.requestSingleInstanceLock`)
- [x] 설정 '조용히 처리'(`pipeline.quiet`) — 화자 분리 스레드를 성능 코어의 절반으로, STT와 순차 실행 (`references/architecture.md` 가속·스레드 정책)
- [x] 통합 테스트: ModelDownloadSection, SummaryModelSection, UpdateBanner, SettingsSection(업데이트 옵션)
- [x] `electron-builder.yml`의 `publish.owner` 교체(`geongyu09`), 공증 자격 증명 등록(`notarytool` 키체인 프로필 `meeting-stt-notary`, 2026-09-18)
- [x] 첫 릴리스 `v0.1.0` 게시 (2026-09-18) — 공증·스테이플 확인, dmg만 업로드 성공. 다음 릴리스에는 자동 업데이트용 zip이 필요하다 (`references/distribution.md` 6절)
- [x] 업데이트 배너 오탐 수정 — 판정을 `isUpdateAvailable`로 바꿨다. `checkForUpdates()` 결과에서 알릴 버전을 고르는 부분만
      `src/main/updateResult.ts`의 순수 함수로 떼어 단위 테스트를 붙였다 (electron-updater를 import하는 파일은 테스트할 수 없다).
      v0.1.1에 포함 (2026-09-18, `references/distribution.md` 7절 · `references/pitfalls.md`)
- [x] `v0.1.1` 게시 (2026-09-18) — **zip 포함**. 빌드·공증은 `build:mac:release`로 끝내고 자산은 하나씩 올렸다
      (zip 91초·dmg 101초, 재시도 0회). 동봉 바이너리 17개 서명·공증·스테이플 확인 (`references/distribution.md` 6절)
- [x] 완료 기준: `userData/models/`가 빈 상태로 앱을 켜면 온보딩이 뜨고, 다운로드가 끝나면 홈에서 녹음할 수 있다
      (**2026-09-18 사용자 수동 확인 완료**. 개발 모드는 픽스처 폴백 때문에 `userData/models/`와 `scripts/fixtures/models/`를
      둘 다 치워야 재현된다 — `src/main/models/paths.ts`) → **Phase 4 종료**

## Phase 5: 확장

사용자 지시로 Phase 3·4보다 먼저 착수했다(2026-08-26). 로드맵 순서를 건너뛴 예외라 여기 기록해 둔다.
설계·계약은 `references/architecture.md`의 "로컬 LLM 요약 (Phase 5)" 절이 기준.

### 5-1. llama.cpp 기반 로컬 요약 → `meetings.summary`

끝난 것:

- [x] `llama-cli` 호출 방식 확정 — `-sysf`/`-f`/`-o` 파일 입출력 + `-st --no-escape`, `-o` 출력에서 `\nAssistant:\n` 뒤만 취함
- [x] 요약 모델 확정 — `Qwen3-4B-Instruct-2507-Q4_K_M.gguf` (Apache-2.0, 비사고형). **필수 모델 아님** — 없으면 요약만 막히고 STT는 그대로
- [x] 순수 로직 `src/shared/summary.ts` (구간 분할·프롬프트 조립·출력 정리) + 단위 테스트
- [x] main `src/main/summary/{llama,run,paths,transcript}.ts` — map-reduce, 임시 파일은 잡이 끝나면 실패해도 삭제
- [x] 잡 큐 통합 — `pipeline/queue.ts`를 `{ kind: 'pipeline' | 'summary' }`로 일반화(동시성 1 유지). 요약 실패는 회의 상태를 건드리지 않음
- [x] IPC 계약 `summary:create` + `summary:progress`, preload·renderer api·`useSummary` 훅
- [x] `modules/widgets/meeting/SummarySection` + 통합 테스트 10개, `/meetings/:meetingId`에 배치
- [x] `scripts/summarize.ts` 검증 스크립트, `setupBin.ts`(llama-cli), `setupModels.ts --summary`
- [x] 실제 71분 회의록(40,089자 / 28,004토큰)으로 측정 — 5구간 map + reduce
- [x] 결함 두 개 수정 후 재측정 — 최대 생성 토큰 900 → 1200(최종 요약이 문장 중간에서 잘렸음),
      익명 라벨(`화자 7`)을 담당자로 쓰지 말라는 지시 추가. **324초 → 240초**, 잘림·라벨 나열 모두 사라짐

- [x] `docs/phase5-results.md` — 측정치와 확인된 함정 기록
- [x] `references/pitfalls.md`·`data-model.md`에 Phase 5 절 추가
- [x] 포매팅 경고 정리 (`pnpm exec prettier --check .` 통과)
- [x] **온보딩과의 연결 결정** — 요약 모델은 온보딩에서 받지 않고 `/settings`의 `SummaryModelSection`에서 따로 받는다.
      `SummarySection`은 모델이 없으면 버튼을 막고 설정 링크를 보여준다 (`references/distribution.md` 1절)

- [x] **STT 오인식을 요약 단계에서 고치지 않기로 결정** — 원문 회의록에 이미 "증본 문서"(changeset)·"타볼"(tarball)로
      적혀 있고 요약 모델은 충실히 옮긴 것뿐이다. 교정 지시는 "없는 내용을 만들지 마라"와 충돌해 이름·숫자까지 바꾼다.
      Phase 3 인라인 편집으로 회의록을 고친 뒤 "다시 요약"하는 경로를 쓴다 (`docs/phase5-results.md`)

남은 것:
- [x] 회의별 용어 사전(whisper `--prompt`) 검토 — **2026-09-24 측정 완료** (`docs/phase5-refine-results.md`).
      `--prompt`만으로는 첫 30초 창에서 효과가 끝난다. `--carry-initial-prompt`를 함께 주면 71분 회의 오인식 39곳 중 18곳
      (GitHub 11곳 전부, pnpm, 모노레포)을 고치고 없는 용어는 뚜렷이 만들지 않았다. 반복 환각도 1,103초 → 18초로 줄었다.
      앱 적용 여부와 용어 입력 위치는 사용자 확인 대기 (5-4 앱 항목)
- [x] **앱 동봉 whisper-cli 반복 환각 원인 조사** — 71분 녹음에서 1,103초가 반복 문장으로 채워진다(Homebrew 빌드는 27초).
      **2026-09-25 `-mc 0`으로 대응** (사용자 결정 A: 모든 모델에 적용). 금토로 71분 1,034초 → 25초, large-v3 102분 2,338초 → 2초 (`docs/stt-tuning-results.md`)
- [x] **`pnpm dev`로 실제 앱에서 관통 확인** — 회의 상세에서 "요약 만들기" → 진행률 → 본문 표시 → 앱 재시작 후에도 남아 있는지
      (**2026-09-18 사용자 수동 확인 완료**)
- [ ] **동봉 dylib의 서명·공증 확인 — 자격 증명 대기.** rpath가 `@loader_path`인 것과 내려받은 상태가
      adhoc(linker-signed)인 것은 확인했다(`docs/phase5-results.md`). `asarUnpack: resources/**`도 걸려 있다.
      electron-builder가 Developer ID로 재서명한 결과 확인은 인증서가 있어야 가능하다 (`references/distribution.md` 6절)
- [ ] 저사양 폴백 모델 검토 (Qwen3-1.7B 등) — Phase 4 저사양 안내와 함께

### 5-2. 시스템 오디오 캡처 (2026-09-26 착수)

온라인 회의(Zoom·Meet 등) 상대방 목소리를 전사하기 위해 스피커로 나가는 소리를 마이크와 함께 녹음한다.
사용자 결정: **앱 밖에서 해야 하는 설정(가상 오디오 드라이버 설치·집계 장치 구성)은 두지 않는다.** 설계는 `references/architecture.md` "시스템 오디오 캡처" 절.

**동봉 도구**
- [x] `native/systemAudioTap/main.swift` — Core Audio Taps(macOS 14.2+)로 전역 mono 탭 + 비공개 집계 장치 → `AVAudioConverter`로 16kHz mono Float32 → stdout. 벽시계 기준으로 빈 구간을 0으로 채워 연속 스트림을 보장하고, 기본 출력 장치가 바뀌면 다시 만든다. stdin이 닫히거나 SIGTERM이면 정리 후 종료
- [x] `scripts/setupBin.ts`가 `swiftc -O -target arm64-apple-macos14.2`로 빌드해 `resources/bin/darwin-arm64/systemAudioTap`에 둔다. `swiftc`가 없으면 경고만 남기고 넘어간다 (이 기능만 막힌다)
- [x] `src/main/bin/paths.ts`에 `systemAudioTapBinPath()`
- [x] `electron-builder.yml` `extendInfo`에 `NSAudioCaptureUsageDescription` 한국어 문구
- [ ] 서명·공증 빌드에서 동봉 도구가 함께 서명되는지 확인 — 자격 증명 대기 (5-1의 dylib 항목과 같은 이유)

**main**
- [x] `src/main/audio/systemAudio.ts` — 도구 spawn·stdout 누적·정지, 1초 프로브(권한 창 유도·동작 확인)
- [x] `src/main/audio/systemAudioMix.ts` — 순수 함수: 시스템 샘플 FIFO(부족하면 0 채움, 밀리면 오래된 것 버림)와 두 스트림 합산(클리핑). vitest
- [x] `src/main/audio/session.ts` — 시작 시 켜져 있으면 도구를 띄우고, 청크마다 마이크 + 시스템 샘플을 섞어 WAV·레벨·라이브 받아쓰기에 넘긴다. 도구가 없거나 실패하면 마이크만 녹음하고 `systemAudio.errorMessage`로 알린다. 정지 시 남은 시스템 샘플을 쓰고 도구를 끝낸다
- [x] `src/main/db/settings.ts` — `audio.systemCapture` 읽기·쓰기 (`AppSettings` 밖)

**계약·화면**
- [x] `src/shared/ipc.ts` — `recording.setSystemAudio`(invoke, `{ isEnabled }` → `GetRecordingStateResponse`), `RecordingStateEvent.systemAudio: { isEnabled, errorMessage? }`
- [x] preload `window.api.recording.setSystemAudio`, renderer `setSystemAudioApi`, `useRecordingState`가 `systemAudio`를 돌려준다
- [x] `RecorderSection`에 스위치 행 "온라인 회의 소리 함께 녹음" + 이어폰 권장 안내 + 실패 문구. 위젯 패널은 바꾸지 않는다
- [x] 사전 `recording.systemAudio.*`, `main.recording.systemAudio*` (ko·en)

**완료 기준**
- [ ] `pnpm dev`에서 스위치를 켜면 macOS "시스템 오디오 녹음" 권한 창이 뜨고, Zoom·Meet 또는 브라우저 재생 소리가 이어폰을 낀 채로 회의록에 들어간다 (사용자 수동 확인)
- [ ] 스피커로 들을 때 마이크에 되돌아온 소리와 겹쳐도 STT가 크게 나빠지지 않는지 확인. 나쁘면 "이어폰 권장"을 경고로 올린다

### 5-3. 녹음 위젯 패널 (메뉴바·전역 단축키 포함)

사용자 요청으로 5-2보다 먼저 착수한다 (2026-09-18). 5-1처럼 로드맵 순서를 건너뛴 예외이므로 여기 기록해 둔다.
설계·근거는 `references/architecture.md`의 "녹음 호스트 창 · 메뉴바 · 전역 단축키" 절, 함정은 `references/pitfalls.md`의 같은 이름 절.

> **2026-09-28 (`test/usage-analytics` 브랜치)**: 사용자 요청으로 플로팅 위젯 패널을 제거했다. 아래 완료 항목 중 패널·위젯 설정·위젯 단축키·트레이 "위젯 표시/숨김"은
> 이 브랜치에서 되돌려졌고, 그래프 소유 창만 보이지 않는 녹음 호스트 창(`windows/recorder.ts`, `#/recorder`)으로 남는다.

**계약 변경 (먼저 한다)**
- [x] `src/shared/ipc.ts`: `recording.state` / `recording.control` / `recording.setSpeakerCount` / `recording.reportError`(모두 invoke), `events.recordingState` / `events.recordingCommand`, `widget.setVisible` 추가 (채널 문자열 표는 `references/architecture.md` IPC 규약 절)
- [x] `StopRecordingRequest`에서 `speakerCount` 제거 — 참석자 수는 main 세션이 단일 출처가 된다
- [x] `AppSettings`에 `isWidgetEnabled`(`widget.enabled`, 기본 켜짐) 추가
- [x] 청크 RMS 계산을 `src/renderer`에서 `src/shared/audio.ts`로 옮기고 vitest 추가 (main이 레벨을 계산해 브로드캐스트)

**main**
- [x] `src/main/audio/session.ts`에 녹음 세션 상태(진행 중 회의·`startedAt`·참석자 수·마지막 레벨)와 상태 변화 브로드캐스트 추가
- [x] `src/main/windows/{main,widget,tray,shortcuts}.ts` 분리 — `index.ts`에서 창 생성 코드를 옮긴다
- [x] 메인 창 참조 보관 → `app.on('activate')` 재생성 조건과 `second-instance` 포커스를 메인 창 기준으로 수정
- [x] 위젯 패널 창: frameless·`type: 'panel'`·alwaysOnTop·`backgroundThrottling: false`·vibrancy, `workArea` 우측 배치, 위치 저장/복원(화면 밖이면 폐기)
- [x] Tray: `resources/trayTemplate.png`(+`@2x`), 녹음 중에만 1초 타이머로 `setTitle('● mm:ss')`, 메뉴 4개
- [x] `globalShortcut` `⌥⌘R`(녹음 토글)·`⌥⌘W`(패널 토글), 등록 실패는 경고 로그만, `will-quit`에서 해제
- [x] `before-quit`에서 진행 중 녹음의 WAV 헤더 확정 + 잡 큐 투입 (라우트 이동으로 정지하던 경로가 사라졌다)

**renderer**
- [x] `pages/Widget` + `modules/widgets/recording/WidgetPanelSection` — 녹음중 점·경과 시간·레벨 미터·참석자 수 입력·시작/정지
- [x] `/widget` 라우트를 `RequireModels` 가드 **밖**에 등록, 모델 미준비 시 시작 버튼 차단 + 안내
- [x] `useRecorder`를 위젯 전용으로 정리 — 언마운트 시 자동 정지 제거, `recording:command` 구독 추가
- [x] `useRecordingState` 훅(상태 구독 + `startedAt` 기반 경과 시간) 신설, `RecorderSection`은 명령 전송·상태 구독으로 전환
- [x] `RecorderSection`·`WidgetPanelSection`의 참석자 수 입력을 `recording:setSpeakerCount`로 동기화
- [x] 메인 창이 `stoppedMeetingId`를 받으면 회의 상세로 이동
- [x] `SettingsSection`에 위젯 표시 토글 추가
- [x] 위젯 재질을 `vibrancy: 'popover'` + `visualEffectState: 'active'`로 교체 (포커스 시 색 깨짐 수정, 2026-09-24)
- [x] 설정: 위젯 반투명 on/off·불투명도 슬라이더, 전역 단축키 두 개 변경 (`shortcut.*`, `widget.fade*`, `shortcuts:setSuspended`)

**검증**
- [x] 위젯 통합 테스트(시작/정지, 경과 시간, 모델 미준비 차단)와 `RecorderSection` 통합 테스트(명령 전송·상태 구독·참석자 수 동기화).
      훅은 단위 테스트하지 않는다 (`.claude/rules/test-strategy.md`)
- [x] `pnpm test`(199개) / `pnpm typecheck` / `pnpm lint` / `pnpm build` 통과 (2026-09-18)
- [ ] `pnpm dev` 실제 확인 — **설치된 v0.1.0 앱이 단일 인스턴스 잠금을 쥐고 있으면 dev 인스턴스가 즉시 종료된다.
      확인 전에 설치본을 종료할 것.** — 메인 창을 닫거나 다른 화면으로 이동해도 녹음 유지, 전체화면 앱 위에 패널 표시,
      단축키로 시작·정지, 메뉴바 시간 갱신, 정지 후 상세 이동, 외장 모니터 분리 후 패널 위치 복원
- [ ] 패널을 숨긴 채로 장시간(10분 이상) 녹음해 throttling으로 청크가 밀리지 않는지 확인 (`backgroundThrottling: false` 검증)

### 5-4. LLM 회의록 교정 (수정 제안)

사용자 요청으로 착수한다 (2026-09-24). 5-3이 끝나기 전에 시작하는 예외이므로 여기 기록해 둔다.
5-1의 "STT 오인식을 요약 단계에서 고치지 않는다" 결정은 **요약과 교정을 한 번에 하는 것**에 대한 판단이다.
교정은 요약과 분리된 별도 단계로 두고, 그 결정이 지적한 두 위험(없는 내용 생성, 정답 정보 부재)을 아래 방식으로 막는다.

- ~~파이프라인 자동 실행이 아니라 디테일 화면의 **버튼으로 요청**한다~~ → **2026-09-25 사용자 결정: 파이프라인이 회의록을 저장한 뒤 자동으로 돌린다.**
  회의록은 여전히 교정 없이도 `done`이고(교정은 별도 잡), 실패해도 상태·본문을 건드리지 않는다
- ~~`utterances.text`를 덮어쓰지 않는다. **발화별 수정 제안**을 만들고 사용자가 수락·거절한다~~ → **2026-09-25 사용자 결정: 통과한 쌍을 바로 본문에 반영한다.**
  판정 정밀도가 52%라 오탐도 들어가므로 고친 쌍 목록을 상세에 남기고, 잘못 고친 곳은 발화 인라인 편집으로 되돌린다
- **용어 사전이 필수다.** 정답 후보 없이는 고칠 근거가 없다 (검증 1·2). 라틴 문자 용어는 `용어 = 읽기1, 읽기2`로 한글 읽기를 함께 받는다.
  용어가 없거나 LLM이 준비되지 않은 회의는 자동 교정을 조용히 건너뛴다
- **LLM은 문장을 쓰지 않는다.** 코드가 자모 발음 유사도로 치환 후보를 만들고(`src/shared/phonetic.ts`, 하한 0.55),
  LLM은 후보마다 "그 자리에서 뜻이 통하는가"를 O/X로만 답한다. 출력 형식은 GBNF 문법(`--grammar-file`)으로 고정하고, 치환은 코드가 한다

**검증 (Phase 1 방식) — 2026-09-24 완료, `docs/phase5-refine-results.md`**
- [x] `scripts/refine.ts` + 순수 로직 `src/shared/{refine,phonetic}.ts`와 단위 테스트
- [x] 10분·71분 실녹음 회의록으로 측정 — 발화 다시 쓰기는 정답 0개(폐기). 후보+판정 방식은 71분 회의 **38초**,
      정밀도 20%(코드만) → **52%**, 판정이 정답 후보를 하나도 떨어뜨리지 않음
- [x] 결론(측정 시점): 자동 적용은 불가, **사용자가 수락하는 제안**으로만 쓴다. 같은 쌍이 여러 곳에서 반복되므로(기터브→GitHub 8곳)
      제안은 **쌍(from → to) 단위로 묶어** 한 번에 수락·거절하게 한다.
      → **2026-09-25 사용자 결정으로 뒤집었다**: 수락 단계 없이 자동 반영한다. 정밀도 한계는 그대로이므로 고친 목록을 남겨 되돌릴 수 있게 한다

**앱 — 2026-09-25 사용자 결정으로 착수. 설계는 `architecture.md` "회의록 교정"·`data-model.md` "교정 제안 저장"**

사용자 결정(2026-09-25): **교정(후처리) 단계로 간다.** 용어 사전을 인식 단계(whisper `--prompt --carry-initial-prompt`)에 넣는
안은 채택하지 않는다 — 사용자가 실제 회의를 돌려 봤을 때 인식 자체의 오인식이 두드러지지 않아 파이프라인을 바꿀 이유가 없었고,
남는 오인식(카볼·대포처럼 다른 소리로 들은 말)은 어차피 교정 단계가 맡아야 한다. 인식 단계 안은 뒤의 후속 후보로만 남긴다.
~~이 결정으로 **회의별 용어의 입력 위치는 상세 화면의 교정 패널**이 된다~~ → 같은 날 두 번째 결정으로 **회의별 용어 층을 폐기**했다. 근거는 전역 용어 사전뿐이다.
- [x] ~~**용어 사전은 전역 + 회의별 두 층** (2026-09-24 사용자 결정)~~ → **전역 한 층** (2026-09-25 사용자 결정, 회의별 층 폐기).
      앱에 고정 목록을 넣지 않는다 — 회의마다 용어가 달라 고정 목록은 모든 회의를 한 분야로 끌고 간다 (`docs/phase5-results.md`)
- [x] **전역 용어는 설정의 팀 소개로 LLM이 초안을 만들고 사용자가 고쳐 저장한다** (2026-09-24 사용자 결정).
      완전 자동은 폐기 — 모델 초안에 일반어·틀린 읽기가 섞여 그대로 쓰면 오탐이 늘어난다 (`docs/phase5-refine-results.md` "팀 소개로 용어 초안 만들기").
      설계: `data-model.md` settings `glossary.*`, `architecture.md` "용어 사전 (Phase 5-4)"
- [x] 계약: `GlossarySettings` 타입, settings 키 `glossary.team`·`glossary.terms`, IPC `glossary:get`·`glossary:update`·`glossary:draft`, 큐 `kind: 'glossary'`
- [x] 순수 로직 `src/shared/glossary.ts`(초안 프롬프트·GBNF 문법·출력 파싱·약어 읽기·병합·검증) + vitest
- [x] main: `src/main/glossary/draft.ts`(llama-cli 실행), `db/settings.ts` 읽기·쓰기, 핸들러
- [x] renderer: 설정 "용어 사전" 카테고리(`setting/GlossarySection`) — 팀 소개 입력, 초안 만들기, 용어 목록 편집·저장
- [x] 검수한 읽기 사전 `@meeting-stt/core/termReadings`로 초안의 단어 읽기 덮어쓰기 (2026-09-24, `architecture.md` "용어 사전")
- [ ] **`pnpm dev`로 실제 앱에서 확인** — 팀 소개 입력 → 초안 → 편집 → 저장 → 재시작 후 유지
- [x] ~~회의별 용어 층 — 상세 화면 교정 패널의 입력칸, `meetings.glossary_terms`에 저장~~ → 마이그레이션 4에서 컬럼 삭제 (2026-09-25)
- [x] 결과 저장 스키마 `meetings.refine_applied`·`refined_at`(마이그레이션 4), IPC `refine:run`(수동 재실행, 큐 예약) + `refine:progress`(push), 큐 `kind: 'refine'`.
      `refine:resolve`·`refine:discard`는 제거 (2026-09-25)
- [x] 파이프라인 잡이 `done` 뒤 `scheduleAutoRefine` — 전역 용어가 있고 LLM이 준비됐을 때만 교정 잡을 이어 넣는다 (2026-09-25)
- [x] 순수 로직: 쌍 적용(`applyRefinePairs`)·쌍 묶기(`groupRefinePairs`)·결과 읽기(`readRefinePairs`) + vitest (2026-09-25)
- [x] main `src/main/refine/run.ts` — `createLlmClient()`로 읽기·판정을 돌린다. 외부 공급자는 GBNF 대신 형식 지시문 (2026-09-25)
- [x] renderer: `api/refine`, `useRefine`·`useGlossary` 훅, `features/refine/RefinePanel`(고친 쌍 목록·진행률·"다시 교정") + 통합 테스트.
      `TranscriptSection`이 레일에 배치하고 `useMeeting`이 결과를 상세와 함께 든다 (2026-09-25)
- [ ] `pnpm dev`로 실제 앱에서 확인 — 전역 용어 저장 → 녹음·처리 → 자동 교정 진행률 → 본문 반영·고친 목록 → 재시작 후 유지 → "다시 교정"
**문장 교정 — 2026-09-28 사용자 요청.** 용어 사전 밖의 오인식까지 문장 뜻을 보고 고친다. 측정 결과 외부 공급자만 해낸다
(`docs/phase5-refine-results.md` "문장 교정"). 설계는 `architecture.md` "회의록 교정 > 문장 교정", 저장은 `data-model.md` "자동 교정 결과 저장".

- [x] 검증 스크립트 `scripts/sentenceRefine.ts` — 로컬·Claude CLI × line·pair, 10분·71분 회의록 (2026-09-28)
- [x] 계약 변경: 마이그레이션 5(`utterances.original_text`), `Utterance.originalText`, `RefineStage`에 `'sentence'`, IPC `utterances:revertRefine`, 설정 `refine.autoExternal`(`isAutoRefineExternal`, 기본 꺼짐) (2026-09-28)
- [x] 순수 로직 `src/shared/sentenceRefine.ts` — 조각 나누기·프롬프트·출력 파싱·어절 LCS·발음 가드(영문 읽기 포함) + vitest (2026-09-28)
- [x] main: 공급자별 분기(`runSentenceRefine`), 자동 실행 조건(외부 공급자는 용어 없이도), 교정 반영 시 `original_text` 보관, 되돌리기 트랜잭션 (2026-09-28)
- [x] renderer: 발화 행 "교정됨" 표시·원문 펼치기·되돌리기, 레일 문구(로컬 안내·문장 교정 단계), 설정 LLM 섹션의 자동 교정 스위치(`features/refine/AutoRefineToggle`) + 통합 테스트 (2026-09-28)
- [ ] `pnpm dev`로 실제 앱에서 확인 — 외부 공급자로 녹음·처리 → 문장 교정 반영 → 원문 보기·되돌리기 → 재시작 후 유지
- [ ] 후속 후보: 자동 반영의 오탐을 줄이기 위한 유사도 하한 상향 또는 판정 2회 교차
- [ ] 후속 후보: Whisper 토큰 확률을 후보 가중치로(스키마 변경 필요)
- [ ] 후속 후보: 용어 사전을 인식 단계에도 쓰기 (`--prompt --carry-initial-prompt`). 측정상 효과가 크다(`docs/phase5-refine-results.md`)
      — 채택하면 회의별 용어를 파이프라인 전에 받아야 하므로 녹음 정지 화면 입력·`buildWhisperArgs`·큐 잡 payload가 바뀐다. 2026-09-25에는 보류

## UI 리디자인 (2026-09-24, Phase 번호 밖)

사용자 요청으로 Design 캔버스에서 시안("여백")을 확정하고 문서를 먼저 고쳤다 (`architecture.md` "화면 디자인", `data-model.md` "회의록 검색").
사용자 결정: 한글 글꼴 **Pretendard**, **다크 모드 보류**, **회의록 검색 포함**.
커밋은 단계마다 나눈다. 설정 화면은 다른 작업(용어 사전)이 끝나 커밋된 뒤에 손댄다.

- [x] 토큰: `base.css` 값 교체·추가, 다크 블록 제거, `color-scheme: light` (2026-09-24)
- [x] 글꼴: Google Sans·Pretendard·Google Sans Code 원본 파일과 `OFL.txt` 동봉, `fonts.css` (2026-09-24)
- [x] 메인 창: 1280×800 / 최소 1040×640, `titleBarStyle: 'hiddenInset'`, drag 영역 (2026-09-24)
- [x] primitives: `Button` 변형(강조·주요·보조·위험), `Badge`, `Switch`, `Stepper` + 통합 테스트 (2026-09-24, 계약은 `architecture.md` "공통 컴포넌트". 설정의 `Switch`·녹음/위젯의 `Stepper` 적용은 각 화면 항목에서)
- [x] 계약: `meetings:search`·`meetings:changed` 채널, `SearchMeetingsRequest`/`SearchMeetingsResponse`, LIKE 이스케이프 순수 함수 + vitest (2026-09-24)
- [x] main: 검색 쿼리, 목록 변경 지점(녹음 시작·정지·제목 변경·삭제·파이프라인 처리 시작/done/error)에서 `meetings:changed` push (2026-09-24)
- [x] 레이아웃: `AppShellLayout` + `meeting/MeetingSidebarSection`(새 녹음·검색·날짜 묶음 목록·설정 링크), `MeetingListSection` 제거, 홈 빈 상태 (2026-09-24)
- [x] 상세: 두 칸(회의록 + 레일), `TranscriptSection`의 `aside` 슬롯, 화자 목록 레일로 이동 (2026-09-24)
- [x] 상세: 레일 폭 드래그 조절(핸들·키보드·더블클릭 초기화, `localStorage` 저장) (2026-09-24)
- [x] 녹음·위젯: 타이머·파형 레벨 미터(`LevelWaveform`, 녹음 화면만 — 위젯 파형은 2026-09-24 제거)·스테퍼·정지 버튼, 위젯 창 300×304 (2026-09-24)
- [x] 설정·온보딩: 행 레이아웃, `Switch`, 온보딩 두 칸 (2026-09-24)
- [x] 녹음 화면 재배치: 헤더 + 두 칸(보기 카드·제어 / 옵션 패널 "파일로 만들기"·"녹음 설정" 순), 페이지 스크롤 없음, 상태 전환 시 레이아웃 시프트 없음(숨김 대신 비활성, 문구 자리 높이 고정) (2026-09-26, `architecture.md` "화면별 구성" > 녹음)
- [x] `pnpm test` / `pnpm typecheck` / `pnpm lint` / `pnpm build` 통과 (2026-09-24)
- [ ] `pnpm dev` 실제 확인 — 창 끌기, 검색(한글 2글자·영문 대소문자·`%` 포함 질의), 제목 변경·삭제 후 사이드바 갱신, 녹음 중 사이드바 표시
- [x] 디자인 패키지: 토큰·글꼴을 `packages/design`으로 올리고 두 앱이 import, 브라우저 프로토타입에 공통 컴포넌트(계약 동일) 이식 (2026-09-24)
- [ ] 후속: 검색 결과에서 해당 발화로 스크롤
- [x] 후속: 다크 모드 — `base.css` 다크 블록(시스템 설정 연동), 스위치 손잡이·비활성 글자·성공 바탕 토큰 추가, 하드코딩 색 제거 (2026-09-28, `architecture.md` "다크 모드")
- [x] 테마 설정: `AppSettings.theme`(`system`·`light`·`dark`, 기본 `system`), `ui.theme` 읽기·검증, main `nativeTheme.themeSource` 적용(시작 시·변경 시), 설정 "화면" 카테고리 (2026-09-28)
- [ ] 다크 모드 `pnpm dev` 실제 확인 — 메인 창·위젯 패널(vibrancy)·설정·온보딩을 시스템 다크/라이트 전환하며 확인

## knot 리디자인 (2026-09-28, Phase 번호 밖)

사용자 요청: Figma `knot` 파일 "UI/UX Policy Guidelines" 페이지를 기반으로 앱 디자인을 다시 한다.
사용자 결정: **비주얼 + 레이아웃**(팔레트·글꼴·카드·버튼 + 상단 GNB·하단 독·카드 홈·회의록 목록), **다크 모드 제거**.
설계는 `architecture.md` "화면 디자인 (knot 리디자인)"·"메인 창 레이아웃". 위 "UI 리디자인" 절의 팔레트·사이드바·다크 모드 항목을 대체한다.

- [x] 문서: SKILL.md 결정 표, `architecture.md` 토큰·다크 모드 없음·공통 컴포넌트·레이아웃·화면별 구성·라우트, `data-model.md` `ui.theme` 제거, `project-structure.md` `navigation` 도메인 (2026-09-28)
- [x] 토큰: `base.css` knot 값, 다크 블록 제거, 그림자·반경·글자 크기 추가, `--font-sans` Pretendard 우선 (2026-09-28)
- [x] 다크 모드 제거: `AppSettings.theme`·`src/shared/theme.ts`·`src/main/theme.ts`·`ThemeSelect`·설정 "화면" 카테고리·사전 문구, main `nativeTheme.themeSource = 'light'` 고정 (2026-09-28)
- [x] primitives: `Button`(`accent` 제거, 크기 knot 값), `Badge`, `Switch` 색, `Card`·`PageColumn` 추가, `TopBar` 제거 — 두 앱 계약 동일하게 (2026-09-28)
- [x] 셸: `navigation/GnbSection`, `recording/DockSection`, 회의 목록 패널(여닫기·본문 밀어내기·`localStorage`) (2026-09-28)
- [x] 홈 카드 2×2, `/meetings` 회의록 목록 화면 (2026-09-28)
- [x] 녹음·상세·설정·온보딩·위젯: 상단 바 제거, knot 모양 반영 (2026-09-28)
- [x] `pnpm test` / `pnpm typecheck` / `pnpm lint` / electron-vite build (2026-09-28)
- [x] 화면 확인 (스크린샷 드라이버) — 홈·목록·상세·녹음·설정·목록 패널, 1280×800·최소 1040×640 (2026-09-28)
- [ ] `pnpm dev` 실제 확인 — 녹음 중 독(시간 칩·정지)·홈 진행 중 카드, 위젯 패널이 macOS 다크에서도 라이트로 그려지는지

## LLM 공급자 선택 (2026-09-24, Phase 번호 밖)

사용자 요청: LLM을 쓰는 곳(요약·용어 초안)에서 사용자가 구독 중인 Claude를 **API 키(토큰)** 또는 **Claude Code CLI 서브프로세스**로 쓸 수 있게 한다.
같은 날 두 번째 요청으로 **OpenAI API 키(GPT-6 계열, 모델 선택)** 를 추가했다.
설계는 `architecture.md` "LLM 공급자", 설정 키는 `data-model.md`, 함정은 `pitfalls.md` "LLM 공급자" 절. 문서를 먼저 확정했다.

- [x] 계약: `LlmProvider`·`LlmStatus` 타입, settings 키 `llm.provider`·`llm.claudeApiKey`, IPC `llm:status`·`llm:setProvider`·`llm:setClaudeApiKey`·`llm:check`
- [x] OpenAI 추가 (2026-09-24): `openai-api` 공급자, 회사별 키(`LlmApiVendor`, `llm.openaiApiKey`), GPT 모델 선택(`llm.openaiModel`),
      IPC `llm:setClaudeApiKey` → `llm:setApiKey`(회사 지정)로 일반화 + `llm:setOpenaiModel`, `src/main/llm/openaiApi.ts`(`openai` SDK Responses API),
      `LlmSection`에 라디오·키 입력·모델 선택, 테스트 갱신
- [x] 순수 로직 `src/shared/llm.ts` — 공급자 유니온·라벨·준비 판정·CLI 인자·CLI JSON 파싱·Claude 청크 예산 + vitest
- [x] main `src/main/llm/*` — 공급자 추상화, llama 이관, Anthropic SDK(`@anthropic-ai/sdk`), `claude -p` spawn(stdin·PATH 탐색), safeStorage 키 저장, 연결 확인
- [x] `summary/run.ts`·`glossary/draft.ts`가 `createLlmClient()`만 부르도록 정리. 청크 예산은 공급자 값
- [x] renderer: `api/llm` 래퍼, `hooks/domain/llm/useLlmStatus`, `setting/LlmSection`(라디오·키 입력·CLI 상태·연결 확인) + 통합 테스트, 설정 페이지 배치
- [x] `meeting/SummarySection`이 공급자별 준비 여부·문구·캡션을 보이도록 수정 + 테스트 갱신
- [x] 설정 구조 정리 (2026-09-24 사용자 요청) — 카테고리 이름 "언어 모델" → "요약 · 용어 초안", 요약 모델 다운로드 행을 "모델" 카테고리에서
      이 카테고리의 로컬 옵션 아래로 옮기고(`localModelSlot`) 제목을 "로컬 요약 모델 파일"로. "모델" 카테고리는 "음성 인식 모델"만 남는다
- [ ] `pnpm dev` 실제 확인 — 공급자 전환 후 요약, API 키 저장(Anthropic·OpenAI 각각) → 재시작 후 유지, CLI 미설치·미로그인 안내, 연결 확인 성공/실패 문구, GPT 모델 바꾼 뒤 요약
- [x] 교정 O/X 판정(Phase 5-4)도 같은 추상화로 붙이기 (2026-09-25, `src/main/refine/run.ts`)
- [ ] 후속: `GlossarySection` 안내 문구를 공급자 라벨로, CLI 모델·Claude API 모델 선택 옵션, Codex CLI(구독) 공급자

## 녹음본 재생·내보내기·다시 인식 (2026-09-25, Phase 번호 밖)

사용자 요청으로 "녹음본 재생은 요구사항 아님" 결정을 뒤집었다. 설계는 `architecture.md` "녹음본 재생·내보내기·다시 인식", 저장 규칙은 `data-model.md` "다시 인식". 문서를 먼저 고쳤다.

- [x] 계약: `Meeting.hasAudio`, IPC `meetings:reprocess`·`meetings:exportAudio`와 요청/응답 타입
- [x] main: `meeting-audio://` 프로토콜(Range → 206), 내보내기(저장 대화상자 + 복사), 다시 인식 요청(검증·상태·큐), 성공 저장 트랜잭션(화자 초기화·교정 결과 비움)
- [x] renderer: CSP `media-src`, `api/meetings` 래퍼, `useMeeting`의 `reprocessMeeting`, 레일 "녹음" 패널(플레이어·저장·다시 인식 확인), 발화 시각 클릭 시 이동, 실패 회의 "다시 시도"
- [x] 테스트: 파일명 정리·Range 해석 순수 함수 vitest, 녹음 패널·다시 시도 통합 테스트
- [x] `pnpm test` / `pnpm typecheck` / `pnpm lint` / `pnpm build` 통과 (2026-09-25)
- [ ] `pnpm dev` 실제 확인 — 보관 켠 뒤 녹음 → 재생·시킹·발화 시각 클릭, WAV 저장·취소, 참석자 수 바꿔 다시 인식, 실패 회의 다시 시도
- [ ] 후속: 재생 중인 발화 강조

## 마이크 입력 장치·테스트 (2026-09-25, Phase 번호 밖)

사용자 요청으로 설정 화면에 입력 장치 선택과 마이크 테스트를 둔다. 설계는 `architecture.md` "마이크 입력 장치와 테스트", 저장 규칙은 `data-model.md`의 `audio.inputDevice`. 문서를 먼저 고쳤다.

- [x] 계약: `AudioInputDevice`·`AppSettings.inputDevice`(기본 `null`), `audio.inputDevice` 읽기·검증 (`db/settings.ts`, `ipc/handlers.ts`), `updateSettingsApi` 필드 추가
- [x] main: `setPermissionCheckHandler`에서 `media` 허용 (장치 라벨 노출)
- [x] renderer: `utils/microphone` 유틸(+vitest) — 녹음·테스트가 같은 제약을 쓴다, `useRecorder`가 시작 시 설정의 장치를 `ideal`로 요청
- [x] renderer: `useInputDevices`(목록·라벨·`devicechange`)·`useMicrophoneTest`(AnalyserNode RMS·무음 안내) 훅, 설정 카테고리 "마이크"(입력 장치 select, 테스트 버튼 + 파형)
- [x] 테스트: `SettingsSection` 통합 테스트(장치 선택 저장, 연결되지 않은 장치 표기, 테스트 시작·정지·녹음 중 차단), 위젯 테스트에 설정 mock 추가
- [x] `pnpm test`(531개) / `pnpm typecheck` / `pnpm lint`(이 작업 파일 기준) / `pnpm build` 통과 (2026-09-25)
- [ ] `pnpm dev` 실제 확인 — 외장 마이크를 고르고 녹음해 그 장치로 녹음되는지, 장치를 뺀 뒤 녹음이 기본 마이크로 폴백하는지, 테스트 파형이 움직이는지, 음소거 시 무음 안내

## UI 언어 설정 (2026-09-25, Phase 번호 밖)

사용자 요청으로 설정에 UI 언어(한국어 기본 / 영어)를 둔다. 설계는 `architecture.md` "UI 언어", 저장 규칙은 `data-model.md`의 `ui.locale`. 문서를 먼저 고쳤다.
인식·요약 언어는 바뀌지 않는다 — 화면·메뉴바·오류 문구만 바꾼다.
이름 없는 화자의 기본 표시("화자 N"·"화자 미상")는 `@meeting-stt/core/format`의 `resolveSpeakerNames`가 `defaultNames`를 선택 인자로 받아 앱이 UI 언어의 이름을 넘긴다 (넘기지 않으면 한국어 — `apps/web`은 그대로).
남긴 한국어: 운영 로그, LLM 프롬프트, 내보내기 파일명 폴백(`회의 녹음`), `NSMicrophoneUsageDescription`, `apps/web`.

- [x] 계약: `Locale`·`AppSettings.locale`(기본 `'ko'`), `ui.locale` 읽기·검증 (`db/settings.ts`, `ipc/handlers.ts`), `updateSettingsApi` 필드 추가, push 채널 `settings:changed`
- [x] 사전: `src/shared/i18n.ts` + `src/shared/locales/<domain>.ts` (`ko`·`en` 나란히, `en`은 `typeof ko`)
- [x] renderer: `shared/provider/context/localeContext`(`LocaleProvider`·`useLocale`), 컴포넌트·훅·api 래퍼·포맷터의 문구를 사전으로 이동, `<html lang>` 동기화
- [x] main: `src/main/locale.ts`의 `t()`, 메뉴바 메뉴·저장 대화상자·핸들러 오류 문구 이동, 언어 변경 시 `refreshTray` + `settings:changed` push
- [x] 설정 화면 "언어" 카테고리 (select, 즉시 반영) — `SettingsSection/ui/LocaleSelect`
- [x] 테스트: 기존 통합 테스트는 기본값(한국어)으로 그대로 통과, `localeContext`에 영어 전환 테스트, `src/shared/i18n.test.ts`가 ko·en 키 집합 일치와 영어에 한글 미포함(용어 사전 예시 제외)을 검사
- [x] `pnpm test` / `pnpm typecheck` / `pnpm lint` / `pnpm build` 통과 (2026-09-25)
- [ ] `pnpm dev` 실제 확인 — 영어로 바꾸면 메인 창·위젯 창·메뉴바가 즉시 바뀌는지, 재시작 후 유지되는지

## 화자 재군집 (2026-09-25, Phase 번호 밖)

사용자 결정으로 화자 분리 개선안(`docs/diarization-clustering-results.md` 8절의 **안 A**)을 적용한다. 설계는 `architecture.md` "화자 재군집", 결정 표는 `SKILL.md` 1절 화자 분리 행. 문서를 먼저 고쳤다.
CLI 라벨을 버리고 결과 구간을 5초 조각으로 재임베딩(`sherpa-onnx-node`) → k-means(K = 참석자 수, 모르면 12) + 중심 병합 0.75로 다시 군집한다. 바이너리·모델·온보딩은 그대로다.

- [x] `packages/core/src/cluster.ts`: 조각 분할·L2 정규화·k-means(k-means++, 고정 시드, 10회 재시작)·중심 병합·라벨 재배정 + vitest 17개
- [x] `sherpa-onnx-node` 1.13.8 의존성 추가(`apps/desktop` dependencies), 타입 선언 `src/main/types/sherpaOnnxNode.d.ts`, `electron-builder.yml` `asarUnpack`
- [x] main: `pipeline/speakerEmbedding.ts`(동기 임베딩, 스크립트 공용) · `pipeline/embedWorker.ts`(utilityProcess 진입) · `pipeline/embed.ts`(fork·메시지) · `pipeline/recluster.ts`(흐름·폴백) · `run.ts` 연결(`diarize` 0~90% / 90~100%)
      — 실제 Electron `utilityProcess`에서 빌드된 워커로 임베딩이 나오는 것을 확인했다. Electron은 N-API 외부 버퍼를 금지하므로 `enableExternalBuffer=false`가 필수다 (`pitfalls.md`)
- [x] `diarize.ts`: 참석자 수가 없으면 `num-clusters=12` (임계값은 명시했을 때만), 테스트 갱신
- [x] 스크립트: `scripts/recluster.ts`(CLI 구간 + WAV → 재군집 구간 파일, 임베딩 캐시) · `scripts/pipeline.ts`에 재군집 반영(`--no-recluster`로 CLI 군집 비교)
- [x] 검증(`diarBench.ts`, 3스레드 + nice, `docs/diarization-clustering-results.md` 11절): jun-meeting K=7 **92.7%**(기준선 83.4%), K 없음(`num-clusters=12` 구간 + K=12) **92.9%**(기준선 63.8%), Python 실험과 ±0.5%p.
      K=6에서 병합 0.7은 실제 화자를 합쳐 87.0% → **0.75 확정**. geumtoro는 K=3·4로는 안정, 참석자 수 없이는 10명 (정답본 없음)
- [x] `pnpm test`(565개) / `pnpm typecheck` / `pnpm lint` / `electron-vite build` 통과 (2026-09-25)
- [x] 패키징(`build:unpack`)에서 `sherpa-onnx-darwin-arm64`(애드온·dylib)가 `app.asar.unpacked/node_modules/`로 풀리고 워커 `out/main/embedWorker-*.js`가 asar에 들어가는 것을 확인 (2026-09-25)
- [ ] `pnpm dev` 실제 확인 — 참석자 수를 넣고/빼고 녹음해 회의록 화자 수, 진행률이 90%에서 잠깐 머물다 끝나는지, 로그에 재군집 결과(조각 수·클러스터 수·시간)
- [ ] 후속: 발표형 원거리 녹음의 참석자 수 없음 경로(발표자가 여러 클러스터로 남음) 개선, 병합 임계값 0.75를 2~3명 짧은 회의로 재확인, 웹 프로토타입도 `@meeting-stt/core/cluster`로 통일

## 녹음 파일 가져오기 (2026-09-25, Phase 번호 밖)

사용자 요청으로 앱 밖에서 녹음한 파일로도 회의록을 만든다. 설계는 `architecture.md` "녹음 파일 가져오기", 결정 표는 `SKILL.md` 1절 녹음 행. 문서를 먼저 고쳤다.
스키마 변경은 없다.

- [x] main: `src/main/audio/importRecording.ts` — 열기 대화상자 → `afconvert` 변환 → 길이 확인 → 회의 행 + 파이프라인 잡
- [x] IPC `meetings:import` + preload + renderer `importMeetingAudioApi`
- [x] 녹음 화면 "녹음 파일 가져오기" 버튼(`features/meeting/ImportAudioButton`)(대기 중일 때만), 성공 시 상세로 이동, 실패 문구
- [x] 사전(`ko`·`en`) 문구, 테스트 — `importSource.test.ts`(헤더·제목), `RecorderSection/test.tsx`(이동·취소·실패·녹음 중 숨김)
- [x] `pnpm test` / `pnpm typecheck` / `pnpm lint` / `pnpm build` 통과, 스테레오 AAC m4a를 `afconvert`로 바꾼 WAV가 `scripts/pipeline.ts`(정규화·whisper·재군집)를 통과 (2026-09-25)
- [ ] `pnpm dev` 실제 확인 — m4a·mp3·mp4를 가져와 회의록이 만들어지는지

## 라이브 받아쓰기 (2026-09-26, Phase 번호 밖)

사용자 요청으로 녹음 화면의 파형 영역을 라이브 받아쓰기 보기로 바꿀 수 있게 한다. 설계는 `architecture.md` "라이브 받아쓰기", 결정 표는 `SKILL.md` 1절.
"실시간 스트리밍 STT 금지"(4절 범위 절제)의 사용자 결정 예외이고, 문서를 먼저 고쳤다. 스키마 변경·새 모델은 없다.

- [x] main: `src/main/audio/liveWindow.ts`(구간 나누기, 순수) + `liveTranscript.ts`(whisper-cli 실행), 세션 청크·시작·정지에 연결
- [x] IPC `recording:setLiveTranscript` + `RecordingStateEvent.liveTranscript` + preload + renderer `setLiveTranscriptApi`
- [x] `RecorderSection` 보기 전환(파형 / 라이브 받아쓰기)과 라이브 보기, 사전(`ko`·`en`) 문구
- [x] 테스트 — `liveWindow.test.ts`, `RecorderSection/test.tsx`(전환·표시)
- [x] `pnpm test` / `pnpm typecheck` / `pnpm lint` / `pnpm build` 통과, 실제 회의 녹음(jun-meeting)을 0.5초 청크로 실시간 속도로 흘려 `liveWindow` + whisper-cli(turbo)를 돌린 결과 갱신 간격 1.1~1.6초, 12초마다 확정 (2026-09-26)
- [x] 라이브 모델을 turbo로 고정 (2026-09-26 사용자 결정) — `LIVE_WHISPER_MODEL_ID`, `liveWhisperModelPath()`, 저사양 선택·turbo 파일 없음 폴백
- [ ] `pnpm dev` 실제 확인 — 녹음 중 말하면 1~2초 안에 글자가 나타나는지

## 레벨 미터를 이퀄라이저형으로 (2026-09-26, Phase 번호 밖)

이력형 파형(0.5초마다 왼쪽부터 칸을 채움)이 24초 동안 차오르는 모양이라 진행 바로 읽힌다는 사용자 지적. 현재 음량에 모든 막대가 함께 반응하는 이퀄라이저형으로 바꾼다. 계약은 `architecture.md` "공통 컴포넌트"의 `LevelWaveform`.

- [x] `LevelWaveform` props `levels[]` → `level`, 종 모양 포락선 + 막대별 CSS `transform` 흔들림, `prefers-reduced-motion` 대응 (데스크탑·웹 두 구현)
- [x] `useRecordingState`·`useMicrophoneTest`에서 레벨 이력(`levels`, 48개) 제거 — 더 쓰는 곳이 없다
- [ ] `pnpm dev` 실제 확인 — 말하면 막대가 함께 튀고 조용하면 점으로 가라앉는지, 팬·CPU 변화 없는지
