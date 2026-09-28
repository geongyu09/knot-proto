# 알려진 함정과 대응

## STT / 화자 분리 품질
- **무음 환각**: Whisper는 무음·잡음 구간에서 없는 문장을 만든다. VAD로 무음을 제거한 뒤 추론하고, VAD가 잘라낸 구간의 오프셋을 타임스탬프에 다시 더해야 한다.
- **작은 음량에서 Whisper가 구간을 통째로 놓친다** (실제 71분 녹음, Phase 1). whisper.cpp는 입력 음량을 정규화하지 않는다.
  원거리 마이크 녹음(발화 RMS −44 dBFS)에서 11초짜리 세그먼트가 "네네" 한 단어로 나오는 식으로 수십 초가 사라졌다.
  대응: STT 전에 RMS 게인 정규화(`src/main/pipeline/normalize.ts`). 10분 발췌에서 글자수 2563 → 3494(+36%), ffmpeg `loudnorm`(3505)과 동등.
  `dynaudnorm` 같은 구간별 가변 게인은 효과가 덜했다(3284). 화자 분리는 정규화해도 결과가 거의 같다.
- **whisper가 긴 녹음에서 반복 환각 고리에 빠진다 → `-mc 0`으로 막는다** (2026-09-24 발견, 2026-09-25 대응, `docs/stt-tuning-results.md`).
  이전 창의 출력이 다음 창의 문맥(`--max-context`, 기본 무제한)으로 넘어가 스스로를 강화하는 고리다. 한 문장 반복뿐 아니라 "6월이." / "한."처럼 두 문장이 번갈아 도는 형태도 있다.
  `large-v3-q5_0`은 102분 회의의 60분 이후를 통째로(2,338초) 날려 CER이 18.8% → 44%가 됐다. `-mc 0`을 주면 turbo 금토로 71분 1,034초 → 25초, large-v3 102분 2,338초 → 2초로 사라지고
  처리 시간은 16~18% 줄며, CER 비용은 +0.23pt(102분 회의)다. 빌드마다 빠지는 정도가 달라 원인은 빌드 차이가 아니라 문맥 전달 자체로 본다.
  아래는 발견 당시 기록이다.
  `scripts/buildWhisper.ts`로 만든 v1.8.4 빌드는 71분 녹음에서 같은 문장을 수백 번 반복하며 **1,103초(26%)** 를 날렸다.
  같은 입력에서 Homebrew 1.8.4(ggml 0.12.0)는 27초다. 출력이 결정적이라 항상 재현된다. Phase 1의 71분 측정은 Homebrew로 해서 드러나지 않았다.
  `--prompt <용어> --carry-initial-prompt`를 주면 18초로 줄지만 원인 해결은 아니다(빈 용어 사전일 때는 효과 없음). 원인(ggml 버전·빌드 옵션)은 조사 전이다.
- **`--prompt`만으로는 긴 녹음에 효과가 없다.** whisper.cpp는 초기 프롬프트를 첫 30초 창에만 쓰고 이후는 직전 출력이 문맥을 밀어낸다.
  용어 사전을 인식에 쓰려면 `--carry-initial-prompt`를 함께 줘야 한다.
- **화자 분리 임계값을 올려도 파편 클러스터가 남는다.** `cluster-threshold` 0.6 → 0.8로 올리면 23명 → 12명이 되지만,
  0.9까지 올려도 총 발화 1~8초짜리 화자가 8~9명 남는다(짧은 구간의 임베딩이 불안정). 임계값으로 해결하려 하지 말고
  병합 단계에서 **총 발화 10초 미만 화자를 시간상 가장 가까운 주요 화자에 흡수**한다 (12명 → 3명). `--min-duration-on`을 올려도 큰 차이가 없다.
- **임계값 군집은 긴 녹음에서 화자가 무한정 늘어난다.** sherpa-onnx `FastClustering`은 complete-linkage + 코사인 거리 고정 임계값이라
  클러스터 수가 참석자 수가 아니라 녹음 길이·발화 교대에 비례한다. 71분 발표 녹음은 0.9에서 115개(10초 이상 38명), 앱 26분 회의는 0.8에서 129개(23명)였고
  같은 사람이 800·600·360초짜리 큰 클러스터로 갈라져 군소 화자 흡수로도 못 막는다. 10분 발췌에서 맞춘 임계값을 전체 길이에 쓰지 않는다 —
  참석자 수를 받아 `num-clusters`로 돌리는 것이 기본이고 임계값은 폴백이다 (`docs/phase1-results.md` 6·7절).
- **`num-clusters`를 줘도 sherpa-onnx의 complete-linkage는 실제 화자를 합친다** (2026-09-25, `docs/diarization-clustering-results.md`). complete-linkage는 클러스터 *지름*을 제한하므로
  튀는 임베딩 하나가 클러스터 하나를 차지하고(7개 중 2개가 32자·17자짜리 잡음), 그만큼 실제 화자 둘이 하나로 합쳐진다(한 참석자 1,970자가 통째로 다른 사람에게). 같은 임베딩을 k-means로 묶으면 83% → 93%.
  그래서 CLI 라벨은 버리고 앱이 재임베딩 + k-means로 다시 군집한다 (`references/architecture.md` "화자 재군집"). 임베딩 모델 교체는 답이 아니다 — 네 모델의 상한이 94~95%로 같다.
- **k-means에 K를 실제보다 크게 주면 큰 화자를 쪼갠다** (K=9에서 93% → 79%). 군집 뒤 중심 코사인 0.75 이상 쌍을 합치는 병합 보호를 반드시 같이 쓴다.
  짧은 조각(1~2초 미만)을 군집에서 빼고 중심에 붙이는 것은 오히려 나빴다(93% → 90%·79%) — 짧은 조각이 많아 중심이 나빠진다.
- **클로바 노트 정답본은 1시간 이후 턴 헤더가 `H:MM:SS`다.** `MM:SS`만 파싱하면 60분 이후 43분이 한 턴이 되어 모든 수치가 20%p 낮게 나온다 (`scripts/diarBench.ts`에 반영).
- **`--embedding.provider=coreml`·`--segmentation.provider=coreml`은 CPU보다 훨씬 느리다** (10분 입력: CPU 141초 완료 vs CoreML 4분 경과에 18%). 프로바이더는 CPU로 고정한다.
- **ffmpeg가 만든 WAV는 헤더가 44바이트가 아니다** (`LIST` 청크가 붙음). PCM을 직접 읽을 때는 `data` 청크를 찾아서 읽어야 한다. 앱이 직접 쓰는 WAV는 44바이트 고정이지만 외부 파일을 받는 경로가 생기면 주의.
- **whisper.cpp `--vad`는 토큰 타임스탬프를 되돌리지 않는다** (whisper-cpp 1.8.4에서 확인, Phase 1).
  `--vad`를 켜면 세그먼트의 `offsets`는 원본 시간축으로 복원되지만, `--output-json-full`의 **토큰 `offsets`(및 `t_dtw`)는 무음이 제거된 압축 시간축 그대로** 남는다.
  무음이 쌓일수록 오차가 커진다(합성 픽스처 115초에서 0.9초 → 4.5초). VAD를 끄면 둘이 정확히 일치한다.
- **whisper 세그먼트의 `offsets.from`은 직전 세그먼트의 `to`를 그대로 쓴 값이다.** 실제 발화 시작이 아니다.
  (합성 픽스처: 실제 발화 시작 11.234초인 세그먼트의 `from`이 직전 세그먼트 끝인 10.640초.) `offsets.to`만 실제 발화 끝을 반영한다.
  대응: `src/main/pipeline/whisper.ts`의 파서가 토큰 시각을 **세그먼트 끝(`to`)에 맞춰 되돌린다** — `원본시각 = segTo - (tokenTo - token)`.
  토큰 구간 길이를 보존하므로 발화 시작이 앞당겨지지 않는다. 세그먼트 시작보다 앞서면 `from`으로 자르고,
  토큰 구간이 세그먼트 구간보다 길면(세그먼트 안에서 무음이 많이 제거된 경우) 선형 재매핑으로 되돌아간다.
- **`-dtw`(토큰 정렬 타임스탬프)는 flash attention과 배타적이다.** `-fa`가 기본 켜짐이라 `-dtw`만 주면
  `dtw_token_timestamps is not supported with flash_attn - disabling` 로그와 함께 **조용히 꺼지고 `t_dtw`가 전부 -1**로 나온다.
  반드시 `--no-flash-attn`을 함께 준다. `t_dtw`의 단위는 ms가 아니라 **10ms**다.
- **`--output-json-full` 결과 파일은 유효한 UTF-8이 아니다.** whisper 토큰은 바이트 조각이라 한글 한 글자가 토큰 둘로 쪼개지고, 그 조각이 그대로 JSON에 들어간다.
  대응: 파일을 `latin1`(바이트 보존)로 읽어 `JSON.parse`한 뒤, 이어붙인 토큰 문자열을 `Buffer.from(text, 'latin1').toString('utf8')`로 되돌린다. UTF-8로 바로 읽으면 글자가 깨진다.
- **세그먼트 내 화자 전환**: Whisper 세그먼트 하나에 두 화자가 섞일 수 있다. 단어 단위 타임스탬프로 배정한 뒤 재문장화한다.
- **단어별 화자 배정만 쓰면 한 문장이 두 화자로 쪼개진다.** whisper.cpp(DTW 끔) 단어 타임스탬프는 세그먼트 끝으로 뭉개지고(길이 0인 단어가 turbo 26%, large-v3 4%)
  pyannote 구간 경계와도 어긋나, 문장 끝 한두 단어가 옆 화자로 넘어간다 (실녹음 발화 경계의 42~76%가 문장 중간, `docs/phase1-results.md` 9절).
  단어 배정 뒤 **문장 단위 다수결**(문장은 최대 8초)로 덮어쓴다 (`references/data-model.md` 병합 알고리즘 3단계). 문장 안의 짧은 다른 화자 구간을 살리는 보정은 넣지 않는다 — 같은 화자의 파편 클러스터가 되살아난다.
- **Whisper가 문장부호를 거의 찍지 않을 때가 있다.** 38분 2인 회의를 `large-v3-turbo-q5`로 돌리면 3130단어 중 20개만 문장부호가 붙었다(앱 DB에 저장된 같은 회의 결과는 문장부호가 정상). 반복 환각 구간에서도 문장부호가 사라진다. 문장부호에 기대는 로직은 쉼·길이 상한 같은 대체 경계를 함께 둔다.
- **겹쳐 말하기**: 단일 라벨로만 붙인다(주 화자 기준). 완벽을 목표로 하지 않는다.
- **비슷한 목소리 오분류**: 알고리즘으로 해결하지 말고 UI의 화자 병합/재배정 기능으로 사용자가 복구하게 한다.
- **작은 모델 유혹**: tiny/base는 한국어에 부적합. 기본값은 large-v3-turbo q5 아래로 내리지 않는다(저사양 폴백만 small).
- **한국어 이중 전사**: 파인튜닝을 시도할 경우 "(7시)/(일곱시)" 형태 전처리가 결과를 좌우한다. 1차 범위에서는 파인튜닝하지 않는다.

## 녹음
- 장시간 녹음 PCM을 renderer 메모리에 누적하지 않는다. 청크 단위로 main에 보내 즉시 append.
- **`AudioWorkletNode`를 destination까지 연결하지 않으면 `process()`가 호출되지 않는다.** 렌더링 그래프는 destination에서 역방향으로 순회하므로
  마이크 → 워크릿만 이어 두면 청크가 한 번도 오지 않는다. 스피커로 소리가 되돌아가는 에코를 막으려면 `gain = 0`인 `GainNode`를 사이에 두고 destination에 연결한다.
- **워크릿 파일이 `data:` URL로 인라인되면 프로덕션 빌드에서만 녹음이 죽는다.** Vite가 4KB 미만 에셋을 인라인하는데 renderer CSP는 `script-src 'self'`라
  `audioWorklet.addModule('data:text/javascript;...')`가 차단된다. 개발 서버에서는 재현되지 않으므로 `pnpm build` 뒤 `out/renderer/assets/`에 워크릿 파일이 있는지 확인한다.
- `AudioContext({ sampleRate: 16000 })`이 일부 장치에서 무시될 수 있다 → 실제 `context.sampleRate`를 확인하고 다르면 main에서 리샘플링하거나 오류 안내.
- 녹음 중 앱 종료/크래시 대비: WAV 헤더는 정지 시 확정하지만, 청크는 이미 디스크에 있으므로 다음 실행 시 "미완료 녹음 복구" 처리를 고려한다 (Phase 3 이후).
- **`afconvert`로 스테레오를 mono로 바꿀 때 `--mix`를 빼면 채널을 섞지 않고 버린다.** 한쪽 채널에만 목소리가 있는 녹음이 통째로 무음이 된다.
- **`afconvert`의 WAV 출력 헤더는 44바이트가 아닐 수 있다.** 원본이 모노(음성 메모 AAC)면 `WAVE_FORMAT_EXTENSIBLE`(fmt 40바이트, `data`가 68바이트 위치)로 쓰고 끄는 옵션이 없다.
  `data`가 36바이트 위치에 있다고 가정하면 모노 파일 가져오기가 전부 "읽지 못했습니다"로 끝난다 (2026-09-26 실제 발생). 가져온 WAV는 청크를 걸어 읽고 44바이트 헤더로 다시 쓴다 (`architecture.md` "녹음 파일 가져오기").
  기본 출력에는 `FLLR` 패딩 청크가 끼므로 `--no-filler`로 녹음과 같은 44바이트 헤더를 만든다. webm·ogg(Opus/Vorbis)는 못 읽는다 (`architecture.md` "녹음 파일 가져오기").
- macOS: `NSMicrophoneUsageDescription` 없으면 크래시. `systemPreferences.askForMediaAccess('microphone')`로 명시 요청.

## 시스템 오디오 캡처 (Phase 5-2)
- **Core Audio 탭의 첫 실행은 몇 초 동안 버퍼가 오지 않을 수 있다** (실측: 6초 중 1.84초만 수신, 두 번째부터는 연속). 도구가 벽시계 기준으로 0을 채우지 않으면
  마이크와 시스템 스트림의 길이가 어긋나 상대방 소리가 앞으로 당겨진다 (`architecture.md` "시스템 오디오 캡처").
- **`kAudioTapPropertyFormat`의 샘플레이트를 믿지 않는다.** 탭을 만들 때 48kHz라고 답해도 집계 장치는 출력 장치 속도(실측 24kHz)로 돌고 콜백 데이터도 그 속도다.
  탭 형식대로 변환하면 6초 재생이 3초로 줄어든다. 집계 장치의 `kAudioDevicePropertyNominalSampleRate`를 읽고 변경 리스너로 변환기를 다시 만든다.
- 개발 모드(`pnpm dev`)에서는 권한 창이 `Electron.app`(node_modules) 이름으로 뜨고, 시스템 설정의 "화면 및 시스템 오디오 녹음" 목록에도 Electron으로 올라간다. 패키징한 앱과 권한이 따로 논다.
- `getUserMedia`의 `echoCancellation`은 Chromium이 재생한 소리만 지운다. Zoom이 스피커로 낸 소리가 마이크로 되돌아오는 것은 못 막으므로 이어폰을 권장한다.
- 기본 출력 장치가 바뀌면 집계 장치의 IOProc이 멈춘다. 도구가 리스너로 다시 만들지만 그 사이는 무음이다.
- `kAudioAggregateDeviceIsPrivateKey`를 빼면 집계 장치가 시스템 설정 오디오 장치 목록에 나타나고 프로세스가 죽어도 남는다.
- 도구는 부모가 stdin을 닫을 때 끝난다. `spawn` 뒤 `stdin`을 `end()`하지 않고 두었다가 정지 시 닫는다. `detached`로 띄우지 않는다.

## 프로세스 / 성능
- main 프로세스에서 동기 IO·동기 spawn(`spawnSync`, `execSync`)은 UI를 멈춘다. 비동기 `spawn`만 사용.
- STT와 화자 분리를 무조건 병렬로 돌리지 않는다. `os.cpus().length`가 8 미만이면 순차 실행.
- **`os.cpus().length`는 성능 코어와 효율 코어를 구분하지 않는다.** 그 수만큼 스레드를 주면 효율 코어까지 잡아 느려지면서 팬만 돈다 (M3 Pro 실측: 화자 분리 `-t 10` 18.2초 → `-t 6` 10.8초, CPU 915% → 593%). 스레드 수는 `src/main/bin/threads.ts`가 성능 코어(`sysctl -n hw.perflevel0.logicalcpu`) 기준으로만 정한다.
- **GPU로 도는 단계에 CPU 스레드를 많이 주지 않는다.** whisper·llama는 Metal이 일하고 남은 스레드는 스핀 대기만 한다 — 요약은 `-t 2`와 `-t 10`이 같은 속도인데 CPU 시간이 6배 차이났다.
- **`taskpolicy -b`(background QoS)로 팬을 잡으려 하지 않는다.** 효율 코어로 밀려 화자 분리가 10.8초 → 116.7초로 10배 느려진다. 팬 소음을 줄이려면 설정 '조용히 처리'(`pipeline.quiet`)로 화자 분리 스레드를 성능 코어의 절반으로 줄인다 (+44%, CPU 부하 절반, `references/architecture.md`).
- **화자 분리를 `--*.provider=coreml`로 돌리지 않는다.** 임베딩 입력 길이가 호출마다 달라 CoreML이 매번 첫 호출 비용을 치른다 — 1분 녹음 임베딩 CPU 5.2초 / CoreML 24.7초.
- **`sherpa-onnx-node`의 `SpeakerEmbeddingExtractor.compute`는 동기 API다.** main에서 그대로 부르면 103분 회의에서 70초 넘게 이벤트 루프가 멈춰 IPC·진행률·창이 전부 굳는다.
  재임베딩은 `utilityProcess`(`src/main/pipeline/embedWorker.ts`)에서만 돌린다. 워커에는 `electron` 모듈이 없으므로 `locale`·`db`를 import하는 모듈을 끌어오지 않는다.
- **Electron은 N-API 외부 버퍼를 금지한다** (`External buffers are not allowed`, V8 샌드박스 — utilityProcess도 같다). sherpa-onnx-node의 `readWave(path, enableExternalBuffer)`·
  `compute(stream, enableExternalBuffer)`는 기본값이 `true`라 Node(tsx 스크립트)에서는 되고 Electron에서만 죽는다. 항상 `false`를 넘긴다 (2026-09-25 실측).
- 잡 큐는 한 번에 하나만 처리한다(여러 회의 동시 처리 금지). 큐 상태는 앱 재시작 시 `status='processing'`인 회의를 `error`로 정리하거나 재시도한다.
- **renderer가 보낸 PCM 청크를 `await` 없이 파일에 쓰면 순서가 섞인다.** WAV writer는 append를 직렬화(이전 쓰기 Promise에 체이닝)하고, `recording:stop`은 그 큐가 비워진 뒤에 헤더를 확정해야 한다.
- whisper 진행률은 stderr/stdout 포맷이 버전에 따라 달라질 수 있으므로 파싱 실패 시 진행률만 숨기고 작업은 계속한다.

## 빌드 / 배포
- **`better-sqlite3`는 Electron ABI로 리빌드되므로 vitest(순수 Node)에서 import하면 `NODE_MODULE_VERSION` 오류로 죽는다.**
  DB 계층(`src/main/db/*`)은 단위 테스트 대상에서 제외하고, 순수 함수(병합·포맷·파서·WAV 헤더)만 테스트한다. DB 동작은 `pnpm dev`로 확인한다.
- **`sherpa-onnx-node`는 N-API 애드온이라 리빌드가 없지만 vitest에서 import하면 실제 dylib을 로드한다.** 임베딩을 부르는 모듈(`speakerEmbedding`, `embedWorker`, `embed`, `recluster`)은 단위 테스트 대상에서 빼고
  순수 로직(`@meeting-stt/core/cluster`)만 테스트한다. 실제 임베딩 검증은 `scripts/recluster.ts` + `scripts/diarBench.ts`로 한다.
- 네이티브 애드온(`better-sqlite3`)은 Electron ABI로 리빌드가 필요하다. pnpm 10은 의존성의 install/postinstall 스크립트를 기본 차단하므로 `package.json`의 `pnpm.onlyBuiltDependencies`에 등록하고(`electron`, `esbuild`, `electron-winstaller` 포함) `pnpm install` 로그에 "Ignored build scripts" 경고가 없는지, `electron-builder install-app-deps`가 실행되는지 확인한다.
- pnpm 기본 링커(isolated, 심볼릭 링크)는 electron-builder 패키징·네이티브 리빌드에서 문제를 일으킬 수 있다. `.npmrc`의 `node-linker=hoisted` / `shamefully-hoist=true`를 유지한다.
- `src/main`, `src/preload`는 Node에서 실행된다. 테스트 러너는 vitest(`pnpm test`), TS 스크립트 실행은 tsx(`pnpm --filter meeting-stt exec tsx scripts/x.ts`)를 쓴다. `bun test`, `bun:*` 모듈, `Bun.*` API는 사용하지 않는다.
- 바이너리는 `asarUnpack` 대상이어야 실행 가능하고, macOS에서는 실행 권한(`chmod +x`)과 quarantine 해제가 필요하다. notarization 시 동봉 바이너리와 dylib까지 모두 서명(`hardenedRuntime`, entitlements에 `com.apple.security.cs.allow-unsigned-executable-memory` 등 필요 여부 확인).
- 모델 파일은 절대 리포지토리나 설치 파일에 포함하지 않는다. `userData/models`에 다운로드하고 `.gitignore`로 차단.
- `electron-builder.yml`의 `publish.url`, `appId`, `NSMicrophoneUsageDescription`은 스캐폴드 기본값이므로 배포 전 반드시 교체.
- **`autoUpdater.checkForUpdates()`가 버전을 돌려줬다고 업데이트가 있는 것이 아니다.** 업데이트가 없어도 결과 객체가 오고
  `updateInfo.version`은 **서버의 최신 버전**이다. 판단은 `result.isUpdateAvailable`로만 한다. 이걸 빠뜨리면 자기 버전을 "새 버전"으로 알리게 되고,
  그 상태에서 누른 "받기"는 `Error: Please check update first`로 실패한다 — electron-updater가 업데이트가 있을 때만
  내부 상태(`updateInfoAndProvider`)를 채우기 때문이다 (v0.1.0 배포본 실측, `distribution.md` 7절).

## 모델 다운로드 (Phase 4)
- **`fetch`의 Range 응답은 200으로 올 수 있다.** 서버(또는 리다이렉트 뒤의 CDN)가 Range를 무시하면 전체 본문이 200으로 온다.
  `206`일 때만 이어받기로 보고, 아니면 부분 파일을 `truncate(0)`한 뒤 처음부터 쓴다. 이어붙이면 파일이 깨지고 SHA256에서 걸린다.
- **부분 파일은 `models/tmp/`에 둔다.** 최종 경로에 쓰면 `existsSync` 하나로 설치 여부를 판단하는 코드가 반쯤 받은 파일을 설치된 것으로 본다.
- **설치 여부는 파일 존재로만 본다.** 수백 MB 파일의 체크섬을 앱을 켤 때마다 다시 읽지 않는다. 체크섬은 내려받은 직후 한 번만 검증한다.
- **개발 모드의 픽스처 폴백 때문에 온보딩이 재현되지 않는다.** `scripts/fixtures/models/`에 모델이 있으면 `userData/models/`가 비어도
  `isReady`가 참이다. 온보딩을 보려면 픽스처 모델을 잠시 옮긴다.
- 아카이브는 `tar -xf`(bsdtar)로 푼다. bzip2 디코더를 의존성으로 들이지 않는다. `tar`가 없는 환경은 한국어 오류로 끝낸다.

## 데이터
- 화자 이름을 `utterances`에 복사하지 않는다 (speakers 매핑으로만).
- 삭제는 `ON DELETE CASCADE`에 의존하므로 `PRAGMA foreign_keys = ON`을 연결마다 켠다.
- 원본 WAV 삭제는 `status='done'` 이후에만, 그리고 설정이 "삭제"일 때만 수행한다. 실패한 회의의 WAV는 재시도를 위해 보관한다.

## 로컬 요약 / llama.cpp (Phase 5)

측정과 근거는 `docs/phase5-results.md`.

- **`-st`(single-turn) 없이 `llama-cli`를 띄우면 프로세스가 끝나지 않는다.** 답변을 다 쓴 뒤 대화 모드로 들어가 stdin을 기다리므로 잡 큐가 그 자리에서 멈춘다.
- **회의록을 `-p`(argv)로 넘기지 않는다.** 구간 하나가 9천 자라 argv 길이 제한에 걸린다. 프롬프트·시스템 프롬프트·출력은 전부 파일(`-f`/`-sysf`/`-o`)로 주고받는다.
- **`-e`(이스케이프 해석)가 기본으로 켜져 있다.** `--no-escape`를 주지 않으면 회의록 본문의 역슬래시 시퀀스가 제어문자로 바뀐다.
- **`-o` 출력 파일에는 프롬프트가 함께 들어간다** (`User:\n<프롬프트>\n\nAssistant:\n<답변>`). 파일을 통째로 읽으면 회의록 전문이 요약으로 저장되므로, **프롬프트가 끝나는 지점부터** `\nAssistant:\n`을 찾아 그 뒤만 취한다 — 회의록 본문에도 같은 표시가 있을 수 있다.
- **생성 토큰 상한이 낮으면 요약이 문장 중간에서 잘린다.** 71분 회의의 최종 요약이 `-n 900`에서 끊겼다. 1200으로 둔다.
- **모델은 `화자 7` 같은 익명 라벨을 담당자 이름으로 쓴다.** 시스템 프롬프트에서 번호 라벨이 사람 이름이 아님을 못박는다. 근거 없는 날짜·숫자도 지어내므로 함께 금지한다.
- **STT 오인식은 요약 단계에서 고치지 않는다.** 모델에게 교정을 지시하면 "없는 내용을 만들지 마라"와 충돌해 사람 이름·숫자까지 바꾼다. 회의록을 인라인 편집해 고친 뒤 다시 요약하는 경로를 쓴다.
- **요약 모델(2.4GB)은 필수 모델이 아니다.** 없으면 요약만 막히고 STT는 그대로 돌아야 한다. spawn 전에 실행 파일·모델 존재를 확인하고 한국어로 안내만 하고 멈춘다.
- **요약 실패가 회의 상태를 덮어쓰면 안 된다.** `meetings.status`는 파이프라인 소유다. 요약 잡은 `summary:progress`의 `'error'`로만 알린다.
- **`libllama-server-impl.dylib`은 `llama-server`를 쓰지 않아도 빼면 안 된다.** `llama-cli`가 직접 링크하고 있어 없으면 dyld가 실행을 거부한다. dylib은 실행 파일과 같은 폴더에 둔다 (rpath가 `@loader_path`).
- 컨텍스트를 크게 잡으면 KV 캐시가 그만큼 커진다 (Qwen3-4B는 토큰당 약 144KB). 8192토큰이면 1.2GB 수준이라 저사양에서도 뜬다.

## 녹음 호스트 창 · 메뉴바 · 전역 단축키 (Phase 5-3)

결정과 근거는 `references/architecture.md`의 "녹음 호스트 창 · 메뉴바 · 전역 단축키" 절. 플로팅 위젯 패널은 2026-09-28 이 브랜치에서 제거했다.

- **숨겨지거나 가려진 창은 타이머·메시지 처리가 throttling된다.** 오디오 그래프를 들고 있는 호스트 창(항상 숨김)에는
  `webPreferences.backgroundThrottling: false`가 필수다. `AudioWorklet` 자체는 별도 오디오 스레드라 살아 있지만,
  `port.onmessage`로 넘어온 청크를 IPC로 넘기는 일은 메인 JS 스레드가 한다.
- **main의 녹음 세션이 하나여도 청크를 보내는 오디오 그래프가 하나라는 보장은 없다.** 호스트 컴포넌트가 다시 마운트되면
  (dev Fast Refresh 등) ref만 비워지고 이전 그래프는 마이크를 잡은 채 옛 `meetingId`로 청크를 계속 보낸다.
  `useRecorder`는 언마운트 cleanup에서 그래프를 닫고 진행 중이던 녹음을 정지한다. main은 세션과 맞지 않는 청크를
  throw하지 않고 경고 로그만 남기고 버린다 — 이미 끝난 녹음의 청크는 사용자에게 알릴 실패가 아니고,
  `errorMessage`가 다음 publish까지 대기 화면에 남아 "시작 직전 에러"처럼 보이기 때문이다.
- **경과 시간을 IPC로 흘려보내지 않는다.** `startedAt`만 주고 각 창이 `Date.now()`로 계산한다. 렌더가 밀려도 값이 정확하고 IPC 횟수도 늘지 않는다.
- **`BrowserWindow.getAllWindows()[0]`을 메인 창으로 가정하지 않는다.** 호스트 창이 먼저 잡힐 수 있어
  `app.on('activate')`의 창 재생성과 `second-instance` 포커스가 엉뚱한 창을 집는다. 메인 창 참조를 따로 들고 있는다.
- **`window-all-closed`가 오지 않는다.** 호스트 창이 있어 메인 창을 닫아도 창이 남아 macOS 외 플랫폼의 종료 처리가 걸리지 않는다. macOS 전용이라 당장 문제는 없지만, 종료 판단을 창 개수로 하지 않는다.
- **Tray 아이콘 파일명은 `…Template.png`여야 한다.** 이 접미가 없으면 macOS가 다크 모드에서 아이콘을 반전하지 않아 검은 배경에 검은 아이콘이 된다.
- **전역 단축키는 선점당할 수 있다.** `globalShortcut.register`의 반환값을 확인하고, 실패해도 경고만 남기고 앱을 띄운다.
- **Tray 제목 갱신 타이머는 녹음 중에만 돌린다.** 상시 1초 타이머는 앱이 유휴 상태에서도 CPU를 깨워 배터리를 먹는다.
- **Tray 컨텍스트 메뉴를 상태 이벤트마다 다시 만들지 않는다.** 레벨 값은 청크 주기(약 0.5초)로 바뀌므로 초당 두 번 메뉴가 교체된다.
  녹음 여부가 바뀔 때만 `setContextMenu`한다.
- **`loadFile(..., { hash })`에 앞의 `/`를 빼면 `#recorder`가 된다.** `createHashRouter`는 `#/recorder`를 기대하므로 라우트가 맞지 않는다.
- **`recording:state` 조회 응답이 그 사이 도착한 상태 이벤트를 덮어쓸 수 있다.** 창이 열리자마자 녹음이 시작되면
  먼저 보낸 조회의 (녹음 아님) 응답이 나중에 도착해 화면이 되돌아간다. 이벤트를 한 번이라도 받았으면 조회 결과를 버린다
  (`useRecordingState`).
- **설치된 앱이 떠 있으면 `pnpm dev`가 조용히 종료된다.** 단일 인스턴스 잠금(`app.requestSingleInstanceLock`)은 dev 빌드와 설치본을
  같은 앱으로 본다. 로그도 남지 않고 exit 0으로 끝나므로, 개발 확인 전에 `/Applications`의 앱을 먼저 종료한다.
- **`titleBarStyle: 'hiddenInset'`이면 창을 끌 곳이 없어진다.** 제목 표시줄이 사라지므로 사이드바 상단과 본문 상단 바에
  `-webkit-app-region: drag`를 주고, 그 안의 버튼·입력·링크는 `no-drag`로 되돌려야 클릭이 먹는다. drag 영역 위의 요소는 마우스 이벤트를 받지 못한다.
- **사이드바처럼 화면 전환에도 살아 있는 컴포넌트는 "마운트할 때 한 번 불러오기"로 최신 상태를 유지할 수 없다.**
  상세에서 제목을 바꾸거나 회의를 지워도 목록이 그대로 남는다. main이 목록 변경 뒤 `meetings:changed`를 push하고 사이드바가 다시 불러온다 (`architecture.md` "화면 디자인").
- **글꼴 서브셋·woff2 변환본은 원래 이름으로 동봉하지 않는다.** OFL 예약 글꼴 이름 조항 때문이다. 배포처가 준 파일을 그대로 넣는다.

## LLM 공급자 (Claude API · Claude Code CLI · OpenAI API)

- **Finder에서 띄운 Electron 앱의 `PATH`에는 `claude`가 없다.** GUI 앱은 로그인 셸의 PATH를 받지 않아 `/usr/bin:/bin:/usr/sbin:/sbin`뿐이다.
  잘 알려진 설치 위치를 먼저 보고, 없으면 `$SHELL -ilc 'command -v claude'`로 한 번 찾아 캐시한다. spawn할 때도 PATH를 로그인 셸 값으로 바꿔 준다 — npm 설치본은 `node`를 PATH에서 찾는다.
- **`claude --bare`는 키체인을 읽지 않아 구독 로그인이 풀린다** (`Not logged in · Please run /login`). 최소 모드는
  `--tools "" --no-session-persistence --setting-sources ""`로 만들고, CLAUDE.md 자동 로드는 빈 `cwd`로 피한다.
- **`claude -p`에 긴 프롬프트를 argv로 넘기지 않는다.** stdin으로 준다. `--system-prompt`는 수백 자라 argv로 충분하다.
- **`claude -p --output-format json`은 실패해도 종료 코드 0으로 JSON을 낸다.** `is_error: true`와 `result`(오류 문장)를 확인해야 한다. 종료 코드만 보면 "성공"으로 읽힌다.
- **`safeStorage`는 `app.whenReady()` 뒤에만 쓸 수 있고, 키체인 접근이 막힌 환경에서는 `isEncryptionAvailable()`이 거짓이다.** 거짓이면 키 저장을 거절한다. 평문 폴백을 두지 않는다.
- **API 키를 renderer로 보내지 않는다.** 설정 화면은 유무와 마지막 4자만 받는다. 키를 화면 상태에 들고 있으면 DevTools·로그·테스트 스냅샷에 새기 쉽다.
- **외부 API는 8K 컨텍스트 청킹이 필요 없다.** 그대로 map-reduce하면 요청 수가 늘고 reduce가 부분 요약을 다시 뭉갠다. 공급자가 청크 예산을 정한다.
- **Claude 응답에서 `stop_reason`을 본다.** `refusal`은 텍스트가 비어 있고, `max_tokens`는 문장 중간에서 끝난다. 둘 다 빈 요약·잘린 요약으로 저장되지 않게 오류로 바꾼다.
- **OpenAI Responses 응답에서 `status`를 본다.** HTTP 200이어도 `status: 'incomplete'`면 `output_text`가 잘려 있다. `incomplete_details.reason`(`max_output_tokens`·`content_filter`)으로 나눠 오류로 바꾼다.
- **GPT-6의 추론 토큰도 `max_output_tokens`에 포함된다.** Claude의 적응형 사고와 같은 이유로 하한(`API_MIN_MAX_TOKENS`)을 둔다. 온도(`temperature`)는 추론 모델이 받지 않으므로 넘기지 않는다.
- **API 키를 공급자가 아니라 회사 단위로 저장한다.** 공급자 라디오를 오갈 때마다 키를 다시 붙여 넣게 하지 않기 위해서다. 새 공급자를 붙일 때 `apiVendorOf`에 대응만 추가하면 키 저장·상태·화면이 따라온다.

## 사용 정보 수집 (`test/usage-analytics` 브랜치)
- **전송을 사용자 작업의 경로에 두지 않는다.** 이벤트는 outbox에 넣고 즉시 반환한다. 네트워크 대기로 녹음 정지·파이프라인 완료가 늦어지면 안 된다.
- **원본 WAV 삭제와 업로드 순서.** `audio.keep`이 꺼져 있으면 파이프라인 직후 원본을 지우므로, 업로드 성공 전에 지우면 녹음이 영영 안 올라간다.
- **녹음은 이벤트 묶음에 넣지 않는다.** 100분 회의 WAV는 약 190MB다. 파일 단위로, 이어 올리기로 보낸다.
- **API 키·팀 토큰을 로그·이벤트에 싣지 않는다.** 설정 스냅샷은 허용 목록(allowlist)으로 만든다 — 차단 목록 방식은 새 비밀 키가 생기면 샌다.
- **외부 분석 서비스에 회의 내용을 싣지 않는다.** 이벤트 props에 발화 텍스트·요약·화자 이름을 넣지 않도록 `packages/telemetry` 타입에서 막는다.
