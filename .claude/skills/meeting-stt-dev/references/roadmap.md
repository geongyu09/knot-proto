# 로드맵과 완료 기준 (Definition of Done)

각 Phase는 아래 체크리스트를 **모두** 만족해야 다음 Phase로 넘어간다. 진행 상황은 이 파일의 체크박스를 갱신해 기록한다.

## 보관된 작업

아래 절은 `references/roadmap-archive.md`에 있다. **필요할 때만** 그 파일에서 해당 절을 찾아 읽는다.

- 완료: "Phase 0: 개발 환경 정리" · "Phase 1: 파이프라인 검증 (스크립트, UI 없음)" · "Phase 2: 앱 골격 (관통)" · "Phase 3: 편집·복사·화자 관리" · "Phase 4: 배포 품질"
- 미완료 항목이 남음 (대부분 `pnpm dev` 수동 확인·자격 증명 대기·후속 후보):
  - "Phase 5: 확장"
  - "UI 리디자인 (2026-09-24, Phase 번호 밖)"
  - "knot 리디자인 (2026-09-28, Phase 번호 밖)"
  - "LLM 공급자 선택 (2026-09-24, Phase 번호 밖)"
  - "녹음본 재생·내보내기·다시 인식 (2026-09-25, Phase 번호 밖)"
  - "마이크 입력 장치·테스트 (2026-09-25, Phase 번호 밖)"
  - "UI 언어 설정 (2026-09-25, Phase 번호 밖)"
  - "화자 재군집 (2026-09-25, Phase 번호 밖)"
  - "녹음 파일 가져오기 (2026-09-25, Phase 번호 밖)"
  - "라이브 받아쓰기 (2026-09-26, Phase 번호 밖)"
  - "레벨 미터를 이퀄라이저형으로 (2026-09-26, Phase 번호 밖)"

## 진행 경과 (SKILL.md 3절에서 옮김)

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
**결정 문서 전환**은 2026-09-28 사용자 결정으로 같은 브랜치에서 착수한다 — 저장·탐색의 단위를 회의록에서 결정 문서로 바꾼다. **D0(실제 회의로 추출 품질 검증) → D1(계약) → D2(main 자동 흐름) → D3(사이드 패널·문서 화면) → D4(회의 상세·설정) → D5(복사·검색)** 순서이고 D0 결과로 로컬 4B를 계속 쓸지 사용자가 정한다 (`references/decisions.md`, `references/roadmap.md` "결정 문서 전환"). **2026-09-28 D1~D5 코드가 붙었다** — 사용자 지시로 D0 완료 전에 진행한 예외다. D0은 스크립트·로컬 중간 측정(`docs/decisions-extraction-results.md`)까지 했고, 정답 비교·외부 공급자 측정·로컬 4B 유지 여부 결정과 `pnpm dev` 수동 확인이 남았다.
**사용 정보 수집**은 2026-09-28 사용자 결정으로 `test/usage-analytics` 브랜치(워크트리 `../meeting-stt-usage`)에서 별개 제품처럼 진행한다. Phase 번호 밖의 작업이며 체크리스트는 `references/roadmap.md` "사용 정보 수집" 절이다.

## 품질 점검 후속 (2026-09-26, Phase 번호 밖)

2026-09-26 전체 코드 점검(main 견고성·renderer UX·테스트/배포/문서)에서 나온 개선 항목을 사용자 지시로 로드맵에 올린다.
새 기능이 아니라 이미 있는 것을 고치는 작업이라 Phase 번호는 붙이지 않는다. 진행 순서는 아래 절 순서(1 → 2 → 3)를 기본으로 하되,
각 항목이 계약(IPC·스키마·상수)을 바꾸면 SSOT 규칙대로 `architecture.md`·`data-model.md`를 먼저 고친다.
다른 세션이 진행 중인 "일시정지·재개"(`architecture.md` 같은 이름의 절) 작업과 겹치는 파일(`session.ts`, `RecorderSection`, `WidgetPanelSection`)은 그 작업이 커밋된 뒤 손댄다.

### 1. 데이터가 날아갈 수 있는 것 (먼저)

- [ ] **디스크 부족(ENOSPC)에서 녹음 세션이 영구히 막히는 문제.** `audio/wavWriter.ts`의 쓰기 체인(`queue = queue.then(...)`)이 한 번 reject되면 이후 append·finalize가 전부 실패하고, `stopRecording`이 finalize 뒤에 `session = null`을 해서 세션이 남아 다음 녹음이 `alreadyActive`가 된다.
      → 실패한 append는 체인을 끊지 않고 오류를 세션에 보고, `stopRecording`은 finalize가 실패해도 세션을 반드시 비운다. 녹음 시작 전 `statfs`로 여유 공간(예: 1시간분 115MB)을 확인해 부족하면 사전(`ko`·`en`) 문구로 막는다
- [ ] **크래시 중이던 녹음 복구.** WAV 헤더를 정지 시에만 확정해 크래시 후 `dataBytes = 0`으로 남고, `readWavPcm`이 빈 PCM을 읽어 다시 인식해도 결과가 빈다.
      → 앱 시작 시 `status='recording'`으로 남은 회의의 WAV를 파일 크기로 헤더를 고쳐 `duration_sec`을 채우고 `error`(원본 보존)로 바꿔 "다시 시도"가 되게 한다. 헤더 복구 함수는 순수 로직으로 두고 단위 테스트
- [ ] **처리 중·녹음 중 회의 삭제 방지.** `ipc/handlers.ts`의 삭제 핸들러에 상태 확인이 없어 파이프라인은 끝까지 돌고 마지막 `saveTranscript`만 FK 오류로 실패한다.
      → `recording`·`processing`(대기 포함)이면 삭제를 거절하거나 잡을 먼저 취소한다(아래 취소 항목과 함께). 사이드바 삭제 UI는 그 상태에서 비활성
- [ ] **외부 프로세스 취소·타임아웃.** `bin/spawn.ts`의 `runBinary`와 `pipeline/embed.ts`가 AbortSignal도 타임아웃도 받지 않고, 큐(`pipeline/queue.ts`)에서 잡을 빼는 API가 없다. llama-cli·`claude -p`가 멈추면 동시성 1 큐 전체가 막힌다.
      → `runBinary({ signal, timeoutMs })`, 큐 잡 취소, 앱 종료(`before-quit`) 시 도는 자식 프로세스 전부 kill. 자식 프로세스 목록을 한 곳에서 추적한다
- [ ] **DB 마이그레이션 트랜잭션화 + 사전 백업.** `db/migrations.ts`가 단계별 `exec`와 `user_version` 갱신을 따로 실행해 4번(DROP·RENAME·UPDATE·ADD)이 중간에 실패하면 반쯤 적용된 채 재시도도 실패한다. DB 버전이 앱보다 높을 때(다운그레이드)도 막지 않는다.
      → 단계마다 `db.transaction`, 마이그레이션 전 `VACUUM INTO meetings.backup-<version>.db`, 버전이 높으면 안내 후 종료
- [ ] **연속 UPDATE 트랜잭션.** `audio/session.ts`의 `stopRecording`(duration·speakerCount·status)과 `audio/importRecording.ts`(insert·duration·speakerCount·status)를 트랜잭션 하나로 묶는다
- [ ] 완료 기준: 디스크 가득 찬 상태(이미지 마운트)에서 녹음 → 안내 → 세션 정리 → 다음 녹음 정상. 녹음 중 강제 종료 → 재시작 → 회의가 `error`로 보이고 "다시 시도"로 회의록 생성. `pnpm test`에 헤더 복구·마이그레이션 트랜잭션 테스트

### 2. 사용 중 체감되는 것

- [ ] **정규화 메모리 급증.** `pipeline/normalize.ts`가 WAV 전체를 읽고 slice·applyGain·concat으로 사본을 세 번 만들어 2시간 녹음이면 순간 약 1GB다.
      → 두 패스(1패스: 프레임 RMS만 계산, 2패스: 스트림으로 게인 적용해 쓰기)로 바꿔 상주 메모리를 프레임 버퍼 수준으로 낮춘다. `@meeting-stt/core/normalize` 공식은 그대로
- [ ] **라이브 받아쓰기 실패 시 구간 무한 증가.** `audio/liveTranscript.ts`의 실패 처리가 `pending`을 비우지 않아 turbo 모델이 없는 경우처럼 계속 실패하면 청크가 녹음 내내 자라고 매번 전체를 복사한다(O(n²)).
      → 실패해도 최대 구간(12초)을 넘는 앞쪽 청크는 버리고, 연속 실패 N회면 라이브 보기를 끄고 사전 문구로 안내. 정지·보기 끄기 시 도는 whisper를 kill
- [ ] **대기 중 회의의 상태 표시.** `stopRecording`이 큐에 넣기만 하고 `recording`으로 두어 앞 잡이 끝날 때까지 사이드바에 "녹음 중"으로 보인다. 가져오기 경로처럼 즉시 `processing`으로 바꾼다
- [ ] **로그 파일 저장.** `log.ts`가 `process.stdout`에만 써서 패키징된 앱에서는 로그가 사라진다. `userData/logs/main.log`에 쓰고 크기 기준 순환(예: 5MB × 3). 설정 화면에 "로그 폴더 열기". `windows/shortcuts.ts`가 버리는 등록 실패 원인도 로그에 남긴다
- [ ] **시스템 오디오 도구 고아 프로세스.** 도구가 `error:` 줄만 내고 살아 있으면 `session.systemAudio = null`로 참조만 버린다. `onFailure`에서 `stop()`을 부른다. 마이크 청크가 멈췄을 때 FIFO가 무한히 자라지 않게 상한(예: 30초분)을 둔다
- [ ] **인라인 편집 접근성 3종** (`shared/components/primitives/InlineEditableText`, `useInlineEdit`):
      (a) 표시 버튼의 `aria-label`이 본문을 대체해 모든 발화가 "발화 내용 수정"으로만 읽힌다 → `aria-label` 대신 `aria-describedby`나 시각적으로 숨긴 접두 텍스트로 바꿔 본문이 읽히게,
      (b) Enter·Esc·blur로 에디터가 사라진 뒤 표시 버튼으로 포커스 복원,
      (c) `isComposing` 검사 추가(한글 조합 중 Enter·Esc 무시, `TermRow`와 동일). 여러 줄 편집의 Cmd+Enter 확정을 사전 문구로 안내
- [ ] **확인 단계 포커스.** 삭제(`TranscriptActions`)·다시 인식(`RecordingBar`)·화자 합치기(`SpeakerPanel`)의 2단계 인라인 확인이 뜰 때 확인 버튼으로 포커스를 옮긴다
- [ ] **언어 전환 시 용어 사전 편집 소실.** `GlossarySection/model/useGlossary.ts`의 조회 effect가 `t`에 의존해 언어를 바꾸면 다시 불러오며 편집을 덮는다 → 조회는 마운트 한 번, 오류 문구는 표시 시점에 `t`로 만든다
- [ ] **상세 화면 이중 조회·에러 덮임.** `SummarySection`이 `useMeeting`을 따로 호출해 조회·구독이 두 번이고, 다시 인식 중 요약 패널이 옛 상태로 남는다. `TranscriptSection`은 재조회 실패 시 본문 전체가 에러로 바뀌고 다시 시도가 없다
      → 회의 하나는 `TranscriptSection`이 한 번만 조회해 props/컨텍스트로 내려주고, 이미 불러온 뒤의 실패는 인라인 배너 + `refetch` 버튼
- [ ] **긴 회의 렌더.** 발화 행마다 화자 `select`·버튼이 붙고 memo가 없어 복사·`useNow` 갱신마다 전체가 리렌더된다. 먼저 300발화 이상 회의로 측정하고, 실제로 버벅이면 행 분리·`memo` → 그래도 부족하면 가상화(의존성 추가는 문서 먼저)
- [ ] **모델 설명 문구 사전화.** `packages/models/src/desktop.ts`의 한국어 설명이 사전을 거치지 않아 영어 UI에서도 한국어다 → 카탈로그에는 설명 키만 두고 문구는 `src/shared/locales/models.ts`에 `ko`·`en`. `SummarySection`·`RefinePanel`의 문장 부호 이어 붙이기(`{missingMessage}.`)도 사전 문구로
- [ ] **설정 저장 경쟁·낙관적 반영.** `useSettings`가 닫힌 스냅샷에 변경을 덧붙여 저장해 연타 시 앞 변경이 되돌려질 수 있고, 스위치가 IPC 왕복 뒤에야 바뀐다. 투명도 슬라이더는 input마다 IPC를 보낸다 → 함수형 갱신 + 낙관적 반영, 슬라이더는 디바운스, `settings:changed` 구독
- [ ] **작은 상태 처리.** 설정·용어 사전·LLM 섹션 로드 실패 시 다시 시도 버튼, 모델 확인 중 빈 화면(`routes/guards.tsx`) 대신 로딩 표시, 업데이트 배너 닫기, 에러 문구에 `role="alert"` 통일, 검색 결과 개수 `aria-live`
- [ ] **기능 공백 (각각 문서 먼저).** 재생 중 발화 강조(재생·내보내기 절 후속), 검색 결과에서 해당 발화로 스크롤(UI 리디자인 절 후속), 회의록 파일 내보내기(md·txt·srt, 요약 포함 여부 선택), 발화 삭제·분할, 앱 내 단축키(Space 재생/정지, ⌘F 검색, ⌘N 새 녹음), 온보딩 언어 선택
- [ ] 완료 기준: 2시간 녹음 처리 중 main 상주 메모리 300MB 이하. turbo 모델 파일을 지운 채 라이브 보기를 켜고 5분 녹음해도 메모리가 늘지 않음. VoiceOver로 발화 본문이 읽히고 편집 후 포커스가 제자리. 영어 UI에서 한국어 문구 없음

### 3. 배포·구조·문서

- [ ] **웹 프로토타입 군집을 core로 통일.** `apps/web/src/workers/diarizeWorker.ts`가 자체 `clusterByCompleteLinkage`(83.4%)를 쓴다 → `@meeting-stt/core/cluster`의 k-means + 병합(92.7%)으로 바꾸고 `apps/web/src/pipeline/cluster.ts`·중복 `l2Normalize` 삭제, `docs/browser-prototype-plan.md`의 AHC 서술 갱신 (화자 재군집 절 후속과 같은 항목)
- [ ] **앱 용량(408MB) 줄이기.** `electron-builder.yml` `files`에 `!**/*.{map,d.ts,d.mts}` 제외(`openai`·`@anthropic-ai/sdk`), `react-router`를 devDependencies로(renderer 번들에 인라인됨), `libllama-server-impl.dylib`(8.9MB) 동봉 필요 여부를 `otool -L`로 확인해 불필요하면 `scripts/assets.ts`에서 제외, better-sqlite3 unpacked 26MB에 빌드 산출물이 섞였는지 확인. 목표와 결과 크기를 `distribution.md`에 기록
- [ ] **`release:mac` 스크립트 제거.** `--publish always`가 남아 있어 실수로 배포될 수 있다. `distribution.md` 로컬 릴리스 절차(3단계 "쓰지 않는다")와 맞춘다. 루트 `package.json`의 위임 스크립트도 함께
- [ ] **entitlements 정리.** `build/entitlements.mac.plist`의 `com.apple.security.cs.allow-dyld-environment-variables`는 코드에서 쓰지 않는다(`distribution.md` "DYLD_LIBRARY_PATH 불필요") → 제거 후 서명 빌드에서 동봉 dylib 로드 확인
- [ ] **창 보안.** `windows/main.ts`의 `setWindowOpenHandler`가 스킴 검사 없이 `shell.openExternal`을 부른다 → `https:`·`mailto:`만 허용, `will-navigate` 차단, 위젯 창에도 같은 핸들러. `sandbox: false`를 `true`로 바꿀 수 있는지(preload가 Node API를 쓰는지) 확인해 결정을 `architecture.md`에 기록
- [ ] **의존성.** `@types/better-sqlite3` 9.x → `better-sqlite3` 13.x에 맞는 버전, Electron 39가 지원 범위(최신 3개 메이저)에 있는지 확인해 필요하면 올린다(네이티브 리빌드·`onlyBuiltDependencies` 확인). `apps/web`의 `tsx`는 `smokeModels.ts`를 부르는 스크립트를 등록하거나 제거
- [ ] **Node 버전 고정.** 루트에 `.nvmrc`(22) 추가. 기본 node가 20이면 desktop vitest 설정이 `ERR_REQUIRE_ESM`으로 로드조차 안 된다. `monorepo.md`에 한 줄 적는다
- [ ] **테스트 공백.** DB 레포지토리(`db/*.ts` 8개, 마이그레이션 1→4 포함)·IPC 핸들러·파이프라인 조립부(`run`·`queue`·`recluster`·`reprocess`)·`session.ts`·`wavWriter.ts`. DB는 vitest에서 better-sqlite3가 Electron ABI로 빌드되어 로드되지 않는 문제부터 푼다(테스트용 node ABI 리빌드 스크립트 또는 SQL 계층 분리). E2E(Playwright) 도입 여부를 `.claude/rules/test-strategy.md`에서 결정(현재 "Phase 4에서 검토"로 미결)
- [ ] **컨벤션.** `ipc/handlers.ts`(657줄)를 도메인별 파일(`ipc/meetings.ts`, `ipc/recording.ts`, `ipc/settings.ts`, `ipc/llm.ts`)로 분리, `registerIpcHandlers`(약 200줄)·`startSystemAudioCapture`(약 90줄) 50줄 이하로. `settings.update` 핸들러의 인라인 로직 함수화
- [ ] **CI.** `build.yml`에 whisper.cpp 소스 빌드 캐시, `concurrency`(이전 실행 취소), `apps/web` 빌드 포함
- [ ] **문서 드리프트.** k-means 결정 근거가 git 제외된 `docs/external/`에만 있어 커밋된 문서만 보면 AHC가 정답처럼 읽힌다 → 근거 요약을 `docs/diarization-clustering-results.md`에 옮긴다. `data-model.md` 설정 키 표에 `llm.provider`·`llm.openaiModel`·`llm.*ApiKey` 추가. `architecture.md` IPC 규약 블록에 `events.settingsChanged` 추가. `.claude/rules/*`의 존재하지 않는 예시(`useAudioLevel`, `RecordButton`, `groupBySpeaker`)를 실제 코드 예로 교체. Windows 잔재(`win`/`nsis` 블록, `build:win`, `icon.ico`, `electron-winstaller`)는 제거하거나 "유지하지 않음"을 파일 주석으로
- [ ] 완료 기준: `pnpm build:mac` 결과 크기가 문서 목표 이하, `release:mac` 없음, `.nvmrc`로 새 셸에서 `pnpm test` 전부 통과, 웹 프로토타입이 core 군집으로 데스크탑과 같은 라벨을 냄

## 사용 정보 수집 (2026-09-28, `test/usage-analytics` 브랜치 전용, Phase 번호 밖)

사용 이벤트·성능·오류·환경과 회의 내용(발화·요약·녹음)을 자체 수집 서버로, 이벤트·수치만 외부 분석 서비스로 보낸다. 앱 안에서 동의를 받지 않고, 사전 동의한 팀에게만 배포한다 (사용자 결정).
`main`의 "서버 없이" 방향과 달라 브랜치를 나눴으며 `main`에 병합하지 않는다. 설계는 `telemetry.md`, 결정 표는 `SKILL.md` 1절.

### 0. 미결 결정 (코드 전에)
- [x] 수집 서버 스택·저장소 결정 (Hono + `node:sqlite` + 로컬 디스크, `telemetry.md` "수집 서버")
- [ ] 수집 서버 호스트·도메인 결정 (배포 형태는 Docker + Caddy로 결정)
- [x] 외부 분석 서비스 종류 결정, 오류·크래시 전송처 결정 — PostHog(이벤트) + Sentry(오류·크래시), 2026-09-28
- [x] 데스크탑↔수집 서버 HTTP 계약 확정 (`telemetry.md` "전송 계약") — 서버보다 데스크탑을 먼저 만든다 (2026-09-28)
- [ ] 서버 보관 기간·팀 탈퇴 시 삭제 절차
- [x] 대시보드 여부 — 수집 서버 `/admin`에 읽기 전용 관리자 페이지 (2026-09-28 사용자 요청, `telemetry.md` "관리자 페이지")

### 1. 계약
- [x] `packages/telemetry` 신설 — 이벤트 이름·payload 타입·envelope·회의 스냅샷 스키마 (`monorepo.md` 구성 표·`.claude/rules/project-structure.md` 갱신)
- [x] `data-model.md` "사용 정보 outbox" 테이블 마이그레이션(6), `telemetry.installId` 설정 키
- [x] IPC `telemetry:track`(renderer → main) + preload `window.api.telemetry.track`

### 2. 데스크탑
- [x] `src/main/telemetry/` — 수집기, outbox, 전송 워커(묶음·백오프), 싱크 어댑터(자체 서버·PostHog) + Sentry
- [x] 이벤트 호출 지점: 녹음·가져오기·파이프라인 단계별 시간·요약·교정·복사·화자 편집·화면 이동·오류
- [x] 회의 스냅샷 전송과 내용 변경 시 재전송, 녹음 WAV 파일 업로드(이어 올리기) → 성공 뒤 원본 삭제로 순서 변경
- [x] 빌드 분리 — `appId`·`productName`·업데이트 끔, 팀 토큰 빌드 주입(`.env.example`), 설정 화면 업데이트 자리의 "팀 테스트 빌드" 표시
- [ ] 실제 녹음 한 건으로 스냅샷·WAV 업로드 확인 (가짜 서버로 이벤트 경로·오프라인 재전송은 2026-09-28 확인, 업로드는 단위 테스트만)

### 3. 수집 서버 (`apps/collector`)
- [x] 워크스페이스 신설, 팀 토큰 검증, 이벤트 묶음 수신, 회의 스냅샷 upsert·삭제 표시, 녹음 파일 업로드 수신 (2026-09-28, vitest 16개 + 실서버 확인)
- [x] 개발 환경 `pnpm dev:stack`(서버 + 데스크탑 한 번에), `collector:inspect`, 배포 환경(Docker 이미지 + Caddy compose), `collector:smoke` (`telemetry.md` "환경"). 2026-09-28 dev:stack으로 데스크탑 이벤트 도착·번들 스모크 통과 확인, **Docker 이미지 빌드·compose는 Docker 데몬이 꺼져 있어 미확인**
- [x] 관리자 페이지 `/admin` — 개요·이벤트·설치·회의 목록·회의 상세(발화·요약·녹음 재생), HTTP Basic(`COLLECTOR_ADMIN_PASSWORD`), `dev:stack` 비밀번호 자동 생성 (2026-09-28, vitest 9개 + 번들 서버로 개발 데이터 사본 화면 확인)
- [ ] 완료 기준: 새 `userData`로 빌드를 실행해 회의 하나를 녹음 → 서버에 이벤트·스냅샷·WAV가 모두 도착, 서버를 끈 채 녹음해도 앱 동작에 영향이 없고 서버를 다시 켜면 밀린 데이터가 도착

## 결정 문서 전환 (2026-09-28, `test/usage-analytics` 브랜치, Phase 번호 밖)

회의록(발화 목록)이 아니라 **결정 1건 = 문서 1개**를 남긴다. 녹음이 끝나면 파이프라인 → 교정(조건부) → 결정 추출이 한 흐름으로 돌고,
사이드 패널의 주 목록은 사용자 정의 타입별 결정 문서다. 결정·근거는 `decisions.md`, 스키마는 `data-model.md` "결정 문서".
**D0(검증) → D1(계약) 순서를 건너뛰지 않는다** — Phase 1처럼 실제 회의로 로컬 4B의 추출 품질을 먼저 재고, 그 결과로 프롬프트·청크·모델을 정한 뒤 계약을 고정한다.
**예외 (2026-09-28 사용자 지시 "구현 안 된 부분 구현")**: D0의 측정·사용자 결정을 기다리지 않고 D1~D5 코드를 붙였다 — Phase 5-1처럼 순서를 건너뛴 예외다.
프롬프트·청크 예산은 `decisions.md`의 초기값으로 두고, D0 결과로 바뀌면 문서를 먼저 고친 뒤 `src/main/decisions/prompt.ts`만 바꾼다. 계약(스키마·IPC)은 D0 결과와 무관하게 유지한다.

### D0. 추출 검증 (스크립트, UI 없음)
- [x] `scripts/decisions.ts` — DB의 회의(또는 발화 JSON)를 읽어 공급자별로 결정을 추출하고 결과 JSON·소요 시간을 남긴다 (`scripts/refine.ts`와 같은 모양, 무거운 실험은 3스레드·순차) — 2026-09-28 작성, DB(`--meeting`)·회의록 텍스트(`--transcript`) 입력, 공급자 4종
- [x] 고정 llama.cpp 빌드의 `--json-schema` 지원 확인 — 도움말에는 있지만 **실제로는 `{}`도 "Failed to initialize samplers"로 실패하고 종료 코드 0** (2026-09-28). 대체안으로 손으로 쓴 GBNF(`--grammar-file`)를 쓴다 (`decisions.md` "LLM 출력", `pitfalls.md`)
- [ ] 실제 회의 3건 이상(짧은 회의·71분 발표·Q&A)에 **사람이 정답 결정 목록을 먼저 적고** 로컬·Claude·GPT로 비교: 찾은 결정 수·놓친 결정·지어낸 결정·잘못 쪼개거나 합친 결정·근거 줄 정확도·타입 일치율·시간
- [ ] 청크 예산·reduce(중복 합치기) 필요 여부·프롬프트 확정, 검증 규칙(`validate.ts`)이 버리는 비율 확인
- [ ] 결과 문서 `docs/decisions-extraction-results.md` — 중간 결과(로컬 2건, 정답 비교 전)만 있다
- [ ] **사용자 결정**: 로컬 4B 품질이 쓸 만한가. 아니면 (a) 로컬 모델 교체 (b) 로컬은 "결정 추출 불가" 안내 후 외부만 (c) 그대로 두고 품질 경고 중 고른다 → SKILL.md 1절·`decisions.md` 갱신

**완료 기준**: 정답을 적어 둔 회의에서 선택한 기본 공급자가 결정을 대부분 찾고(놓침·지어냄 수치를 결과 문서에 기록), 근거 구간이 실제 발화를 가리킨다.

### D1. 계약·스키마 (코드보다 먼저, 여기서 바뀌면 문서부터)
- [x] 마이그레이션 7 (`data-model.md` "결정 문서") + `Meeting.decisionState`·`decisionCount`·`decisionError`, `Decision`·`DecisionType`·`DecisionListItem` (`src/shared/types.ts`)
- [x] `src/shared/ipc.ts` — `decisions:*`, `decisionTypes:*`, `decisions:progress` (`decisions.md` "IPC"), preload `window.api.decisions.*`, renderer `shared/api/decisions`
- [x] 사전 `src/shared/locales/decisions.ts` (ko·en) — 탭·묶음·상태·빈 상태·확인 문구, 설정 카테고리
- [x] `packages/telemetry` — 스냅샷에 `decisions`·`decisionTypes`, 이벤트 `decisions_completed`·`decision_opened`·`decision_copied`·`decision_types_updated` (`telemetry.md` 수집 항목 표 갱신)
- [x] `.claude/rules/project-structure.md`에 새 경로(`src/main/decisions/`, `pages/DecisionDetail`, `widgets/decision/*`) 반영

### D2. main — 자동 흐름
- [x] `src/main/decisions/` — `lines.ts`(줄 번호 입력 조립), `prompt.ts`(프롬프트·스키마·GBNF·청크), `extract.ts`(청크·공급자 호출·합치기, electron 없음 — D0 스크립트와 공용), `validate.ts`(순수, vitest: 근거 없음·범위 밖·타입 불일치·화자 불일치·구간 합치기), `run.ts`(잡), 채널은 `src/main/ipc/decisionHandlers.ts`
- [x] 큐에 `{ kind: 'decisions' }` 추가, 중복 방지, 실패는 `decision_state='error'`만 (회의 `status` 불변)
- [x] 파이프라인 성공 직후 `pending` + refine(조건부)·decisions를 같은 동기 구간에서 순서대로 넣기 — 녹음·가져오기·다시 인식 세 경로 모두 — 세 경로가 모두 `processMeeting`을 거치므로 한 곳
- [x] 다시 인식 성공 저장에 `decisions` 삭제 추가, 앱 시작 복구에 `pending → error` 추가, 화자 병합 트랜잭션에 JSON 라벨 치환 추가
- [x] `decisionTypes:get/update`(검증: 최대 20개·이름 20자·설명 80자·중복), 추출 시작·완료·실패·타입 변경 뒤 `meetings:changed`
- [x] 수집: 추출 완료 뒤 스냅샷 재전송, 이벤트 호출 지점 (수집 서버 `validate.ts`도 결정 필드를 받는다)

### D3. 사이드 패널·결정 문서 화면
- [x] `MeetingSidebarSection`에 [결정 문서 | 회의록] 탭(`localStorage` `meetingSidebar.tab`, 기본 결정 문서), 결정 탭: "처리 중" 묶음 → 타입 묶음(접기) → 미분류
- [x] 회의록 탭 행에 결정 개수 칩 / "결정 없음"
- [x] 라우트 `/decisions/:decisionId`(`PATHS.decisionDetail`) + `pages/DecisionDetail` — 읽기 전용 문서(결정·배경·대안·후속 조치·참여 화자·근거 칩)
- [x] 오른쪽 원문 패널: `TranscriptSection` 좁은 변형 + 근거 구간 강조·첫 근거로 스크롤·근거 칩 클릭 이동, 편집·화자 이름·병합 동작 유지, 폭 리사이즈
- [x] "이 회의 다시 추출"(2단계 인라인 확인 → 회의 상세로 이동), 없는 문서 빈 상태
- [x] 통합 테스트(`test.tsx`): 탭 전환·묶음 접기·처리 중/실패 항목·읽기 전용(입력 요소 없음)·근거 강조

### D4. 회의 상세·설정
- [x] 회의 상세 레일 맨 위 "결정 문서" 카드 — 목록·진행/실패·"결정 추출"/"다시 추출"(기존 회의는 여기서만 추출)
- [x] 설정 "결정 타입" 카테고리(추가·이름/설명·순서·삭제 2단계 확인·저장), LLM 공급자 경고 문구에 자동 전송 추가

### D5. 복사·검색·마무리
- [x] 결정 문서 마크다운 복사 (`src/shared/decisionFormat.ts` + vitest) — 문서 화면 "복사" 버튼이 쓴다
- [x] 결정 탭 검색 `decisions:search` (제목·결정·배경, `meetings:search`와 같은 LIKE 이스케이프) — 사이드 패널 검색 입력이 탭별로 쓴다
- [x] SKILL.md 2절 파이프라인·3절 현재 위치, `architecture.md` IPC 규약 갱신 (화면별 구성은 `architecture.md`가 `decisions.md` "화면"을 가리킨다)

**완료 기준 (사용자 수동 확인, `pnpm dev` 또는 `pnpm dev:stack`)** — 2026-09-28 코드 완료, 단위·통합 테스트·빌드·DB 사본 마이그레이션 확인까지 했고 실제 앱 수동 확인은 남았다
- [ ] 결정이 여러 개 나온 실제 회의를 녹음 → 정지 후 아무것도 누르지 않아도 사이드 패널 결정 탭 "처리 중"에 진행률이 보이고, 끝나면 결정마다 문서가 타입 묶음에 나타난다
- [ ] 문서를 열면 오른쪽 원문 패널이 근거 구간을 강조해 보여 주고, 화자 이름을 바꾸면 문서의 제안자·담당이 바로 바뀐다
- [ ] 결정이 없는 회의는 결정 탭에 아무것도 남기지 않고 회의록 탭에만 "결정 없음"으로 보인다
- [ ] LLM이 준비되지 않은 상태(로컬 요약 모델 없음 또는 외부 키 없음)로 녹음하면 결정 탭에 실패 항목이 뜨고, 준비 후 "다시 시도"로 문서가 생긴다. 앱을 재시작해도 실패 항목이 남는다
- [ ] 기존 회의는 자동으로 추출되지 않고, 회의 상세의 "결정 추출"로 만들 수 있다
- [ ] 수집 서버에 결정 문서가 포함된 스냅샷이 도착한다
