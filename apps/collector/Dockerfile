# 수집 서버 배포 이미지 (telemetry.md "환경"). 저장소 루트를 컨텍스트로 빌드한다:
#   docker build -f apps/collector/Dockerfile -t meeting-stt-collector .
# 빌드 단계에서 esbuild로 한 파일에 묶고, 실행 단계에는 그 파일만 둔다 (node:sqlite는 Node 내장이라 node_modules가 필요 없다).

FROM node:22-alpine AS build
WORKDIR /repo
RUN corepack enable

# 잠금 파일 검사가 워크스페이스 전체 목록을 보므로 모든 package.json을 넣고, 설치는 collector와 그 의존만 한다.
# .npmrc의 hoisted 링커는 필터와 상관없이 Electron까지 전부 깔므로(Electron 패키징용 설정) 이 단계에서만 isolated로 바꾸고,
# 번들에는 설치 스크립트가 필요 없어 electron·better-sqlite3 바이너리 다운로드도 건너뛴다
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/desktop/package.json apps/desktop/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/collector/package.json apps/collector/package.json
COPY packages/core/package.json packages/core/package.json
COPY packages/models/package.json packages/models/package.json
COPY packages/design/package.json packages/design/package.json
COPY packages/telemetry/package.json packages/telemetry/package.json
RUN pnpm install --frozen-lockfile --filter @meeting-stt/collector... --config.node-linker=isolated --ignore-scripts

COPY packages/telemetry/src packages/telemetry/src
COPY apps/collector/src apps/collector/src
RUN pnpm --filter @meeting-stt/collector run build

FROM node:22-alpine
ENV NODE_ENV=production \
    COLLECTOR_HOST=0.0.0.0 \
    COLLECTOR_PORT=8787 \
    COLLECTOR_DATA_DIR=/data
WORKDIR /app
COPY --from=build /repo/apps/collector/dist/index.js ./index.js
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -qO- http://127.0.0.1:8787/health || exit 1
CMD ["node", "--no-warnings=ExperimentalWarning", "index.js"]
