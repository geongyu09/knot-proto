# @meeting-stt/collector

`test/usage-analytics` 브랜치 전용 사용 정보·회의 내용 수집 서버. Hono + `@hono/node-server`, 저장소는 Node 내장 `node:sqlite`.
계약(경로·본문·응답)은 `packages/telemetry`와 `.claude/skills/meeting-stt-dev/references/telemetry.md` "전송 계약"·"수집 서버"·"환경" 절이 정본이다.

## 개발 환경 — 서버 + 데스크탑 한 번에

```bash
pnpm dev:stack          # 저장소 루트에서. 로컬 서버(127.0.0.1:8787)가 뜬 뒤 데스크탑 앱을 띄운다
pnpm collector:inspect  # 다른 터미널에서. 받은 이벤트·회의 스냅샷·녹음 요약
```

- 팀 토큰은 실행마다 새로 만들어 두 프로세스에 환경 변수로 넣는다. 설정 파일이 필요 없다.
- 서버 로그에 `[dev] 이벤트 3개 저장 (…)`처럼 받을 때마다 한 줄씩 나온다. Ctrl+C면 둘 다 꺼진다.
- 데이터는 `apps/collector/data/dev`. 지우면 처음부터 다시 쌓인다.
- 데스크탑은 `~/Library/Application Support/meeting-stt-team`을 쓰고(공개 빌드와 분리), 모델은 공개 빌드 폴더에 링크한다.
- 포트를 바꾸려면 `DEV_STACK_COLLECTOR_PORT=8788 pnpm dev:stack`.

서버만 띄울 때는 `apps/collector/.env.example`을 `.env`로 복사해 토큰을 채우고 `pnpm dev:collector`.

## 배포 환경 — Docker + Caddy(HTTPS)

```bash
cd apps/collector/deploy
cp .env.example .env              # COLLECTOR_DOMAIN, COLLECTOR_TEAM_TOKENS (openssl rand -hex 32)
docker compose up -d --build      # 호스트에 Docker만 있으면 된다. 80·443 개방, DNS가 이 서버를 가리켜야 인증서 발급
COLLECTOR_SMOKE_TOKEN=<팀 토큰> pnpm collector:smoke https://<도메인>   # 저장소 루트에서, 계약대로 받는지 확인
```

- 이미지만 만들 때: 저장소 루트에서 `pnpm collector:image` (`meeting-stt-collector`). 이미지에는 esbuild 번들 `index.js` 하나만 있다.
- 로컬에서 배포 구성을 시험하려면 `COLLECTOR_DOMAIN=localhost`. Caddy가 자체 서명 인증서를 쓰므로 스모크는
  `NODE_TLS_REJECT_UNAUTHORIZED=0 COLLECTOR_SMOKE_TOKEN=… pnpm collector:smoke https://localhost`.
- 데이터는 볼륨 `collector-data`(`/data`)에 있다. 확인: `docker compose cp collector:/data /tmp/collector-backup` 후 저장소 루트에서 `pnpm collector:inspect --data-dir /tmp/collector-backup` (상대 경로는 `apps/collector` 기준).
- 팀 토큰 폐기: `.env`에서 지우고 `docker compose up -d`.

데스크탑 배포 빌드는 `apps/desktop/.env.production.local`(git 제외)에 아래를 적고 `pnpm build:mac`.

```
MAIN_VITE_COLLECTOR_URL=https://<도메인>
MAIN_VITE_COLLECTOR_TEAM_TOKEN=<그 팀의 토큰>
```

## API

| 경로                                          | 무엇                                                               |
| --------------------------------------------- | ------------------------------------------------------------------ |
| `GET /health`                                 | 토큰 없이 상태 확인                                                |
| `POST /v1/events`                             | 이벤트 묶음. 이벤트 id로 중복 제거                                 |
| `PUT /v1/meetings/{installId}/{meetingId}`    | 회의 스냅샷 최신본 저장 (`sentAt`이 옛것이면 무시)                 |
| `DELETE /v1/meetings/{installId}/{meetingId}` | 삭제 시각만 표시                                                   |
| `PUT /v1/recordings/{installId}/{meetingId}`  | `Content-Range` 조각 이어 올리기, 어긋나면 `409 { receivedBytes }` |

조회 API는 없다 — `pnpm collector:inspect` 또는 `sqlite3 data/dev/collector.sqlite`.
