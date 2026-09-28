---
name: meeting-stt-dev
description: 로컬 STT 회의록 데스크탑 앱(meeting-stt)의 개발 방향성·아키텍처 결정·단계별 로드맵·코딩 규칙. 이 프로젝트에서 기능 구현, 구조 설계, "다음 단계", 파이프라인(녹음→Whisper→화자분리→병합→SQLite→결정 추출), 결정 문서, UI(홈/녹음/디테일), 모델 배포, 빌드/서명 관련 작업을 할 때 반드시 먼저 로드한다. 근거 문서는 plan.md.
---

# meeting-stt 개발 방향성

클로바 노트/젠스파크 회의록과 유사한 기능을 **서버 없이** 데스크탑 앱 하나로 구현한다.
근거 문서는 `plan.md`(2026-08 기준 조사 자료). 이 스킬은 그 문서에서 **결정된 사항**과
**작업 규칙**만 추려낸 것이며, 배경 설명이 필요하면 plan.md의 해당 섹션을 읽는다.

> **브랜치 주의 (`test/usage-analytics`, 2026-09-28)**: 이 브랜치는 `main`과 방향이 다른 **사용 정보 수집 실험**이다.
> 사용 이벤트·성능·오류·환경에 더해 **회의 내용(발화·요약·녹음)까지 자체 수집 서버로 보내므로, 이 범위에서는 "서버 없이"가 뒤집힌다.**
> 추론 파이프라인은 여전히 로컬이다. 결정과 설계는 `references/telemetry.md`와 1절 "사용 정보 수집" 행에 있다. `main`에 병합하지 않는다.
> 같은 브랜치에서 **저장 단위를 회의록에서 결정 문서로 바꾸는 작업**도 진행한다 (2026-09-28, 1절 "저장 단위" 행, `references/decisions.md`).

## 0. 문서 우선 원칙 (SSOT)

**이 스킬 문서(SKILL.md + `references/*.md`)가 프로젝트의 단일 진실 공급원(SSOT)이고, 코드는 그 부산물이다.**
코드와 문서가 다르면 문서가 옳다고 보고 코드를 문서에 맞춘다. 문서를 고쳐야 할 이유가 생겼다면 **코드보다 문서를 먼저 고친다.**

- 기술 결정(1절)·파이프라인(2절)·로드맵(3절)·구조 규칙(4절)과 어긋나는 구현·리팩터링·라이브러리 추가·모델 변경은
  **문서를 먼저 수정하고 사용자에게 변경 내용을 알린 뒤** 코드를 작성한다. "일단 코드 먼저, 문서는 나중에"는 금지.
- 작업 중 문서에 없는 결정을 내려야 하면(예: 새 IPC 채널 규약, 스키마 컬럼 추가, 상수 값 선택) 코드를 쓰기 전에
  해당 `references/*.md`에 결정과 근거를 추가한다. 사소한 구현 세부는 코드에 두되, 다른 코드가 의존하게 되는 계약은 문서에 둔다.
- 상태 변화는 `references/roadmap.md`의 체크리스트·"진행 경과"와 3절 "현재 위치"에 기록한다.
- 문서에 오래된 내용(예: 마이그레이션 전 도구 이름)이 발견되면 즉시 문서를 고친다. 낡은 문서는 잘못된 SSOT다.

## 1. 확정된 기술 결정 (변경 시 사용자 확인 필수)

결정 한 줄만 적는다. **근거·실측값·번복 이력·세부 규약은 `references/tech-decisions.md`** (같은 행). 결정을 바꾸면 두 곳을 함께 고친다.

| 영역 | 결정 |
| --- | --- |
| 대상 플랫폼 | macOS 14+ / Apple Silicon 전용. 새 `win32` 분기·자산 금지 |
| 프레임워크 · 도구 | Electron (electron-vite + React 19 + TS), pnpm 10, Node 22+, vitest, tsx |
| 리포지토리 | pnpm 워크스페이스 모노레포, `apps/* → packages/*` 한 방향 (`references/monorepo.md`) |
| STT | whisper.cpp `whisper-cli` spawn, 기본 `large-v3-turbo-q5_0`, `-l ko -mc 0`, `-dtw` 끔 |
| 화자 분리 | sherpa-onnx CLI로 구간만 얻고 라벨은 버림 → 재임베딩 + k-means(K=참석자 수, 모르면 12) + 코사인 0.75 병합 (`architecture/pipeline.md` "화자 재군집") |
| 가속 · 스레드 | whisper·llama는 Metal, sherpa는 CPU. 스레드는 성능 코어 수 기준, '조용히 처리' 옵션 |
| 음량 정규화 · VAD | STT 전 순수 TS RMS 정규화, whisper 내장 Silero VAD 필수 |
| 녹음 | AudioWorklet 16kHz mono PCM → WAV. 외부 파일은 `afconvert`로 가져옴. 입력 장치 선택·마이크 테스트 |
| 저장소 | SQLite `better-sqlite3` (main 전용, `references/data-model.md`) |
| 라우팅 · 스타일 | `createHashRouter`, CSS Modules + `@meeting-stt/design` 토큰. UI 라이브러리·CSS-in-JS 금지 |
| 비주얼 디자인 | knot 디자인 시스템, 상단 GNB + 하단 녹음 독 + 여닫는 목록 패널, 다크 모드 없음 (`architecture/ui.md`) |
| 편집 · 확인 UI | 발화 단위 인라인 편집(에디터 라이브러리 금지), 되돌릴 수 없는 동작은 2단계 인라인 확인(`window.confirm` 금지) |
| 모델 배포 | 설치 파일 미동봉, 첫 실행 온보딩에서 다운로드 (`references/distribution.md`) |
| 시스템 오디오 | Core Audio Taps 동봉 Swift 도구 `systemAudioTap`, main에서 마이크와 믹스 (`architecture/audio.md`) |
| 요약 · LLM 공급자 | 로컬 `llama-cli` + Qwen3-4B 기본. 공급자 추상화로 Claude API / Claude Code CLI / OpenAI API 선택 가능 (`architecture/llm.md`) |
| 녹음본 | 완료 후 원본 삭제 기본, 보관 시 재생·내보내기·다시 인식 |
| 클립보드 | main의 `electron.clipboard` 경유 |
| 녹음 제어 | 보이지 않는 녹음 호스트 창이 오디오 그래프 소유 + 메뉴바 Tray + 전역 단축키. 위젯 패널 없음 |
| 라이브 받아쓰기 | 녹음 중 turbo `whisper-cli`를 12초 구간마다 재실행, 결과는 저장 안 함 |
| UI 언어 | 한국어(기본)/영어, `src/shared/locales/<domain>.ts`에 `ko`·`en` 나란히. 인식·요약 언어는 한국어 고정 |
| 사용 정보 수집 (이 브랜치) | main outbox → 자체 수집 서버(`apps/collector`), 이벤트만 PostHog·Sentry. 동의 UI 없음 (`references/telemetry.md`) |
| 저장 단위 (이 브랜치) | 결정 문서 — 파이프라인 → 교정 → 결정 추출 자동, 사이드 [결정 문서 \| 회의록] 탭 (`references/decisions.md`) |

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
  → [(조건부) 자동 교정 → (이 브랜치) 결정 추출 → decisions 교체, decision_state='done']
  → [(이 브랜치) 회의 스냅샷·녹음 WAV 업로드 대기열 등록 → 업로드 성공 후]
  → [(설정) 원본 WAV 삭제]
  → [사이드 패널 결정 탭(타입별) / 결정 문서 + 원문 패널 / 회의록 탭: 조회·원문 인라인 수정·화자 이름 지정·복사]
```

무거운 작업(spawn, 파일 IO, DB)은 전부 **main 프로세스(또는 utilityProcess)** 에서 수행하고,
renderer는 IPC로 요청·진행률 수신만 한다. 렌더러 내 추론(transformers.js/WebGPU)은 하지 않는다.
사용 정보 수집(이 브랜치)도 main에서만 하며, 전송이 실패해도 파이프라인·녹음은 실패하지 않는다 (`references/telemetry.md`).

## 3. 로드맵 — 순서를 건너뛰지 않는다

Phase 1(파이프라인 스크립트 검증) → 2(앱 골격) → 3(편집·복사·화자) → 4(배포 품질) → 5(확장: 요약·시스템 오디오·녹음 제어·교정).

현재 위치: **Phase 1~4, 5-1 종료.** 남은 것은 대부분 `pnpm dev` 수동 확인과 후속 후보다.
이 브랜치의 진행 중 작업은 **결정 문서 전환**(D1~D5 코드 붙음, D0 정답 비교·`pnpm dev` 확인 남음), **사용 정보 수집**, **품질 점검 후속**이다.
체크리스트·진행 경과(순서를 건너뛴 예외 기록 포함)는 `references/roadmap.md`, 완료된 절은 `references/roadmap-archive.md`.
작업 시작 시 `git log`/디렉터리 상태로 현재 위치를 먼저 재확인한다.

## 4. 코드 구조와 규칙

워크스페이스 경계는 `references/monorepo.md`, 데스크탑 앱 내부(프로세스 경계·디렉터리·IPC·기능별 설계)는 `references/architecture.md` **목차**에서 필요한 주제 파일만 찾아 읽는다. 배포는 `references/distribution.md`. 코드 컨벤션·React 레이어·IPC/API·테스트 규칙은 `.claude/rules/*.md`가 해당 경로 작업 시 자동 적용된다. 핵심 규칙:

- **워크스페이스 경계**: 두 앱이 같은 값·알고리즘을 쓰면 `packages/*`에, 런타임 API(`fs`, `electron`, `AudioContext`, 워커, spawn)를 만지는 코드는 앱에 둔다.
- **프로세스 경계**: `src/main`(Node) / `src/preload`(contextBridge) / `src/renderer`(브라우저) / `src/shared`(순수 TS). 순수 로직은 vitest로 단위 테스트한다.
- **IPC**: 채널·payload 타입은 `src/shared/ipc.ts`에 단일 정의. preload는 `window.api`에 타입 붙은 함수만 노출한다.
- **외부 바이너리**: `resources/bin/<platform>-<arch>/`, `asarUnpack`. 실패는 `status='error'` + 사용자 안내.
- **데이터**: 화자 이름은 `speakers(meeting_id, label) → display_name` 매핑. 시간 값은 초(REAL), 생성 시각은 epoch ms.
- **한국어 우선**: 문서·커밋은 한국어, 식별자는 영어. UI 문구는 사전에 `ko`·`en`을 함께 적는다.
- **범위 절제**: plan.md에 없는 기능(클라우드 동기화, 실시간 스트리밍 STT, 계정)은 제안만 한다. 예외는 라이브 받아쓰기, 이 브랜치의 수집 서버.

## 5. 알려진 함정

구현 전에 `references/pitfalls.md`에서 해당 영역을 확인한다. 특히: VAD 없이 추론 금지, STT 전 RMS 정규화 필수, sherpa 내장 군집 라벨 신뢰 금지, 장시간 PCM은 청크 단위 디스크 append, 스레드는 성능 코어 기준.

## 6. 작업 시작 시 절차

1. 이 스킬을 읽고, 작업 주제에 해당하는 references 파일(또는 `architecture.md` 목차의 주제 파일 하나)**만** 읽는다. 큰 파일을 통째로 읽지 말고 필요한 절을 grep으로 찾는다. 결정과 어긋나는 요청이면 plan.md 근거로 한 번 확인하고, 사용자가 재확인하면 진행한다.
2. 현재 작업의 체크리스트를 `references/roadmap.md`에서 확인하고 해당 항목만 구현한다.
3. 순수 로직은 `pnpm test`, 앱 동작은 `pnpm dev`로 확인한 뒤 결과를 있는 그대로 보고한다.
4. 새 기술 결정은 **코드 전에** 1절 표·`tech-decisions.md`나 해당 references를 먼저 갱신한다(0절). 문서 갱신 → 사용자 확인 → 코드.
