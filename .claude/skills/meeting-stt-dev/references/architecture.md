# 아키텍처 목차

이 문서는 **데스크탑 앱(`apps/desktop`)** 내부를 다룬다. 아래 `src/…`, `scripts/…`, `resources/…`는 모두 `apps/desktop/` 기준이고, 워크스페이스 경계와 공용 패키지는 `references/monorepo.md`에 있다.

본문은 주제별 파일로 나뉘어 있다. 코드·문서가 `architecture.md "<절 이름>" 절`로 가리키면 아래 표에서 파일을 찾아 **그 파일만** 읽는다. 새 절은 주제가 맞는 파일에 넣고 이 표에 추가한다.

| 파일 | 절 |
| --- | --- |
| `architecture/structure.md` (프로세스 경계·디렉터리·IPC) | "프로세스 경계" · "디렉터리 배치 (목표)" · "IPC 규약" |
| `architecture/pipeline.md` (파이프라인 실행·바이너리·스레드·잡 큐) | "외부 바이너리·모델 확보 (커밋하지 않는다)" · "외부 바이너리 실행" · "가속·스레드 정책" · "앱 런타임 경로 (Phase 2)" · "파이프라인 잡 큐 (Phase 2)" · "진행률 표시 (Phase 3)" |
| `architecture/audio.md` (녹음·녹음본·라이브 받아쓰기·시스템 오디오) | "녹음본 재생·내보내기·다시 인식 (2026-09-25)" · "녹음 파일 가져오기 (2026-09-25)" · "녹음 (renderer)" · "녹음 호스트 창 · 메뉴바 · 전역 단축키 (Phase 5-3)" · "라이브 받아쓰기 (2026-09-26)" · "시스템 오디오 캡처 (Phase 5-2, 2026-09-26)" |
| `architecture/ui.md` (화면 디자인·라우트·편집 UI·UI 언어) | "UI 언어 (2026-09-25)" · "화면 디자인 (knot 리디자인, 2026-09-28)" · "화면 라우트 (Phase 2)" · "편집 UI 규칙 (Phase 3)" |
| `architecture/llm.md` (요약·LLM 공급자·용어 사전·교정) | "로컬 LLM 요약 (Phase 5)" · "LLM 공급자 (2026-09-24)" · "용어 사전 (Phase 5-4)" · "회의록 교정 (Phase 5-4)" |

하위 절(`###`)로 가리키는 경우:

- `structure.md`: "편집 채널의 응답 규약 (Phase 3)"
- `pipeline.md`: "화자 재군집 (2026-09-25)" · "조용히 처리 (`pipeline.quiet`, 기본 꺼짐)" · "화자 분리를 GPU(CoreML)로 돌리지 않는 이유"
- `audio.md`: "마이크 입력 장치와 테스트 (2026-09-25)" · "플로팅 위젯 패널 제거 (2026-09-28, `test/usage-analytics` 브랜치)" · "macOS WidgetKit 위젯을 만들지 않는 이유" · "호스트 창 속성과 라우트" · "녹음 상태의 단일 출처" · "일시정지·재개 (2026-09-26)" · "메뉴바 (Tray)" · "전역 단축키" · "설정" · "엔진: 기존 whisper-cli를 짧은 구간마다 다시 돌린다" · "구간 나누기 (`src/main/audio/liveWindow.ts`, 순수 함수 + vitest)" · "인식 한 번 (`src/main/audio/liveTranscript.ts`)" · "상태와 IPC" · "화면" · "방식: Core Audio Taps + 동봉 Swift 도구" · "도구 규약 (`systemAudioTap`)" · "main: 섞기는 세션 안에서, 파이프라인은 그대로" · "화면"
- `ui.md`: "사전과 타입" · "renderer" · "main" · "범위 밖" · "디자인 토큰 (`packages/design/src/base.css`)" · "다크 모드 없음 (2026-09-28)" · "공통 컴포넌트 (`shared/components/primitives/ui`)" · "글꼴 동봉" · "메인 창 레이아웃: 상단 GNB · 하단 독 · 회의 목록 패널 (knot, 2026-09-28)" · "화면별 구성" · "회의록 검색 (`meetings:search`)"
- `llm.md`: "잡 큐 통합" · "IPC (Phase 5)" · "화면" · "바이너리·모델 확보 (Phase 5)" · "네 공급자" · "파일과 인터페이스" · "Claude Code CLI 호출" · "Claude API 호출" · "OpenAI API 호출" · "IPC" · "화면" · "초안은 LLM, 확정은 사람" · "실행과 큐" · "IPC" · "화면" · "실행과 큐" · "문장 교정 (외부 공급자, 2026-09-28)" · "결과 기록" · "IPC" · "화면"
