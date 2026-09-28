# 사용 정보 수집 (`test/usage-analytics` 브랜치 전용)

작성일 2026-09-28. **이 문서는 `test/usage-analytics` 브랜치에만 있다.** `main`의 "서버 없이" 방향과 맞지 않아
브랜치를 나눠 **별개 제품처럼** 실험한다 (사용자 결정). `main`으로 병합하지 않는 것이 전제이며,
병합하려면 이 문서와 SKILL.md 1절 "사용 정보 수집" 행을 다시 결정해야 한다.

이 브랜치에서는 SKILL.md 서두의 "서버 없이"와 4절 "범위 절제"의 "클라우드 동기화 금지"가 **이 문서 범위에 한해** 뒤집힌다.
STT·화자 분리·요약 파이프라인 자체는 그대로 로컬이다 — 서버는 추론을 하지 않고 **수집만** 한다.

## 결정 요약 (2026-09-28 사용자 결정)

| 항목 | 결정 |
| --- | --- |
| 수집 대상 | ① 기능 사용 이벤트 ② 파이프라인 성능 지표 ③ 오류·크래시 ④ 설정·환경 ⑤ **회의 내용**(전사 발화, 요약, 화자 이름, 녹음 WAV) |
| 전송처 | **자체 수집 서버가 기본(주 저장소)**. 외부 분석 서비스는 보조로 **함께** 붙인다 ("혹시 몰라") |
| 외부 분석 서비스 | **PostHog**(사용 이벤트·성능·환경) + **Sentry**(오류·크래시) (2026-09-28 사용자 결정). PostHog는 SDK 없이 `/batch/` HTTP로, Sentry는 `@sentry/electron`(main만)으로 붙인다 |
| 구현 순서 | **데스크탑 먼저** (2026-09-28 사용자 결정). 수집 서버(`apps/collector`)는 아래 "전송 계약"만 확정하고 나중에 만든다 |
| 동의 | **앱 안에서 동의를 받지 않는다.** 동의 UI·끄기 스위치를 만들지 않는다 |
| 전제 | 이 빌드는 **사전에 동의한 팀에게만 배포**한다. 동의는 앱 밖(배포 전 팀 단위 합의)에서 받는다 |

동의 UI가 없는 대신 아래 두 가지로 "동의한 팀만 쓴다"는 전제를 지킨다.

- **빌드 분리**: 이 브랜치의 빌드는 `main` 빌드와 `appId`·`productName`·업데이트 채널이 달라야 한다 (아래 "빌드 분리").
  공개 배포본의 자동 업데이트로 수집 빌드가 흘러들어가는 경로를 원천적으로 막는다.
- **팀 토큰**: 수집 서버는 빌드에 심은 팀 토큰이 없으면 받지 않는다. 팀별로 토큰을 따로 발급해 어느 팀 데이터인지 구분하고,
  동의를 철회한 팀은 토큰을 폐기해 끊는다.

## 수집 항목

| 분류 | 예시 | 전송처 |
| --- | --- | --- |
| 기능 사용 이벤트 | 녹음 시작·정지, 파일 가져오기, 요약·교정 실행, 복사, 화자 이름 변경·병합, 화면 이동, 라이브 받아쓰기 켜기 | 자체 서버 + PostHog |
| 파이프라인 성능 | 회의 길이, 단계별 처리 시간(정규화·STT·화자 분리·병합·교정·요약), 모델, 스레드 수, 조용히 처리 여부, 실패 단계 | 자체 서버 + PostHog |
| 오류·크래시 | spawn 실패·종료 코드, stderr 끝부분, 예외 스택, 재군집 폴백, renderer 크래시, `status='error'` 잡 | 자체 서버 + Sentry |
| 설정·환경 | 앱 버전, macOS 버전, 칩·성능 코어 수·메모리, LLM 공급자, UI 언어, 테마, 녹음본 보관 여부 | 자체 서버 + PostHog |
| 회의 내용 | 발화(화자 라벨·시각·텍스트, 교정 전 원문 포함), 요약, 화자 표시 이름, 용어 사전, 녹음 WAV | **자체 서버만** |

- **회의 내용은 외부 분석 서비스로 보내지 않는다.** 분석 SaaS는 이벤트용이라 긴 텍스트·오디오를 받을 곳이 아니고,
  제3자에게 회의 원문이 넘어가는 경로를 하나 줄인다. 외부로는 이벤트 이름·수치·열거형 값만 간다.
- API 키(Claude·OpenAI)와 같은 비밀값은 설정·환경 수집에서 **항상 뺀다.** 공급자 종류만 보낸다.
- 녹음 WAV는 **원본 삭제(`audio.keep` 꺼짐) 전에** 올린다. 파이프라인 완료 → 업로드 대기열에 등록 → 업로드 성공 뒤 삭제 순서다.
  업로드가 끝나기 전에 앱이 꺼지면 다음 실행 때 이어서 올린다.

## 흐름

```
[main: 이벤트 발생 지점]  ─┐
[renderer: window.api.track] ─┤→ [main telemetry 모듈] → [SQLite outbox] → [전송 워커] ─→ 자체 수집 서버 (전부)
[파이프라인 완료]            ─┘                                               └→ 외부 분석 (이벤트만)
```

- **수집·전송은 main에서만** 한다. renderer는 `window.api.track(event, props)`로 이벤트를 넘기기만 하고 네트워크를 직접 쓰지 않는다
  (renderer에서 무거운 작업·외부 통신을 하지 않는다는 기존 규칙 유지).
- 이벤트는 먼저 **로컬 outbox 테이블**(`data-model.md` "사용 정보 outbox")에 쌓고, 전송 워커가 묶어서 보낸다.
  오프라인·서버 장애에서도 이벤트를 잃지 않고, 앱 동작(녹음·파이프라인)을 네트워크가 막지 않게 하기 위해서다.
- 전송 실패는 지수 백오프로 재시도하고, 성공한 행만 outbox에서 지운다. **전송 실패가 사용자 작업을 실패시키지 않는다.**
- 녹음 WAV는 이벤트와 다른 경로로 **파일 단위 업로드**(청크·이어 올리기)를 한다. 수백 MB일 수 있어 이벤트 묶음에 섞지 않는다.
- 외부 분석 서비스는 `src/main/telemetry/sinks/*` 어댑터 하나로 감싼다. 자체 서버 어댑터와 같은 인터페이스를 쓰고,
  외부 어댑터가 실패해도 자체 서버 전송에는 영향이 없다.

## 싱크별 규칙

- **outbox 행은 싱크마다 따로 만든다** (`telemetry_outbox.sink`). 같은 이벤트라도 자체 서버 행과 PostHog 행이 따로 있어
  한쪽의 재시도·실패가 다른 쪽을 막지 않는다. 싱크 설정값(URL·키)이 빌드에 없으면 그 싱크의 행은 만들지 않는다.
- **PostHog**: 이벤트 분류가 오류가 아닌 것만 보낸다. `distinct_id`는 설치 id, `$process_person_profile: false`로 사람 프로필을 만들지 않는다.
- **Sentry**: outbox를 거치지 않는다 — SDK가 자체 오프라인 대기열을 갖고 있고 크래시(minidump)는 앱이 죽은 뒤에 보내야 해서다.
  main에서만 `init`하고 renderer SDK는 쓰지 않는다. renderer의 처리 안 된 오류는 `telemetry:track`으로 main에 넘기고 main이 Sentry에 올린다.
  `sendDefaultPii: false`, 브레드크럼은 `console`·`ui.*`·`http` 분류를 버린다(회의 내용이 섞일 수 있는 경로). 네이티브 크래시는 SDK 기본 minidump 수집을 쓴다.
- **renderer가 보낸 이벤트는 main이 다시 거른다.** 이름은 renderer 허용 목록(`RENDERER_EVENT_NAMES`)에 있어야 하고,
  props 값은 문자열·숫자·불리언만, 문자열은 `TELEMETRY_PROP_MAX_LENGTH`(80자) 이하만 남긴다 — 긴 문자열 슬롯으로 회의 내용이 새지 않게 한다.

## 전송 계약 (HTTP, `packages/telemetry/src/collector.ts`)

수집 서버가 아직 없으므로 데스크탑이 따르는 계약을 먼저 정한다. 서버는 이 계약대로 만든다.

| 요청 | 본문 | 응답 |
| --- | --- | --- |
| `POST /v1/events` | `EventBatch { events: TelemetryEnvelope[] }` | `2xx`면 묶음 전체 성공 |
| `PUT /v1/meetings/{installId}/{meetingId}` | `MeetingSnapshot` (JSON) | `2xx`면 최신본으로 덮어씀 |
| `DELETE /v1/meetings/{installId}/{meetingId}` | 없음 | 사용자가 앱에서 회의를 지웠을 때. 서버 보관분 처리는 서버 정책(미결) |
| `PUT /v1/recordings/{installId}/{meetingId}` | WAV 바이트 조각, 헤더 `Content-Range: bytes {start}-{end}/{total}` | `200 { receivedBytes }`. 서버가 가진 바이트 수와 `start`가 다르면 `409 { receivedBytes }` → 앱이 그 위치부터 다시 보낸다 |

- 모든 요청에 `Authorization: Bearer {팀 토큰}`. `401`·`403`은 토큰이 폐기된 것이므로 재시도 간격을 최대로 둔다(행은 지우지 않는다).
- 응답에 따른 outbox 처리: `2xx` → 행 삭제. `401`·`403` → 위와 같이 최대 간격으로 미룸. `408`·`409`(녹음 제외)·`429`·`5xx`·네트워크 오류 → 지수 백오프로 재시도.
  **그 밖의 `4xx`(`400` 본문 모양 오류 등)는 재시도해도 결과가 같으므로 행을 버리고 경고 로그를 남긴다** — 버리지 않으면 영원히 재시도한다.
  서버는 긴 문자열을 거절하지 않고 서버 상한으로 잘라 저장하므로, 정상 이벤트가 `400`으로 버려지는 경로는 계약 불일치뿐이다.
- 녹음 조각 크기는 `RECORDING_CHUNK_BYTES`(8MB). 업로드 진행은 조각마다 `telemetry_uploads.uploaded_bytes`에 기록한다.
- 회의 스냅샷은 **보낼 때** DB에서 만든다 (outbox에는 `meetingId`만 둔다). 편집이 여러 번 일어나도 대기 중인 스냅샷 행은 회의당 하나이고,
  항상 최신 내용이 간다. 그사이 회의가 지워졌으면 행을 버린다.

## 빌드 주입 값

electron-vite의 `MAIN_VITE_*` 환경 변수(빌드 시 `import.meta.env`로 치환, `apps/desktop/.env.local` 또는 CI 비밀값)로 넣는다. 저장소에는 `.env.example`만 둔다.

| 변수 | 무엇 | 없으면 |
| --- | --- | --- |
| `MAIN_VITE_COLLECTOR_URL` | 수집 서버 주소 (`https://…`) | 자체 서버 싱크 끔, 녹음 업로드 안 함(원본 삭제는 기존 규칙대로) |
| `MAIN_VITE_COLLECTOR_TEAM_TOKEN` | 팀 토큰 | 위와 같음 |
| `MAIN_VITE_POSTHOG_KEY`, `MAIN_VITE_POSTHOG_HOST` | PostHog 프로젝트 키·호스트 (기본 `https://us.i.posthog.com`) | PostHog 싱크 끔 |
| `MAIN_VITE_SENTRY_DSN` | Sentry DSN | Sentry 끔 |

값이 없으면 그 싱크만 조용히 꺼진다 — 개발 중 `pnpm dev`가 아무 설정 없이도 돌아야 하기 때문이다. 시작 로그에 켜진 싱크를 남긴다.

## 데스크탑 구현 배치 (2026-09-28)

| 파일 (`apps/desktop/src/…`) | 역할 |
| --- | --- |
| `main/telemetry/track.ts` | 수집 입구. `track()`·`trackMeetingSnapshot()`·`trackMeetingDeleted()`·`trackMeetingEdit()` — outbox에 넣고 바로 돌아온다 |
| `main/telemetry/worker.ts` | 15초마다 싱크별 outbox를 묶어 보낸다(최대 100건). 녹음 업로드는 따로 돈다 |
| `main/telemetry/upload.ts` | 녹음 이어 올리기와 업로드 뒤 원본 삭제 |
| `main/telemetry/sinks/{collector,posthog}.ts` | 싱크 어댑터 |
| `main/telemetry/sentry.ts`, `sentryPolicy.ts` | Sentry 초기화와 회의 내용 차단 규칙 |
| `main/telemetry/stageTimer.ts`, `pipeline.ts` | 진행률 보고 시각으로 단계별 처리 시간을 잰다 — 파이프라인 코드에 타이머를 심지 않는다 |
| `main/db/telemetry.ts` | outbox·업로드 테이블 |
| `renderer/src/shared/api/telemetry` | `trackApi()` — 실패해도 던지지 않는다 |
| `renderer/src/shared/hooks/domain/telemetry/useScreenTracking` | 메인 창 화면 이동(`PATHS` 키 이름만, 회의 id 없음) |
| `renderer/src/shared/utils/rendererErrorReporter` | 처리 안 된 오류·거부를 main으로 넘긴다 |

- 호출 지점: 녹음 시작·정지·가져오기·라이브 받아쓰기·시스템 오디오 토글, 회의 이름·삭제·다시 인식·녹음 내보내기, 발화 편집·재배정·교정 되돌리기,
  화자 이름·병합, 설정 변경(바뀐 **키 이름만**), LLM 공급자·용어 사전 저장은 IPC 핸들러에서, 파이프라인·요약·교정 완료·실패는 큐에서, 복사·화면 이동·renderer 오류는 renderer에서 남긴다.
- 개발 모드도 `productName`(`meeting-stt-team`)을 따라 userData가 `~/Library/Application Support/meeting-stt-team`으로 갈라진다.
  공개 빌드에서 받은 모델은 보이지 않으므로 처음 실행하면 온보딩이 다시 뜬다 (모델 폴더를 symlink하면 건너뛸 수 있다).

## 식별자

- **설치 id**: 첫 실행 때 만드는 UUID(`settings` 키 `telemetry.installId`). 기기·사용자 계정 정보에서 파생하지 않는다.
- **팀 토큰**: 빌드 시 주입(환경 변수 → electron-vite `define`). 코드·저장소에 커밋하지 않는다.
- 회의 내용은 로컬 `meetings.id`와 설치 id를 묶어 서버에서 회의 단위로 모은다. 다시 인식·교정·화자 이름 변경처럼
  내용이 바뀌면 **바뀐 회의 스냅샷을 다시 보낸다**(서버는 최신본으로 덮어쓰고 이력은 이벤트로 남는다).

## 워크스페이스 배치

| 경로 | 무엇 |
| --- | --- |
| `apps/desktop/src/main/telemetry/` | 이벤트 수집, outbox, 전송 워커, 싱크 어댑터(자체 서버·외부 분석) |
| `apps/collector` (신규) | 자체 수집 서버. 이벤트·회의 스냅샷·녹음 파일 수신과 저장, 팀 토큰 검증 |
| `packages/telemetry` (신규) | 두 앱이 공유하는 **이벤트 이름·payload 타입·envelope 스키마**. 순수 TS |

- 이벤트 스키마를 패키지로 올리는 이유는 데스크탑(보내는 쪽)과 수집 서버(받는 쪽)가 **같은 계약**을 써야 하기 때문이다
  (`monorepo.md`의 "두 앱이 같은 값을 써야 하면 packages로" 규칙).
- 새 이벤트를 추가할 때는 `packages/telemetry`에 이름·payload 타입을 먼저 정의하고, 그다음 호출 지점을 붙인다.

## 빌드 분리

- `electron-builder.yml`의 `appId`·`productName`을 `main`과 다르게 둔다 → `userData`도 갈라져 공개 빌드의 회의 DB와 섞이지 않는다.
- 자동 업데이트(`publish.url`)는 공개 채널과 다른 곳을 가리키거나 끈다.
- 앱 정보 화면에 "팀 테스트 빌드 — 사용 정보·회의 내용이 수집 서버로 전송됩니다"를 적는다. 동의 UI는 아니고,
  이 빌드가 공개 빌드가 아니라는 표시다.

## 수집 서버 (`apps/collector`, 2026-09-28 결정)

| 항목 | 결정 | 이유 |
| --- | --- | --- |
| HTTP 프레임워크 | **Hono** + `@hono/node-server` (사용자 지정) | 가볍고 `app.request()`로 서버를 띄우지 않고 라우트를 테스트할 수 있다 |
| 런타임 | Node 22+ (`tsx`로 실행, 별도 번들 없음) | 저장소의 다른 도구와 같은 런타임 |
| 이벤트·스냅샷 저장소 | **`node:sqlite`** (Node 내장, 파일 하나) | `better-sqlite3`는 데스크탑 postinstall이 Electron ABI로 리빌드해 같은 호이스팅 `node_modules`의 Node 서버에서 `NODE_MODULE_VERSION` 오류가 난다(`pitfalls.md`). 내장 모듈이라 네이티브 빌드가 없다. 규모가 커지면 Postgres로 옮긴다 |
| 녹음 파일 저장소 | 서버 로컬 디스크 `<dataDir>/recordings/<teamId>/<installId>/<meetingId>.wav` | 올리는 중에는 `.part`, 다 받으면 이름을 바꾼다 |
| 팀 토큰 | 환경 변수 `COLLECTOR_TEAM_TOKENS="teamId:token,…"`. 요청은 `Authorization: Bearer <token>` | 저장소에 커밋하지 않는다. 폐기는 목록에서 지우고 재시작. 비교는 해시 후 `timingSafeEqual` |

- API 경로·본문·응답은 위 "전송 계약"을 그대로 따른다 (계약은 데스크탑 쪽에서 먼저 정했다). 서버 쪽 추가 규칙:
  - 설치 id는 경로(`{installId}`)로 받고, 녹음은 `<dataDir>/recordings/<teamId>/<installId>/<meetingId>.wav`에 둔다.
  - 이벤트는 envelope의 id로 중복 제거한다 — outbox 재시도가 같은 묶음을 다시 보내도 한 번만 저장한다.
    이벤트 이름은 모르는 것도 저장한다(데스크탑이 서버보다 새 버전일 수 있다). 대신 `category`는 네 값 중 하나여야 한다.
  - props의 긴 문자열은 거절하지 않고 2000자로 잘라 저장한다. 거절하면 outbox가 같은 묶음을 영원히 재시도한다.
    모양 자체가 틀린 본문(필드 누락·타입 오류)은 `400 { error }` — 재시도해도 결과가 같다.
  - 스냅샷의 `sentAt`이 저장본보다 오래되면 덮어쓰지 않고 `200 { isApplied: false }`를 준다 (늦게 도착한 재전송).
    경로의 `installId`·`meetingId`와 본문 값이 다르면 `400`.
  - `DELETE /v1/meetings/…`는 행을 지우지 않고 `deleted_at`만 찍는다 (보관 기간·삭제 절차 미결).
  - 크기 제한: 이벤트 묶음 2MB, 스냅샷 20MB, 녹음 조각 16MB, 녹음 전체 2GB. 넘으면 `413`.
  - 같은 회의 녹음에 조각이 동시에 오면 뒤에 온 것은 `409 { receivedBytes }`로 돌려보낸다.
    `Content-Range`의 `total`이 처음 받은 값과 다르면(파일이 바뀜) 처음부터 다시 받는다 — `start`가 0이면 기존 파일을 버리고 새로 받고(완료된 녹음도 교체),
    0이 아니면 `409 { receivedBytes: 0 }`으로 0부터 보내게 한다. 데스크탑의 "409면 그 위치부터 다시" 규칙과 맞물려 무한 반복 없이 풀린다.
  - 서버는 받은 데이터를 앱으로 돌려주지 않는다 (조회 API 없음). 조회는 SQLite 파일을 직접 연다.

## 환경 (개발·배포, 2026-09-28 결정)

| 환경 | 수집 서버 | 데스크탑 | 확인 방법 |
| --- | --- | --- | --- |
| **개발** | `pnpm dev:stack` 하나로 로컬 서버(`tsx watch`, `127.0.0.1:8787`, 데이터 `apps/collector/data/dev`)와 데스크탑(`electron-vite dev`)을 함께 띄운다 | 스크립트가 `MAIN_VITE_COLLECTOR_URL`·`MAIN_VITE_COLLECTOR_TEAM_TOKEN`을 **프로세스 환경 변수로 주입**한다 (Vite `loadEnv`가 process.env의 `MAIN_VITE_*`를 합친다) | 한 터미널에 `[collector]`·`[desktop]` 접두어로 로그가 섞여 나오고, 서버는 받을 때마다 "이벤트 n개 저장"처럼 한 줄 남긴다. 받은 내용은 `pnpm collector:inspect` |
| **배포** | Docker 이미지(`apps/collector/Dockerfile`, esbuild 번들 한 파일 + `node:22-alpine`, 런타임 `node_modules` 없음) + `apps/collector/deploy/compose.yaml`(수집 서버 + **Caddy** 자동 HTTPS). 호스트에 Docker만 있으면 된다 | `apps/desktop/.env.production.local`(git 제외)에 배포 주소·팀 토큰을 적고 `pnpm build:mac` | `pnpm collector:smoke <주소>` — 이벤트·스냅샷·녹음 두 조각을 보내 응답을 확인 |

- **개발 팀 토큰은 `dev:stack`이 실행마다 무작위로 만든다.** 저장소에 토큰 파일을 두지 않고, 서버·데스크탑 양쪽에 같은 값을 넣는다. 팀 id는 `dev`.
- 이 브랜치 데스크탑은 `productName`이 `meeting-stt-team`이라 개발 실행도 `~/Library/Application Support/meeting-stt-team`을 쓴다 — 공개 빌드의 회의 DB와 섞이지 않는다.
  대신 모델이 없어 온보딩이 수 GB를 다시 받으므로, `dev:stack`은 팀 쪽 `models`가 없고 공개 쪽 `meeting-stt/models`가 있으면 **심볼릭 링크**로 이어 준다 (모델 파일은 읽기만 한다).
- 서버를 따로 띄울 때(`pnpm dev:collector`)는 `apps/collector/.env`를 읽는다. 셸에 이미 있는 변수가 `.env`보다 우선한다.
- 배포 설정은 `apps/collector/deploy/.env`(git 제외)에 `COLLECTOR_DOMAIN`·`COLLECTOR_TEAM_TOKENS`를 둔다. `COLLECTOR_DOMAIN=localhost`로 두면 같은 구성을 로컬에서 자체 서명 HTTPS로 돌려 볼 수 있다.
- 수집 서버 컨테이너는 포트를 밖에 열지 않고 Caddy만 80·443을 연다. 데이터(SQLite·녹음)는 이름 있는 볼륨 `collector-data`에 둔다.
- 스모크 테스트는 설치 id `00000000-0000-4000-8000-000000000000`(스모크 전용)로 보낸다 — 운영 데이터에서 이 id를 걸러 낸다.

## 정하지 않은 것 (구현 전에 결정)

- 수집 서버를 올릴 호스트와 도메인. 배포 형태(Docker + Caddy)는 위 "환경" 절에서 정했다.
- 서버 쪽 보관 기간과 팀 탈퇴 시 삭제 절차.
- 수집 서버에 대시보드(조회 화면)를 둘지, 저장만 하고 조회는 다른 도구로 할지.
