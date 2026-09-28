# 데이터 모델

## SQLite 스키마 (better-sqlite3, main 프로세스)

```sql
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS meetings (
  id            TEXT PRIMARY KEY,           -- uuid
  title         TEXT NOT NULL,              -- 기본값: "2026-08-25 회의"
  created_at    INTEGER NOT NULL,           -- epoch ms
  duration_sec  REAL NOT NULL DEFAULT 0,
  status        TEXT NOT NULL,              -- 'recording' | 'processing' | 'done' | 'error'
  error_message TEXT,
  audio_path    TEXT,                       -- 원본 WAV 경로 (삭제 후 NULL)
  summary       TEXT,                       -- Phase 5 로컬 LLM 요약용
  speaker_count INTEGER,                    -- 녹음 정지 시 입력한 참석자 수 → diarization num-clusters (NULL이면 임계값 폴백). 마이그레이션 2
  refine_applied TEXT,                      -- Phase 5-4 마지막 자동 교정에서 본문에 반영한 쌍 (RefinePair[] JSON). 마이그레이션 3→4
  refined_at    INTEGER                     -- 마지막 자동 교정 시각 (epoch ms). NULL이면 아직 교정하지 않음. 마이그레이션 4
);

CREATE TABLE IF NOT EXISTS utterances (
  id            TEXT PRIMARY KEY,
  meeting_id    TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  ord           INTEGER NOT NULL,           -- 표시 순서
  speaker_label TEXT NOT NULL,              -- 'SPEAKER_00' (원본 라벨, 재배정 시 갱신)
  start_sec     REAL NOT NULL,
  end_sec       REAL NOT NULL,
  text          TEXT NOT NULL,              -- 사용자 수정 시 갱신
  original_text TEXT                        -- 자동 교정이 처음 바꾸기 전 원문. NULL이면 교정으로 바뀐 적 없음. 마이그레이션 5
);
CREATE INDEX IF NOT EXISTS idx_utterances_meeting ON utterances(meeting_id, ord);

CREATE TABLE IF NOT EXISTS speakers (
  meeting_id    TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  label         TEXT NOT NULL,              -- 'SPEAKER_00'
  display_name  TEXT,                       -- 사용자 지정 이름 (NULL이면 "화자 1" 식으로 표시)
  PRIMARY KEY (meeting_id, label)
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,                   -- 'audio.keep' (Phase 3), 'stt.model' (Phase 4) ...
  value TEXT NOT NULL                       -- JSON 문자열
);
```

- 화자 이름은 반드시 `speakers` 매핑으로만 관리한다. `utterances.speaker_label`은 익명 라벨.
- 화자 병합(A→B)은 `utterances.speaker_label` UPDATE + `speakers` 행 삭제로 처리한다. 한 트랜잭션 안에서 함께 한다.
- 마이그레이션은 `PRAGMA user_version` 정수로 관리하고 `src/main/db/migrations.ts`에 순차 배열로 둔다.
  - 1: 초기 스키마. 2: `ALTER TABLE meetings ADD COLUMN speaker_count INTEGER` (2026-08-26, 참석자 수 → `num-clusters`).
    3: `ALTER TABLE meetings ADD COLUMN refine_pairs TEXT` + `ADD COLUMN glossary_terms TEXT` (2026-09-25, 교정 제안·회의별 용어 — 같은 날 폐기).
    4: `DROP COLUMN glossary_terms` + `RENAME COLUMN refine_pairs TO refine_applied` + `UPDATE … SET refine_applied = NULL` + `ADD COLUMN refined_at INTEGER`
       (2026-09-25, 자동 교정으로 전환. 3에서 저장된 미확정 제안은 반영된 적이 없으므로 비운다. 개발 DB가 이미 버전 3이라 3을 고치지 않고 4를 더했다).
    5: `ALTER TABLE utterances ADD COLUMN original_text TEXT` (2026-09-28, 문장 교정과 발화별 되돌리기. 이전에 교정된 발화는 원문이 없어 NULL로 남는다).

## 편집 동작 (Phase 3)

| 동작 | SQL |
| --- | --- |
| 발화 텍스트 수정 | `UPDATE utterances SET text = ? WHERE id = ? AND meeting_id = ?` |
| 발화 화자 재배정 | `UPDATE utterances SET speaker_label = ? WHERE id = ? AND meeting_id = ?` (대상 라벨이 같은 회의의 `speakers`에 있어야 한다) |
| 화자 이름 지정 | `UPDATE speakers SET display_name = ? WHERE meeting_id = ? AND label = ?` |
| 화자 병합 A→B | 트랜잭션: `UPDATE utterances SET speaker_label = B …` + `DELETE FROM speakers WHERE label = A` |
| 회의 제목 변경 | `UPDATE meetings SET title = ? WHERE id = ?` |
| 회의 삭제 | `DELETE FROM meetings WHERE id = ?` (발화·화자는 `ON DELETE CASCADE`) + 원본 WAV 파일 삭제 |

- `ord`는 편집으로 바뀌지 않는다. 발화 순서를 사용자가 바꾸는 기능은 범위에 없다.
- 화자 재배정으로 앞뒤 발화의 화자가 같아져도 발화를 자동으로 합치지 않는다 (`references/architecture.md` 편집 UI 규칙).
- 이름을 지운(빈 문자열) 경우 `display_name`을 `NULL`로 되돌리지 않는다. 빈 값은 저장 자체를 막는다.

## 요약 저장 (Phase 5)

| 동작 | SQL |
| --- | --- |
| 요약 저장 | `UPDATE meetings SET summary = ? WHERE id = ?` |

- `meetings.summary`는 **요약 잡이 성공했을 때만** 통째로 덮어쓴다. 부분 요약(map 결과)은 저장하지 않는다 —
  회의록에서 언제든 다시 만들 수 있는 파생물이라 DB에 남길 이유가 없다.
- **요약 실패는 `meetings.status`를 건드리지 않는다.** `status`는 파이프라인(STT·화자 분리) 소유다.
  요약이 실패해도 회의록은 그대로 `'done'`이어야 하고, 실패는 `summary:progress`의 `'error'`로만 알린다.
- 회의를 지우면 요약도 함께 사라진다 (같은 행이다). 요약만 지우는 동작은 범위에 없다 — 다시 요약하면 덮어쓴다.
- 요약 중 임시 파일은 `userData/summaries/<meetingId>/`에 두고 **잡이 끝나면 실패해도 지운다**.
- 요약은 자동 실행이 아니라 사용자가 버튼으로 요청한다. 잡 큐는 파이프라인과 공유하며 동시성은 1이다
  (`{ kind: 'pipeline' | 'summary' }`). 같은 회의의 요약 잡이 이미 큐에 있으면 다시 넣지 않는다.

## 다시 인식 (2026-09-25)

원본 WAV가 남아 있는 회의를 파이프라인에 다시 넣는다 (`architecture.md` "녹음본 재생·내보내기·다시 인식").

| 동작 | SQL |
| --- | --- |
| 요청 | `UPDATE meetings SET speaker_count = ?, status = 'processing', error_message = NULL WHERE id = ?` (`speaker_count`는 `NULL` 허용 — 임계값 폴백) |
| 성공 저장 | 트랜잭션: `DELETE FROM speakers WHERE meeting_id = ?` + 새 라벨 `INSERT` + 발화 전체 교체(`DELETE` + `INSERT`) + `UPDATE meetings SET refine_applied = NULL, refined_at = NULL` |

- 첫 처리도 같은 "성공 저장"을 거친다. 첫 처리에는 지울 화자·발화·교정 결과가 없을 뿐이다.
- 화자 이름은 초기화된다. 새 군집 라벨(`SPEAKER_00` …)은 이전 군집과 대응하지 않아 이름을 옮기면 틀린 사람에게 붙는다.
- `summary`는 건드리지 않는다. `duration_sec`·`title`·`created_at`도 그대로다.

## 자동 교정 결과 저장 (Phase 5-4)

| 동작 | SQL |
| --- | --- |
| 교정 반영 | 트랜잭션: 바뀐 발화마다 `UPDATE utterances SET original_text = COALESCE(original_text, text), text = ? WHERE id = ? AND meeting_id = ?` + `UPDATE meetings SET refine_applied = ?, refined_at = ? WHERE id = ?` |
| 결과 조회 | `SELECT refine_applied, refined_at FROM meetings WHERE id = ?` (`meetings:get`에 `refineResult`로 실린다) |
| 발화 되돌리기 | 트랜잭션: `UPDATE utterances SET text = original_text, original_text = NULL WHERE id = ? AND meeting_id = ? AND original_text IS NOT NULL` + 그 발화의 쌍을 뺀 `refine_applied` 저장 (2026-09-28) |

- 결과는 별도 테이블이 아니라 **`meetings.refine_applied` JSON 한 컬럼**이다. 회의당 수십 개 안팎의 작은 파생물이고 회의와 함께 사라지며,
  개별 행을 조회·정렬할 일이 없다 (요약 컬럼과 같은 판단). JSON이 깨져 있으면 빈 목록으로 읽는다.
- 저장 단위는 실제로 본문을 바꾼 **쌍(`RefinePair`: utteranceId, from, to, similarity)** 이다. 문장 교정의 "발음 가드를 통과한 덩어리"도 같은 형식이다.
  화면은 쌍을 묶어 "무엇을 몇 곳 고쳤는지"를 보여 준다 (`architecture.md` "회의록 교정").
- ~~발화의 "전" 텍스트는 저장하지 않는다~~ → **2026-09-28부터 `utterances.original_text`에 처음 교정되기 전 원문을 보관한다.** 문장 교정은 고치는 범위가 넓어
  인라인 편집만으로 되돌리기 어렵다. `COALESCE`로 처음 값만 남기므로 다시 교정해도 인식 원문이 유지되고, 사용자 인라인 편집은 `original_text`를 건드리지 않는다.
  다시 인식(파이프라인 재실행)은 발화를 새로 만들므로 원문도 함께 사라진다.
- `refined_at`이 NULL이면 아직 교정하지 않은 회의다 (용어가 없거나 LLM이 준비되지 않아 건너뛴 경우 포함). `refined_at`이 있고 `refine_applied`가 비어 있으면 고칠 곳을 찾지 못한 것이다.
- **교정 실패는 `meetings.status`와 이전 결과를 건드리지 않는다.** 요약과 같은 규칙이다.
- 교정의 근거는 전역 용어 사전(`settings`의 `glossary.terms`)뿐이다. 회의별 용어 컬럼은 두지 않는다 (2026-09-25 사용자 결정).
  외부 공급자의 문장 교정은 용어 사전 없이도 돈다 (2026-09-28).

## settings 테이블 키

`settings`는 `key` → JSON 문자열 `value`다. 앱이 읽을 때는 `src/shared/types.ts`의 `AppSettings`로 모아서 다룬다.

| 키 | 타입 | 기본값 | 뜻 |
| --- | --- | --- | --- |
| `audio.keep` | boolean | `false` | 파이프라인 성공 후 원본 WAV를 보관할지. 끄면 삭제하고 `meetings.audio_path`를 `NULL`로 만든다 |
| `update.check` | boolean | `false` | 앱 시작 시 새 버전이 있는지 확인할지 (Phase 4). 꺼져 있으면 네트워크를 전혀 쓰지 않는다 |
| `stt.model` | `WhisperModelId` | `'turbo-q5'` | 온보딩·설정에서 고른 음성 인식 모델 (Phase 4). 모르는 값이면 기본 모델로 읽는다 |
| ~~`widget.enabled`·`widget.bounds`·`widget.fade`·`widget.fadeOpacity`~~ | — | — | **2026-09-28 제거** (이 브랜치에서 위젯 패널 제거). 이전 빌드가 쓴 행이 남아 있어도 읽지 않는다 (`references/architecture.md` "녹음 호스트 창 · 메뉴바 · 전역 단축키") |
| `shortcut.recording` | string | `'Alt+Command+R'` | 녹음 토글 전역 단축키 (Electron accelerator). 형식이 틀리면 기본값으로 읽는다 |
| ~~`shortcut.widget`~~ | — | — | **2026-09-28 제거** (위젯 패널과 함께). 남은 행은 읽지 않는다 |
| `pipeline.quiet` | boolean | `false` | 조용히 처리. 켜면 화자 분리 스레드를 줄이고 STT와 화자 분리를 순차로 돌린다. 느려지는 대신 발열·팬 소음이 준다. 잡이 **시작할 때** 읽으므로 진행 중인 잡에는 적용되지 않는다 (`references/architecture.md` 가속·스레드 정책) |
| ~~`ui.theme`~~ | — | — | **2026-09-28 제거** (knot 리디자인, 다크 모드 없음). 이전 빌드가 쓴 행이 남아 있어도 읽지 않는다 (`references/architecture.md` "다크 모드 없음") |
| `refine.autoExternal` | boolean | `false` | 외부 LLM 공급자일 때 회의록이 만들어지면 자동으로 문장 교정할지 (2026-09-28). 켜면 회의가 끝날 때마다 회의록이 그 회사 서버로 전송된다. 로컬 공급자의 자동 용어 교정과는 무관하다 (`references/architecture.md` "회의록 교정") |
| `ui.locale` | `'ko' \| 'en'` | `'ko'` | 화면·메뉴바·main 오류 문구의 언어 (2026-09-25). 인식·요약 언어가 아니다. 모르는 값이면 `'ko'`로 읽고, 저장 요청은 거절한다 (`references/architecture.md` "UI 언어") |
| `audio.inputDevice` | `{ deviceId, label } \| null` | `null` | 녹음에 쓸 마이크 (2026-09-25). `null`이면 시스템 기본 마이크. `deviceId`는 Chromium이 주는 origin별 해시(1~200자), `label`은 고를 당시의 장치 이름(0~200자)이며 장치를 뺀 뒤 설정 화면에 "연결되지 않음"으로 보여주기 위해 함께 둔다. 모양이 다르면 `null`로 읽고, 저장 요청은 거절한다. 녹음 그래프는 시작할 때 이 값을 읽어 `deviceId: { ideal }`로 요청하므로 장치가 없으면 기본 마이크로 폴백한다 (`references/architecture.md` "마이크 입력 장치와 테스트") |
| `audio.systemCapture` | boolean | `false` | 온라인 회의 상대방 소리(스피커 출력)를 마이크와 함께 녹음할지 (2026-09-26, Phase 5-2). 녹음 화면의 스위치가 `recording:setSystemAudio`로 바꾸고 다음 녹음부터 적용된다. `AppSettings`에 넣지 않는다 — 켜는 행위가 값 저장이 아니라 동봉 도구 프로브(시스템 권한 창)를 동반하기 때문이다 (`references/architecture.md` "시스템 오디오 캡처") |

```ts
export interface AudioInputDevice {
  deviceId: string
  label: string
}

export interface AppSettings {
  isAudioKept: boolean
  isUpdateCheckEnabled: boolean
  isQuietProcessing: boolean
  recordingShortcut: string
  inputDevice: AudioInputDevice | null
  locale: Locale
}
```

- 키는 점 표기(`audio.keep`)로 두고 TS 필드명은 코드 컨벤션(`is` 접두 boolean)을 따른다. 둘 사이 변환은 `src/main/db/settings.ts` 한 곳에서만 한다.
- 값이 없거나 JSON 파싱에 실패하면 기본값으로 읽는다 (설정 하나가 깨졌다고 앱이 뜨지 않으면 안 된다).
- **`stt.model`은 `AppSettings`에 넣지 않는다.** 모델을 바꾸는 행위는 값 하나를 저장하는 게 아니라 **다운로드를 동반**하므로
  `settings:update`가 아니라 `models:download`가 쓴다 (`references/distribution.md` 3절). 읽기는 앱 시작 시 한 번
  `src/main/db/settings.ts`의 `getWhisperModelId()` → `src/main/models/paths.ts`의 `setSelectedWhisperModelId()`로 넘긴다.
  renderer는 `models:status` 응답의 `selectedWhisperModelId`로 본다.
- **용어 사전(`glossary.team`, `glossary.terms`)도 `AppSettings`에 넣지 않는다** (Phase 5-4). 설정 화면의 별도 카테고리가
  자기 채널(`glossary:get`/`glossary:update`)로 읽고 쓴다. 목록이 길어질 수 있어 토글 하나 바꿀 때마다 설정 전체와 함께 오가지 않게 하고,
  `SettingsSection`의 한 번 로드·전체 저장 흐름에 초안 생성 같은 비동기 동작을 섞지 않기 위해서다.

  | 키 | 타입 | 기본값 | 뜻 |
  | --- | --- | --- | --- |
  | `glossary.team` | string | `''` | 팀 소개. 초안 생성의 입력이다. 최대 500자 |
  | `glossary.terms` | string[] | `[]` | 전역 용어 사전. 한 줄에 용어 하나, 형식은 `용어` 또는 `영어 표기 = 읽기1, 읽기2` (`scripts/refine.ts`의 용어 파일과 같다). 최대 200줄, 줄당 80자 |

  ```ts
  export interface GlossarySettings {
    teamDescription: string
    terms: string[]
  }
  ```

  저장할 때 main이 줄 앞뒤 공백을 자르고 빈 줄·중복 용어(`=` 앞부분 기준, 대소문자 무시)를 뺀다. 한도를 넘으면 거절한다.
- **LLM 공급자(`llm.provider`, `llm.claudeApiKey`, `llm.openaiApiKey`, `llm.openaiModel`)도 `AppSettings`에 넣지 않는다** (2026-09-24). 키 저장·CLI 탐색·연결 확인이 붙은
  별도 카테고리라 자기 채널(`llm:status`/`llm:setProvider`/`llm:setApiKey`/`llm:setOpenaiModel`)로 읽고 쓴다 (`references/architecture.md` "LLM 공급자").

  | 키 | 타입 | 기본값 | 뜻 |
  | --- | --- | --- | --- |
  | `llm.provider` | `'local' \| 'claude-api' \| 'claude-cli' \| 'openai-api'` | `'local'` | 요약·용어 초안이 쓰는 LLM. 모르는 값은 `'local'`로 읽는다 |
  | `llm.claudeApiKey` | string (base64) | 없음 | `safeStorage.encryptString`으로 암호화한 Anthropic API 키. **평문을 저장하지 않고 renderer에 돌려주지 않는다.** 복호화는 요청 직전 main에서만 한다 |
  | `llm.openaiApiKey` | string (base64) | 없음 | 같은 방식으로 암호화한 OpenAI API 키. 키 이름은 회사(`LlmApiVendor`)별로 `apiKey.ts`가 대응시킨다 |
  | `llm.openaiModel` | `'gpt-6-astra' \| 'gpt-6-sol' \| 'gpt-6-luna'` | `'gpt-6-sol'` | `openai-api`가 부르는 모델. 모르는 값은 기본값으로 읽는다 |

  ```ts
  export type LlmProvider = 'local' | 'claude-api' | 'claude-cli' | 'openai-api'
  export type LlmApiVendor = 'anthropic' | 'openai'
  export type OpenaiModelId = 'gpt-6-astra' | 'gpt-6-sol' | 'gpt-6-luna'

  export interface LlmApiKeyStatus {
    isSaved: boolean
    tail: string | null
  }

  /** llm:status 응답. 키 자체는 없고 회사별 유무와 마지막 4자만 있다 */
  export interface LlmStatus {
    provider: LlmProvider
    isLocalModelReady: boolean
    apiKeys: Record<LlmApiVendor, LlmApiKeyStatus>
    openaiModel: OpenaiModelId
    claudeCliPath: string | null
    claudeCliVersion: string | null
  }
  ```

## 사용 정보 outbox (`test/usage-analytics` 브랜치 전용)

전송 전 이벤트·업로드를 잃지 않기 위한 로컬 대기열이다. 설계는 `telemetry.md`. 마이그레이션 6에서 만든다 (2026-09-28 확정).

| 테이블 | 컬럼 | 뜻 |
| --- | --- | --- |
| `telemetry_outbox` | `id` INTEGER PK AUTOINCREMENT, `sink` TEXT(`collector`·`posthog`), `kind` TEXT(`event`·`meeting_snapshot`·`meeting_deleted`), `payload` TEXT(JSON), `created_at` INTEGER(epoch ms), `attempts` INTEGER, `next_attempt_at` INTEGER(epoch ms) | 싱크별 전송 대기열. 같은 이벤트도 싱크마다 행이 따로 있다. `event`의 payload는 `TelemetryEnvelope`, `meeting_snapshot`·`meeting_deleted`는 `{ meetingId }`뿐이고 스냅샷 본문은 보낼 때 만든다. 성공한 행만 지운다 |
| `telemetry_uploads` | `meeting_id` TEXT PK (FK 없음), `audio_path` TEXT, `total_bytes` INTEGER, `uploaded_bytes` INTEGER, `status` TEXT(`pending`·`done`·`failed`), `attempts` INTEGER, `next_attempt_at` INTEGER | 녹음 WAV 이어 올리기 상태. `pending`인 동안은 `audio.keep`이 꺼져 있어도 원본을 지우지 않고, `done`이 되는 순간 그때의 `audio.keep`을 보고 지운다. `failed`는 파일이 사라졌거나 서버가 재시도해도 소용없는 `4xx`를 준 경우다(네트워크 실패·`5xx`는 재시도). `failed`도 `done`처럼 그 순간 `audio.keep`을 적용한다. 파이프라인이 실패한 회의의 녹음도 원인 분석용으로 대기열에 올린다(원본은 재시도용으로 어차피 남는다) |

- `telemetry_uploads.meeting_id`에 FK를 걸지 않는 이유: 회의가 지워져도 행을 남겨 워커가 "파일 없음 → failed"로 정리하게 한다. CASCADE로 사라지면 진행 중 업로드가 조용히 끊긴다.
- 인덱스: `telemetry_outbox(sink, next_attempt_at)`.

| 설정 키 | 타입 | 기본값 | 뜻 |
| --- | --- | --- | --- |
| `telemetry.installId` | string(UUID) | 첫 실행 때 생성 | 설치 식별자. 기기·계정 정보에서 파생하지 않는다. 설정 화면에 노출하지 않는다 |

## 공유 타입 (`src/shared/types.ts`)

```ts
export type MeetingStatus = 'recording' | 'processing' | 'done' | 'error'

export interface Meeting {
  id: string; title: string; createdAt: number; durationSec: number
  status: MeetingStatus; errorMessage?: string; summary?: string
  speakerCount?: number   // 녹음 정지 시 입력한 참석자 수. 없으면 임계값 폴백으로 처리된 회의
  hasAudio: boolean       // 원본 WAV 경로가 남아 있는지 (audio_path IS NOT NULL). 재생·내보내기·다시 인식 가능 여부
}

export interface Utterance {
  id: string; meetingId: string; ord: number
  speakerLabel: string; startSec: number; endSec: number; text: string
  /** 자동 교정이 처음 바꾸기 전 원문. null이면 교정으로 바뀐 적 없음 (2026-09-28) */
  originalText: string | null
}

export interface Speaker { meetingId: string; label: string; displayName: string | null }

export interface AppSettings { isAudioKept: boolean; isUpdateCheckEnabled: boolean; isQuietProcessing: boolean }

/** 사용자가 고를 수 있는 음성 인식 모델 (Phase 4). 목록·체크섬은 @meeting-stt/models/desktop */
export type WhisperModelId = 'turbo-q5' | 'large-v3-q5' | 'small-q5_1'
/** 모델 파일 종류. 'summary'만 선택 모델이고 나머지는 필수다 */
export type ModelKey = 'whisper' | 'vad' | 'segmentation' | 'embedding' | 'summary'

/** 디테일 화면이 한 번에 받는 묶음 (meetings:get 응답). 마지막 자동 교정 결과도 여기 실린다 (Phase 5-4) */
export interface MeetingDetail {
  meeting: Meeting; utterances: Utterance[]; speakers: Speaker[]
  refineResult: RefineResult | null
}

// 교정 (Phase 5-4). RefinePair·RefineSource·RefineSuggestion은 src/shared/types.ts 참고
export type RefineStage = 'read' | 'verify' | 'done' | 'error'
/** 마지막 자동 교정 결과. appliedPairs가 비어 있으면 고칠 곳을 찾지 못한 것 */
export interface RefineResult { refinedAt: number; appliedPairs: RefinePair[] }
/** 화면이 쌍 단위로 묶어 보여 주는 단위. utteranceIds 길이가 "n곳"이다 */
export interface RefinePairGroup { from: string; to: string; utteranceIds: string[] }

// 파이프라인 중간 산출물
export interface SttWord    { start: number; end: number; text: string }
export interface SttSegment { start: number; end: number; text: string; words?: SttWord[] }
export interface SpeakerSegment { start: number; end: number; speaker: string }
export interface SpeakerPiece  { speaker: string; start: number; end: number; text: string }
export type MergedUtterance = Omit<Utterance, 'id' | 'meetingId'>

// 'vad'는 whisper 내장이라 별도 단계가 없다. 'done'·'error'는 잡의 마지막에 한 번만 보낸다.
export type PipelineStage = 'stt' | 'diarize' | 'merge' | 'save' | 'done' | 'error'

// 요약 잡의 단계. 'summarize'는 구간별 부분 요약(map), 'reduce'는 합치기.
// 회의록이 컨텍스트에 한 번에 들어가면 'reduce' 없이 'summarize' → 'done'으로 끝난다.
export type SummaryStage = 'summarize' | 'reduce' | 'done' | 'error'
```

진행률 이벤트 payload(`PipelineProgressEvent`)는 프로세스 간 계약이므로 `src/shared/types.ts`가 아니라
`src/shared/ipc.ts`에 둔다 (`.claude/rules/ipc-api-guide.md`).

## 회의록 검색 (UI 리디자인)

스키마를 바꾸지 않는다. `meetings.title`과 `utterances.text`를 `LIKE`로 전체 스캔한다 (FTS5를 쓰지 않는 이유는 `architecture.md` "회의록 검색").

```sql
-- ? = '%' || escape(query) || '%'   (escape: \ → \\, % → \%, _ → \_)
SELECT m.*, (
  SELECT u.id FROM utterances u
  WHERE u.meeting_id = m.id AND u.text LIKE ? ESCAPE '\'
  ORDER BY u.ord LIMIT 1
) AS match_utterance_id
FROM meetings m
WHERE m.title LIKE ? ESCAPE '\'
   OR EXISTS (SELECT 1 FROM utterances u WHERE u.meeting_id = m.id AND u.text LIKE ? ESCAPE '\')
ORDER BY m.created_at DESC
LIMIT 50;
```

- 요청·응답 타입은 IPC 계약이므로 `src/shared/ipc.ts`에 둔다: `SearchMeetingsRequest { query: string }`,
  `SearchMeetingsResponse = MeetingSearchResult[]`, `MeetingSearchResult { meeting: Meeting; match: { utteranceId; text; startSec } | null }`.
- 이스케이프 함수는 순수 함수로 두고 vitest로 `%`·`_`·`\`가 글자 그대로 찾히는지 검증한다.

## 식별자

- `meetings.id`·`utterances.id`는 **uuid 문자열**(`node:crypto`의 `randomUUID`)이다. 정수 자동 증가를 쓰지 않는다 —
  녹음 시작 시점(파일명 결정)에 main이 id를 먼저 정해야 하고, 나중에 파일 기반 내보내기·복구에서 충돌이 없어야 하기 때문이다.
- 따라서 IPC payload의 `meetingId`·`utteranceId`도 전부 `string`이다.

## 병합 알고리즘 (`@meeting-stt/core/merge`, 순수 함수)

입력 `SpeakerSegment[]`는 2026-09-25부터 sherpa-onnx CLI 라벨이 아니라 재군집(`@meeting-stt/core/cluster`, `architecture.md` "화자 재군집")이 붙인 라벨이다. 라벨 형식(`speaker_NN`)과 아래 알고리즘은 그대로다.

1. `SpeakerSegment[]`를 start 기준 정렬해 두고, 각 단어(없으면 세그먼트)에 대해 **겹침 길이가 최대인 화자**를 배정한다. 세그먼트 수가 수천 개가 되므로 이진 탐색으로 후보 구간을 좁힌다 (WhisperX 방식).
2. 겹치는 화자 구간이 없으면 **1초 이내에서 가장 가까운 화자 구간**에 배정한다 — 화자 전환 경계의 단어는 타임스탬프 오차 때문에 어느 구간에도 걸치지 않는 일이 잦다. 그래도 없으면 직전 단어의 화자를 승계하고, 그것도 없으면 `UNKNOWN`.
3. **문장 단위 다수결**로 단어별 배정을 덮어쓴다. 단어를 문장으로 묶고(단어가 `.`·`?`·`!`로 끝나거나, 다음 단어까지 **1초 이상** 쉬면 문장 끝),
   문장 안 단어들의 화자별 발화 시간 합이 가장 큰 화자 한 명을 문장 전체에 준다. 길이 0인 단어도 0.05초로 쳐서 표를 준다.
   문장이 **8초**를 넘으면 그다음 Whisper 세그먼트 경계에서 끊는다 — Whisper가 문장부호를 거의 안 찍는 경우(38분 회의를 turbo 모델로 돌리면 3130단어 중 20개)나
   반복 환각 구간에서 "문장"이 수십~수백 초로 커져 다른 화자의 말을 통째로 삼키는 것을 막는다. 문장부호가 정상인 대화에서는 8초 이상 어느 값이든 결과가 같았다.
   whisper.cpp(DTW 끔)의 단어 타임스탬프는 세그먼트 끝으로 뭉개지고(길이 0인 단어가 turbo 26%, large-v3 4%) pyannote 구간 경계와도 어긋나서
   단어별 배정만 쓰면 문장 끝 한두 단어가 옆 화자로 떨어져 **한 문장이 두 화자로 쪼개진다** (`docs/phase1-results.md` 9절).
   대가로 쉼·문장부호 없이 곧바로 이어진 짧은 화자 전환은 한 화자로 뭉친다 — 문장 안의 2~3초짜리 다른 화자 구간을 살리는 보정은 같은 화자의 파편 클러스터를 되살려 더 나빴다(9절).
4. 연속된 동일 화자 단어를 하나의 발화로 묶고, 같은 화자의 연속 발화는 문단으로 병합한다.
5. 0.5초 미만 고아 발화는 앞뒤 발화에 흡수한다.
6. 결과는 `Omit<Utterance, 'id' | 'meetingId'>[]` (ord 부여 완료) 형태로 반환한다.

테스트(`pnpm test`, vitest)에는 최소 다음 케이스를 둔다: 단일 화자, 문장 경계의 화자 전환, 문장 끝 단어의 경계 오차 보정, 긴 쉼으로 나뉘는 문장, 겹침 없는 단어, 고아 발화 흡수, 빈 입력.

## 복사 포맷 (`@meeting-stt/core/format`)

```
[00:00:12] 김OO: 지난주 논의했던 배포 일정부터 정리하겠습니다.
[00:00:25] 이OO: 네, QA 쪽 이슈가 하나 남아 있습니다.
```

- 플레인 텍스트가 기본, 마크다운 옵션은 화자를 `**굵게**`.
- 이름은 `speakers.display_name ?? "화자 N"`. 번호 N은 **이름 지정 여부와 무관하게 등장 순서**로 매긴다 — 한 화자의 이름을 바꿔도 나머지 번호가 밀리지 않아야 한다.
- 화자를 배정하지 못한 `UNKNOWN` 라벨은 번호를 쓰지 않고 `화자 미상`으로 표기한다.
- 타임스탬프는 `hh:mm:ss` 고정폭.
