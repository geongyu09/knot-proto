# 배포 (Phase 4): 모델 다운로드·바이너리·서명·자동 업데이트

Phase 4에서 내린 결정의 SSOT. `SKILL.md`의 결정 표와 `references/architecture.md`(프로세스·IPC 규약)를 보완한다.
Phase 1~3에서 확정된 내용(모델 조합, 파이프라인, 편집 계약)은 여기서 다시 정의하지 않는다.

**대상은 macOS 14+ / Apple Silicon 하나다** (2026-08-26 결정, `SKILL.md` 결정 표). Windows는 배포 대상이 아니므로
여기서 다루지 않는다 — 리포지토리에 남아 있는 `resources/bin/win32-x64/`·`build:win`·`setupBin --platform=win32-x64`는
지우지 않았을 뿐 유지·검증 대상이 아니고, 새 코드에 `win32` 분기를 추가하지 않는다.

경로는 데스크탑 앱(`apps/desktop/`) 기준이다 (`references/monorepo.md`).

## 1. 모델 카탈로그 — 앱과 스크립트가 공유한다

`@meeting-stt/models/desktop`(= `packages/models/src/desktop.ts`)은 **electron을 import하지 않는 순수 데이터·함수**다.
main 프로세스의 온보딩 다운로더와 `scripts/setupModels.ts`(Phase 1 픽스처용)가 같은 목록을 쓴다.
목록이 두 곳에 갈라지면 체크섬이 어긋난 채로 오래 남는다. 브라우저 앱이 쓰는 저장소 id는 같은 패키지의
`@meeting-stt/models/web`에 있다 — 런타임이 달라 값은 공유하지 않지만 **모델을 바꾸는 결정은 한 패키지에서** 내린다.

- 항목 형태: `{ key, label(한국어), fileName, url, sha256, sizeBytes, kind: 'direct' | 'archive' }`.
  `archive`는 아카이브 안에서 꺼낼 `entry` 경로를 함께 갖는다.
- **Whisper 모델만 사용자가 고른다** (`turbo-q5` 권장 / `large-v3-q5` 고품질 / `small-q5_1` 저사양).
  VAD·화자 분할·화자 임베딩은 선택지가 없는 필수 모델이다.
- 고른 모델은 `settings` 테이블의 `stt.model`(기본 `turbo-q5`)에 저장한다 (`references/data-model.md`).
  `src/main/models/paths.ts`는 이 값을 받아 whisper 모델 파일명을 정한다. 다른 모듈이 파일명을 직접 조립하지 않는다.
  `WhisperModelId`·`ModelKey` 타입은 카탈로그의 어휘이므로 `@meeting-stt/models/desktop`에서 정의하고,
  `src/shared/types.ts`가 그것을 재노출한다 (앱 코드의 `@shared/types` import 경로를 유지하기 위해서다).
- **요약 모델은 온보딩에서 받지 않는다** (2026-08-26 결정). 필수 묶음(약 620MB)만 받아 첫 실행을 짧게 끝내고,
  2.4GB짜리 요약 모델은 `/settings`의 "요약 · 용어 초안" 카테고리(`LlmSection` 안의 `SummaryModelSection`, 실행 방식이 로컬일 때만 보인다)에서 사용자가 따로 받는다. 회의 상세의 `SummarySection`은
  요약 모델이 없으면 버튼을 막고 설정으로 가는 링크를 보여준다. "요약 버튼을 처음 누를 때 받기"는 택하지 않았다 —
  버튼 하나가 수 분짜리 다운로드와 수 분짜리 추론을 연달아 일으키면 사용자가 무엇을 기다리는지 알 수 없다.
- 파일은 전부 `userData/models/` 한 곳에 평평하게 둔다. 모델별 하위 폴더를 만들지 않는다 — 파일명이 이미 모델을 구분한다.

## 2. 온보딩 흐름

- 진입 조건: 필수 모델이 하나라도 없으면 앱 시작 시 `/onboarding`으로 보낸다. 전부 있으면 홈으로 간다.
- 화면 순서: 장비 사양으로 **권장 모델을 미리 골라 둔 상태**에서 선택지 3개를 보여 준다 → 받을 총 용량을 표시 →
  "다운로드" → 항목별 진행률 → 완료 시 홈으로 이동.
- **"네트워크는 여기서 한 번만 쓴다"** 는 문구를 이 화면에 노출한다 (`plan.md`의 로컬 우선 약속).
- **취소 버튼은 두지 않는다.** 이어받기(Range)가 되므로 창을 닫았다가 다시 들어오면 이어서 받는다.
  버튼을 두면 "취소 = 부분 파일 삭제"인지 "일시 정지"인지 사용자에게 설명해야 하는데, 이어받기가 있으면 그 구분이 의미가 없다.

## 3. 다운로드 IPC 계약 (Phase 4에 추가하는 채널)

```ts
models:   { status: 'models:status', download: 'models:download', downloadSummary: 'models:downloadSummary' }
events:   { modelDownload: 'models:downloadProgress', modelsChanged: 'models:changed' }
```

| 채널 | 요청 | 응답 |
| --- | --- | --- |
| `models:status` | 없음 | `ModelStatusResponse` |
| `models:download` | `{ whisperModelId }` | 완료 후 `ModelStatusResponse`. 고른 모델을 `settings.stt.model`에 저장하고 런타임 선택값도 바꾼다 |
| `models:downloadSummary` | 없음 | 완료 후 `ModelStatusResponse` (요약 모델만 받는다) |
| `models:downloadProgress` (push) | — | `{ key, receivedBytes, totalBytes, percent }` |
| `models:changed` (push) | — | 없음. `models:download`·`models:downloadSummary`가 성공한 뒤 모든 창에 보낸다 |

- **`models:changed`가 필요한 이유** (2026-09-28): 녹음 호스트 창(이전의 위젯 창)은 메인 창과 함께 앱 시작 때 만들어지고 언마운트되지 않는다.
  모델 상태를 마운트 때 한 번만 읽으면, 첫 실행에서 온보딩으로 모델을 받은 뒤에도 호스트는 `isReady: false`를 계속 들고 있다.
  메인 창의 "녹음 시작"도 호스트 창의 오디오 그래프로 녹음하므로(architecture.md "녹음 호스트 창 · 메뉴바 · 전역 단축키"), 앱을 다시 켤 때까지 어느 창에서도 녹음이 막혔다.
  `useModelStatus`는 이 이벤트를 구독해 상태를 다시 읽는다. payload는 없다 — `models:status`가 파일 존재 확인뿐이라 싸다.
  상태를 아직 못 읽은 동안(`status === null`)에는 "모델 없음" 안내를 띄우지 않는다.

```ts
interface ModelStatusItem {
  key: ModelKey; label: string; isInstalled: boolean; sizeBytes: number
  /** false면 요약 모델. 온보딩 준비 여부(isReady)에 들어가지 않는다 */
  isRequired: boolean
}
interface WhisperModelChoice { id: WhisperModelId; label: string; description: string; sizeBytes: number }
interface ModelStatusResponse {
  isReady: boolean
  isSummaryReady: boolean
  selectedWhisperModelId: WhisperModelId
  recommendedWhisperModelId: WhisperModelId
  /** 선택 화면이 그릴 목록. 레지스트리는 main에만 있으므로 renderer는 이 응답으로만 안다 */
  whisperOptions: WhisperModelChoice[]
  items: ModelStatusItem[]
}
```

- `items`는 **현재 선택된** whisper 모델 + 필수 모델 3개 + 요약 모델이다. 다른 whisper 모델의 설치 여부는 싣지 않는다 —
  선택을 바꾸면 `models:download`가 그 모델을 받고, 이미 있으면 바로 끝난다.
- `models:download`는 **이미 설치된 모델을 고르기만 해도** 부른다(선택 저장이 이 채널의 몫이라서). 파일이 있으면 즉시 완료 이벤트만 보낸다.
- 다운로드 **동시성은 1**이다. 이미 받는 중에 새 요청이 오면 한국어 오류로 거절한다 (파이프라인 잡 큐와 같은 이유).
  `models:download`와 `models:downloadSummary`가 같은 잠금을 쓴다.
- 진행률은 `invoke`가 끝날 때까지 push로 온다. `invoke`는 마지막 파일까지 받고 나서야 resolve된다 — 수백 MB라 수 분이 걸리지만
  요약과 달리 사용자가 이 화면에서 기다리는 것이 전제이므로 잡 큐에 넣지 않는다.
- 검증은 SHA256. 불일치하면 파일을 지우고 "다시 시도해 주세요" 안내를 남긴다. 부분 파일은 남겨 두어야 이어받기가 된다.
- 아카이브(`.tar.bz2`, `.zip`)는 `tar -xf`로 푼다. macOS에 기본 포함된 bsdtar가 확장자로 압축 방식을 자동 판별한다. `tar`가 없으면 "압축 해제 도구를 찾을 수 없습니다"로 실패시킨다 —
  bzip2 디코더를 의존성으로 들이지 않는다.

## 4. 저사양 감지

`src/main/models/recommend.ts`의 순수 함수로 두고 vitest로 검증한다 (electron·`os`를 import하지 않고 인자로 받는다).

```ts
recommendWhisperModelId({ cpuCount, totalMemoryBytes }): WhisperModelId
```

| 조건 | 권장 |
| --- | --- |
| 메모리 8GB 미만 **또는** 코어 4개 이하 | `small-q5_1` |
| 그 외 | `turbo-q5` |

- `large-v3-q5`는 자동으로 권장하지 않는다. Phase 1 측정에서 turbo 대비 **2.3배 느린데 품질 이득은 작았다**
  (`docs/phase1-results.md`). 사용자가 직접 고를 때만 쓴다.
- 권장값은 기본 선택일 뿐 강제하지 않는다. 저사양 장비에서 turbo를 고르면 "시간이 오래 걸릴 수 있다"고 안내만 한다.
  구체적으로: `recommendedWhisperModelId`가 `small-q5_1`(=저사양 판정)인데 다른 모델을 고르면 안내 문구를 붙인다.
  권장이 `turbo-q5`인 장비에서 `large-v3-q5`를 고르는 것은 사용자의 품질 선택이므로 안내하지 않는다 (설명문에 "2배 이상 느립니다"가 이미 있다).

## 5. 플랫폼별 바이너리

| 플랫폼 | 자산 | 비고 |
| --- | --- | --- |
| `darwin-arm64` (개발) | Homebrew `whisper-cli` 심볼릭 링크, sherpa-onnx `v1.13.6` osx-arm64 shared-no-tts | `pnpm setup:bin` |
| `darwin-arm64` (배포) | whisper.cpp `v1.8.4`를 **소스에서 정적 빌드**, sherpa-onnx는 같음 | `pnpm --filter meeting-stt exec tsx scripts/setupBin.ts --from-source` |
| `darwin-arm64` (개발·배포 공통) | `systemAudioTap` — `native/systemAudioTap/main.swift`를 `swiftc -O -target arm64-apple-macos14.2`로 빌드 (Phase 5-2, `references/architecture.md` "시스템 오디오 캡처") | `pnpm setup:bin`이 함께 만든다. Xcode 또는 Command Line Tools가 없으면 경고만 남기고 건너뛴다. 시스템 프레임워크만 링크하므로 dylib 동봉이 없다 |

### macOS 배포용 whisper는 소스에서 빌드한다

Homebrew 설치본은 `@rpath`로 Cellar의 dylib(`libggml`, `libwhisper`)을 참조해서 **다른 컴퓨터에서 실행되지 않는다.**
그래서 배포 빌드는 `scripts/buildWhisper.ts`가 소스를 받아 직접 빌드한다.

- 버전은 **`v1.8.4` 고정** — Phase 1의 품질·타임스탬프 측정을 이 버전으로 했다 (`docs/phase1-results.md`).
  올리려면 `--vad`와 토큰 타임스탬프 동작(`references/pitfalls.md`)을 다시 확인한 뒤에 올린다.
- 옵션: `BUILD_SHARED_LIBS=OFF`(정적 링크) + `GGML_METAL_EMBED_LIBRARY=ON`(Metal 셰이더 내장).
  둘을 켜면 **파일 하나만 복사하면 되고**, `.metal` 파일을 따로 동봉할 필요가 없다.
- 빌드 후 `otool -L`로 시스템(`/usr/lib`, `/System`) 밖 라이브러리를 참조하는지 확인하고, 있으면 경고를 남긴다.
- 소스와 빌드 산출물은 `scripts/fixtures/build/`(git 제외)에 둔다. CMake가 그 안에 `compiler_depend.ts`라는
  **타임스탬프 파일**을 만들기 때문에 `tsconfig.node.json`·eslint·prettier에서 `scripts/fixtures`를 제외해야 한다.
  제외하지 않으면 `pnpm typecheck`가 CMake 산출물을 TypeScript로 파싱하려다 실패한다.

### macOS 앱에는 `darwin-arm64` 바이너리만 넣는다

`asarUnpack: resources/**`는 `resources/bin/` 아래를 통째로 앱에 넣는다. 리포지토리에 남은 `resources/bin/win32-x64/`(약 78MB)가
mac 앱에 딸려 들어가던 것을 `electron-builder.yml`의 `files`에서 `!resources/bin/win32-*`로 뺀다.

### 화자 재임베딩 애드온 `sherpa-onnx-node` (2026-09-25)

화자 재군집(`references/architecture.md` "화자 재군집")은 CLI 대신 npm 패키지 `sherpa-onnx-node`(1.13.8)의 N-API 애드온으로 임베딩을 뽑는다.
실제 바이너리는 optionalDependency `sherpa-onnx-darwin-arm64`에 있다 — `sherpa-onnx.node`(0.6MB) + `libsherpa-onnx-c-api.dylib`(4MB) + `libonnxruntime.dylib`(29MB).
CLI가 쓰는 `resources/bin/darwin-arm64/libonnxruntime.dylib`과 별개 복사본이라 앱이 약 34MB 커진다. 하나로 합치려면 sherpa-onnx를 직접 빌드해야 해서 하지 않는다.

- N-API라 Electron ABI 리빌드가 없고 install 스크립트도 없다. `pnpm.onlyBuiltDependencies`에 넣지 않는다.
- 애드온의 rpath는 `@loader_path`라 같은 폴더의 dylib을 스스로 찾는다. sherpa-onnx-node README가 말하는 `DYLD_LIBRARY_PATH`는 필요 없다 (hardened runtime에서는 어차피 무시된다).
- `.node`가 든 모듈은 electron-builder가 asar 밖(`app.asar.unpacked/node_modules/sherpa-onnx-darwin-arm64/`)으로 풀고 서명·공증 대상에 넣는다.
  자동 감지에 기대지 않고 `electron-builder.yml`의 `asarUnpack`에 `node_modules/sherpa-onnx-darwin-arm64/**`를 적어 둔다.
  `sherpa-onnx-node`(순수 JS)는 asar 안에 남아도 된다 — `require('../sherpa-onnx-darwin-arm64/sherpa-onnx.node')`는 Electron의 asar 리다이렉트로 풀린 파일을 연다 (`better-sqlite3`와 같은 구조).
- 임베딩은 `utilityProcess`에서 돌린다. 워커 파일(`out/main/embedWorker-*.js`)은 electron-vite가 `?modulePath` import로 따로 번들한다.

## 6. 코드 사이닝 · notarization · 릴리스

- macOS: `hardenedRuntime: true` + `build/entitlements.mac.plist`(마이크·JIT 권한) + `notarize`.
  서명 인증서는 **로그인 키체인의 `Developer ID Application`** 을 electron-builder가 자동으로 찾는다 (팀 ID `3XD9F9256D`).
- 공증 자격 증명은 커밋하지 않는다. 로컬 릴리스는 **`notarytool` 키체인 프로필**(`APPLE_KEYCHAIN_PROFILE`)을 쓴다 —
  앱 암호가 환경변수·셸 기록에 남지 않는다. 프로필은 한 번만 만든다:
  `xcrun notarytool store-credentials meeting-stt-notary --apple-id <Apple ID> --team-id 3XD9F9256D`
  (앱 암호는 appleid.apple.com → 로그인 및 보안 → 앱 암호에서 만든다). CI로 옮길 때는 `APPLE_ID`·`APPLE_APP_SPECIFIC_PASSWORD`·`APPLE_TEAM_ID`를 쓴다.
- **공증은 옵트인이다.** `electron-builder.yml`의 기본값은 `notarize: false`이고,
  배포 빌드용 `pnpm run build:mac:release`·`pnpm run release:mac`가 `-c.mac.notarize=true`로 켠다.
  기본값을 켜 두면 자격 증명이 없는 로컬 빌드가 공증 단계에서 실패한다.
- **자격 증명이 없으면 electron-builder는 공증을 경고만 남기고 건너뛴다** (`notarize=true`여도 실패하지 않는다).
  그래서 릴리스 산출물은 반드시 `spctl`로 `source=Notarized Developer ID`인지 확인한 뒤에 게시한다.
- **동봉 바이너리와 dylib도 서명 대상이다.** `asarUnpack`으로 풀려 나온 `resources/bin/**`이 서명되지 않으면
  하드닝 런타임에서 실행이 차단된다. 빌드 후 확인:
  `codesign --verify --deep --strict --verbose=2 <app>` / `spctl -a -t exec -vv <app>`.
- **`--deep`은 동봉 바이너리를 검사하지 않는다.** `--deep`이 따라 들어가는 곳은 `Frameworks`·`Helpers` 같은
  정해진 중첩 번들 위치뿐이라, `Contents/Resources/app.asar.unpacked/resources/bin/`에 있는 파일은 통과 여부에 영향을 주지 않는다.
  앱 수준 검증이 "valid on disk"라도 그 안의 dylib은 따로 확인해야 한다:
  ```bash
  BIN="<app>/Contents/Resources/app.asar.unpacked/resources/bin/darwin-arm64"
  for f in "$BIN"/*; do codesign --verify --strict "$f" || echo "FAIL $f"; done
  ```
- **v0.1.0 실측 (2026-09-18)**: 동봉 17개(dylib 14 + `whisper-cli`·`llama-cli`·`sherpa-onnx-offline-speaker-diarization`)가
  전부 `Developer ID Application: geongyu Park (3XD9F9256D)`로 재서명됐고 하드닝 런타임 플래그(`0x10000`)와 타임스탬프를 갖는다.
  실패 0건. 앱은 `spctl` `source=Notarized Developer ID`, `stapler validate` 통과.
  electron-builder가 `asarUnpack` 산출물까지 알아서 서명한다는 것이 확인됐으므로, 별도 서명 단계를 추가할 필요는 없다.

### 로컬 릴리스 절차

릴리스는 CI가 아니라 **서명 인증서가 있는 개발 장비에서** 만든다 (8절). 저장소는 `github.com/geongyu09/meeting-stt`(공개)이고
`electron-builder.yml`의 `publish`가 여기를 가리킨다.

1. **커밋된 상태에서 빌드한다.** 이 워킹 트리는 여러 세션이 동시에 편집하므로, 커밋 안 된 변경이 섞이지 않게
   릴리스할 커밋으로 별도 `git worktree`를 만들고 그 안에서 `pnpm install --frozen-lockfile`을 한다.
   `resources/bin/`은 git 제외라 원본 트리의 `resources/bin/darwin-arm64/`를 복사해 넣는다 (whisper는 `--from-source` 정적 빌드여야 한다).
2. `apps/desktop/package.json`의 `version`을 올리고 커밋한다 (루트 `package.json`의 버전은 쓰지 않는다).
   릴리스 태그는 `v<version>`이다.
3. **빌드와 업로드를 분리한다.** `APPLE_KEYCHAIN_PROFILE=meeting-stt-notary pnpm run build:mac:release`
   → 서명·공증·스테이플까지만 하고 `apps/desktop/dist/`에 `dmg`·`zip`·`*.blockmap`·`latest-mac.yml`을 남긴다.
   `publish` 설정이 있으므로 업로드를 하지 않아도 `latest-mac.yml`은 만들어진다.
   `release:mac`(`--publish always`)은 쓰지 않는다 — 병렬 업로드가 드래프트를 두 개 만들고 140MB 구간에서 끊긴다(아래).
4. `codesign --verify --deep --strict` / `spctl -a -t exec -vv`(`source=Notarized Developer ID`) / `xcrun stapler validate <app>`로 확인한다.
   동봉 바이너리는 `--deep`이 보지 않으므로 `resources/bin/darwin-arm64/*`를 따로 검증한다 (6절).
5. `gh release create v<version> --draft`로 빈 드래프트를 만들고, 자산을 **하나씩 순서대로** 올린다.
   작은 파일(`*.blockmap`, `latest-mac.yml`)은 `gh release upload`로 되지만, 140MB짜리 `dmg`·`zip`은
   `curl -4 -X POST -T <파일>`(스트리밍)로 올린다. `zip`과 `latest-mac.yml`이 없으면 `electron-updater`가 업데이트를 찾지 못한다.
6. 올린 자산을 다시 내려받아 `latest-mac.yml`의 sha512와 대조한 뒤 드래프트를 게시한다.
   `electron-updater`는 **게시된** 릴리스만 본다.

#### 업로드가 자주 끊긴다 (2026-09-18 v0.1.0 실측)

`uploads.github.com`으로 140MB짜리를 올리는 구간이 불안정하다. 빌드·공증이 다 끝난 뒤 여기서만 반복 실패했다.

- **electron-builder의 병렬 업로드가 드래프트를 두 개 만든다.** dmg와 zip을 동시에 올리면서 "release doesn't exist"를 각각 판단해
  같은 태그의 드래프트를 2개 만들고 파일이 나뉘어 올라갔다. 게다가 40분 넘게 끌다가 `504 Gateway Timeout`으로 끝났다.
- 그래서 **큰 파일은 하나씩 따로 올린다.** `gh release upload`도 같은 엔드포인트라 `500 Error saving asset`으로 실패했고,
  성공한 것은 `curl -4 -X POST -T <파일>`(스트리밍 전송)이었다 — 66초, 2.1MB/s.
  `--data-binary`는 파일을 통째로 메모리에 올려 `curl: (55) Send failure: Result too large`로 죽는다.
- 실패한 업로드는 릴리스에 `state=starter`인 껍데기 자산을 남긴다. 다시 올리기 전에 지운다.
- 올린 뒤에는 자산을 다시 내려받아 `latest-mac.yml`의 sha512와 대조한다. 끊긴 연결이 조용히 손상된 파일을 남길 수 있다.
- 업로드 자체가 계속 실패하면 브라우저에서 릴리스 편집 화면에 끌어다 놓는 경로가 남아 있다 (웹 업로드는 다른 서버를 쓴다).

**v0.1.0에는 zip이 없다.** 12번 시도가 전부 실패해 dmg만 올렸다. 설치에는 지장이 없고, 업데이트 **확인**도 zip 없이 동작한다
(`latest-mac.yml`만 읽으면 되고, 내려받기는 그다음 릴리스의 자산에서 이뤄진다). 다만 **다음 릴리스에는 zip이 반드시 있어야**
0.1.0 사용자가 업데이트를 받을 수 있다 — mac용 electron-updater는 zip만 받는다.

배포본에서 "새 버전 0.1.0이 있습니다" 배너가 뜨고 "받기"가 `Please check update first`로 실패한 것은 **zip 누락과 무관하다.**
`checkForUpdates()` 결과에서 `isUpdateAvailable`을 보지 않아 자기 버전을 새 버전으로 알린 것이다 (7절). v0.1.1에서 고쳤다.

#### v0.1.1 실측 (2026-09-18) — 분리한 절차로는 한 번에 올라갔다

`build:mac:release`로 빌드·공증을 끝내고 `gh release create --draft` 뒤에 자산을 하나씩 올렸더니
zip 141MB가 91초(1.6MB/s), dmg 142MB가 101초(1.4MB/s)에 `201 Created`로 끝났다. **재시도 0회.**
같은 `uploads.github.com`인데 v0.1.0에서 12번 실패한 것과 갈린 지점은 병렬 업로드 여부다 —
electron-builder가 두 파일을 동시에 올리면서 드래프트를 둘로 쪼개던 것이 실패의 큰 몫이었다.
작은 파일(`*.blockmap`, `latest-mac.yml`)은 `gh release upload`로 한 번에 올려도 문제없었다.

#### v0.2.1 실측 (2026-09-25) — 서명 단계가 타임스탬프 서버 때문에 한 번 실패했다

`build:mac:release`가 `codesign --timestamp` 도중 `The timestamp service is not available`로 죽었다.
`timestamp.apple.com`이 잠깐 응답하지 않은 것이라 **같은 명령을 그대로 다시 돌리면 통과한다** — 설정을 건드릴 일이 아니다.
재실행 전에 `dist/`를 지운다 (반쯤 서명된 앱 번들이 남아 있다). 백그라운드로 돌릴 때 셸 마지막 명령이 `echo`면
종료 코드가 0으로 보이므로 로그의 `notarization successful`·`EXIT=`를 직접 확인한다.
업로드는 zip 150MB·dmg 150MB가 각 11초(13~14MB/s)에 `201`로 끝났다. 재시도 0회.

## 7. 자동 업데이트 — 기본은 꺼 둔다

`electron-updater`를 넣되 **기본값은 꺼짐**이고, 설정의 `update.check`(기본 `false`)가 켜져 있을 때만 확인한다.

- 이유: 이 앱의 약속은 "네트워크는 모델 다운로드 한 번뿐"이다. 업데이터가 조용히 서버를 부르면 그 약속이 깨진다.
- `autoDownload = false`로 두고 **새 버전이 있다는 사실만 알린다.** 사용자가 받겠다고 해야 내려받는다.
- 개발 모드(`is.dev`)에서는 아무것도 하지 않는다.
- 업데이트 확인 실패는 로그만 남기고 무시한다. 오프라인이 정상 상태인 앱이다.
- 확인 시점은 **창이 뜬 직후 한 번**이다. 주기적으로 다시 확인하지 않는다.
- **수동 확인 (2026-09-24 추가)**: `/settings`의 "지금 확인" 버튼은 `update.check` 설정과 **무관하게** 그 자리에서 확인한다.
  사용자가 직접 누른 요청이므로 "조용히 서버를 부르지 않는다"는 약속과 충돌하지 않는다. 자동 확인과 달리 실패를 삼키지 않고
  화면에 안내한다(누른 사람이 결과를 기다리고 있다). 새 버전을 찾으면 그 자리에서 "받기" → "다시 시작해 설치"로 이어진다.
  이유: 기본값이 꺼짐이라 기존 설치자 대부분이 새 버전을 알 방법이 없었다. 개발 모드에서는 확인하지 않고 그 사실을 안내한다.
- **새 버전 알림은 `checkForUpdates()` 결과의 `isUpdateAvailable`이 참일 때만 보낸다.** `checkForUpdates()`는 업데이트가 없어도 결과 객체를 돌려주고,
  그 `updateInfo.version`에는 **서버의 최신 버전**(= 지금 쓰고 있는 버전일 수 있다)이 들어 있다. 이 필드만 보고 알리면 자기 버전을 새 버전으로 알리게 되고,
  electron-updater는 업데이트가 있을 때만 내부 상태를 채우므로 사용자가 누른 "받기"가 `Please check update first`로 거절된다
  (2026-09-18 v0.1.0 배포본에서 발생, `references/pitfalls.md`).

### 업데이트 IPC 계약

```ts
update:  { check: 'update:check', download: 'update:download', install: 'update:install' }
events:  { updateAvailable: 'update:available' }
```

| 채널 | 요청 | 응답 |
| --- | --- | --- |
| `update:available` (push) | — | `{ version }` — `isUpdateAvailable`이 참일 때만 한 번 |
| `update:check` | 없음 | `{ currentVersion, availableVersion }` — 새 버전이 없으면 `availableVersion: null`. 확인 실패·개발 모드는 reject(안내 문구) |
| `update:download` | 없음 | 내려받기가 끝나면 resolve (`invoke`를 매달아 둔다 — 설치 파일 하나라 수십 초 안에 끝난다) |
| `update:install` | 없음 | 응답 없음. `quitAndInstall()`로 앱이 종료된다 |

- UI는 홈 상단의 `modules/features/update/UpdateBanner` 하나다. 이벤트를 받기 전에는 아무것도 그리지 않고,
  "받기" → 진행 중 → "다시 시작해 설치" 순서로 바뀐다. 무시하면 다음 실행 때 다시 알린다 (상태를 저장하지 않는다).
- 설정의 `update.check`는 `AppSettings.isUpdateCheckEnabled`로 노출하고 `/settings`의 체크박스로 켠다. 켜도 다음 실행부터 확인한다.
- 수동 확인 UI는 `modules/features/update/UpdateCheck`이고 `/settings`의 `SettingsSection`이 "업데이트 확인" 토글 바로 아래에 둔다.
  배너와 같은 `useUpdate` 훅을 쓰며, 훅은 `check()`와 `'checking' | 'latest'` 단계를 더 갖는다. 배너는 이 두 단계에서 아무것도 그리지 않는다.

## 모노레포에서의 패키징 (2026-09-22)

(뒤 절의 번호를 밀지 않으려고 번호를 붙이지 않았다. 워크스페이스 전반은 `references/monorepo.md`.)

electron-builder는 **앱 워크스페이스(`apps/desktop`)가 실행 디렉터리**여야 `electron-builder.yml`·`build/`·`out/`을 찾는다.
루트에서 부르면 안 된다. 루트 스크립트는 `pnpm --filter meeting-stt run …`으로 위임만 한다.

- **`apps/desktop/package.json`의 `electron` 버전은 범위(`^39.2.6`)가 아니라 정확한 버전(`39.8.10`)으로 적는다.**
  `.npmrc`가 `node-linker=hoisted`라 `electron`이 워크스페이스 루트의 `node_modules`에 설치되고,
  electron-builder는 앱 디렉터리의 `node_modules/electron`을 못 찾아 버전을 계산하지 못한다
  (`⨯ Electron version "^39.2.6" is a range, not a fixed version`). 고정하면 `package.json` 한 곳만 보고 해결한다 —
  `electron-builder.yml`에 `electronVersion`을 박지 않는 이유는 그 값이 실제 설치본과 조용히 갈라질 수 있기 때문이다.
  electron을 올릴 때는 이 번호를 직접 바꾼다 (서명·공증해 내보내는 앱이라 자동 minor 업데이트를 원하지 않는다).
- 버전을 고정하면 `postinstall`의 `electron-builder install-app-deps`가 워크스페이스 루트를 스스로 감지해
  네이티브 의존성을 Electron ABI로 리빌드한다 (`detected workspace root for project using packageManager field`).
- 공용 패키지(`@meeting-stt/core`, `@meeting-stt/models`)는 앱의 **devDependencies**에 둔다. 번들러가 소스를 인라인하므로
  런타임 의존성이 아니고, `dependencies`에 두면 electron-builder가 TS 소스 디렉터리를 app.asar에 복사하려 한다.
  실제로 패키징한 app.asar에는 `@meeting-stt/*`가 없고 `better-sqlite3`·`electron-updater` 같은 런타임 의존성만 들어간다 (2026-09-22 확인).

## 8. CI (GitHub Actions)

`.github/workflows/build.yml`

- 러너는 `macos-15`(arm64) 하나다. 네이티브 애드온(`better-sqlite3`)과 동봉 바이너리가 플랫폼에 묶여 있어 크로스 빌드하지 않는다.
  Windows 잡은 두지 않는다 (대상 플랫폼 결정, `SKILL.md`).
- 순서: `pnpm install` → 린트·타입·테스트 → `pnpm --filter meeting-stt exec tsx scripts/setupBin.ts --from-source`
  → `pnpm run build` → `pnpm --filter meeting-stt exec electron-builder --mac --publish never`. 아티팩트 경로는 `apps/desktop/dist/`다.
  `resources/bin/`이 비어 있으면 빌드를 중단한다 (`setupBin.ts`가 실패로 끝난다).
- **CI는 검증 빌드만 하고 릴리스에 올리지 않는다** (2026-09-18 결정). push/PR/태그 모두 아티팩트 업로드까지다.
  이전 워크플로는 `v*` 태그에서 드래프트 릴리스를 만들었지만, 시크릿이 없어 **공증 안 된** dmg만 올렸고
  `zip`·`latest-mac.yml`을 빠뜨려 `electron-updater`가 동작하지 않았다. 로컬 릴리스(6절)와 같은 태그에 산출물이 섞일 위험도 있다.
  릴리스를 CI로 옮기려면 `CSC_LINK`·`CSC_KEY_PASSWORD`·`APPLE_*` 시크릿을 등록하고 `release:mac`을 태그 잡에서 돌리도록 이 절부터 고친다.
- **서명 시크릿을 빈 값으로 넘기지 않는다.** `CSC_LINK: ${{ secrets.CSC_LINK }}`는 시크릿이 없으면 빈 문자열이 되고,
  electron-builder가 그것을 인증서 경로로 읽어 `⨯ <작업 디렉터리> not a file`로 죽는다 (2026-09-18 실측).
  CI는 서명하지 않으므로 `CSC_IDENTITY_AUTO_DISCOVERY: 'false'`만 준다.

## 9. 단일 인스턴스

`app.requestSingleInstanceLock()`을 얻지 못하면 즉시 종료하고, 두 번째 실행 시도는 먼저 뜬 창을 앞으로 가져온다.
두 인스턴스가 같은 `userData/meetings.db`를 열면 나중에 뜬 쪽의 시작 정리가 먼저 뜬 쪽의 처리 중 회의를 `'error'`로 덮어쓴다
(`references/architecture.md` 잡 큐 절). 개발 모드도 예외가 아니다 — `pnpm dev`를 겹쳐 띄우면 두 번째가 바로 꺼진다.

## 10. 남은 작업 (2026-08-26 기준)

여기까지는 끝났고 실제로 확인했다 — 모델 레지스트리·다운로더(이어받기·SHA256·아카이브 해제),
macOS 배포용 whisper 정적 빌드(v1.8.4, Metal 내장), 저사양 권장 판단(+단위 테스트),
서명·공증 설정, `electron-updater` 코드, GitHub Actions 워크플로, `--dir` 패키징에서 동봉 바이너리가
`app.asar.unpacked/resources/bin/`로 풀리는 것, 그리고 Phase 3 머지 뒤의 배선(3절 IPC·preload·핸들러,
`useModelStatus`·`ModelDownloadSection`·`SummaryModelSection`·`pages/Onboarding`·`RequireModels` 가드,
`update.check` 설정·`UpdateBanner`, 단일 인스턴스 잠금)까지.

남은 것은 아래와 같다.

### 10.1 사용자만 할 수 있는 것

- ~~원격 저장소~~: 2026-09-18 확인 — `origin`이 `github.com/geongyu09/meeting-stt`(공개)이고 `publish.owner`를 `geongyu09`로 바꿨다.
- **공증 자격 증명**: Developer ID 인증서는 로그인 키체인에 있다(2026-09-18 확인, 2026-08-26 빌드가 이 인증서로 서명됐지만 공증은 안 됐다).
  `notarytool` 키체인 프로필 `meeting-stt-notary`도 등록했고, 2026-09-18에 첫 릴리스 `v0.1.0`을 게시했다 (6절).
- **온보딩·설정 화면 실기 확인**: `userData/models/`를 비운 상태로 `pnpm dev`를 띄워 `/onboarding`으로 가는지,
  다운로드 진행률이 항목별로 올라가는지, 끝나면 홈으로 가는지. 개발 모드는 `scripts/fixtures/models/` 폴백이 있어
  픽스처 모델이 있으면 온보딩이 뜨지 않는다 (`references/architecture.md` 앱 런타임 경로 절).
- **업데이트 배너 실기 확인**: 릴리스가 있어야 확인할 수 있다. `publish.owner` 교체 → 태그 릴리스 → 이전 버전 설치본에서
  설정의 "업데이트 확인"을 켜고 재시작.
