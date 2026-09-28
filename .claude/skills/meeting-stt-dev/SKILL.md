---
name: meeting-stt-dev
description: 로컬 STT 회의록 데스크탑 앱(meeting-stt)의 개발 방향성·아키텍처 결정·단계별 로드맵·코딩 규칙. 이 프로젝트에서 기능 구현, 구조 설계, "다음 단계", 파이프라인(녹음→Whisper→화자분리→병합→SQLite), UI(홈/녹음/디테일), 모델 배포, 빌드/서명 관련 작업을 할 때 반드시 먼저 로드한다. 근거 문서는 plan.md.
---

# meeting-stt 개발 방향성

클로바 노트/젠스파크 회의록과 유사한 기능을 **서버 없이** 데스크탑 앱 하나로 구현한다.
근거 문서는 `plan.md`(2026-08 기준 조사 자료). 이 스킬은 그 문서에서 **결정된 사항**과
**작업 규칙**만 추려낸 것이며, 배경 설명이 필요하면 plan.md의 해당 섹션을 읽는다.

> **브랜치 주의 (`test/usage-analytics`, 2026-09-28)**: 이 브랜치는 `main`과 방향이 다른 **사용 정보 수집 실험**이다.
> 사용 이벤트·성능·오류·환경에 더해 **회의 내용(발화·요약·녹음)까지 자체 수집 서버로 보내므로, 이 범위에서는 "서버 없이"가 뒤집힌다.**
> 추론 파이프라인은 여전히 로컬이다. 결정과 설계는 `references/telemetry.md`와 1절 "사용 정보 수집" 행에 있다. `main`에 병합하지 않는다.

## 0. 문서 우선 원칙 (SSOT)

**이 스킬 문서(SKILL.md + `references/*.md`)가 프로젝트의 단일 진실 공급원(SSOT)이고, 코드는 그 부산물이다.**
코드와 문서가 다르면 문서가 옳다고 보고 코드를 문서에 맞춘다. 문서를 고쳐야 할 이유가 생겼다면 **코드보다 문서를 먼저 고친다.**

- 기술 결정(1절)·파이프라인(2절)·로드맵(3절)·구조 규칙(4절)과 어긋나는 구현·리팩터링·라이브러리 추가·모델 변경은
  **문서를 먼저 수정하고 사용자에게 변경 내용을 알린 뒤** 코드를 작성한다. "일단 코드 먼저, 문서는 나중에"는 금지.
- 작업 중 문서에 없는 결정을 내려야 하면(예: 새 IPC 채널 규약, 스키마 컬럼 추가, 상수 값 선택) 코드를 쓰기 전에
  해당 `references/*.md`에 결정과 근거를 추가한다. 사소한 구현 세부는 코드에 두되, 다른 코드가 의존하게 되는 계약은 문서에 둔다.
- Phase 완료·진입 등 상태 변화는 3절의 "현재 위치"와 `references/roadmap.md` 체크리스트를 갱신해 기록한다.
- 문서에 오래된 내용(예: 마이그레이션 전 도구 이름)이 발견되면 즉시 문서를 고친다. 낡은 문서는 잘못된 SSOT다.

## 1. 확정된 기술 결정 (변경 시 사용자 확인 필수)

| 영역 | 결정 | 비고 |
| --- | --- | --- |
| 대상 플랫폼 | **macOS 14+ / Apple Silicon 전용** | Windows는 지원하지 않는다 (2026-08-26 결정). 새 코드에 `win32` 분기·자산을 만들지 않는다. 이미 있는 `win32-x64` 바이너리·`build:win`·`setupBin --platform=win32-x64`는 유지·검증 대상이 아니다 |
| 데스크탑 프레임워크 | **Electron** (electron-vite + React 19 + TS) | 이미 스캐폴드됨. Tauri로 전환하지 않는다 |
| 패키지 매니저 / 스크립트 러너 | **pnpm 10** (`pnpm install`, `pnpm dev`, `pnpm test`, `pnpm --filter meeting-stt exec tsx scripts/*.ts`) | 런타임은 **Node 22+**. 단위 테스트는 **vitest**, TS 스크립트 실행은 **tsx**. bun/npm/yarn 명령을 문서·스크립트에 섞지 않는다 |
| 리포지토리 구조 | **pnpm 워크스페이스 모노레포** — `apps/desktop`(제품 Electron 앱) · `apps/web`(브라우저 프로토타입) · `packages/core`(순수 공용 로직) · `packages/models`(모델 카탈로그) · `packages/design`(디자인 토큰·글꼴) | 두 앱이 같은 파이프라인을 다른 런타임에서 돌리므로 병합·포맷·정규화 공식·참석자 수 규칙·모델 카탈로그는 `packages/*`에 **한 번만** 정의한다. 의존 방향은 `apps/* → packages/*` 한 방향이고 패키지는 electron·fs·DOM을 import하지 않는다. 워크스페이스 경계·스크립트 규약·새 패키지 추가 절차는 `references/monorepo.md` |
| STT 엔진 | **whisper.cpp** `whisper-cli` 바이너리를 `child_process`로 spawn (방식 A) | 기본 모델 `ggml-large-v3-turbo-q5_0.bin`, 고품질 옵션 `large-v3-q5_0`, 저사양 옵션 `small-q5_1`. `-l ko --output-json-full` + 토큰 타임스탬프. **`-mc 0`**(이전 창의 출력을 다음 창 문맥으로 넘기지 않음) — 긴 회의의 반복 환각 고리를 끊는다 (2026-09-25, `docs/stt-tuning-results.md`). **`-dtw`는 끔** (Phase 1에서 이득 없음, `--no-flash-attn`을 강제해 느려짐) |
| 화자 분리 | **sherpa-onnx** (pyannote segmentation-3.0 ONNX + 3D-Speaker ERes2Net 임베딩)로 **분할·구간**을 만들고, **군집은 앱이 다시 한다** (2026-09-25 결정) | `sherpa-onnx-offline-speaker-diarization` CLI spawn (v1.13.6), **CPU 프로바이더** (`coreml`은 CPU보다 훨씬 느려 사용 안 함). CLI는 `--clustering.num-clusters=<참석자 수, 모르면 12>`로 돌리되 **그 라벨은 버린다** — sherpa-onnx 내장 군집(complete-linkage)은 튀는 임베딩 하나가 클러스터 하나를 차지해 실제 화자 둘을 합치고(7명 회의에서 한 명이 통째로 사라짐, 83.4%), 임계값 방식은 클러스터 수가 녹음 길이에 비례해 늘어난다(63.8%, 32명). 대신 CLI 결과 구간을 **5초 이하 조각으로 잘라 `sherpa-onnx-node`(같은 ERes2Net 모델)로 다시 임베딩**하고, `@meeting-stt/core/cluster`의 **k-means(K = 참석자 수, 모르면 12) + 중심 코사인 0.75 이상 클러스터 병합**으로 라벨을 새로 붙인다 → 같은 회의에서 **92.7% / 7명**, 참석자 수를 몰라도 **92.9%**(여분 화자 2명은 UI에서 병합) (`docs/diarization-clustering-results.md` 11절). 발표형 원거리 녹음은 참석자 수 없이는 여전히 과분할(10명)되므로 참석자 수 입력을 계속 권장한다. 참석자 수 입력(녹음 정지 시, `meetings.speaker_count`)은 여전히 권장하고, 없을 때만 군소 화자 흡수(10초 미만, `assignSpeakers`)를 적용한다. 임베딩은 main을 막지 않도록 `utilityProcess`에서 돌리고, 재군집이 실패하면 CLI 라벨로 폴백해 경고 로그를 남긴다. 설계는 `references/architecture.md` "화자 재군집" 절 |
| 가속 · 스레드 | whisper.cpp·llama.cpp는 **Metal GPU**(전 레이어 offload), sherpa-onnx는 CPU. spawn에 넘기는 스레드 수는 **성능 코어(P) 수 기준**으로 프로세스마다 따로 정한다 | `os.cpus().length - 2`처럼 효율 코어까지 세면 **더 느려지면서 발열만 는다** (M3 Pro 실측: 화자 분리 `-t 10` 18.2초·CPU 915% → `-t 6` 10.8초·CPU 593%). **설정 '조용히 처리'(`pipeline.quiet`, 기본 꺼짐)** 를 켜면 화자 분리 스레드를 성능 코어의 절반으로 줄이고 STT와 순차로 돌린다 (화자 분리 +44%, CPU 부하 절반). 화자 분리를 CoreML로 옮기지 않는 이유(임베딩 입력 길이가 호출마다 달라 CPU보다 느림)도 같은 문서에 있다. 정책과 실측표는 `references/architecture.md` |
| 음량 정규화 | STT·화자 분리 **전에** WAV 전체에 **순수 TS RMS 게인 정규화** (`src/main/pipeline/normalize.ts`) | ffmpeg를 동봉하지 않는다. 50ms 프레임 RMS의 90퍼센타일을 −20 dBFS로 맞추고 게인은 최대 +30 dB, 초과 샘플은 하드 클립. 원거리 마이크 녹음(발화 −44 dBFS)에서 Whisper가 수십 초를 통째로 놓치던 것을 복구한다 (글자수 +36%, ffmpeg `loudnorm`과 동등). 화자 분리에는 효과 없음. `docs/phase1-results.md` |
| VAD | **whisper.cpp 내장 VAD** (`--vad --vad-model ggml-silero-v5.1.2.bin`) | 환각 억제뿐 아니라 **타임스탬프 정확도에도 필수**. 끄면 화자 경계 단어가 앞 화자에게 붙는다 (`docs/phase1-results.md`) |
| 녹음 | `getUserMedia` + **AudioWorklet**으로 16kHz mono Float32 PCM 직접 수집 → WAV. **앱 밖에서 녹음한 파일도 가져온다** — main이 macOS 내장 `/usr/bin/afconvert`로 16kHz mono WAV로 변환한 뒤 같은 파이프라인에 넣는다 (2026-09-25, `references/architecture.md` "녹음 파일 가져오기") | MediaRecorder/ffmpeg 경로 사용 안 함. 주기적으로 디스크에 append. **입력 장치는 설정에서 고른다**(`audio.inputDevice`, 기본 시스템 마이크, 없으면 기본으로 폴백) — 새 IPC 없이 renderer의 `enumerateDevices`로 목록을 읽고 `settings:update`로 저장. **마이크 테스트**는 설정 화면의 짧은 별도 그래프(AnalyserNode RMS)로, 녹음 그래프 소유자 규칙의 예외다 (2026-09-25, `references/architecture.md` "마이크 입력 장치와 테스트") |
| 저장소 | **SQLite** via `better-sqlite3` (main 프로세스 전용) | 스키마는 `references/data-model.md` |
| 라우팅 | **react-router v8**의 `createHashRouter` + `RouterProvider` | URL 공유가 없고 `file://`에서도 동작한다. `BrowserRouter` 금지. 경로 상수는 `@renderer/shared/routes`에서만 정의 |
| 스타일 | **CSS Modules** (`index.module.css` 코로케이션) + `@meeting-stt/design/base.css`의 CSS 변수 토큰 | UI 라이브러리·CSS-in-JS 도입 안 함 |
| 비주얼 디자인 | **knot 디자인 시스템** (2026-09-28 사용자 요청, Figma `knot` 파일 "UI/UX Policy Guidelines" 페이지) — 따뜻한 무채색 팔레트(바탕 `#FAF9F7`·흰 카드·잉크 `#1F1E1C`, 주요 버튼 차콜 `#3C3B39`, 보조 강조 청록 `#2E85A3`, 녹음 표시·오류 빨강 `#BF3B2C`), 큰 라운드 카드(24)와 옅은 그림자, **Pretendard(한글·라틴)·Google Sans Code(숫자)** 를 앱에 동봉. 레이아웃은 **사이드바 두 칸 대신 떠 있는 상단 GNB(알약 탭) + 하단 녹음 독 + 여닫는 회의 목록 패널**. 토큰·글꼴은 **`packages/design`** 에 한 번만 두고 브라우저 프로토타입도 같은 디자인 시스템을 쓴다 | 2026-09-24 "여백" 팔레트·사이드바 레이아웃을 대체한다. 글꼴은 전부 OFL이고 오프라인 앱이라 CDN을 쓰지 않는다. **다크 모드는 없다** (2026-09-28 사용자 결정 — 같은 날 넣은 다크 모드·테마 설정을 knot 시안에 다크가 없어 제거). 앱은 항상 라이트이고 main이 `nativeTheme.themeSource = 'light'`로 고정한다. knot의 계정·워크스페이스·팀원 초대·AI 탐색은 서버가 필요해 가져오지 않는다. 토큰·레이아웃은 `references/architecture.md` "화면 디자인" 절 |
| 편집 | 발화 단위 인라인 편집(contentEditable/textarea, blur 시 UPDATE) | 에디터 라이브러리 도입 금지 (필요 생기면 그때 TipTap 검토) |
| 모델 배포 | 설치 파일에 미동봉, **첫 실행 온보딩에서 다운로드** (Range 이어받기 + 체크섬) | 저장 위치 `app.getPath('userData')/models` |
| 시스템 오디오 캡처 | **Core Audio Taps(macOS 14.2+)로 스피커 출력 전체를 잡아 마이크와 섞는다** (2026-09-26 사용자 결정, Phase 5-2). 동봉 Swift 도구 `systemAudioTap`(`native/systemAudioTap/main.swift`, `setupBin`이 `swiftc`로 빌드)을 main이 spawn하고 stdout의 16kHz mono Float32 PCM을 마이크 청크와 **main에서 더해** 같은 WAV에 쓴다. 파이프라인은 손대지 않는다 | 온라인 회의(Zoom·Meet) 상대방 목소리를 앱 밖 설정 없이 전사하기 위해서다. 가상 오디오 드라이버(BlackHole)처럼 **사용자가 앱 밖에서 해야 하는 방식은 쓰지 않는다**(사용자 결정). Electron 내장 `getDisplayMedia` loopback도 쓰지 않는다 — macOS에서는 네이티브 화면 공유 피커를 매번 거쳐야 하고 "화면 및 시스템 오디오 녹음" 권한과 보라색 화면 녹화 표시가 뜬다. 켜기/끄기는 녹음 화면의 스위치(`recording:setSystemAudio`, DB 키 `audio.systemCapture`, 기본 꺼짐)이며 켜는 순간 도구를 1초 돌려 시스템 권한 창을 미리 띄운다. 설계는 `references/architecture.md` "시스템 오디오 캡처" 절 |
| 로컬 요약 | **llama.cpp `llama-cli`** 를 `child_process`로 spawn. 모델 `Qwen3-4B-Instruct-2507-Q4_K_M.gguf` (Apache-2.0, 비사고형 instruct) | `llama-server`(HTTP)는 쓰지 않는다 — 단발 요약에 상주 서버·포트 관리가 필요 없다. 프롬프트·시스템 프롬프트·출력은 **전부 파일**로 주고받고(`-f`/`-sysf`/`-o`), 회의록이 길면 map-reduce 청킹. 자동 실행이 아니라 사용자가 버튼으로 요청한다 (`references/architecture.md`) |
| LLM 공급자 | 요약·용어 초안처럼 LLM을 쓰는 곳은 **공급자 추상화(`src/main/llm/*`)** 를 거치고, 사용자가 설정에서 넷 중 하나를 고른다 — **로컬 모델(기본, llama.cpp)** / **Claude API 키**(Anthropic SDK, 토큰 요금) / **Claude Code CLI**(설치된 `claude -p`를 서브프로세스로 실행, 구독 계정 사용) / **OpenAI API 키**(OpenAI SDK Responses API, GPT-6 계열 중 모델 선택, 토큰 요금). 지원 외부 LLM은 **Claude와 GPT** (2026-09-24 Claude만 → 같은 날 GPT 추가, 사용자 결정) | "네트워크는 모델 다운로드 한 번"이라는 로컬 우선 약속의 **명시적 예외**다 — 기본은 여전히 로컬이고, 외부 공급자를 고르는 순간 회의록이 그 회사 서버(Anthropic·OpenAI)로 전송된다는 사실을 설정 화면에 적는다. 파이프라인(STT·화자 분리)은 어느 공급자를 골라도 로컬이다. 그 밖의 공급자(Gemini, Codex CLI 등)는 제안만 하고 구현하지 않는다. 설계는 `references/architecture.md` "LLM 공급자" 절 |
| 녹음본 보관·활용 | 파이프라인 완료 후 원본 WAV **삭제가 기본**, 보관은 설정 옵션(`audio.keep`, `/settings`). **원본이 남아 있는 회의는 상세 화면에서 재생(발화 시각 클릭 시 그 지점으로 이동)·WAV 내보내기·다시 인식**을 할 수 있다 (2026-09-25 사용자 요청으로 "재생은 요구사항 아님"을 뒤집음) | 실패한 잡은 재시도용으로 원본을 남기고 "다시 시도" 버튼을 둔다. 재생은 커스텀 프로토콜 `meeting-audio://`(Range 지원), 내보내기는 네이티브 저장 대화상자. 설계는 `references/architecture.md` "녹음본 재생·내보내기·다시 인식" 절 |
| 클립보드 | 복사는 main의 `electron.clipboard` 경유(`clipboard:writeText`) | `file://` 문서와 권한 핸들러에 걸릴 여지를 없앤다. 텍스트 조립은 renderer가 `@meeting-stt/core/format`으로 |
| 녹음 제어 | **보이지 않는 녹음 호스트 창**(`#/recorder`, 오디오 그래프 전용) + 메뉴바 Tray 시간 + 전역 단축키(기본 `⌥⌘R`, 설정에서 변경) | 플로팅 위젯 패널은 이 브랜치에서 사용자 요청으로 제거했다 (2026-09-28). macOS WidgetKit 위젯도 만들지 않는다. **오디오 그래프의 소유자는 호스트 창 하나**이고 메인 창은 명령 전송·상태 구독만 한다 — 메인 창을 닫아도 메뉴바·단축키로 녹음할 수 있어야 하기 때문이다. 진행 중 녹음의 단일 출처는 main의 녹음 세션이며 `recording:state`로 push한다. 설계는 `references/architecture.md`의 "녹음 호스트 창 · 메뉴바 · 전역 단축키" 절 |
| 라이브 받아쓰기 | 녹음 화면의 파형 영역을 **"라이브 받아쓰기" 보기로 바꿀 수 있다** (2026-09-26 사용자 요청). 엔진은 **새 모델 없이 기존 `whisper-cli`** 를 짧은 구간(최대 12초)마다 다시 spawn해 쓰고, 모델은 **속도 우선으로 turbo(`large-v3-turbo-q5_0`)를 고정**한다 — 회의록용으로 고품질을 골랐어도 라이브는 turbo, turbo 파일이 없거나 저사양 모델을 골랐으면 고른 모델 (2026-09-26 사용자 결정) | 4절 "범위 절제"의 "실시간 스트리밍 STT는 구현하지 않는다"에 대한 **사용자 결정 예외**다. 진짜 스트리밍 모델(sherpa-onnx 한국어 streaming zipformer)은 모델 다운로드·다중 파일 아카이브 지원이 새로 필요해 쓰지 않는다 — turbo로 8초 구간이 약 1.5초(M3 Pro, 모델 로드 0.4초 포함)라 1~2초 지연으로 충분하다. 고품질(large-v3)은 같은 구간이 3.1초·메모리 2.1GB라 라이브에 쓰지 않는다(turbo 0.9GB). **라이브 결과는 저장하지 않는다** — 회의록은 여전히 정지 후 파이프라인(정규화·VAD·화자 분리)이 만든다. 라이브 보기는 켜져 있을 때만 GPU를 쓴다. 설계는 `references/architecture.md` "라이브 받아쓰기" 절 |
| 확인 UI | 되돌릴 수 없는 동작(회의 삭제, 화자 병합)은 **2단계 인라인 확인**. `window.confirm`·네이티브 대화상자 금지 | renderer를 멈추지 않고 통합 테스트로 검증할 수 있다 |
| 사용 정보 수집 (이 브랜치 전용) | 기능 사용 이벤트·파이프라인 성능·오류·설정/환경과 **회의 내용(발화·요약·화자 이름·녹음 WAV)** 을 main이 SQLite outbox에 쌓았다가 **자체 수집 서버(`apps/collector`)** 로 보낸다. 이벤트·수치만 **외부 분석 서비스**에도 보낸다(보조 — 사용 이벤트는 **PostHog**, 오류·크래시는 **Sentry**, 2026-09-28). **앱 안 동의 UI 없음** — 사전 동의한 팀에게만 배포한다 (2026-09-28 사용자 결정) | 공개 빌드와 `appId`·업데이트 채널을 갈라 수집 빌드가 공개 배포로 새지 않게 하고, 빌드에 심은 팀 토큰으로 서버가 팀을 구분·차단한다. 회의 내용은 외부 분석 서비스로 보내지 않고, API 키는 어디에도 보내지 않는다. 녹음은 원본 삭제 전에 올린다. 이벤트 계약은 `packages/telemetry`. 설계·미결 사항은 `references/telemetry.md` |
| UI 언어 | 설정에서 **한국어(기본) / 영어**를 고른다 (`AppSettings.locale`, DB 키 `ui.locale`, 2026-09-25 사용자 요청). 사전은 `src/shared/locales/<domain>.ts`에 도메인별로 `ko`·`en`을 나란히 두고 `src/shared/i18n.ts`가 모은다. renderer는 `useLocale()`의 `t`, main은 `src/main/locale.ts`의 `t()`로 읽는다. i18n 라이브러리는 도입하지 않는다 | **UI 언어일 뿐 인식·요약 언어가 아니다** — whisper `-l ko`, 요약·용어 초안 프롬프트, 교정의 한글 읽기는 그대로 한국어다. 문서·커밋 메시지도 계속 한국어. 설계는 `references/architecture.md` "UI 언어" 절 |

## 2. 처리 파이프라인 (불변)

```
[마이크 녹음 (AudioWorklet, 16kHz mono)]
  → [WAV 확정]
  → [음량 정규화 (RMS 게인, 순수 TS)]
  → [VAD 무음 제거]
  → [whisper-cli → JSON 세그먼트(+단어 타임스탬프)]   ┐ 코어 수에 따라
  → [sherpa-onnx diarization → 화자 구간]              ┘ 병렬/순차 분기
  → [병합: 군소 화자 흡수 → 타임스탬프 겹침 최대 화자 배정 → 문장 단위 다수결 → 동일 화자 연속 발화 문단화]
  → [SQLite INSERT, status='done']
  → [(이 브랜치) 회의 스냅샷·녹음 WAV 업로드 대기열 등록 → 업로드 성공 후]
  → [(설정) 원본 WAV 삭제]
  → [홈 리스트 / 디테일 페이지: 조회·인라인 수정·화자 이름 지정·복사]
```

무거운 작업(spawn, 파일 IO, DB)은 전부 **main 프로세스(또는 utilityProcess)** 에서 수행하고,
renderer는 IPC로 요청·진행률 수신만 한다. 렌더러 내 추론(transformers.js/WebGPU)은 하지 않는다.
사용 정보 수집(이 브랜치)도 main에서만 하며, 전송이 실패해도 파이프라인·녹음은 실패하지 않는다 (`references/telemetry.md`).

## 3. 단계별 로드맵 — 순서를 건너뛰지 않는다

상세 체크리스트(완료 기준 포함)는 `references/roadmap.md`.

1. **Phase 1 파이프라인 검증 (스크립트)** — 앱 UI를 만들기 **전에** `apps/desktop/scripts/`에서 tsx로
   `whisper-cli → sherpa-onnx → 병합`을 실제 한국어 회의 WAV로 돌려 품질·속도를 확인하고
   모델 크기/양자화/`cluster_threshold`를 튜닝한다. 여기서 만든 병합 로직은 이후 `src/main/pipeline/`으로 그대로 옮긴다.
2. **Phase 2 앱 골격** — 녹음 → WAV → 파이프라인 → SQLite → 홈/디테일 관통.
3. **Phase 3 편집·복사·화자 관리** — 인라인 편집, 화자 이름, 전체/부분 복사, 진행률.
4. **Phase 4 배포 품질** — 온보딩 모델 다운로드, 코드 사이닝/notarization, electron-updater, 저사양 폴백.
5. **Phase 5 확장** — 로컬 LLM 요약(llama.cpp), 시스템 오디오 캡처.

현재 위치: **Phase 1~4 종료, Phase 5-1(로컬 요약) 종료** (2026-09-18).
Phase 2·3·4와 5-1의 완료 기준이 2026-09-18 사용자 수동 확인을 모두 통과했다.
진행 중인 작업은 **Phase 5-3(녹음 위젯 패널)** 이다 — 사용자 요청으로 5-2보다 먼저 착수했고, 5-1처럼 순서를 건너뛴 예외다.
그 뒤 작업 후보는 **Phase 5-2(시스템 오디오 캡처)** 와 미착수로 남은 배포·품질 항목(다음 릴리스의 업데이트용 zip, 회의별 용어 사전, 저사양 요약 폴백 모델)이다. Phase 1은 합성 픽스처에 이어 **실제 한국어 발표·Q&A 녹음(71분, 음성 메모 m4a → 16kHz WAV)** 으로 재측정까지 마쳤고,
그 결과 음량 정규화 단계 추가·`cluster-threshold 0.8`·군소 화자 흡수를 확정했다(`docs/phase1-results.md`). Phase 2의 `run.ts`가 이 세 가지를 반영했고,
녹음 → 파이프라인 → SQLite → 홈/디테일 관통이 붙었다. Phase 3(편집·복사·화자 관리·설정)과 Phase 4(온보딩 모델 다운로드, 서명·업데이터 설정,
CI, 단일 인스턴스)도 코드가 붙었고, 세 Phase의 완료 기준(실제 녹음·실제 회의록·빈 `userData`로 온보딩)을 모두 통과했다.
**Phase 5-1(로컬 LLM 요약)은 사용자 지시로 Phase 3·4보다 먼저 착수했다** — 로드맵 순서를 건너뛴 예외이므로 여기 기록해 둔다.
5-1에 남은 항목(회의별 용어 사전, 저사양 폴백 모델)은 완료 기준이 아니라 후속 과제다 (`references/roadmap.md`).
Phase 4 배포 결정(모델 레지스트리·온보딩·바이너리·서명·업데이트·CI)은 `references/distribution.md`에 있다.
**Phase 5-2(시스템 오디오 캡처)는 2026-09-26 사용자 요청으로 착수했다** — Core Audio Taps 기반 동봉 도구로 스피커 출력을 마이크와 섞어 녹음한다 (`references/architecture.md` "시스템 오디오 캡처", 체크리스트는 `references/roadmap.md` 5-2).
**Phase 5-3(녹음 위젯 패널)** 은 2026-09-18에 문서를 먼저 확정했다. 녹음 제어가 메인 창 밖으로 나가면서
오디오 그래프 소유자·참석자 수의 단일 출처·창 참조 관리가 함께 바뀌므로, 체크리스트의 "계약 변경"을 먼저 끝내고 구현한다.
**Phase 5-4(LLM 회의록 교정)** 는 2026-09-24 사용자 요청으로 검증 단계만 마쳤다 — 발화를 LLM이 다시 쓰는 방식은 폐기하고,
용어 사전 + 발음 유사도 후보 + LLM O/X 판정으로 수정 **제안**을 만드는 방식을 채택했다 (`docs/phase5-refine-results.md`). 앱 통합은 **전역 용어 사전**부터 착수했다 (2026-09-24 사용자 결정) — 설정의 팀 소개로 LLM이 초안을 만들고 사용자가 고쳐 저장한다 (`references/architecture.md` "용어 사전").
**2026-09-25 사용자 결정으로 교정 단계를 앱에 붙였다** — 인식 단계(`--prompt`)는 건드리지 않는다. 같은 날 두 번째 결정으로 **회의별 용어 층을 없애 전역 용어 사전만 쓰고, 제안·수락 흐름 대신 파이프라인 뒤에 자동으로 돌려 통과한 쌍을 바로 본문에 반영**한다. 상세 레일에는 고친 쌍 목록과 "다시 교정"만 남는다 (`references/architecture.md` "회의록 교정", `data-model.md` "자동 교정 결과 저장"). `pnpm dev` 실제 확인이 남았다.
**2026-09-28 사용자 요청으로 "발화를 LLM이 다시 쓰는 방식 폐기"를 외부 공급자에 한해 뒤집었다** — 그 결론은 로컬 4B만 잰 것이었다. 외부 공급자(Claude·GPT)를 고르면 교정이 **문장 교정**(LLM이 고친 줄 → 코드가 어절 단위 발음 가드로 거름)이 되어 용어 사전 밖의 오인식까지 고치고, 로컬은 용어 교정 그대로다. 교정이 바꾼 발화는 원문을 보관해 발화별로 되돌릴 수 있다 (`docs/phase5-refine-results.md` "문장 교정", `references/architecture.md` "회의록 교정").
**UI 리디자인**은 2026-09-24 사용자 요청으로 문서를 먼저 확정했다 — 사이드바 + 본문 두 칸 레이아웃, "여백" 팔레트, 동봉 글꼴, 회의록 검색(`meetings:search`).
**knot 리디자인**(2026-09-28 사용자 요청)이 그 팔레트·레이아웃을 대체했다 — Figma knot 시안의 비주얼과 레이아웃(상단 GNB·하단 독·카드 홈·회의록 목록 화면)을 가져오고 다크 모드를 없앤다. 체크리스트는 `references/roadmap.md` "knot 리디자인" 절이다.
Phase 번호 밖의 별도 작업이며 체크리스트는 `references/roadmap.md` "UI 리디자인" 절이다.
**LLM 공급자 선택**도 2026-09-24 사용자 요청으로 문서를 먼저 확정했다 — 요약·용어 초안이 로컬 모델 대신 사용자의 Claude API 키나
Claude Code CLI(구독)를 쓸 수 있게 한다. 같은 날 사용자 요청으로 **OpenAI API 키(GPT-6 계열)** 도 추가했다. Phase 번호 밖의 별도 작업이며 설계는 `references/architecture.md` "LLM 공급자" 절, 체크리스트는 `references/roadmap.md` "LLM 공급자 선택" 절이다.
**품질 점검 후속**은 2026-09-26 전체 코드 점검에서 나온 개선 항목을 사용자 지시로 로드맵에 올린 것이다 — 1(데이터 유실 위험: ENOSPC·크래시 녹음 복구·처리 중 삭제·취소/타임아웃·마이그레이션 트랜잭션) → 2(정규화 메모리·라이브 받아쓰기 누수·접근성·로그 파일 등) → 3(웹 군집 통일·앱 용량·릴리스 스크립트·의존성·테스트 공백·문서 드리프트) 순서로 진행한다 (`references/roadmap.md` "품질 점검 후속"). 새 기능이 아니라 Phase 번호는 없다.
**사용 정보 수집**은 2026-09-28 사용자 결정으로 `test/usage-analytics` 브랜치(워크트리 `../meeting-stt-usage`)에서 별개 제품처럼 진행한다. Phase 번호 밖의 작업이며 체크리스트는 `references/roadmap.md` "사용 정보 수집" 절이다.
작업 시작 시 `git log`/디렉터리 상태로 현재 Phase를 먼저 재확인한다.

## 4. 코드 구조와 규칙

워크스페이스 경계·패키지 형태·스크립트 규약은 `references/monorepo.md`, 데스크탑 앱 내부의 디렉터리 배치·IPC 규약·프로세스 경계는 `references/architecture.md`, 배포(모델 다운로드·바이너리·서명·업데이트·CI)는 `references/distribution.md`를 따른다. 코드 컨벤션·renderer React 레이어(추상화 레벨·콜로케이션·세그먼트·훅 위치)·IPC/API 작성·테스트 배치 규칙은 `.claude/rules/*.md`에 있으며, 해당 경로의 파일을 만들거나 수정할 때 자동으로 적용된다. 핵심 규칙:

- **워크스페이스 경계**: 두 앱이 같은 값·같은 알고리즘을 써야 하면 `packages/core`(순수 로직)나 `packages/models`(모델 카탈로그)에 올리고, 런타임 API(`fs`, `electron`, `AudioContext`, 워커, spawn)를 만지는 코드는 앱에 남긴다. 아래 `src/…` 경로는 모두 `apps/desktop/` 기준이다 (`references/monorepo.md`).
- **프로세스 경계**: `src/main`(Node) / `src/preload`(contextBridge) / `src/renderer`(브라우저) / `src/shared`(순수 TS 타입·유틸, 런타임 의존 없음). 병합 알고리즘·포맷터 같은 순수 로직은 `src/shared` 또는 `src/main/pipeline`에 두고 `pnpm test`(vitest)로 단위 테스트한다.
- **IPC**: 채널 이름과 payload 타입은 `src/shared/ipc.ts`에 단일 정의. 요청-응답은 `ipcMain.handle`/`ipcRenderer.invoke`, 진행률 등 push는 `webContents.send`. preload는 `window.api`에 **타입이 붙은 함수만** 노출하고 `ipcRenderer`를 직접 노출하지 않는다.
- **외부 바이너리**: `resources/bin/<platform>-<arch>/` 에 두고 `asarUnpack` 대상으로 유지. 실행 전 존재·실행권한 확인, stdout JSON 파싱 실패/비정상 종료는 `status='error'`로 기록하고 사용자에게 안내한다.
- **데이터**: 화자 이름은 `utterances`에 쓰지 않고 `speakers(meeting_id, label) → display_name` 매핑으로 관리한다(한 번 바꾸면 전체 반영). 모든 시간 값은 초(sec, REAL), 생성 시각은 epoch ms.
- **한국어 우선**: 기본 언어 `ko`, 문서·커밋 메시지는 한국어. 코드 식별자는 영어. **UI 문구는 사전(`src/shared/locales/*.ts`)에 `ko`·`en`을 함께 적고 컴포넌트·main에 직접 쓰지 않는다** (2026-09-25 언어 설정). 새 문구를 추가할 때 한쪽 언어만 적으면 타입 오류다.
- **pnpm 주의**: pnpm 10은 의존성의 install/postinstall 스크립트를 기본 차단한다. 네이티브 애드온·바이너리 다운로드 패키지(`electron`, `esbuild`, `electron-winstaller`, `better-sqlite3`)는 **워크스페이스 루트** `package.json`의 `pnpm.onlyBuiltDependencies`에 등록해야 한다 (앱 `package.json`에 적으면 무시된다). 새 네이티브 의존성을 추가하면 이 목록도 갱신한다. `.npmrc`의 `node-linker=hoisted`는 electron-builder 패키징을 위한 설정이므로 지우지 않는다. `package.json` scripts 내부 호출은 `pnpm run <script>`로 통일한다.
- **범위 절제**: plan.md에 없는 기능(클라우드 동기화, 실시간 스트리밍 STT, 계정 등)은 제안만 하고 구현하지 않는다. 예외: 녹음 중 "라이브 받아쓰기" 보기(2026-09-26 사용자 결정, 1절 표) — 저장되는 회의록은 여전히 정지 후 파이프라인이 만든다. 이 브랜치에서는 사용 정보·회의 내용 수집 서버(`references/telemetry.md`)도 예외다 — 수집만 하고, 서버에서 앱으로 내려받는 동기화와 계정은 여전히 만들지 않는다.

## 5. 알려진 함정 (구현 전 확인)

전체 목록은 `references/pitfalls.md`. 자주 걸리는 것:

- Whisper는 무음에서 환각 텍스트를 만든다 → VAD 없이 추론 금지.
- 음량이 작은 녹음(원거리 마이크)에서는 Whisper가 수십 초 구간을 한두 단어로 뭉갠다 → STT 전에 RMS 정규화 필수.
- sherpa-onnx 내장 군집(complete-linkage)은 믿지 않는다 → 임계값 방식은 긴 녹음에서 화자가 무한정 늘어나고, `num-clusters`를 줘도 잡음 조각이 클러스터를 차지해 실제 화자 둘이 합쳐진다. CLI 라벨은 버리고 앱이 재임베딩 + k-means로 다시 군집한다 (`references/architecture.md` "화자 재군집").
- k-means는 K를 실제보다 크게 주면 큰 화자를 쪼갠다(K=9에서 79%) → 군집 뒤 중심 코사인 0.75 이상 쌍을 합치는 병합 보호를 반드시 같이 쓴다. 임계값을 더 낮추지 않는 이유는 UI에 화자 병합은 있어도 분리는 없기 때문이다.
- Whisper 세그먼트 안에서 화자가 바뀔 수 있다 → 단어 단위 타임스탬프로 배정 후 재문장화.
- 장시간 녹음 PCM을 메모리에 전부 들고 있지 않는다 → 청크 단위 디스크 append.
- 저사양 CPU에서 STT+화자분리 병렬 실행은 오히려 느리다 → `os.cpus().length` 기준 분기.
- 바이너리에 코어 수만큼 스레드를 주면 효율 코어까지 잡아 **느려지고 팬만 돈다** → 성능 코어 수 기준으로, GPU가 일하는 whisper·llama는 그보다 더 낮게.
- 성능 코어 수로 돌려도 긴 회의의 화자 분리는 몇 분간 코어를 전부 쓴다 → 소음이 싫은 사용자는 '조용히 처리' 설정으로 속도를 내준다. GPU를 쓴다고 발열이 없는 게 아니다(CPU·GPU가 방열판 하나를 공유).
- macOS 마이크 권한: `NSMicrophoneUsageDescription`(electron-builder.yml, 한국어 문구로 교체) + `systemPreferences.askForMediaAccess('microphone')`.
- 동봉 바이너리도 macOS notarization 시 함께 서명해야 한다.

## 6. 작업 시작 시 절차

1. 이 스킬과 필요한 `references/*.md`를 읽는다. 결정 사항과 어긋나는 요청이면 plan.md 근거를 들어 한 번 확인하고, 사용자가 재확인하면 그대로 진행한다.
2. 현재 Phase와 완료 기준을 `references/roadmap.md`에서 확인하고, 해당 Phase 항목만 구현한다.
3. 순수 로직은 `pnpm test`로 검증, 앱 동작은 `pnpm dev`로 확인한 뒤 결과를 있는 그대로 보고한다.
4. 새로운 기술 결정(모델 변경, 라이브러리 추가, 규약 변경 등)이 생기면 **코드를 쓰기 전에** 이 SKILL.md의 결정 표나
   해당 `references/*.md`를 먼저 갱신한다(0절). 문서 갱신 → 사용자 확인 → 코드 순서를 지킨다.
