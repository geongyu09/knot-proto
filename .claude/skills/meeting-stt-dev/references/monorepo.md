# 모노레포: 워크스페이스 경계와 관리 규약

pnpm 워크스페이스 하나에 데스크탑 앱·브라우저 프로토타입·공용 패키지를 함께 둔다.
두 앱이 **같은 파이프라인**(정규화 → VAD → STT → 화자 분리 → 병합)을 서로 다른 런타임에서 돌리기 때문에,
같은 이유로 함께 바뀌는 코드(병합 알고리즘, 복사 포맷, 정규화 상수, 모델 카탈로그)를 패키지로 뽑아 **한 번만 정의**한다.

분리 전에는 `web/src/ported/merge.ts`·`format.ts`가 `src/shared/*`의 **바이트 단위 복사본**이었고,
참석자 수 범위(1~20)와 16kHz·mono·16bit 형식 상수도 양쪽에 따로 적혀 있었다. 한쪽만 고치면 조용히 갈라진다.

## 구성

| 워크스페이스 | 패키지 이름 | 런타임 | 역할 |
| --- | --- | --- | --- |
| `apps/desktop` | `meeting-stt` | Electron (Node + Chromium) | 제품 앱. 녹음 → 파이프라인 → SQLite → UI → 패키징 |
| `apps/web` | `@meeting-stt/web` | 브라우저 (WebGPU/WASM) | 브라우저 추론 프로토타입 (`docs/browser-prototype-plan.md`) |
| `packages/core` | `@meeting-stt/core` | 순수 TS (런타임 의존 없음) | 파이프라인 중간 산출물 타입, 화자 배정·발화 병합, 화자 재군집(조각 분할·k-means·중심 병합), 복사 포맷, 음량 정규화 공식, 참석자 수 규칙, 오디오 형식 상수, 용어 읽기 사전 |
| `packages/models` | `@meeting-stt/models` | 순수 TS (데이터) | 모델 카탈로그 SSOT. 데스크탑 자산(URL·sha256·용량)과 웹 저장소 id·dtype |
| `apps/collector` (`test/usage-analytics` 전용) | `@meeting-stt/collector` | Node 22 서버 (Hono + `node:sqlite`) | 사용 정보·회의 내용 수집 서버. 팀 토큰 검증, 이벤트·스냅샷·녹음 파일 수신 (`telemetry.md`) |
| `packages/telemetry` (`test/usage-analytics` 전용) | `@meeting-stt/telemetry` | 순수 TS | 데스크탑(보내는 쪽)과 수집 서버(받는 쪽)가 공유하는 이벤트 이름·payload 타입·envelope 스키마 |
| `packages/design` | `@meeting-stt/design` | CSS + 글꼴 파일 (런타임 코드 없음) | 디자인 토큰(`base.css`)과 동봉 글꼴(`fonts.css`, `fonts/`) SSOT. 두 앱이 같은 "여백" 화면을 그린다 |

- **의존 방향은 한 방향**이다: `apps/* → packages/*`. 패키지가 앱을 import하지 않고, 패키지끼리도 의존하지 않는다.
  (`models`는 `core`를 import하지 않는다 — 모델 카탈로그는 파이프라인 로직을 모른다.)
- 앱끼리도 import하지 않는다. 데스크탑이 웹 코드를, 웹이 데스크탑 코드를 가져다 쓰는 일이 필요해지면
  그건 `packages/`로 올릴 신호다.
- `packages/*`는 **electron·fs·DOM·AudioContext를 일절 import하지 않는다.** 순수 TS만 두므로 Node와 브라우저,
  main과 renderer, vitest에서 모두 같은 파일이 돈다.

## 무엇을 패키지로 올리고 무엇을 앱에 남기나

올린다:

- 두 앱이 **같은 숫자·같은 알고리즘**을 써야 하는 것. 정규화 목표 음량(−20 dBFS), 게인 상한(+30dB),
  참석자 수 범위, 16kHz·mono·16bit, 화자 배정 규칙, 발화 병합 규칙, 복사용 텍스트 모양.
- 모델의 **정체**(어느 저장소·어느 양자화·어느 체크섬). 모델을 바꾸는 결정은 한 곳에서 내려야 한다.

앱에 남긴다:

- 런타임 API를 만지는 코드. WAV 파일 읽기/쓰기(`fs`), `AudioContext`·`decodeAudioData`, 워커 생성,
  `child_process.spawn`, `better-sqlite3`, `transformers.js` 호출.
- 그 앱에만 있는 개념. IPC 채널(`src/shared/ipc.ts`), 회의·설정 같은 제품 타입, 진행률 가중치,
  워커 메시지 계약, 녹음 청크 크기(데스크탑 8192 / 웹 2048 — 의도적으로 다르다).

같은 알고리즘이지만 데이터 타입이 달라 코드를 공유할 수 없을 때는 **공식과 상수만 올린다.**
음량 정규화가 그 예다 — 데스크탑은 `Int16Array`(WAV 버퍼), 웹은 `Float32Array`(디코딩 결과)를 제자리에서 고치므로
루프는 각자 갖고, `packages/core/src/normalize.ts`의 프레임 RMS 분위수·게인 계산만 공유한다.
타입 하나로 억지로 합치면 71분 273MB 배열을 도는 루프가 다형(polymorphic)이 되고 복사본이 생긴다.

## 디자인 패키지 (`packages/design`, 2026-09-24)

두 앱이 같은 디자인 시스템("여백", `references/architecture.md` "화면 디자인")을 쓰기로 해서(사용자 결정) **토큰 값과 글꼴 파일**을 패키지로 올렸다.
글꼴만 7MB라 앱마다 복사하면 저장소에 두 벌이 쌓이고, 토큰 값을 한쪽만 고치면 조용히 갈라진다.

- 내용물은 CSS와 글꼴뿐이다: `src/base.css`(`:root` 토큰 + 전역 리셋), `src/fonts.css`(`@font-face`), `src/fonts/<글꼴>/`(원본 파일 + `OFL.txt`).
  exports는 `{ "./*.css": "./src/*.css" }`이고 앱의 진입 CSS가 `@import '@meeting-stt/design/fonts.css'`, `@import '@meeting-stt/design/base.css'`로 가져온다.
  `fonts.css`의 `url('./fonts/…')`는 번들러(vite/electron-vite)가 패키지 파일 기준으로 풀어 앱 산출물에 자산으로 복사한다.
- **React 컴포넌트는 패키지로 올리지 않는다.** 패키지는 `react`를 import하지 않는다는 경계(위 구성)를 지키고, 앱마다 레이어 규칙도 다르다.
  대신 컴포넌트의 **계약**(변형·props·동작)은 `architecture.md` "공통 컴포넌트" 표 하나이고, 두 앱이 그 계약대로 각자 구현한다
  (데스크탑 `shared/components/primitives/ui/*`, 웹 `apps/web/src/components/*`). 계약을 바꾸면 두 구현을 같이 고친다.
- 앱 전용 레이아웃 치수(데스크탑의 사이드바 폭·상단 바 높이·레일 폭)는 패키지에 두지 않고 그 앱의 CSS에 둔다.
- 토큰이 올바른지는 `src/tokens.test.ts`가 본다 — 계약 표의 변수가 모두 정의돼 있는지, `fonts.css`가 가리키는 파일이 전부 있는지.
  파일 자체를 검사하는 테스트라 이 테스트만 `node:fs`로 읽는다 (vitest는 `?raw` CSS를 빈 문자열로 만든다). 패키지 본체는 여전히 `fs`를 쓰지 않는다.

## 패키지 형태 — 빌드 단계 없음

`packages/*`는 **TS 소스를 그대로 노출**한다. 빌드·watch·`dist` 없이 앱의 번들러(vite/electron-vite)와
`tsx`, `vitest`가 소스를 직접 읽는다. 내부 전용(`private: true`)이라 배포 산출물이 필요 없고,
빌드 단계를 두면 "패키지를 고쳤는데 앱에 반영이 안 된다"는 함정이 생긴다.

```json
{
  "name": "@meeting-stt/core",
  "private": true,
  "type": "module",
  "exports": { "./*": "./src/*.ts" }
}
```

- 서브패스 와일드카드라 파일 하나가 모듈 하나다: `@meeting-stt/core/merge` → `packages/core/src/merge.ts`.
  배럴(`index.ts`)을 두지 않는 이유는 `src/shared`·`src/main`과 같다 — 역할별 플랫 파일에 경로가 곧 이름이다
  (`.claude/rules/general-code-convention.md`).
- 앱은 `"@meeting-stt/core": "workspace:*"`를 **devDependencies**에 적는다. `moduleResolution: bundler`라 `exports`가
  그대로 해석되므로 tsconfig에 `paths` 별칭을 따로 만들지 않는다. devDependencies인 이유는 번들러(electron-vite/vite)가
  소스를 **인라인**하므로 런타임 의존성이 아니고, `dependencies`에 두면 electron-builder가 TS 소스 디렉터리를
  app.asar에 복사하려 하기 때문이다 (`references/distribution.md`).
- 테스트는 코드와 같이 산다. `packages/core/src/merge.test.ts`가 `pnpm -r test`에서 자기 패키지의 vitest로 돌아간다.

## 스크립트 규약

| 실행할 것 | 명령 |
| --- | --- |
| 전체 검사 | `pnpm lint`, `pnpm typecheck`, `pnpm test` (루트에서 워크스페이스 전체) |
| 데스크탑 앱 | `pnpm dev`, `pnpm build`, `pnpm build:mac` (루트 위임 스크립트) |
| 브라우저 프로토타입 | `pnpm dev:web`, `pnpm build:web` |
| 특정 워크스페이스에 직접 | `pnpm --filter meeting-stt run <script>`, `pnpm --filter @meeting-stt/web run <script>` |

- **스크립트의 정의는 그 워크스페이스의 `package.json`에 있고, 루트는 위임만 한다.** 루트에서 `electron-vite`나
  `vite`를 직접 부르지 않는다 — 실행 디렉터리가 달라지면 설정 파일·상대 경로가 전부 어긋난다.
- `typecheck`·`test`는 `pnpm -r run <script>`로 모든 워크스페이스를 돈다. 새 패키지에는 두 스크립트를 반드시 넣는다
  (없으면 조용히 건너뛴다).
- `lint`·`format`은 루트 하나(`eslint.config.mjs`, `.prettierrc.yaml`)가 저장소 전체를 본다. 패키지마다 만들지 않는다.
- 루트에 `tsx`로 도는 스크립트를 두지 않는다. Phase 1 검증 스크립트는 데스크탑 앱 것이므로
  `apps/desktop/scripts/`에 있고 `pnpm --filter meeting-stt exec tsx scripts/<name>.ts`로 돌린다.

## 의존성 추가 규칙

- 런타임 의존성은 **그것을 실제로 import하는 워크스페이스**에 넣는다. 루트 `package.json`에는 저장소 전체 도구
  (prettier, eslint, typescript, vitest 등)만 둔다.
- 네이티브 애드온·바이너리를 내려받는 패키지는 루트 `package.json`의 `pnpm.onlyBuiltDependencies`에 등록한다.
  이 필드는 **워크스페이스 루트에서만** 읽힌다 (`apps/desktop/package.json`에 적어도 무시된다).
- `.npmrc`의 `node-linker=hoisted`·`shamefully-hoist=true`는 electron-builder 패키징과 네이티브 리빌드를 위한 설정이다.
  워크스페이스가 늘어도 유지한다.
- 잠금 파일은 루트의 `pnpm-lock.yaml` 하나뿐이다.

## 새 워크스페이스를 추가할 때

1. `apps/<name>` 또는 `packages/<name>` 디렉터리를 만든다 (`pnpm-workspace.yaml`은 `apps/*`·`packages/*` 글롭이라 수정 불필요).
2. `package.json`에 `private: true`, 패키지 이름(`@meeting-stt/<name>`, 앱은 제품 이름), `typecheck`·`test` 스크립트를 넣는다.
3. 이 문서의 구성 표와 `.claude/rules/project-structure.md`의 폴더 구조에 한 줄 추가한다.
4. 필요하면 루트 `package.json`에 위임 스크립트를 넣는다.

## 함정

- **electron-builder는 앱 워크스페이스에서 돌려야 한다.** `postinstall`의 `electron-builder install-app-deps`와
  패키징 명령은 `apps/desktop`이 실행 디렉터리다. 루트에서 부르면 `electron-builder.yml`도, `build/` 리소스도 못 찾는다.
- **`apps/desktop`의 `electron` 버전은 범위가 아니라 정확한 버전으로 적는다.** `node-linker=hoisted`라 `electron`이
  루트 `node_modules`에 설치되고, electron-builder가 앱 디렉터리에서 버전을 계산하지 못해
  `⨯ Electron version "^39.2.6" is a range, not a fixed version`으로 설치가 실패한다 (`references/distribution.md`).
- **Vercel 배포는 저장소 루트를 프로젝트 루트로 쓴다.** `vercel.json`이 루트에 있고
  `buildCommand`는 `pnpm --filter @meeting-stt/web run build`, `outputDirectory`는 `apps/web/dist`다.
  워크스페이스 이름을 바꾸면 이 두 줄을 같이 고쳐야 한다.
- **CI는 루트에서 설치하고 앱 워크스페이스에서 패키징한다.** 산출물 경로도 `apps/desktop/dist/`다
  (`.github/workflows/build.yml`).
- **패키지를 고치면 두 앱이 같이 바뀐다.** `packages/core`를 건드리는 변경은 데스크탑 테스트와 웹 테스트를
  모두 돌려 확인한다 (`pnpm test`가 전부 돈다).
- **`pnpm -r`은 스크립트가 없는 워크스페이스를 조용히 건너뛴다.** 새 패키지에 `typecheck`·`test`를 빼놓으면
  검사에서 빠진 채로 오래 남는다.

## 전환 확인 (2026-09-22)

모노레포로 옮긴 뒤 다음을 직접 돌려 통과를 확인했다: `pnpm install`(better-sqlite3 Electron ABI 리빌드 포함),
`pnpm lint`, `pnpm typecheck`(4개 워크스페이스), `pnpm test`(core 38 · models 4 · web 44 · desktop 171 = 257개),
`pnpm build`(electron-vite → `apps/desktop/out`), `pnpm build:web`(→ `apps/web/dist`),
`pnpm build:unpack`(electron-builder 패키징·서명까지),
그리고 `pnpm --filter meeting-stt exec tsx`로 워크스페이스 패키지를 불러오는 스크립트 경로.
패키징된 app.asar에 `@meeting-stt/*`가 들어가지 않고 공용 로직이 `out/main/index.js`에 인라인된 것도 확인했다.

## 이전 문서의 경로를 읽는 법

모노레포 이전에 쓴 기록물(`docs/phase1-results.md`, `docs/phase5-results.md`, `docs/phase3-handoff.md`)의
`src/…`, `scripts/…`, `resources/…`, `dist/…`는 모두 **`apps/desktop/` 기준**이고, `web/src/…`는 `apps/web/src/…`다.
그 안의 `pnpm tsx scripts/<name>.ts`는 지금 `pnpm --filter meeting-stt exec tsx scripts/<name>.ts`로 읽는다.
측정값과 결론은 그대로 유효하므로 경로 때문에 기록을 고쳐 쓰지 않는다.

규칙·아키텍처 문서(`.claude/rules/*.md`, `references/architecture.md`, `references/data-model.md`,
`references/distribution.md`)도 데스크탑 앱을 설명할 때는 `apps/desktop/`을 생략한 상대 경로를 쓴다.
웹 앱을 가리킬 때만 `apps/web/` 접두어를 적는다.
