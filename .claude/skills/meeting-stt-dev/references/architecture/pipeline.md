# 아키텍처: 파이프라인 실행·바이너리·스레드·잡 큐

데스크탑 앱(`apps/desktop`) 기준. 목차와 다른 주제는 `references/architecture.md`.

## 외부 바이너리·모델 확보 (커밋하지 않는다)

`whisper-cli`, `sherpa-onnx-offline-speaker-diarization` 같은 실행 파일과 `*.bin`/`*.onnx` 모델은
용량이 크고 재현 가능하므로 **git에 커밋하지 않는다**(`.gitignore`에 `resources/bin/`, `*.bin`, `*.onnx`).
대신 셋업 스크립트로 내려받아 배치한다.

| 스크립트 | 하는 일 | 배치 위치 |
| --- | --- | --- |
| `pnpm setup:bin` | 현재 플랫폼용 실행 파일 확보(다운로드 또는 로컬 설치본 복사), 실행 권한 부여, macOS 격리 속성 제거 | `resources/bin/<platform>-<arch>/` |
| `pnpm setup:models` | Whisper·diarization 모델 다운로드(Range 이어받기, SHA256 검증) | `scripts/fixtures/models/` (Phase 1 전용) |

- Phase 1 스크립트는 위 두 경로를 상수로 참조한다. 앱 런타임의 모델 경로는 `app.getPath('userData')/models`로 별개이며,
  Phase 4 온보딩 다운로더가 `scripts/setupModels.ts`와 같은 카탈로그(`@meeting-stt/models/desktop`)를 공유한다.
- 패키징·CI는 `electron-builder` 실행 **전에** `setupBin.ts`를 돌려 `resources/bin/`을 채운다. 비어 있으면 빌드를 중단한다.
- macOS에서 Homebrew 등 시스템에 이미 설치된 실행 파일이 있으면 복사해 쓸 수 있다. 단 동적 링크된 dylib에 의존하므로
  **배포용으로는 정적/동봉 빌드를 따로 확보**해야 한다(Phase 4). Phase 1 검증에는 시스템 설치본 복사로 충분하다.

## 외부 바이너리 실행

```ts
// src/main/bin/spawn.ts (개념)
spawn(binPath, args, { windowsHide: true })
  .stdout → 라인 단위 파싱 (whisper: --print-progress로 진행률, --output-json으로 결과 파일)
  .stderr → 로그 보관, 실패 시 사용자 안내 메시지에 포함
  exit code ≠ 0 또는 JSON 파싱 실패 → meetings.status = 'error', error_message 저장
```

- 바이너리 경로: 개발 시 `resources/bin/...`, 패키징 시 `process.resourcesPath` 아래 `app.asar.unpacked/resources/bin/...`. 경로 해석은 `src/main/bin/paths.ts`에서만 한다.
- whisper 호출 예: `whisper-cli -m <model> -f <wav> -l ko -mc 0 --output-json-full -of <out> --print-progress` (+ 단어 타임스탬프 옵션, VAD 옵션은 Phase 1 튜닝 결과 반영).
- diarization 호출 파라미터: **항상 `--clustering.num-clusters=<참석자 수, 모르면 12>`** 로 돌린다(참석자 수는 녹음 정지 시 사용자가 입력, `meetings.speaker_count`). 2026-09-25부터 CLI의 화자 라벨은 쓰지 않고 구간 경계만 쓴다 — 군집은 아래 "화자 재군집"이 다시 한다. 임계값(`--clustering.cluster-threshold`)은 스크립트 실험용으로만 남긴다(임계값 군집은 녹음 길이에 비례해 화자가 늘어난다, `docs/phase1-results.md` 6절). 참석자 수를 모를 때 12를 주는 이유는 임계값보다 구간이 덜 잘게 쪼개져 재임베딩 조각이 길어지고, 재군집이 실패했을 때의 폴백 결과도 32명보다 낫기 때문이다. 최소 지속 시간은 기본값 유지. 프로바이더는 CPU 고정(`coreml`은 훨씬 느림).
- 참석자 수가 있으면 병합 단계의 군소 화자 흡수(`absorbMinorSpeakers`)를 건너뛴다 — K개로 자른 클러스터는 전부 실제 화자로 보고, 짧게 한 마디 한 참석자를 지우지 않기 위해서다. 참석자 수가 없으면 과분할(K=12)에서 병합 보호로 되돌아오지 못한 몇십 초짜리 여분 클러스터가 남을 수 있어 흡수를 적용한다.
- 참석자 수를 실제보다 크게 넣어도 sherpa-onnx는 실패하지 않고 **K개 이하**로 나눈다(합성 3화자 115초에 `num-clusters=10` → 7개, 5초 녹음에 3 → 2개). 재군집의 k-means도 조각 수가 K보다 적으면 조각 수로 줄인다. 그래도 남는 과분할은 Phase 3의 화자 병합 UI로 고칠 수 있으므로 main에서 따로 막지 않는다.
- 음량 정규화: whisper·diarization을 spawn하기 **전에** `src/main/pipeline/normalize.ts`가 녹음 WAV의 PCM에 RMS 게인을 적용한 WAV를 만들고, 두 바이너리는 그 파일을 읽는다. 원본은 정규화본과 별개로 두며 삭제 정책은 원본에만 적용된다. 파라미터는 SKILL.md 결정 표 참고.

### 화자 재군집 (2026-09-25)

sherpa-onnx CLI는 분할(pyannote)·임베딩(ERes2Net)·군집(complete-linkage)을 한 번에 하지만 **군집만 품질을 깎는다.**
같은 임베딩으로 군집만 바꾸면 7명·103분 회의에서 화자 정확도 83.4% → **92.7%**(참석자 수 7), 참석자 수를 모를 때 63.8%(32명) → **92.9%**(9명, 여분은 20~80초짜리)다 — 앱과 같은 TS 코드로 잰 값.
임베딩 모델을 바꿔도 이득이 없다(상한 94~95%로 같음). 실측과 대안 비교는 `docs/diarization-clustering-results.md`(TS 검증은 11절), 채택한 것은 그 문서의 "안 A"다.
발표형 원거리 녹음(geumtoro)은 참석자 수 없이는 발표자가 여러 클러스터(10명)로 남는다 — 참석자 수 입력을 계속 권장하는 이유다.
CLI가 임베딩을 내보내지 않으므로 앱이 **구간을 다시 임베딩**한다. 분할·바이너리·온보딩 모델은 바꾸지 않는다.

흐름 (`src/main/pipeline/recluster.ts`, `diarize` 단계 안):

1. CLI 결과 구간(`SpeakerSegment[]`)에서 라벨을 버리고 각 구간을 **5초 이하 조각으로 균등 분할**한다 (`splitIntoChunks`, `@meeting-stt/core/cluster`).
   pyannote 창 조각(평균 1~2초)보다 길어 임베딩이 안정된다 — 1초 미만 조각은 정답 중심 최근접으로도 45%뿐이다. 3초로 잘라도 결과는 같다.
2. 조각마다 정규화본 WAV의 해당 샘플을 `sherpa-onnx-node`의 `SpeakerEmbeddingExtractor`(온보딩에서 받은 것과 같은 ERes2Net 모델 파일)에 넣어 임베딩을 뽑는다
   (`src/main/pipeline/speakerEmbedding.ts`, 순수 Node 함수 — 스크립트도 같은 함수를 쓴다). 준비되지 않은 조각(`isReady`가 false, 너무 짧음)은 건너뛴다.
   - 임베딩 계산은 **동기 API**라 main에서 부르면 70초 넘게 이벤트 루프가 멈춘다. `src/main/pipeline/embedWorker.ts`를 `utilityProcess.fork`로 띄워 그 안에서 돌리고
     (`import embedWorkerPath from './embedWorker?modulePath'`), 진행률·결과를 `parentPort` 메시지로 받는다 (`src/main/pipeline/embed.ts`).
     WAV 읽기는 워커가 `sherpa-onnx-node`의 `readWave`로 직접 한다 — main이 200MB 샘플을 워커로 복사하지 않는다.
   - 스레드 수는 화자 분리 CLI와 같은 `threadPlan().diarize`다 ('조용히 처리'도 그대로 적용).
3. 임베딩을 L2 정규화해 **k-means**(k-means++ 초기화, 고정 시드, 10회 재시작 중 관성 최소)로 K개로 묶는다.
   K는 참석자 수, 모르면 **12** (`OVERSPLIT_CLUSTER_COUNT`). 조각 수가 K보다 적으면 조각 수.
4. **중심 병합 보호**: 클러스터 중심(정규화 평균) 간 코사인이 **0.75 이상**인 쌍을 가까운 순으로 반복해 합친다 (`CENTROID_MERGE_MIN_COSINE`).
   k-means는 K가 실제보다 크면 큰 화자를 쪼개는데(K=9에서 79%), 쪼개진 조각의 중심은 서로 가깝고(0.7~0.9) 실제 화자끼리는 멀어서(정답 중심 최대 0.69, 5초 조각의 K=7 중심은 0.6 미만)
   이 값이면 조각만 되돌아간다. 0.7이 K를 크게 넣었을 때는 조금 더 좋지만(K=9에서 8명 → 7명, +1.3%p) K를 적게 넣었을 때 실제 화자를 하나 더 합친다(K=6: 92.7% → 87.0%). 0.75를 택한다 —
   **UI에 화자 병합은 있어도 분리는 없으므로** 덜 합쳐서 남은 여분 화자는 사용자가 고칠 수 있고, 목소리가 비슷한 두 사람을 합쳐 버리면 복구할 수 없다.
   임계값은 임베딩 모델에 묶인 값이다(eres2netv2·titanet은 0.75에서 실제 화자까지 합친다). 모델을 바꾸면 다시 잰다.
5. 라벨을 등장 순서로 `speaker_00`, `speaker_01`…로 다시 매기고 조각을 `SpeakerSegment[]`로 돌려준다. 이후 `assignSpeakers` → `mergeUtterances`는 그대로다.

건너뛰는 경우와 폴백:

- 참석자 수가 1이거나 조각이 2개 미만이면 재군집하지 않는다 (CLI 결과 그대로).
- 임베딩 애드온 로드 실패·모델 오류·워커 비정상 종료 등 **재군집이 실패하면 CLI 라벨로 폴백**하고 `warn` 로그를 남긴다. 회의록이 아예 안 나오는 것보다 낫다.
  잡은 `status='done'`으로 끝나며 사용자에게 따로 알리지 않는다 (폴백 품질은 2026-09-24까지의 앱과 같다).
- 진행률: 별도 `PipelineStage`를 두지 않는다 (정규화와 같은 이유 — IPC 계약·진행률 UI가 함께 바뀐다). `diarize` 단계 안에서 CLI 퍼센트를 **0~90%**, 임베딩 진행을 **90~100%** 로 매핑한다.
  재임베딩은 조각이 1,500~2,000개뿐이라 CLI 임베딩(창마다 겹쳐 8,000개 이상)의 10분의 1 시간이다 (103분 회의: CLI 864초 + 70초, 3스레드 기준).

의존성·배포:

- `sherpa-onnx-node`(1.13.8, N-API 애드온)를 `apps/desktop`의 `dependencies`에 둔다. 플랫폼 패키지 `sherpa-onnx-darwin-arm64`(약 34MB, 자체 `libonnxruntime.dylib` 포함)가 optionalDependency로 따라온다.
  N-API라 Electron ABI 리빌드가 필요 없고 install 스크립트도 없다(`onlyBuiltDependencies`에 넣지 않는다). 애드온은 `@loader_path` rpath로 옆의 dylib을 찾으므로 `DYLD_LIBRARY_PATH`가 필요 없다.
- 패키징에서 `.node`가 든 모듈은 electron-builder가 asar 밖으로 풀고 서명한다. 명시적으로 `asarUnpack`에 `node_modules/sherpa-onnx-darwin-arm64/**`를 적어 둔다 (`references/distribution.md` 5절).
- 순수 로직(조각 분할·k-means·병합·라벨 재배정)은 `packages/core/src/cluster.ts`에 두고 vitest로 검증한다. 브라우저 프로토타입도 같은 군집을 쓸 수 있다(현재는 complete-linkage 그대로).

## 가속·스레드 정책

대상은 Apple Silicon 하나뿐이므로 플랫폼 분기를 두지 않는다.

**GPU는 이미 쓰고 있다.** whisper.cpp는 Metal 백엔드가 기본으로 켜져 있고(`-ng`로 꺼야 CPU로 떨어진다),
llama.cpp도 `-ngl` 없이 전 레이어를 Metal에 올린다(`load_tensors: offloaded 37/37 layers to GPU`).
CPU만 쓰는 것은 sherpa-onnx 화자 분리뿐이다 — `coreml` 프로바이더가 CPU보다 훨씬 느려 CPU로 고정했다.

**문제는 스레드 수였다.** 셋 다 `os.cpus().length - 2`를 받고 있었는데, `os.cpus()`는 성능 코어와 효율 코어를
구분하지 않는다. M3 Pro(P6+E6)에서 10을 주면 효율 코어까지 잡아 **느려지면서 발열만 는다.**

측정: 120초 16kHz mono WAV, M3 Pro, 2026-08-26.

| 대상 | 설정 | 실행 시간 | CPU |
| --- | --- | --- | --- |
| whisper (turbo-q5, VAD 켬) | `-t 10` | 6.11초 | 44% |
| whisper | `-t 4` | 6.11초 | 42% |
| whisper | `-t 4 -ng` (GPU 끔) | 20.7초 | 294% |
| 화자 분리 | `-t 10` | 18.2초 | 915% |
| 화자 분리 | `-t 6` | **10.8초** | 593% |
| 화자 분리 | `-t 4` | 13.8초 | 397% |
| 요약 (Qwen3-4B-Q4_K_M, 4K 프롬프트·128토큰) | `-t 10` | 12.5초 (CPU 8.7초) | — |
| 요약 | `-t 4` | 10.6초 (CPU 3.3초) | — |
| 요약 | `-t 2` | 10.6초 (CPU 1.5초) | — |

읽는 법:

- **whisper는 스레드에 반응하지 않는다.** GPU가 일하고 CPU는 40%대에 머문다. 낮게 줘도 손해가 없고,
  화자 분리와 병렬로 돌 때 코어 경합만 줄어든다.
- **화자 분리가 유일한 열원이다.** 성능 코어 수(6)를 넘기면 그 순간부터 느려진다.
- **요약도 GPU 추론이라 스레드는 Metal 커맨드 버퍼 인코딩·스핀 대기에만 쓰인다.** `-t 2`와 `-t 4`가 같은 속도인데
  CPU 시간은 두 배 차이다.

파이프라인의 병렬 구간(STT + 화자 분리 동시 실행)을 같은 WAV로 전후 비교한 결과:

| 설정 | 실행 시간 | CPU | 누적 CPU 시간 |
| --- | --- | --- | --- |
| 이전 (`-t 10` / `-t 10`) | 18.0초 | 979% | 174.7초 |
| 현재 (`-t 4` / `-t 6`) | **13.9초** | 608% | **82.9초** |

정책 (`src/main/bin/threads.ts`가 단독으로 정한다):

| 대상 | 스레드 | 이유 |
| --- | --- | --- |
| 화자 분리 (`sherpa-onnx`) | 성능 코어 수 | 실측 최적. 유일하게 CPU로 도는 단계다 |
| STT (`whisper-cli`) | `min(4, 성능 코어 수)` | GPU가 일한다. 더 줘도 같은 속도라 화자 분리에 코어를 양보한다 |
| 요약 (`llama-cli`) | `min(2, 성능 코어 수)` | 같은 속도에 CPU 시간 1/6 |

- 성능 코어 수는 `sysctl -n hw.perflevel0.logicalcpu`로 얻고 프로세스 수명 동안 캐시한다.
  **`execSync`는 쓰지 않는다** — main에서 동기 spawn은 UI를 멈춘다(`references/pitfalls.md`). 비동기로 한 번 부르고 결과를 재사용한다.
  실패하면 `os.cpus().length`의 절반으로 떨어뜨린다 (Apple Silicon은 성능·효율 코어가 대체로 반반이다).
- **QoS를 낮춰 효율 코어로 밀어내지 않는다.** `taskpolicy -b`로 화자 분리를 돌리면 10.8초 → 116.7초로 **10배 느려진다.**
  조용해지는 대신 71분 회의의 화자 분리가 한 시간을 넘기므로 선택지가 아니다.
- STT와 화자 분리의 병렬 분기(`os.cpus().length >= 8`)는 그대로 둔다. whisper가 CPU를 거의 쓰지 않아 겹쳐도 경합이 없다.

### 조용히 처리 (`pipeline.quiet`, 기본 꺼짐)

위 정책은 **가장 빠른** 설정이고, 그 대가로 화자 분리가 녹음 1분당 약 6.5초 동안 성능 코어 전부를 100%로 쓴다.
한 시간짜리 회의면 7분 넘게 풀가동이라 팬이 크게 돈다. 속도보다 소음을 원하는 사용자를 위해 설정 토글을 둔다.

측정: 실제 녹음 10분 발췌(`geumtoro-10min-rmsnorm.wav`), `num-clusters=3`, M3 Pro(P6), 실행 사이 45~60초 휴지, 2026-09-18.

| 화자 분리 스레드 | 실행 시간 | CPU | 누적 CPU 시간 |
| --- | --- | --- | --- |
| 6 (기본) | 63.7초 | 583% | 371초 |
| 4 | 74.8초 (+17%) | 389% | 291초 |
| **3 (조용히)** | **91.9초 (+44%)** | **294%** | **270초** |
| 2 | 132.4초 (+108%) | 193% | 256초 |

- 6스레드를 연속 측정에서 처음 돌렸을 때는 77.0초가 나왔다. 앞선 측정의 열이 남아 있던 탓으로 보고, 4 → 6 순서로 다시 잰 값을 표에 적었다.
- **3스레드(성능 코어의 절반)를 고른다.** CPU 부하(발열)가 절반이 되고 시간은 44% 는다. 2스레드는 시간이 두 배가 되는데 누적 CPU 시간은 거의 줄지 않는다(270초 → 256초).

정책 (`src/main/bin/threads.ts`의 `planThreads`가 `isQuiet`를 받아 정한다):

| 대상 | 기본 | 조용히 처리 |
| --- | --- | --- |
| 화자 분리 | 성능 코어 수 | `ceil(성능 코어 수 / 2)` |
| STT | `min(4, 성능 코어 수)` | 같음 (GPU가 일한다) |
| 요약 | `min(2, 성능 코어 수)` | 같음 (요약은 이 설정을 보지 않는다) |
| STT와 화자 분리 | 코어 8개 이상이면 병렬 | **항상 순차** (STT → 화자 분리). GPU와 CPU 발열이 한 방열판에 겹치지 않게 한다 |

STT + 화자 분리 전체(같은 입력, 실행 전 60초 휴지):

| 설정 | 실행 시간 | CPU 평균 (최대) | GPU 평균 | 누적 CPU 시간 |
| --- | --- | --- | --- | --- |
| 기본 (병렬, `-t 4` / `-t 6`) | 69.7초 | 596% (678%) | 38% | 415초 |
| 조용히 처리 (순차, `-t 4` → `-t 3`) | 116.9초 (+68%) | **228% (301%)** | 22% | **266초** |

- 전체 시간은 1.7배가 되고, CPU 평균 부하는 40% 수준·최대 부하는 절반 이하로 내려간다. 한 시간 회의로 환산하면 약 7분 → 약 12분이다.

- 설정은 `queue.ts`가 **잡이 시작할 때** 한 번 읽어 `runPipeline({ isQuiet })`로 넘긴다. `run.ts`는 DB를 모른다. 진행 중인 잡에는 적용되지 않는다.
- 효율 코어로 밀어내는 방식(`taskpolicy -b`)은 여전히 쓰지 않는다 — 10배 느려진다.

### 화자 분리를 GPU(CoreML)로 돌리지 않는 이유

CoreML이 느린 원인은 **임베딩 모델 입력 길이가 호출마다 달라서**다 (2026-09-18 측정).

- 1분 녹음: 구간 분할 CPU 0.9초 / CoreML 1.1초로 비슷하고, 임베딩이 CPU 5.2초 / **CoreML 24.7초**로 병목이다.
- sherpa-onnx는 발화 조각마다 임베딩 모델(ERes2Net, 9.9M 파라미터, 입력 `[N, T, 80]`)을 한 번씩 부르고 `T`가 조각 길이를 따라 바뀐다.
  모델만 onnxruntime 1.30으로 30회 호출하면 길이 고정(5초)일 때 CoreML 86ms / CPU 149ms로 CoreML이 빠르지만,
  1~10초로 바꿔 가며 넣으면 **CoreML 315ms / CPU 137ms**로 뒤집힌다. 새 길이마다 CoreML의 첫 호출 비용(800~900ms)이 반복된다.
- 구간 분할 모델(pyannote)은 LSTM을 CoreML이 지원하지 않아 노드 50개 중 16개만 CoreML로 가고 7조각으로 나뉜다. 다만 이 단계는 1초 남짓이다.
- 입력 길이를 몇 개 크기로 패딩하면 CoreML이 빨라질 여지는 있지만, CLI에 옵션이 없어 sherpa-onnx를 고쳐야 하고
  임베딩이 시간축 평균이라 패딩이 값을 바꾼다. 채택하지 않는다.

## 앱 런타임 경로 (Phase 2)

| 대상 | 개발(`pnpm dev`) | 패키징 |
| --- | --- | --- |
| 바이너리 | `resources/bin/<platform>-<arch>/` | `process.resourcesPath/app.asar.unpacked/resources/bin/<platform>-<arch>/` |
| 모델 | `userData/models/` → 없으면 `scripts/fixtures/models/` 폴백 | `userData/models/` (Phase 4 온보딩이 채운다) |
| 녹음 WAV | `userData/recordings/<meetingId>.wav` | 같음 |
| DB | `userData/meetings.db` | 같음 |

- 경로 해석은 `src/main/bin/paths.ts`·`src/main/models/paths.ts`에서만 한다. 다른 모듈이 `app.getPath`를 직접 부르지 않는다.
- **모델 폴백은 개발 모드 전용이다.** Phase 4 온보딩 다운로더가 붙기 전까지 `pnpm setup:models`로 받아 둔 Phase 1 픽스처 모델을 그대로 쓰기 위한 장치이며, 패키징 빌드에서는 폴백하지 않는다.
- 시작 시 바이너리·모델이 없으면 앱은 뜨되 파이프라인 잡이 `status='error'`로 끝나고, 사용자에게 "모델이 준비되지 않았습니다" 안내를 남긴다.

## 파이프라인 잡 큐 (Phase 2)

- `src/main/pipeline/queue.ts`는 **동시성 1**의 메모리 큐다. 여러 회의를 동시에 돌리지 않는다 (`references/pitfalls.md`).
- 한 잡의 흐름: `status='processing'` → `normalize`(RMS 게인 WAV 생성) → whisper(`stt`) / diarization(`diarize`) → `merge` → `save`(트랜잭션 INSERT) → `status='done'`.
  코어가 8개 미만이면 STT와 화자 분리를 순차 실행한다.
- 정규화본은 원본 옆에 `<meetingId>.wav.norm.wav`로 만들고 whisper·diarization이 그 파일을 읽는다. 잡이 끝나면 **실패해도 지운다** — 원본에서 다시 만들 수 있는 파생물이다.
  정규화에는 별도 `PipelineStage`를 두지 않고 `stt` 0%에 묶는다. 단계를 늘리면 `src/shared/ipc.ts` 계약과 Phase 3 진행률 UI가 함께 바뀌는데, 정규화는 spawn 없이 끝나는 짧은 단계다.
- 실패하면 `status='error'`, `error_message`에 한국어 안내를 남기고 **원본 WAV는 지우지 않는다**(재시도용).
- 잡이 **성공**하면 설정 `audio.keep`(기본 꺼짐)에 따라 원본 WAV를 지우고 `meetings.audio_path`를 `NULL`로 만든다 (Phase 3).
  71분 16kHz mono WAV가 약 136MB라 기본값을 보관으로 두면 디스크가 빠르게 찬다.
  지운 회의는 재생·내보내기·다시 인식을 할 수 없다 — 그래서 실패한 잡에는 이 정책을 적용하지 않는다 (아래 "녹음본 재생·내보내기·다시 인식").
- 진행률은 각 단계 시작·종료와 whisper/sherpa의 퍼센트 로그를 `pipeline:progress`로 push한다. 마지막에 `stage='done'` 또는 `'error'`를 한 번 보낸다.
  `percent`는 **그 단계 안에서의 퍼센트**다. 여러 단계를 하나의 막대로 합치는 계산은 renderer가 `src/shared/progress.ts`로 한다.
  `diarize`는 CLI(0~90%)와 재임베딩(90~100%)을 한 단계로 묶는다 ("화자 재군집").
- 앱 시작 시 `status`가 `'recording'`·`'processing'`인 채로 남은 회의는 이전 실행이 비정상 종료된 것이므로 `'error'`로 정리한다. (미완료 녹음 복구는 Phase 3)
  같은 시점에 `recordings/`의 파생물(`*.norm.wav`, `*.whisper.json`)도 지운다 — 잡 중간에 앱이 죽으면 `finally`가 돌지 않아 남는다(2026-08-26 관통 검증에서 확인). 원본 `<meetingId>.wav`는 건드리지 않는다.
- **앱 인스턴스는 한 번에 하나만 띄운다.** 두 인스턴스가 같은 `userData/meetings.db`를 공유하면 나중에 뜬 인스턴스의 시작 정리가 먼저 뜬 인스턴스의 처리 중 회의를 `'error'`로 덮어쓴다. 개발 중 `pnpm dev`를 겹쳐 실행하지 않는다 (단일 인스턴스 강제는 Phase 4에서 `app.requestSingleInstanceLock`으로).

## 진행률 표시 (Phase 3)

`PipelineProgressEvent`는 단계 하나의 퍼센트만 싣는다. 사용자에게 보여 줄 **하나의 진행률 막대**는 renderer가 만든다.

- 계산은 `src/shared/progress.ts`의 순수 함수로 두고 vitest로 검증한다. 단계 가중치는
  `stt 0.3 / diarize 0.6 / merge 0.05 / save 0.05` — Phase 1 측정에서 화자 분리가 병목(10분 발췌 기준 STT 35초 / 화자 분리 141초)이기 때문이다 (`docs/phase1-results.md`).
  체감용 근사치이며, 코어 수에 따라 STT·화자 분리가 병렬로 돌기 때문에 경과 시간과 정확히 비례하지는 않는다.
- 전체 퍼센트는 단계별 퍼센트의 가중합이고 **되돌아가지 않는다**(단계별로 최댓값 유지). `merge`·`save`·`done` 이벤트가 오면 그보다 앞선 단계는 100%로 본다 —
  병렬 실행이라 `stt`와 `diarize` 사이에는 순서가 없지만, `merge`는 둘 다 끝나야 시작하기 때문이다.
- 진행률 UI는 `modules/features/pipeline/PipelineProgress` 하나로 두고 홈 목록 카드와 회의 상세가 함께 쓴다.
