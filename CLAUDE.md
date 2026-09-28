# meeting-stt

서버 없이 로컬에서 동작하는 STT 회의록 데스크탑 앱 (Electron + whisper.cpp + sherpa-onnx).
개발 방향성·아키텍처·로드맵은 `.claude/skills/meeting-stt-dev/SKILL.md`를 **먼저 로드**한다. 근거 문서는 `plan.md`.

> **이 브랜치(`test/usage-analytics`)는 사용 정보 수집 실험이다.** 사용 이벤트·성능·오류·환경과 회의 내용(발화·요약·녹음)을
> 자체 수집 서버(`apps/collector`)와 외부 분석 서비스(이벤트만)로 보낸다. 앱 안 동의 UI 없이 사전 동의한 팀에게만 배포한다.
> 설계는 `.claude/skills/meeting-stt-dev/references/telemetry.md`. `main`에 병합하지 않는다.

**SSOT 규칙**: 개발 방향·아키텍처·기술 결정의 단일 진실 공급원은 **스킬 문서**(`SKILL.md` + `references/*.md`)이고 코드는 그 부산물이다.
기존 방향과 다른 구현·결정이 필요해지면 **무조건 문서를 먼저 수정**하고 사용자에게 알린 뒤 코드를 작성한다. 코드와 문서가 다르면 문서가 옳다.

## 워크스페이스 (pnpm 모노레포)

| 경로                 | 패키지                   | 무엇                                                                                                                                  |
| -------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/desktop`       | `meeting-stt`            | 제품 Electron 앱 (녹음 → 파이프라인 → SQLite → UI → 패키징)                                                                           |
| `apps/web`           | `@meeting-stt/web`       | 브라우저 추론 프로토타입 (`docs/browser-prototype-plan.md`)                                                                           |
| `apps/collector`     | `@meeting-stt/collector` | 사용 정보·회의 내용 수집 서버 (이 브랜치 전용, Hono + `node:sqlite`, `telemetry.md`)                                                  |
| `packages/core`      | `@meeting-stt/core`      | 두 앱 공용 순수 TS — 파이프라인 타입, 병합, 화자 재군집(k-means), 복사 포맷, 정규화 공식, 참석자 수 규칙, 오디오 형식, 용어 읽기 사전 |
| `packages/models`    | `@meeting-stt/models`    | 모델 카탈로그 SSOT — 데스크탑 자산(URL·sha256), 웹 저장소 id·dtype                                                                    |
| `packages/design`    | `@meeting-stt/design`    | 디자인 토큰(`base.css`)·동봉 글꼴(`fonts.css`, `fonts/`) — CSS·글꼴만, React 컴포넌트는 앱별                                          |
| `packages/telemetry` | `@meeting-stt/telemetry` | (이 브랜치 전용) 사용 정보 계약 — 이벤트 이름·payload 타입, envelope, 회의 스냅샷, 수집 서버 HTTP 규약                                |

- 의존 방향은 `apps/* → packages/*` 한 방향. 패키지는 앱·다른 패키지를 import하지 않고 `electron`·`fs`·DOM도 쓰지 않는다.
- 두 앱이 같은 값·같은 알고리즘을 써야 하면 `packages/*`로 올린다. 런타임 API를 만지면 앱에 남긴다.
- 상세 규약(패키지 형태, 스크립트, 새 워크스페이스 추가, 함정)은 `.claude/skills/meeting-stt-dev/references/monorepo.md`.

## 도구 체인

- 패키지 매니저 / 스크립트 러너: **pnpm 10** (`packageManager` 필드 고정). bun / npm / yarn 명령은 쓰지 않는다.
- 런타임: Node 22+. Electron main/preload는 Node에서 실행된다.
- 단위 테스트: **vitest** (루트 `pnpm test` = `pnpm -r run test`), TS 스크립트 실행: **tsx** (`pnpm --filter meeting-stt exec tsx scripts/<name>.ts`).

## 자주 쓰는 명령

루트에서 실행한다. 데스크탑 앱 스크립트는 루트가 `--filter`로 위임만 하고, 정의는 각 워크스페이스의 `package.json`에 있다.

```bash
pnpm install        # 워크스페이스 전체 설치 (apps/desktop postinstall에서 electron-builder install-app-deps)
pnpm dev            # 데스크탑 개발 모드 (electron-vite dev)
pnpm dev:web        # 브라우저 프로토타입 개발 서버 (5180)
pnpm test           # 모든 워크스페이스 vitest
pnpm typecheck      # 모든 워크스페이스 tsc
pnpm lint           # 루트 eslint 하나가 저장소 전체
pnpm build          # 데스크탑 타입체크 + electron-vite build
pnpm build:web      # 브라우저 프로토타입 정적 빌드 (apps/web/dist)
pnpm dev:stack      # 수집 서버 + 데스크탑을 한 번에 (이 브랜치 개발 환경, 토큰 자동 생성)
pnpm collector:inspect  # 로컬 수집 서버가 받은 데이터 요약
pnpm collector:smoke <주소>  # 배포 서버 확인 (COLLECTOR_SMOKE_TOKEN 필요). 배포 절차는 apps/collector/README.md
pnpm build:mac      # macOS 패키징 (apps/desktop/dist)
```

특정 워크스페이스에 직접: `pnpm --filter meeting-stt run <script>`, `pnpm --filter @meeting-stt/web run <script>`.

## pnpm 관련 규칙

- pnpm 10은 의존성의 install/postinstall 스크립트를 기본 차단한다. 네이티브 애드온이나 바이너리를 내려받는 패키지(`electron`, `esbuild`, `electron-winstaller`, `better-sqlite3` 등)를 추가하면 **워크스페이스 루트** `package.json`의 `pnpm.onlyBuiltDependencies`에 반드시 등록한다 (앱 `package.json`에 적으면 무시된다). `pnpm install` 로그에 "Ignored build scripts" 경고가 보이면 누락된 것이다.
- `.npmrc`의 `node-linker=hoisted`, `shamefully-hoist=true`는 electron-builder 패키징과 네이티브 리빌드를 위한 설정이므로 제거하지 않는다.
- `package.json` scripts 내부에서 다른 스크립트를 부를 때는 `pnpm run <script>`를, 다른 워크스페이스를 부를 때는 `pnpm --filter <패키지> run <script>`를 쓴다.
- 런타임 의존성은 그것을 import하는 워크스페이스에 넣는다. 루트에는 저장소 전체 도구(prettier, eslint, typescript, vitest)만 둔다.
- 잠금 파일은 `pnpm-lock.yaml` 하나만 유지한다 (`bun.lock`, `package-lock.json`, `yarn.lock` 생성 금지).

## 코드 규칙 (요약)

- 데스크탑 앱 안에서는 `src/main`(Node) / `src/preload`(contextBridge) / `src/renderer`(브라우저) / `src/shared`(순수 TS) 경계를 지킨다. renderer에서 `fs`, `child_process`, `better-sqlite3` import 금지.
- 문서·규칙의 `src/…`, `scripts/…`, `resources/…` 경로는 `apps/desktop/` 기준이다. 웹 앱은 `apps/web/` 접두어를 적는다.
- 무거운 작업(spawn, 파일 IO, DB)은 main 프로세스에서만. renderer는 IPC로 요청·진행률 수신만.
- UI 문구·문서·커밋 메시지는 한국어, 코드 식별자는 영어.
