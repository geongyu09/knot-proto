# @meeting-stt/telemetry

`test/usage-analytics` 브랜치 전용. 데스크탑 앱(보내는 쪽)과 수집 서버(받는 쪽)가 함께 따르는 **계약**만 둔다.
전송·저장 같은 런타임 동작은 각 앱에 있다. 설계는 `.claude/skills/meeting-stt-dev/references/telemetry.md`.

| 모듈                               | 무엇                                                                    |
| ---------------------------------- | ----------------------------------------------------------------------- |
| `@meeting-stt/telemetry/events`    | 이벤트 이름·분류·payload 타입, renderer가 보낼 수 있는 이벤트 허용 목록 |
| `@meeting-stt/telemetry/envelope`  | 전송 단위(`TelemetryEnvelope`)와 props 정리 규칙                        |
| `@meeting-stt/telemetry/snapshot`  | 회의 내용 스냅샷(`MeetingSnapshot`) — 자체 서버 전용                    |
| `@meeting-stt/telemetry/collector` | 수집 서버 HTTP 경로·헤더·녹음 조각 크기·`Content-Range` 규칙            |

새 이벤트는 `events.ts`의 `TelemetryEventMap`과 `EVENT_CATEGORIES`에 먼저 추가하고 호출 지점을 붙인다.
