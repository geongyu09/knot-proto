# 아키텍처: 녹음·녹음본·라이브 받아쓰기·시스템 오디오

데스크탑 앱(`apps/desktop`) 기준. 목차와 다른 주제는 `references/architecture.md`.

## 녹음본 재생·내보내기·다시 인식 (2026-09-25)

사용자 요청으로 "녹음본 재생은 요구사항 아님" 결정을 뒤집었다. **원본 WAV가 남아 있는 회의**(설정 `audio.keep`을 켠 뒤 녹음했거나, 파이프라인이 실패한 회의)에서만 동작한다.
보관 기본값(삭제)은 그대로다 — 디스크 사용량 판단은 바뀌지 않았다.

- **원본 유무**: `Meeting.hasAudio`(`audio_path IS NOT NULL`)로 renderer에 알린다. 목록 조회마다 파일을 `stat`하지 않는다 —
  경로는 있는데 파일이 사라진 경우는 재생 실패·다시 인식 실패(`status='error'`)로 드러난다.
- **재생**: 커스텀 프로토콜 `meeting-audio://recording/<meetingId>`를 `src/main/audio/playback.ts`가 처리한다.
  - `file://`을 쓰지 않는 이유: 개발 모드 renderer는 `http://localhost` 출처라 `file://`을 불러올 수 없고, renderer에 파일 경로를 노출하지 않기 위해서다.
    핸들러는 회의 ID만 받아 DB의 `audio_path`로 파일을 찾는다. 없는 회의·원본 없음은 404.
  - `<audio>`의 시킹은 `Range` 요청이다. 핸들러가 `Range: bytes=a-b`를 직접 해석해 `206` + `Content-Range`로 그 구간만 스트림한다 (파일 전체를 메모리에 올리지 않는다).
  - 스킴은 `app.whenReady()` **전에** `protocol.registerSchemesAsPrivileged`로 `standard·secure·stream·supportFetchAPI` 권한을 준다. renderer CSP에 `media-src 'self' meeting-audio:`를 더한다.
- **재생 UI**: 상세 본문의 **하단 고정 녹음 바**(`TranscriptSection/ui/RecordingBar`)에 `<audio>` 하나를 숨겨 두고, 브라우저 기본 `controls` 대신
  **디자인 토큰으로 그린 커스텀 플레이어**(재생/일시정지 버튼 + 현재 시각 + 시킹 슬라이더 + 전체 길이)를 쓴다 (2026-09-26 사용자 요청 — 기본 재생 막대는 "여백" 팔레트와 맞지 않는다).
  재생 상태는 `model/useAudioPlayer`가 `<audio>` 이벤트(`play`·`pause`·`timeupdate`·`durationchange`·`ended`·`error`)를 구독해 갖고, 슬라이더는 `<input type="range">`라 키보드로도 옮길 수 있다. 원본이 있으면 발화 행의 시각이 버튼이 되고, 누르면 그 발화의 `startSec`으로 이동해 재생한다.
  재생 중인 발화 강조는 범위 밖이다.
  - 바의 위치는 2026-09-26 사용자 요청으로 오른쪽 레일 패널에서 **본문 최하단**으로 옮겼다. 회의록·레일이 든 스크롤 영역(`.content`)의 **형제**로 그 아래에 두어
    좌우 전체 폭을 채우고, 회의록을 스크롤해도 창 바닥에 붙어 있다 (`position: sticky`가 아니라 `AppShellLayout`의 `main` flex 열에서 스크롤 영역 밖에 있기 때문이다).
    한 줄 가로 배치 — 제목·안내 문구 없이 플레이어가 남은 폭을 채우고, 오른쪽에 "WAV로 저장"·"다시 인식"만 둔다. 다시 인식 확인은 바 안에서 한 줄 더 펼친다.
- **내보내기**: `meetings:exportAudio`(invoke) → main이 `dialog.showSaveDialog`(메인 창에 붙은 시트)로 저장 위치를 받아 `copyFile`한다.
  기본 파일명은 `<회의 제목>.wav`(파일명에 못 쓰는 문자는 `_`). 응답 `{ isSaved }` — 사용자가 취소하면 `false`이고 오류가 아니다.
  저장 위치 선택은 확인 UI가 아니므로 "네이티브 대화상자 금지" 규칙(1절 확인 UI)의 대상이 아니다.
- **다시 인식**: `meetings:reprocess`(invoke, `{ meetingId, speakerCount: number | null }`) → 참석자 수를 저장하고(`null`이면 임계값 폴백)
  `status='processing'`으로 바꾼 뒤 파이프라인 잡을 큐에 넣는다. 응답은 편집 채널처럼 갱신된 `MeetingDetail`이다.
  - 거절 조건: 회의 없음, 원본 없음, `status`가 `recording`·`processing`(이미 처리 중이거나 줄 서 있음).
  - 성공하면 **회의록을 통째로 새로 만든다**: 발화 전체 교체 + **화자 행 전부 삭제 후 새 라벨로 생성**(새 군집의 라벨은 이전 라벨과 대응하지 않으므로 화자 이름이 초기화된다)
    + 자동 교정 결과(`refine_applied`·`refined_at`) 비움. 이후 자동 교정이 다시 돈다. **요약은 남긴다** — 같은 회의의 내용이고, 사용자가 원하면 다시 요약한다.
    이 교체는 한 트랜잭션이다 (`data-model.md` "다시 인식").
  - 실패하면 첫 처리와 같다 — `status='error'`, 원본 유지. 이전 회의록 행은 성공할 때까지 교체되지 않는다.
  - 성공 뒤에는 첫 처리와 같이 `audio.keep`을 적용한다. 보관을 끈 상태에서 실패 회의를 다시 시도해 성공하면 원본이 지워진다.
  - UI: 하단 녹음 바의 "다시 인식" → 2단계 인라인 확인(참석자 수 `Stepper` + "화자 이름·직접 고친 내용·교정 결과가 사라집니다" 안내).
    실패한 회의는 본문 오류 문구 아래 "다시 시도" 버튼(저장된 참석자 수 그대로, 확인 없음 — 잃을 회의록이 보이지 않는 상태다).
- 원본이 없는 회의의 녹음 바는 "원본 녹음을 보관하지 않아 재생·다시 인식을 할 수 없습니다"와 설정 안내만 보인다.

## 녹음 파일 가져오기 (2026-09-25)

사용자 요청으로 앱 밖에서 녹음한 파일(음성 메모 m4a, 회의 녹화 mp4 등)로도 회의록을 만든다. 브라우저 프로토타입의 파일 입력과 같은 기능이지만
**디코딩은 renderer의 `decodeAudioData`가 아니라 main에서 macOS 내장 `afconvert`로 한다.**

- **왜 `afconvert`인가**: ffmpeg를 동봉하지 않는다는 결정(1절 음량 정규화)은 그대로다. 대상 플랫폼이 macOS 전용이라 시스템 바이너리 `/usr/bin/afconvert`(Core Audio)가 항상 있고,
  서명·다운로드·라이선스 부담이 없다. renderer에서 디코딩하면 1시간 파일의 Float32 PCM(약 230MB)을 IPC로 넘겨야 하고 "무거운 작업은 main" 원칙에도 어긋난다.
  경로는 `/usr/bin/afconvert`로 고정한다 (GUI 앱의 PATH를 믿지 않는다).
- **변환 명령**: `afconvert -f WAVE -d LEI16@16000 -c 1 --mix --no-filler <원본> <recordings/<meetingId>.wav>`.
  `--mix`는 스테레오를 한 채널로 섞고(없으면 채널을 버린다), `--no-filler`는 `FLLR` 패딩 청크를 뺀다.
- **헤더는 앱이 44바이트로 다시 쓴다** (2026-09-26). `afconvert`는 원본에 채널 레이아웃이 있으면(음성 메모처럼 **모노 AAC**가 대표적) 출력 WAV를
  `WAVE_FORMAT_EXTENSIBLE`(fmt 40바이트, 태그 `0xFFFE`, `data`가 68바이트 위치)로 쓰고, 스테레오를 섞은 경우에만 16바이트 fmt의 44바이트 헤더가 나온다.
  `afconvert`에는 이를 끄는 옵션이 없다(`-l` 태그로도 유지). 변환 결과를 **RIFF 청크를 순서대로 걸어** 읽고(`parseImportedWav`: fmt가 PCM 또는 서브포맷 PCM인
  EXTENSIBLE, 16kHz·mono·16bit인지 확인), `data`가 44바이트 위치가 아니면 **PCM 본문을 새 44바이트 헤더 뒤로 스트림 복사해 같은 경로로 바꾼다**
  (`rewriteWithCanonicalHeader`, 임시 파일 → `rename`). 정규화의 `readWavPcm`이 `0xFFFE` 태그를 거부하고 sherpa-onnx의 WAV 리더도
  EXTENSIBLE을 보장하지 않으므로, 이후 단계(정규화·whisper·sherpa·재생·내보내기)가 **녹음한 회의와 똑같은 44바이트 헤더**만 보게 만드는 쪽이
  각 단계를 고치는 것보다 안전하다. 1시간 녹음(약 115MB)의 복사는 1초 안쪽이라 변환 시간에 묻힌다.
- **받는 형식**: `m4a mp3 wav aac aif aiff caf flac mp4 mov` (2026-09-25 실측, 영상 파일은 오디오 트랙만 읽는다). webm·ogg(Opus/Vorbis)는 `afconvert`가 못 읽어 목록에서 뺀다.
  확장자는 열기 대화상자의 필터일 뿐이고, 실제로 못 읽으면 변환 실패 안내로 끝난다.
- **흐름** (`src/main/audio/importRecording.ts`):
  1. `dialog.showOpenDialog`(메인 창 시트, 파일 하나) — 취소하면 `{ meeting: null }`, 오류 아님. 열기 대화상자는 확인 UI가 아니므로 "네이티브 대화상자 금지"의 대상이 아니다.
  2. 회의 ID를 정하고 `afconvert`로 변환. 실패하면 반쯤 쓴 출력 파일을 지우고 안내 문구를 던진다. **회의 행은 변환이 성공한 뒤에 만든다** — 못 읽은 파일로 빈 오류 회의가 목록에 남지 않는다.
  3. WAV 헤더의 `data` 크기로 길이를 계산한다. `MIN_RECORDING_SEC`(1초) 미만이면 녹음과 같은 "너무 짧음" 오류로 끝낸다(파일은 남기지 않는다).
  4. `insertMeeting` → `duration_sec`·참석자 수 저장 → `status='processing'` → 파이프라인 잡 큐. 큐에서 기다리는 동안 회의 목록이 "녹음 중"이 아니라 처리 대기로 보이도록 바로 `processing`으로 둔다.
- **제목**은 파일 이름(확장자 제외, 200자까지)이고 비어 있으면 녹음과 같은 기본 제목. **생성 시각**은 가져온 시각이다 — 파일의 수정 시각은 복사·동기화로 쉽게 바뀌어 녹음 날짜를 보장하지 않는다.
- **참석자 수**는 녹음 화면 스테퍼의 값, 즉 main 녹음 세션의 보관값을 그대로 쓴다. 같은 화면의 입력이 녹음과 가져오기에 함께 적용되고, 값의 출처는 여전히 하나다.
- **원본 파일은 건드리지 않는다.** 앱이 관리하는 것은 변환한 WAV뿐이고 `audio.keep` 보관 정책도 그 WAV에만 적용된다.
- 녹음 중에도 가져올 수 있다 — 변환은 짧고, 파이프라인은 큐가 순서대로 처리한다. 다만 UI는 녹음 중에 버튼을 비활성으로 둔다(아래).
- **IPC**: `meetings:import`(invoke, payload 없음) → `ImportMeetingAudioResponse = { meeting: Meeting | null }`.
- **UI**: 녹음 화면(`recording/RecorderSection`) 오른쪽 옵션 패널의 맨 위 그룹 "파일로 만들기"에 행 하나 — 제목 "녹음 파일 가져오기", 설명, 오른쪽 보조 버튼 "가져오기"(`features/meeting/ImportAudioButton`이 행 전체를 그린다).
  **녹음 중에는 숨기지 않고 비활성**으로 둔다 (2026-09-26, 숨기면 화면이 튄다 — "화면별 구성" > 녹음). 컴포넌트가 `useRecordingState`로 스스로 판단한다. 변환 중에는 비활성 + "가져오는 중…",
  성공하면 그 회의 상세로 이동하고, 실패 문구는 설명 자리에 빨간 글자로 바꾼다(높이 고정).
- **범위 밖**: 창에 파일을 끌어다 놓기, 여러 파일 한 번에 가져오기. 필요해지면 같은 `importRecording`에 경로를 넘기는 채널을 더한다.

## 녹음 (renderer)

**오디오 그래프의 소유자는 보이지 않는 녹음 호스트 창 하나뿐이다** (Phase 5-3, 아래 절). 메인 창은 녹음을 시작·정지하는
명령만 보내고 상태는 `recording:state`로 받는다. 아래 규칙은 그래프를 실제로 만드는 쪽(호스트 창)에 적용된다.

- `getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, deviceId? } })`.
  `deviceId`는 설정 `audio.inputDevice`가 있을 때만 `{ ideal: deviceId }`로 붙인다 (아래 "마이크 입력 장치와 테스트" 절).
  제약 객체는 `@renderer/shared/utils/microphone` 한 곳에서 만들고(`buildMicrophoneConstraints`·`openMicrophone`) 녹음·마이크 테스트가 같이 쓴다.
- `new AudioContext({ sampleRate: 16000 })` → `audioWorklet.addModule(workletUrl)` → 프로세서가 128프레임 단위로 받은 Float32를 `CHUNK_SAMPLES`(8192, 약 0.5초)씩 모아 `port.postMessage`.
- **워크릿 파일은 `src/renderer/src/worklet/pcmRecorder.js`에 두고 `import workletUrl from '@renderer/worklet/pcmRecorder.js?url'`로 로드한다.**
  `resources/` 아래에 두면 Vite 개발 서버가 서빙하지 않고 패키징 시에도 `process.resourcesPath`로 흩어져 renderer가 URL로 접근할 수 없다.
  `?url`은 개발 모드에서는 dev 서버 경로를, 빌드에서는 `out/renderer/assets/`에 복사된 경로를 준다.
  단 Vite는 작은 에셋을 `data:` URL로 인라인하는데, renderer의 CSP가 `script-src 'self'`라 인라인되면 `addModule`이 차단된다.
  `electron.vite.config.ts`의 renderer `build.assetsInlineLimit`에서 워크릿만 인라인 대상에서 빼 **항상 파일로 내보낸다**.
- 레벨 미터는 별도 `AnalyserNode`를 붙이지 않고 **main이 `recording:chunk`로 받은 청크의 RMS**를 계산해
  `recording:state`에 실어 보낸다 (노드를 하나 덜 만들고, 메인 창·메뉴바가 같은 값을 본다).
  RMS 계산은 `src/shared/audio.ts`의 순수 함수로 두고 vitest로 검증한다.
- 정지 시 `IPC.recording.stop` → main이 WAV 헤더를 확정하고 파이프라인 잡을 큐에 넣는다.
- **참석자 수(1~`MAX_SPEAKER_COUNT`=20, 정수)는 main의 녹음 세션이 들고 있는다.** 입력란은 메인 창에만 있지만
  녹음은 단축키·메뉴바로도 시작되므로, 입력이 바뀔 때마다 `recording:setSpeakerCount`로 main에 보내고 `recording:state`로 받는다.
  정지 시점에는 main이 보관값을 `meetings.speaker_count`에 저장해 화자 분리의 `num-clusters`로 쓴다.
  `StopRecordingRequest`에는 `speakerCount`를 싣지 않는다 — 두 경로가 생기면 "어느 쪽 값이 이겼는지"를 따져야 한다.
  비우면 임계값 폴백이며, 그 경우 화자가 과분할될 수 있다고 입력란 옆에 안내한다.
- Float32 → Int16 PCM 변환은 main의 `audio/wavWriter.ts`에서 수행 (renderer는 원본 Float32 `ArrayBuffer`만 전달).
- 샘플레이트·청크 크기 상수는 `src/shared/audio.ts`에 한 번만 정의해 renderer와 main이 함께 쓴다.
- `AudioContext`가 16kHz 요청을 무시할 수 있으므로 실제 `context.sampleRate`를 확인해 다르면 녹음을 시작하지 않고 안내한다 (`references/pitfalls.md`).

### 마이크 입력 장치와 테스트 (2026-09-25)

사용자 요청으로 설정 화면에 **입력 장치 선택**과 **마이크 테스트**를 둔다. 회의 직전에 "어느 마이크로, 소리가 들어오고 있는지"를
녹음을 시작하지 않고 확인하기 위해서다.

- **입력 장치는 `AppSettings.inputDevice`** (`{ deviceId, label } | null`, DB 키 `audio.inputDevice`, 기본 `null` = 시스템 기본 마이크)다.
  새 IPC 채널을 만들지 않는다 — 장치 목록은 renderer의 `navigator.mediaDevices.enumerateDevices()`가 주고, 값은 다른 설정과 함께 `settings:update`로 오간다.
  `label`을 함께 저장하는 이유는 장치를 뺀 뒤에도 설정 화면이 "무엇을 골라 뒀는지"를 보여주기 위해서다 (`deviceId`는 해시라 사람이 읽을 수 없다).
- **녹음 그래프는 시작할 때 설정을 읽어** `deviceId: { ideal }`로 요청한다. `exact`를 쓰지 않는다 — 골라 둔 마이크가 빠져 있으면
  녹음 자체가 실패하는 것보다 시스템 기본 마이크로 녹음되는 편이 낫다. 설정 화면의 설명 문구에 이 폴백을 적는다.
  Chromium의 `deviceId`는 origin별 해시이고 기본 세션(persist)에 소금이 저장되므로 앱을 다시 켜도 같은 값이다.
- **장치 목록**은 `useInputDevices`(domain 훅)가 `audioinput`만 골라 든다. Chromium의 `default`·`communications` 가상 항목은 뺀다 —
  "시스템 기본 마이크" 선택지(`null`)가 그 역할이다. 라벨이 비어 있으면(권한 전) `requestMicrophonePermission` 뒤 짧게 `getUserMedia`를 열었다 닫아 라벨을 받고,
  그래도 비면 `마이크 N`으로 표기한다. `devicechange` 이벤트로 목록을 다시 읽는다. 저장된 장치가 목록에 없으면 `"<label> (연결되지 않음)"`을 비활성 선택지로 보여준다.
  main은 `session.setPermissionCheckHandler`에서 `media`를 허용한다 — Chromium이 라벨을 줄지 결정할 때 이 핸들러를 본다.
- **마이크 테스트는 메인 창(설정 화면)에 짧게 사는 별도 그래프**다. "오디오 그래프 소유자는 호스트 창 하나"라는 규칙은 **녹음 그래프**에 대한 것이고,
  테스트 그래프는 청크를 보내지 않고 세션도 만들지 않는다. 구성은 `getUserMedia(같은 제약) → AudioContext(16kHz) → MediaStreamSource → AnalyserNode → gain 0 → destination`이며
  100ms마다 `getFloatTimeDomainData`의 RMS(`@shared/audio`의 `rmsOf`)를 `level`로 들고 레벨 미터(`LevelWaveform`)에 넘긴다.
  16kHz 확인·권한 요청은 녹음과 같은 경로를 타므로 **녹음이 실패할 환경이면 테스트도 같은 안내로 실패한다** — 그것이 테스트의 목적이다.
  - 녹음 중에는 테스트 버튼을 막는다 (마이크를 두 그래프가 잡아도 되지만 사용자가 헷갈린다). 장치 선택을 바꾸면 테스트를 정지한다.
  - 3초 넘게 피크가 `0.01` 아래면 "소리가 거의 잡히지 않습니다. 음소거되었거나 다른 장치가 선택됐을 수 있습니다"를, 그 위면 "소리가 잘 들어옵니다"를 보여준다.
  - 컴포넌트 언마운트·페이지 이탈 시 그래프를 닫는다 (`useEffect` cleanup).
- 화면은 설정 카테고리 **"마이크"** 하나에 두 행(입력 장치 select, 마이크 테스트 버튼 + 파형)이다. 훅은 `useInputDevices`·`useMicrophoneTest`
  (`shared/hooks/domain/recording`), 행 컴포넌트는 `SettingsSection/ui/{InputDeviceSelect,MicrophoneTest}.tsx`다.

## 녹음 호스트 창 · 메뉴바 · 전역 단축키 (Phase 5-3)

회의 중에 앱 창을 앞으로 꺼내지 않고도 녹음을 시작·정지하고, 녹음 중이라는 사실과 경과 시간을 볼 수 있게 한다.
구성은 **메뉴바(Tray) 시간 표시 + 전역 단축키**이고, 오디오 그래프는 **보이지 않는 녹음 호스트 창**이 들고 있다.

### 플로팅 위젯 패널 제거 (2026-09-28, `test/usage-analytics` 브랜치)

Phase 5-3에서는 화면 우측에 떠 있는 플로팅 패널(`type: 'panel'`, alwaysOnTop, 반투명)이 오디오 그래프 소유자이자
녹음 컨트롤이었다. 이 브랜치에서는 사용자 요청으로 **패널 UI를 없앤다** — 화면에 보이는 창, 위젯 설정(표시·반투명·불투명도·위치),
위젯 표시/숨김 단축키, 트레이의 "위젯 표시/숨김" 항목, `widget:setVisible` 채널이 모두 사라진다.

- **그래프 소유 창은 남긴다.** `getUserMedia`는 renderer 전용이고, 메인 창은 닫혀도 앱이 살아 있어 메뉴바·단축키로
  녹음할 수 있어야 한다. 메인 창에 그래프를 두면 창을 닫는 순간 녹음이 끊긴다. 그래서 창은 만들되 **한 번도 보이지 않는다**(`show: false`).
- 창은 `windows/recorder.ts`, 라우트는 `#/recorder`, 화면은 아무것도 그리지 않고 `useRecorder`만 도는 `recording/RecorderHostSection`이다.
- 메인 창 녹음 화면(`RecorderSection`)이 유일한 시각적 녹음 컨트롤이다. 참석자 수 입력도 여기에만 있다.
- 기존 사용자 DB에 남은 `widget.*`·`shortcut.widget` 키는 읽지 않을 뿐 지우지 않는다 (키-값 테이블이라 해가 없다).

### macOS WidgetKit 위젯을 만들지 않는 이유

알림 센터·데스크탑에 놓는 진짜 macOS 위젯은 SwiftUI로 작성한 **앱 확장(Widget Extension)** 이어야 한다.
확장마다 별도 서명·notarization 대상이 늘고(`references/distribution.md` 6절), 녹음 상태를 프로세스 밖으로 한 번 더
복제해야 하며, 버튼 동작은 `AppIntent`로 호스트 앱을 깨우는 우회가 필요하다. 얻는 것은 외형뿐이라 채택하지 않는다.

### 호스트 창 속성과 라우트

| 속성 | 값 | 이유 |
| --- | --- | --- |
| `show` | `false`, 이후에도 `show()`하지 않음 | 보이는 UI가 없다. 그래프만 든다 |
| `skipTaskbar` | `true` | Dock·앱 전환기에 창이 두 개로 보이지 않게 |
| `backgroundThrottling` | **`false`** | 숨겨진 창은 타이머·메시지 처리가 throttling된다. 그래프 소유자가 이 창이라 필수 |

- **별도 HTML 엔트리를 만들지 않고** 같은 `index.html`의 해시 라우트 `#/recorder`로 띄운다
  (`loadFile(..., { hash: '/recorder' })` / 개발 모드는 `loadURL(url + '#/recorder')`). **해시에 앞의 `/`를 빼면 `#recorder`가 되어 라우트가 맞지 않는다**.
- `/recorder`는 `RequireModels` 가드 **밖**에 둔다. 가드 안에 두면 모델이 없을 때 온보딩 화면이 마운트돼 훅이 돌지 않는다.
  대신 호스트가 `models:status`를 직접 조회해 준비 전이면 시작 명령을 오류(`modelNotReady`)로 돌려준다.
- 메인 창 참조를 `windows/main.ts`가 들고 있어야 한다. `BrowserWindow.getAllWindows()[0]`은 호스트 창이 0번이 될 수 있어
  **`app.on('activate')`의 재생성 조건과 `second-instance`의 포커스 대상이 깨진다.**
- 창이 둘이므로 진행률·업데이트 브로드캐스트(`broadcast`)는 그대로 두 창에 간다. 호스트는 자기가 쓰지 않는 이벤트를 구독하지 않으면 그만이다.

### 녹음 상태의 단일 출처

그래프(호스트 창)와 컨트롤(메인 창·메뉴바)이 떨어져 있으므로 **진행 중 녹음의 상태는 main의 세션(`src/main/audio/session.ts`)이 단일 출처**가 된다.

```ts
export interface RecordingStateEvent {
  meetingId: string | null
  /**
   * 경과 시간의 기준 시각(epoch ms) = 실제 시작 시각 + 지금까지 일시정지한 시간.
   * 경과 시간은 받는 쪽이 (pausedAt ?? Date.now()) - startedAt으로 계산한다 — 창마다 값이 어긋나지 않는다
   */
  startedAt: number | null
  /** 일시정지한 시각(epoch ms). 녹음 중이 아니거나 일시정지하지 않았으면 null */
  pausedAt: number | null
  /** 직전 청크의 RMS (0~1). 청크 주기(약 0.5초)로만 갱신된다 */
  level: number
  /** 세션에 보관 중인 참석자 수. 메인 창 입력란이 이 값을 보여 준다 */
  speakerCount?: number
  /** 정지가 끝난 순간 한 번만 실린다. 메인 창이 이 회의의 상세로 이동한다 */
  stoppedMeetingId?: string
  /**
   * 시작·정지가 실패한 순간 한 번만 실린다. 마이크 권한 거부나 그래프 생성 실패는 호스트 창에서만 일어나는데,
   * 시작을 누른 사람은 메인 창에 있을 수 있다. 실패를 세션에 모아 메인 창이 안내를 본다
   */
  errorMessage?: string
}
```

- **경과 시간을 이벤트로 보내지 않는다.** `startedAt`만 주고 각 창이 계산하면 IPC 횟수가 늘지 않고, 창이 가려져 렌더가 밀려도 값이 정확하다.
- 창이 새로 열렸을 때를 위해 조회 채널 `recording:state`(invoke)를 함께 둔다. 이벤트만 있으면 늦게 연 창이 현재 상태를 모른다.
- 전역 단축키·Tray 메뉴로 녹음을 시작하려면 main이 호스트 창에 지시해야 한다 (`getUserMedia`는 renderer에만 있다).
  이 방향의 push 채널이 `recording:command`(`{ kind: 'start' | 'stop' | 'toggle' }`)다. 호스트가 그래프를 만든 뒤 평소처럼 `recording:start`를 invoke한다.
  main → renderer → main으로 한 바퀴 도는 모양이지만, 마이크 접근이 renderer 전용이라 피할 수 없다.
- **메인 창의 시작·정지 버튼도 같은 경로를 탄다.** 메인 창은 `recording:control`(invoke)로 main에 요청하고,
  main이 호스트 창에 `recording:command`를 push한다. 메인 창이 `recording:start`를 직접 부르면 그래프 없는 녹음이 시작돼
  빈 WAV가 남는다.
- **호스트 창은 항상 만든다.** 이 창이 오디오 그래프의 소유자라, 창이 없으면 어느 경로로도 녹음할 수 없다
  (숨은 창이 그래프를 들고 있어도 되는 이유가 `backgroundThrottling: false`다).
- **참석자 수 보관값은 정지 후에도 남는다.** 다음 녹음이 같은 값으로 시작하지만 메인 창 입력란에 계속 보이므로 숨은 상태가 아니다.
  세션마다 지우면 단축키로 시작 → 메인 창에서 입력하는 흐름이 매번 초기화된다.

### 일시정지·재개 (2026-09-26)

사용자 요청으로 녹음을 멈췄다가 같은 회의로 이어 녹음할 수 있게 한다. 쉬는 시간·잡담처럼 회의록에 남기지 않을 구간을 빼는 용도다.

- **일시정지는 main 세션이 청크를 버리는 것으로 구현한다.** 호스트 창의 오디오 그래프는 그대로 돌고 청크도 계속 오지만,
  세션이 일시정지 상태면 WAV에 쓰지 않는다. 호스트에 새 명령(`recording:command`)을 보내지 않으므로 main → 호스트 → main 왕복이 없고,
  상태의 단일 출처가 여전히 세션 하나다. 마이크 사용 표시는 계속 켜져 있다 — 재개할 때 그래프를 다시 만들며 생기는 지연·권한 재확인을 피하는 값이다.
- 일시정지 중에는 시스템 오디오 버퍼도 같은 길이만큼 **꺼내서 버린다**(`take`). 버리지 않으면 재개 직후 멈춰 있던 동안의 상대방 소리가 섞여 들어간다.
  라이브 받아쓰기에는 넣지 않고, 레벨은 0으로 보낸다.
- 일시정지 구간은 WAV에 없으므로 **회의 길이(`duration_sec`)와 발화 타임스탬프는 녹음된 구간만 센다.** 이어 붙인 경계에 표시를 남기지 않는다.
- 경과 시간: 세션은 `pausedAt`을 들고, 재개할 때 `startedAt`을 멈춰 있던 시간만큼 뒤로 민다. 그래서 받는 쪽 계산식은
  `(pausedAt ?? Date.now()) - startedAt` 하나이고 누적 일시정지 시간을 따로 보내지 않는다. 회의 행의 `created_at`은 실제 시작 시각 그대로다.
- 요청은 `recording:setPaused`(`{ isPaused }`, 응답은 바뀐 녹음 상태) 하나다. 녹음 중이 아니면 오류, 이미 같은 상태면 그대로 돌려준다. 정지는 일시정지 중에도 할 수 있다.
- UI: 메인 창 녹음 화면의 정지 버튼 **왼쪽**에 **아이콘만 있는 원형 버튼**(`pause` ↔ `play`, `aria-label`로 "일시정지"/"재개")을 둔다.
  `Button` primitive의 `secondary`를 쓰고 지름은 옆 정지 버튼 높이와 같게 한다(녹음 화면 52px) — 따로 그린 버튼은 디자인 시스템과 어긋난다.
  상태 문구는 "일시정지됨"으로 바꾸고, 메뉴바 제목은 `‖ 12:34`로 멈춘 시간을 보여 준다. 트레이 메뉴·전역 단축키에는 추가하지 않는다.

### 메뉴바 (Tray)

- 아이콘은 `resources/trayTemplate.png`(+`@2x`). 파일명이 `Template`으로 끝나야 macOS가 다크/라이트에 맞춰 반전한다.
- 아이콘 원본은 SVG다: 앱 아이콘 `build/icon.svg`(→ `build/icon.{icns,png,ico}`, `resources/icon.png`), 메뉴바 `build/trayTemplate.svg`(→ 28×22 · 56×44 PNG).
  PNG·icns는 손으로 고치지 않고 SVG에서 다시 렌더링한다 (`rsvg-convert` + `iconutil`).
- 녹음 중에는 `tray.setTitle('● 12:34')`로 경과 시간을 1초마다 갱신하고, 녹음 중이 아니면 제목을 비워 아이콘만 남긴다.
  타이머는 **녹음 중에만** 돌리고 정지 시 `clearInterval`한다.
- 트레이 메뉴: 녹음 시작/정지 · 메인 창 열기 · 종료.

### 전역 단축키

- 기본값은 `⌥⌘R` 녹음 토글 하나(위젯 표시/숨김 `⌥⌘W`는 패널과 함께 제거). `app.whenReady` 이후 등록하고 `will-quit`에서 `unregisterAll`한다.
- **앱 시작 시 등록 실패(다른 앱이 선점)는 앱을 멈추지 않는다.** `globalShortcut.register`의 반환값이 거짓이면 경고 로그만 남기고 진행한다.
  단축키가 없어도 메인 창과 트레이로 모든 동작을 할 수 있다.
- **설정 화면에서 바꿀 수 있다** (2026-09-24 사용자 요청으로 "고정값" 결정을 뒤집음). 값은 Electron accelerator 문자열로
  `shortcut.recording`에 저장한다.
  - 허용 형식은 `src/shared/shortcut.ts`의 `isValidAccelerator` 하나가 정한다: 수식키 `Control`·`Alt`·`Shift`·`Command` 중
    `Control`·`Alt`·`Command`가 **하나 이상**(Shift만으로는 일반 타이핑과 겹친다) + 키 하나(`A`~`Z`, `0`~`9`, `F1`~`F12`, `Space`, 방향키).
    renderer의 키 입력 변환(`KeyboardEvent.code` 기준 — `key`는 ⌥ 조합에서 특수문자가 된다)과 main의 검증이 같은 함수를 쓴다.
  - 저장 순서: 검증 → **등록을 먼저 시도하고 실패하면 이전 단축키로 되돌린 뒤 한국어 오류를 throw** → 성공했을 때만 DB에 쓴다.
    앱 시작과 달리 설정 변경에서는 실패를 삼키지 않는다 — 사용자가 방금 고른 키가 동작하지 않는 걸 모르면 안 된다.
  - **입력받는 동안은 전역 단축키를 해제한다** (`shortcuts:setSuspended`). 해제하지 않으면 현재 단축키를 누르는 순간 녹음이 시작된다.
    입력이 끝나거나(확정·Esc·포커스 이탈) 설정 화면이 언마운트되면 복구한다.
  - 안내 문구의 단축키 표기는 `formatAccelerator`(`⌥⌘R`)로 현재 설정값을 보여준다. 설정을 모르는 화면은 키를 적지 않고 "전역 단축키"라고만 쓴다.

### 설정

위젯 패널을 없애면서(위 "플로팅 위젯 패널 제거" 절) 위젯 관련 설정(`isWidgetEnabled`·`isWidgetFadeEnabled`·`widgetFadeOpacity`·`widgetShortcut`)도 없앴다.
전역 단축키는 `recordingShortcut` 하나이고, 위 "전역 단축키" 절의 저장 순서를 따른다.

설정 화면은 **카테고리별로 묶는다** (2026-09-24 사용자 요청). 항목이 늘어 한 줄 나열로는 찾기 어려워졌기 때문이다.
페이지 제목(`h1` "설정")은 `pages/Settings`가 갖고, 각 카테고리는 `h2` 제목을 가진 `section`이다.

| 순서 | 카테고리 | 항목 | 위치 |
| --- | --- | --- | --- |
| 1 | 마이크 | 입력 장치(`inputDevice`), 마이크 테스트 (2026-09-25, 위 "마이크 입력 장치와 테스트" 절) | `SettingsSection` |
| 2 | 녹음·처리 | 원본 녹음 파일 보관(`isAudioKept`), 조용히 처리(`isQuietProcessing`) | `SettingsSection` |
| 3 | 단축키 | 녹음 시작·정지(`recordingShortcut`) | `SettingsSection` |
| 4 | 음성 인식 모델 | 음성 인식 모델 변경 | `ModelDownloadSection` (온보딩과 공유) |
| 5 | 요약 · 용어 초안 | 실행 방식(로컬 / Claude API 키 / Claude Code / OpenAI API 키), 로컬을 골랐을 때만 **로컬 요약 모델 파일** 다운로드, API 키(공급자별), GPT 모델 선택, CLI 상태, 연결 확인 | `setting/LlmSection` — 파일 다운로드 행 `model/SummaryModelSection`은 페이지가 `localModelSlot`으로 끼운다 (아래 "LLM 공급자" 절). 2026-09-24까지는 "모델" 카테고리에 음성 인식 모델과 나란히 있었는데, 로컬 실행 방식의 부속품이 별개 설정처럼 보여 옮겼다 |
| 6 | 용어 사전 | 팀 소개, 초안 만들기, 용어 목록 (Phase 5-4) | `setting/GlossarySection` (자기 채널로 따로 읽고 쓰므로 `SettingsSection`의 한 번 로드와 무관하다. 모델 위젯과 같이 `children`으로 끼운다) |
| 7 | 업데이트 | 업데이트 확인(`isUpdateCheckEnabled`), 지금 확인(`UpdateCheck`) | `SettingsSection` |
| 8 | 언어 | UI 언어(`locale`, 한국어 / 영어, 2026-09-25, 위 "UI 언어" 절) | `SettingsSection` |

- 설정값 로드는 한 번만 한다. 그래서 `SettingsSection`이 1~3과 7·8을 모두 그리고, 4~6은 `children`으로 받아 3과 7 사이에 끼운다.
  페이지는 `<SettingsSection><SettingGroup title="음성 인식 모델"><ModelDownloadSection /></SettingGroup><LlmSection localModelSlot={<SummaryModelSection />} /><GlossarySection /></SettingsSection>` 형태로 배치만 한다.
  widgets는 widgets를 import하지 않으므로(`.claude/rules/component-abstract-pattern.md`) `SummaryModelSection`은 페이지가 슬롯으로 넘긴다.
- **오른쪽에 목차(TOC)를 둔다** (2026-09-24 사용자 요청). 카테고리가 7개(지금은 8개)로 늘어 스크롤로 찾기 어려워졌기 때문이다.
  목차는 composite `PageToc`가 스크롤 영역 안의 `h2`를 **DOM에서 읽어** 만든다 — 카테고리가 여러 위젯에 흩어져 있고
  설정 로드 전후로 개수가 달라지므로, 제목 목록을 따로 들고 있으면 순서·문구가 어긋난다. `MutationObserver`로 다시 읽는다.
  항목을 누르면 그 카테고리로 부드럽게 스크롤하고, 스크롤 위치에 맞는 항목을 강조한다(`aria-current`).
  창이 좁으면(본문 + 목차가 들어가지 않으면) 목차를 숨긴다.

## 라이브 받아쓰기 (2026-09-26)

사용자 요청으로 녹음 화면(메인 창 `RecorderSection`)의 파형 영역을 **"라이브 받아쓰기" 보기**로 바꿀 수 있게 한다.
들리는 말을 1~2초 안에 글자로 보여 줘 "방금 무슨 말을 했는지"를 바로 확인하는 용도다. SKILL.md 4절 "범위 절제"(실시간 스트리밍 STT 금지)의 사용자 결정 예외다.

### 엔진: 기존 whisper-cli를 짧은 구간마다 다시 돌린다

- **새 모델·새 의존성 없이** 파이프라인과 같은 `whisper-cli` + silero VAD를 쓴다.
  실측(M3 Pro, `-t 4`, 8초 구간 한 번): turbo q5 **약 1.6초·최대 메모리 0.9GB**(모델 로드 0.4초 + 인코딩 0.6초 + 디코딩), large-v3 q5 **약 3.1초·2.1GB**.
- **모델은 속도 우선으로 turbo를 쓴다** (2026-09-26 사용자 결정). 회의록 처리 모델(`stt.model`)과 따로 정한다 — 회의록은 정지 후 한 번이라 정확도가 우선이고,
  라이브는 말하는 동안 계속 돌아 지연·메모리·발열이 우선이다. `main/models/paths.ts`의 `liveWhisperModelPath()`가 정한다:
  - 고른 모델이 저사양(`small-q5_1`)이면 그 모델 — 메모리가 적어 저사양을 고른 사용자에게 더 무거운 모델을 올리지 않는다.
  - 그 밖에는 turbo 파일(`LIVE_WHISPER_MODEL_ID`, `@meeting-stt/models/desktop`)이 있으면 turbo, 없으면 고른 모델(고품질만 받은 사용자). 라이브용으로 turbo를 따로 내려받지는 않는다.
- sherpa-onnx 한국어 streaming zipformer(진짜 스트리밍)는 쓰지 않는다 — 온보딩 다운로드 목록에 모델이 하나 더 늘고,
  다운로더가 아카이브에서 파일 하나만 꺼내는데 이 모델은 encoder·decoder·joiner·tokens 네 파일이 필요하다. 지연 1~2초면 요구("바로바로")를 채운다.
- `whisper-server`(상주 HTTP)도 쓰지 않는다 — 바이너리를 하나 더 동봉·서명해야 하고, 모델 로드 0.4초를 아끼는 것 외에 이득이 없다.

### 구간 나누기 (`src/main/audio/liveWindow.ts`, 순수 함수 + vitest)

main의 녹음 세션이 청크(약 0.5초)를 받을 때마다 **현재 구간**(마지막 확정 이후의 오디오)에 쌓는다.

| 상수 | 값 | 의미 |
| --- | --- | --- |
| `LIVE_STEP_SEC` | 1.5 | 직전 실행 이후 새 오디오가 이만큼 쌓여야 다시 인식한다 |
| `LIVE_MAX_WINDOW_SEC` | 12 | 구간이 이 길이에 닿으면 결과를 확정하고 구간을 비운다 (말이 끊기지 않아도) |
| `LIVE_COMMIT_SILENCE_SEC` | 1 | 구간 끝이 이만큼 조용하면 말이 끝난 것으로 보고 확정한다 |
| `LIVE_SPEECH_RATIO` | 3 (+9.5 dB) | 청크 RMS가 최근 소음 바닥의 이 배수를 넘으면 말소리로 본다 |
| `LIVE_NOISE_HISTORY_CHUNKS` | 40 (약 20초) | 소음 바닥 = 최근 이 개수 청크 RMS의 최솟값 (하한 `LIVE_MIN_NOISE_FLOOR_RMS` 0.0005) |

- 구간에 말소리 청크가 하나도 없으면 whisper를 부르지 않고 구간을 마지막 청크만 남기고 버린다 — 조용할 때 GPU를 쓰지 않는다.
- 한 번에 하나만 돈다. 도는 동안 들어온 청크는 다음 실행에 들어간다. 확정할 때는 **인식에 넣은 샘플까지만** 구간에서 빼고, 그 뒤에 들어온 샘플은 다음 구간 앞에 남긴다.
- 확정 조건은 인식을 시작할 때의 스냅샷으로 판단한다 (끝의 조용함 또는 최대 길이). 확정된 결과는 `lines`에, 아직 말하는 중인 구간의 결과는 `partial`에 둔다.

### 인식 한 번 (`src/main/audio/liveTranscript.ts`)

- 구간을 Int16으로 바꾸고 **파이프라인과 같은 RMS 게인 정규화**(`normalize.ts`의 `measureSpeechRmsDb`·`gainDbFor`·`applyGain`)를 적용한 뒤
  임시 WAV(`app.getPath('temp')/meeting-stt-live/`)로 쓴다. 원거리 마이크에서 whisper가 말을 놓치는 문제가 라이브에도 똑같이 있다.
- 인자: `-m <모델> -f <wav> -l ko -t <stt 스레드> -mc 0 -nt -np --vad --vad-model <silero> -otxt -of <경로>`.
  결과는 stdout이 아니라 `-otxt` 파일을 UTF-8로 읽는다 (stdout 청크 경계에서 한글 바이트가 잘릴 수 있다). 줄바꿈은 공백으로 합친다.
- 실패(바이너리·모델 없음, 비정상 종료)는 녹음을 막지 않는다. 경고 로그는 녹음마다 한 번만 남기고, 라이브 보기에 안내 문구(`errorMessage`)를 띄운 채 다음 구간에서 다시 시도한다.
- 녹음이 끝나거나 보기를 끄면 세대 번호를 올려 **도는 중인 실행의 결과를 버린다**. 프로세스는 죽이지 않는다 (길어야 2초, 정지 직후 파이프라인과 잠깐 겹친다).

### 상태와 IPC

- 보기 모드(`isEnabled`)는 참석자 수처럼 **세션 밖 main 메모리**에 둔다 — 녹음 전에 켜 둘 수 있고, 다음 녹음에도 이어진다. 앱을 다시 켜면 꺼진다(파형이 기본). 설정 DB에 저장하지 않는다.
- 결과는 새 push 채널 없이 `RecordingStateEvent.liveTranscript`로 싣는다. 이 이벤트는 청크마다(0.5초) 가므로 인식이 끝난 결과는 **다음 청크 이벤트에 실려 간다**(최대 0.5초 추가 지연). 인식이 끝날 때 따로 publish하지 않는 이유는, 0.5초 안에 어차피 실려 가는 값을 위해 이벤트 종류와 빈도를 늘릴 이유가 없기 때문이다. 늦게 연 창도 `recording:state` 조회로 현재 글자를 받는다.

```ts
export interface LiveTranscriptLine {
  /** 녹음 안에서 1부터 늘어나는 번호. 리스트 key로 쓴다 (DB 행이 아니다) */
  id: number
  text: string
}
export interface LiveTranscriptState {
  isEnabled: boolean
  /** 확정된 문장. 최근 LIVE_MAX_LINES(50)개만 싣는다 */
  lines: LiveTranscriptLine[]
  /** 아직 말하는 중인 구간의 인식 결과. 다음 실행에서 바뀔 수 있다 */
  partial: string
  errorMessage?: string
}
```

- 켜기·끄기: `recording:setLiveTranscript`(`{ isEnabled: boolean }`) → 응답은 `GetRecordingStateResponse`(`setSpeakerCount`와 같은 모양). 끄면 GPU를 쓰지 않고, 이미 확정된 줄은 남긴다.
- 새 녹음이 시작되면 `lines`·`partial`을 비운다. 녹음이 끝나면(정지) 비운다 — 정지 후에는 상세 화면의 진짜 회의록을 본다.
- **라이브 결과는 DB에 저장하지 않는다.** 저장되는 회의록은 정지 후 파이프라인(전체 정규화·VAD·화자 분리·병합·교정)이 만든다.

### 화면

- `RecorderSection`의 보기 카드 헤더에 **보기 전환 버튼 두 개**(파형 / 라이브 받아쓰기, `aria-pressed`)를 둔다. 녹음 전·중 모두 바꿀 수 있다.
- 라이브 보기는 보기 카드 본문을 채우는 스크롤 영역이다 (카드 크기는 화면이 정하므로 보기를 바꿔도 다른 요소가 움직이지 않는다 — "화면별 구성" > 녹음). 확정된 줄은 본문 색, `partial`은 옅은 색으로 이어 쓰고, 새 글자가 오면 맨 아래로 스크롤한다
  (사용자가 위로 스크롤해 읽는 중이면 따라가지 않는다). 녹음 전에는 "녹음을 시작하면 들리는 말이 여기에 바로 나타납니다" 안내를 보인다.
- 아래에 "미리보기입니다. 회의록은 녹음을 마친 뒤 더 정확하게 다시 만듭니다" 한 줄을 둔다.
- 그 아래에 **자원 사용 안내**를 한 줄 더 둔다 (2026-09-26 사용자 요청): "말하는 동안 GPU를 계속 써서 발열과 배터리 소모가 늘 수 있습니다. 필요 없을 때는 파형으로 바꿔 두세요".
  말하는 동안 인식이 쉬지 않고 이어져 GPU를 70~100% 쓰고, 한 번에 메모리 약 0.9GB를 잡기 때문이다. 인식 실패 안내가 떠 있어도 이 줄은 남긴다.

## 시스템 오디오 캡처 (Phase 5-2, 2026-09-26)

온라인 회의(Zoom·Meet·Teams·브라우저)의 **상대방 목소리는 마이크가 아니라 스피커로 나온다.** 이를 회의록에 넣으려면 스피커로 나가는 소리를
앱이 직접 잡아야 한다. 사용자 결정: **앱 밖에서 해야 하는 설정은 두지 않는다** — BlackHole 같은 가상 오디오 드라이버 설치·집계 장치 구성을 안내하는 방식은 쓰지 않는다.

### 방식: Core Audio Taps + 동봉 Swift 도구

- macOS 14.2+의 **Core Audio Taps**(`CATapDescription` + `AudioHardwareCreateProcessTap`)를 쓴다. 권한은 **"시스템 오디오 녹음"** 하나뿐이고
  화면 녹화 권한·보라색 화면 녹화 표시가 없다. 대상 플랫폼(macOS 14+)과 거의 겹친다 — 14.0·14.1은 지원하지 않고 안내만 한다.
- Electron 내장 `getDisplayMedia` + `audio: 'loopback'`(Electron 39+)은 쓰지 않는다. macOS에서는 네이티브 화면 공유 피커(`useSystemPicker: true`)를 거쳐야만
  소리가 들어오고(커스텀 피커는 트랙이 바로 끝나는 버그, electron#52738), 녹음마다 창을 고르고 "화면 및 시스템 오디오 녹음" 권한을 받아야 한다.
- 외부 npm 패키지(`audiotee`, `electron-audio-loopback`)도 들이지 않는다 — 릴리스 바이너리가 없어 어차피 Swift를 빌드해야 하고, 필요한 코드가 200줄 남짓이라 직접 갖는 편이 관리가 쉽다.
- 도구는 **`apps/desktop/native/systemAudioTap/main.swift`** 한 파일이고 `scripts/setupBin.ts`가 `swiftc -O -target arm64-apple-macos14.2`로
  `resources/bin/darwin-arm64/systemAudioTap`을 만든다 (Xcode 또는 Command Line Tools 필요. 없으면 경고만 남기고 이 기능만 막힌다).
  다른 동봉 바이너리처럼 `asarUnpack` 대상이고 서명·공증도 같이 받는다 (`references/distribution.md` 5절).
  `Info.plist`에 `NSAudioCaptureUsageDescription`(한국어)을 `electron-builder.yml` `extendInfo`로 넣는다 — 없으면 권한 창이 뜨지 않는다.

### 도구 규약 (`systemAudioTap`)

| 항목 | 값 |
| --- | --- |
| 인자 | 없음 (16kHz mono 고정, `@shared/audio`의 `SAMPLE_RATE_HZ`와 같은 값) |
| stdout | Float32LE mono PCM 16kHz, 연속 스트림 |
| stderr | 한 줄씩. `ready`(집계 장치 시작), `format: …`, `restarted: …`, `warn: …`, `error: …` |
| 종료 | stdin이 닫히거나 SIGTERM → 탭·집계 장치 정리 후 0. 시작 실패는 `error:` 한 줄 뒤 1 |

- 탭은 `CATapDescription(monoGlobalTapButExcludeProcesses: [])`(모든 프로세스 mono 믹스다운, 제외 없음) + `isPrivate` + `muteBehavior = .unmuted`.
  비공개 집계 장치에 기본 출력 장치를 서브 장치로, 탭을 `kAudioAggregateDeviceTapListKey`로 물린다. 채널·샘플 형식은 `kAudioTapPropertyFormat`에서 읽되
  **샘플레이트는 집계 장치의 `kAudioDevicePropertyNominalSampleRate`를 쓴다** — 탭 형식 속성은 만들 때 값(48kHz)에 머무는데 실제 콜백 데이터는 출력 장치 속도(실측 24kHz)를 따라서,
  탭 형식대로 변환하면 소리가 절반 속도로 들어와 길이가 어긋난다. 속도가 재생 중에 바뀌므로 그 속성의 리스너에서 `AVAudioConverter`를 다시 만든다.
- **벽시계 기준 연속 스트림.** 실측(M3 Pro, macOS 26.5)에서 IOProc은 무음에도 512프레임씩 계속 오지만, **첫 실행은 탭이 만들어진 뒤 몇 초 동안 버퍼가 오지 않았다.**
  도구는 프로세스 시작 시각을 기준으로 "지금까지 내보냈어야 할 샘플 수"를 계산해 부족분(`GAP_FILL_THRESHOLD_SEC` 0.1 이상)을 0으로 채운다. 콜백이 멈춰도 0.5초 타이머가 같은 일을 한다.
  main은 그래서 시스템 스트림을 마이크와 같은 속도의 연속 스트림으로 볼 수 있다.
- 기본 출력 장치가 바뀌면(이어폰 연결·해제) 집계 장치의 시계가 끊기므로 `kAudioHardwarePropertyDefaultOutputDevice` 리스너가 탭·집계 장치를 통째로 다시 만든다. 그 사이 구간은 위 규칙으로 0이 채워진다.
- **권한 거부 시 동작은 검증하지 못했다** (개발 기기에서 TCC를 초기화하지 않는다). 탭 생성이 실패하면 `error:`로, 성공한 채 무음이면 그대로 무음이 녹음된다.
  녹음 화면 안내 문구가 시스템 설정 경로(개인정보 보호 및 보안 → 화면 및 시스템 오디오 녹음)를 적는다.

### main: 섞기는 세션 안에서, 파이프라인은 그대로

- **켜기/끄기는 녹음 화면의 스위치**(`recording:setSystemAudio`, `{ isEnabled }` → `GetRecordingStateResponse`)이고 값은 DB 키 `audio.systemCapture`(기본 꺼짐)에 남아 앱을 다시 켜도 유지된다.
  `AppSettings`에 넣지 않는 이유는 켜는 행위가 값 저장이 아니라 **프로브**를 동반하기 때문이다 — 켜는 순간 `src/main/audio/systemAudio.ts`가 도구를 띄워 `ready`까지 기다렸다가(최대 `PROBE_TIMEOUT_MS` 15초 — 첫 실행은 시스템 권한 창이 떠 있는 동안 멈춰 있을 수 있다) 끝낸다.
  회의 시작 전에 시스템 권한 창을 미리 띄우고 바이너리·OS 버전 문제를 그 자리에서 알리기 위해서다. 실패하면 스위치는 켜지지 않고 `systemAudio.errorMessage`를 싣는다.
- 상태는 `RecordingStateEvent.systemAudio: { isEnabled: boolean; errorMessage?: string }`로 두 창에 push한다. 값은 참석자 수처럼 **세션 밖 main 메모리**(DB에서 한 번 읽어 캐시)에 있고 녹음 중에 바꾸면 다음 녹음부터 적용된다 (스위치는 녹음 중 비활성).
- `startRecording`이 켜져 있으면 도구를 spawn한다. 실패(바이너리 없음·비정상 종료)해도 **녹음은 마이크만으로 계속**하고 `systemAudio.errorMessage`로 알린다 — 회의 중에 녹음이 통째로 실패하는 것보다 낫다.
- `appendRecordingChunk`가 마이크 청크(`CHUNK_SAMPLES` 8192)를 받을 때마다 시스템 FIFO에서 같은 개수를 꺼내 **샘플별로 더하고 ±1로 클립**한 뒤 WAV·레벨(RMS)·라이브 받아쓰기에 넘긴다.
  섞은 결과가 파이프라인 입력이므로 정규화·VAD·STT·화자 분리·병합은 손대지 않는다. 상대방이 여러 명이면 화자 분리가 그쪽 목소리도 나눈다.
  `src/main/audio/systemAudioMix.ts`(순수 함수, vitest): FIFO는 부족하면 0으로 채우고(도구 시작 지연·재시작 구간), 꺼낸 뒤 남은 양이 `MAX_BACKLOG_SAMPLES`(1.5초)를 넘으면 오래된 것을 버려 시계 차이로 밀리는 것을 막는다.
  시작 시점의 0 채움만큼 시스템 소리가 마이크보다 뒤로 밀리지만(보통 0.5초 미만, 첫 실행은 몇 초) 한 스트림 안의 순서는 그대로라 STT·화자 분리에는 영향이 없다.
- `stopRecording`은 FIFO에 남은 시스템 샘플(최대 0.5초, 상대방의 마지막 말)을 한 청크 더 쓰고 도구의 stdin을 닫아 끝낸다. 앱 종료(`finalizeActiveRecording`)도 같은 경로다.
- **에코.** 스피커로 회의를 들으면 상대방 목소리가 마이크에도 들어와 두 번 섞인다(수 ms 차이라 잔향처럼 들린다). `getUserMedia`의 `echoCancellation`은 Chromium이 재생한 소리만 지우므로 Zoom 소리에는 효과가 없다.
  스위치 행의 안내 문구에 **이어폰 권장**을 적는다. 마이크 쪽에서 겹치는 구간을 지우는 처리는 하지 않는다 (완료 기준에서 품질을 보고 결정).

### 화면

- `RecorderSection` 오른쪽 옵션 패널 "녹음 설정" 그룹의 참석자 수 행 아래에 같은 모양의 행 하나: 제목 "온라인 회의 소리 함께 녹음", 설명 "Zoom·Meet 상대방 목소리도 회의록에 넣습니다. 이어폰을 쓰면 더 정확합니다. 시작 전에 켜 두세요", 오른쪽에 `Switch`.
  녹음 중에는 **비활성**(숨기지 않는다)이고, `systemAudio.errorMessage`가 있으면 설명 자리에 빨간 문구로 바꾼다(설명 높이는 세 줄로 고정, "화면별 구성" > 녹음).
- 녹음 중 상태 표시 옆에 켜져 있음을 알리는 짧은 배지("상대방 소리 포함")를 둔다 — 회의 중 "지금 저쪽 소리도 잡히고 있나"를 한눈에 알기 위해서다.
