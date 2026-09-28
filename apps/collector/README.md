# @meeting-stt/collector

`test/usage-analytics` 브랜치 전용 사용 정보·회의 내용 수집 서버. Hono + `@hono/node-server`, 저장소는 Node 내장 `node:sqlite`.
계약(경로·본문·응답)은 `packages/telemetry`와 `.claude/skills/meeting-stt-dev/references/telemetry.md` "전송 계약"·"수집 서버" 절이 정본이다.

```bash
cp apps/collector/.env.example apps/collector/.env   # 팀 토큰 채우기 (openssl rand -hex 32)
pnpm dev:collector                                   # 저장소 루트에서, 파일 변경 시 재시작
pnpm start:collector
```

| 경로                                          | 무엇                                                               |
| --------------------------------------------- | ------------------------------------------------------------------ |
| `GET /health`                                 | 토큰 없이 상태 확인                                                |
| `POST /v1/events`                             | 이벤트 묶음. 이벤트 id로 중복 제거                                 |
| `PUT /v1/meetings/{installId}/{meetingId}`    | 회의 스냅샷 최신본 저장 (`sentAt`이 옛것이면 무시)                 |
| `DELETE /v1/meetings/{installId}/{meetingId}` | 삭제 시각만 표시                                                   |
| `PUT /v1/recordings/{installId}/{meetingId}`  | `Content-Range` 조각 이어 올리기, 어긋나면 `409 { receivedBytes }` |

데이터는 `COLLECTOR_DATA_DIR`(기본 `./data`) 아래 `collector.sqlite`와 `recordings/<teamId>/<installId>/<meetingId>.wav`.
조회 API는 없다 — `sqlite3 data/collector.sqlite`로 직접 연다. TLS는 앞단 프록시가 맡는다.
