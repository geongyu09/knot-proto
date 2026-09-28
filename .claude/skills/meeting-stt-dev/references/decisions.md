# 결정 문서 (`test/usage-analytics` 브랜치, 2026-09-28 사용자 결정)

회의록(발화 목록)이 아니라 **회의에서 나온 결정 하나하나를 문서로 남기는 앱**으로 바꾼다.
녹음이 끝나면 STT·화자 분리 → (조건부) 교정 → **결정 추출**이 사용자 조작 없이 한 흐름으로 돌고,
결정마다 읽기 전용 문서가 하나씩 생긴다. 사이드 패널의 주 목록은 회의가 아니라 **결정 문서(사용자 정의 타입별 묶음)** 다.

체크리스트는 `roadmap.md` "결정 문서 전환" 절, 스키마는 `data-model.md` "결정 문서" 절.

## 결정 요약 (2026-09-28 사용자 답변)

| 질문 | 결정 | 따라오는 것 |
| --- | --- | --- |
| 발화 원문 | **DB에 보관하고 근거로 노출한다.** 결정 문서가 주인공이고 원문은 문서 오른쪽 패널·회의록 탭에서 본다 | 다시 추출·검증 재료가 남는다. 기존 `utterances`·편집 기능은 그대로 |
| 문서 단위 | **결정 1건 = 문서 1개.** 결정이 없는 논의는 문서가 되지 않는다 | 한 회의에서 문서가 0~N개 나온다. "아젠다" 단위 묶음·"미결" 문서는 만들지 않는다 |
| 결정 0개 회의 | **결정 문서 목록에는 아무것도 나오지 않는다.** 회의·원문은 회의록 탭에만 남는다 | 회의록 탭 행에 "결정 없음"을 표시해 추출이 끝났다는 것과 실패를 구분한다 |
| 실패 표시 | STT·교정·추출 실패(모델 없음, API 키 만료, 타임아웃)는 **사이드 패널 결정 탭 맨 위 "처리 중/실패" 항목**으로 보인다 | 추출 상태를 DB에 남겨야 한다 (`meetings.decision_state`). 앱을 다시 켜도 실패가 보여야 하기 때문 |
| LLM | **기존 공급자 설정 그대로** — 로컬(Qwen3-4B) 기본, Claude·GPT 선택 | 로컬 4B의 추출 품질은 D0에서 실제 회의로 먼저 잰다. 부족하면 그때 모델·방식을 다시 결정한다 |
| 사이드 목록 | **패널 상단 탭 [결정 문서 \| 회의록]**. 결정 탭은 **타입별 묶음**(접기), 회의록 탭은 지금 목록(날짜 묶음) | GNB(홈 · 회의록)와 `/meetings` 화면은 그대로 둔다 |
| 타입 체계 | **사용자가 설정에서 정의**하고 LLM은 그중 하나를 고른다. 기본 목록을 넣어 준다 | 목록에 없는 값·빈 값은 "미분류". 타입을 지우면 그 문서들은 미분류로 간다 |
| 화자 분리 | **유지.** 문서 오른쪽에 화자 분리된 원문 STT를 작게 보여 준다 | 참석자 수 입력·화자 이름·병합 UI 유지 |
| 원문 패널 | **회의 전체 발화, 근거 구간 강조·스크롤, 편집 유지** | 기존 `TranscriptSection`의 편집 기능을 재사용한다 |
| 문서 편집 | **읽기 전용 + 회의 단위 "다시 추출"만.** 필드 편집·문서별 삭제·병합·분할 없음 | 틀린 문서는 원문을 고친 뒤 다시 추출한다. 다시 추출은 그 회의의 문서를 전부 새로 만든다 |
| 문서 필드 | 제목·결정 내용·타입·근거 구간·출처 회의(기본) + **배경·논의 요약, 검토한 대안·기각 이유, 후속 조치·담당·기한, 제안자·참여 화자** | 사람 필드는 화자 라벨로 저장해 화자 이름을 바꾸면 문서에도 반영된다 |
| 요약·교정 | **둘 다 유지.** 교정은 추출 **앞**에서 지금 조건대로 자동으로 돌고, 요약은 회의 상세의 버튼 그대로 | 흐름: 파이프라인 → 교정(조건 충족 시) → 결정 추출 |
| 기존 회의 | **자동 추출하지 않는다.** 회의록 탭의 회의 상세에 "결정 추출" 버튼 | 새 녹음·가져오기·다시 인식만 자동 |
| 브랜치 | **`test/usage-analytics`** 위에서 한다. `main`에 병합하지 않는다 | 결정 문서도 회의 내용이므로 수집 스냅샷에 싣는다 (`telemetry.md`) |

사용자에게 확인하지 않고 문서가 정한 것 (바꾸려면 이 절을 먼저 고친다):

- **외부 공급자를 고른 사용자는 녹음이 끝날 때마다 회의록이 자동으로 그 회사 서버로 간다.** 교정의 `refine.autoExternal`처럼 별도 스위치를 두지 않는다 —
  결정 추출은 이 제품의 기본 흐름이라 꺼 둘 수 있으면 결정 문서가 나오지 않는다. 대신 설정의 공급자 경고 문구를 "녹음이 끝날 때마다 자동 전송"으로 고친다.
- 결정 추출은 **교정을 기다린다.** 교정이 실패하거나 건너뛰어도 추출은 돈다 (교정 전 원문으로).
- 발화를 사람이 고치거나 "다시 교정"을 해도 **자동으로 다시 추출하지 않는다.** 읽기 전용 문서가 사용자 모르게 바뀌지 않게 한다.
  "다시 인식"은 발화를 통째로 새로 만들므로 예외로 자동 재추출한다 (근거 구간이 새 발화와 맞지 않게 되기 때문).

## 흐름

```
[녹음 정지 / 파일 가져오기 / 다시 인식]
  → pipeline 잡 (정규화 → STT ∥ 화자 분리 → 병합 → SQLite, status='done')
  → decision_state='pending' 으로 바꾸고, 같은 함수 안에서 순서대로 큐에 넣는다:
       refine 잡 (autoRefineSkipReason이 null일 때만)
       decisions 잡
  → decisions 잡: 발화 읽기 → LLM 추출(청크) → 코드 검증 → 트랜잭션으로 그 회의의 decisions 교체 → decision_state='done'
  → meetings:changed push → 사이드 패널 결정 탭에 문서가 나타난다
```

- 큐는 지금의 동시성 1 FIFO 큐(`src/main/pipeline/queue.ts`)를 그대로 쓰고 항목에 `{ kind: 'decisions'; meetingId }`를 더한다.
  refine과 decisions를 **같은 동기 구간에서 연달아 넣으면** FIFO라 교정이 먼저 끝난다. 교정 완료 콜백에서 추출을 넣는 방식은 쓰지 않는다 (교정 실패·건너뜀 경로마다 빠뜨리기 쉽다).
- 같은 회의의 decisions 잡이 이미 큐에 있으면 다시 넣지 않는다 (요약·교정과 같은 규칙).
- **추출 실패는 `meetings.status`를 건드리지 않는다.** `status`는 파이프라인 소유다. 실패는 `decision_state='error'` + `decision_error`에 남긴다.
  이전에 성공한 문서는 실패한 다시 추출이 지우지 않는다 (교체는 성공했을 때만 트랜잭션으로).
- 앱이 추출 중에 꺼지면 `decision_state='pending'`이 남는다. 앱 시작 시 `recording`/`processing`을 오류로 바꾸는 복구와 같은 자리에서
  `pending`을 `error`("앱이 종료되어 중단됨")로 바꾼다. 자동으로 다시 돌리지 않는다 — 켜자마자 GPU·외부 API를 쓰지 않기 위해서다.
- 녹음 정지 뒤 화면 이동은 지금처럼 회의 상세(진행률)로 간다. 추출이 끝났다고 화면을 옮기지 않는다 — 사이드 패널 결정 탭과 회의 상세의 결정 카드가 갱신될 뿐이다.

## 추출 (`src/main/decisions/*`)

### LLM 입력

- 발화를 한 줄에 하나씩, **줄 번호를 붙여** 준다: `[12] 화자 2 (03:15) 텍스트`. 화자는 라벨 순서 번호(`SPEAKER_01` → "화자 2")로 주고,
  표시 이름이 이미 있으면 이름을 쓴다. LLM이 돌려준 화자 표기는 코드가 다시 라벨로 되돌린다.
- 타입 목록(이름 + 설명)을 시스템 프롬프트에 넣는다. 미분류는 목록에 넣지 않는다 — "어느 것에도 맞지 않으면 빈 값"이라고 지시한다.
- 요약과 같은 이유로 프롬프트·출력은 파일로 주고받는다 (로컬 `llama-cli`, `architecture.md` "로컬 LLM 요약"). 공급자 호출은 `src/main/llm/*` 추상화를 그대로 거친다.

### LLM 출력 (JSON)

```ts
interface ExtractedDecision {
  title: string              // 40자 이내 명사형 ("가격 정책을 월 구독으로 확정")
  decision: string           // 무엇을 정했는가. 1~3문장
  type: string               // 타입 이름 그대로, 맞는 게 없으면 ''
  background: string         // 왜 이 결정이 나왔는가. 없으면 ''
  alternatives: { option: string; reason: string }[]   // 회의에서 언급된 것만
  actionItems: { task: string; owner: string; due: string }[]  // owner·due는 말한 그대로, 없으면 ''
  proposers: string[]        // "화자 2" 또는 표시 이름
  participants: string[]
  evidenceLines: number[]    // 근거 발화 줄 번호
}
```

- 로컬은 **손으로 쓴 GBNF 문법(`--grammar-file`, `src/main/decisions/prompt.ts`의 `DECISIONS_GRAMMAR`)** 으로, Claude API는 `output_config.format`(`json_schema`), OpenAI는 Responses API `text.format`(`json_schema`, strict)으로 형식을 강제한다. Claude Code CLI는 프롬프트 지시 + 파싱.
  동봉 빌드의 `-j/-jf`(JSON 스키마)는 **`{}` 스키마조차 "Failed to initialize samplers"로 실패하고 종료 코드 0으로 빈 답을 낸다** (2026-09-28 D0 확인, `pitfalls.md`). 같은 스키마가 만든 문법을 `--grammar-file`로 주면 동작하므로 GBNF를 쓴다.
  문법은 필드 순서를 스키마와 같게 고정하고 `evidenceLines`를 1개 이상으로 강제한다. 스키마(API용)와 문법(로컬용)은 같은 파일에 두고 함께 고친다.
- **최상위는 객체 `{ "decisions": ExtractedDecision[] }`** 다 — OpenAI strict 스키마는 최상위 배열을 받지 않는다. 스키마는 모든 필드를 `required`, `additionalProperties: false`로 둔다(strict 조건).
- 스키마는 공급자 추상화의 요청 필드 `LlmCompleteParams.jsonSchema { name, schema }`로 넘긴다. 공급자별 변환은 각 구현(`src/main/llm/*`)이 한다.
- 파싱은 코드 펜스·앞뒤 설명을 벗겨 첫 `{`부터 마지막 `}`까지를 `JSON.parse`한다. 파싱 실패는 청크 하나당 한 번 다시 묻고, 그래도 실패하면 잡을 실패로 끝낸다(`decision_state='error'`).
- **기한은 말한 그대로 문자열로 둔다.** "다음 주 금요일"을 절대 날짜로 바꾸지 않는다 — 회의 날짜 기준 계산을 LLM에 맡기면 틀린 날짜가 그럴듯하게 들어간다.

### 코드 검증 (순수 함수 + vitest, `src/main/decisions/validate.ts`)

LLM 출력을 믿지 않고 저장 전에 거른다. 거른 개수는 로그와 수집 이벤트(`droppedCount`)에 남긴다.

- `evidenceLines`가 비었거나 전부 범위 밖이면 **문서를 버린다** — 근거 없는 결정은 환각일 가능성이 가장 높다.
- `title`·`decision`이 비면 버린다. 길이 상한을 넘으면 자른다.
- `type`이 타입 목록의 이름과 정확히 같지 않으면 미분류(`type_id = NULL`).
- 화자 표기가 그 회의의 화자에 없으면 그 항목만 뺀다. 담당(`owner`)은 화자로 풀리면 라벨로, 아니면 원문 문자열로 둔다 ("민수 씨"처럼 발화 속 이름).
- 근거 줄 번호는 **시각 구간으로 바꿔 저장한다**(연속 줄은 한 구간으로 합친다). 발화 id로 저장하지 않는 이유: 발화 편집·화자 재배정은 시각을 바꾸지 않지만,
  다시 인식은 발화 id를 전부 새로 만든다. 시각 구간은 원문 패널에서 "구간과 겹치는 발화"로 다시 찾는다.

### 긴 회의 (청크)

- 요약처럼 발화 줄 경계로 청크를 나눠 청크마다 후보를 뽑고(map), 후보가 둘 이상의 청크에서 나왔으면 **후보 목록만 넣고 한 번 더 돌려 중복을 합친다**(reduce).
  reduce 출력의 근거 줄은 map 후보의 근거 줄의 합집합이어야 한다 — 새 줄 번호를 지어내면 검증이 버린다.
- 청크 예산은 요약과 같은 `client.chunkBudgetChars`(로컬 `CHUNK_BUDGET_CHARS`, 외부 `API_CHUNK_BUDGET_CHARS`)를 초기값으로 쓴다. 청크가 둘 이상일 때만 reduce를 돈다.
  외부 공급자는 컨텍스트가 커서 대부분 청크 하나로 끝난다. 로컬 컨텍스트는 요약과 같은 `SUMMARY_CTX_TOKENS`, 생성 상한은 4096 토큰(결정 여러 개의 JSON), 온도 0.1.
  D0 결과로 바뀌면 이 줄을 먼저 고친다 (2026-09-28 초기값).
- reduce 입력은 map 후보를 번호를 붙여 JSON으로 주고, 출력의 `evidenceLines`는 **원래 발화 줄 번호**를 그대로 쓰게 한다. 코드가 reduce 결과의 근거 줄을 map 후보 근거 줄의 합집합 안으로 거른다.

## 결정 타입

- 저장: `settings`의 `decisions.types` JSON (`data-model.md`). 용어 사전처럼 `AppSettings` 밖이고 자기 채널로 읽고 쓴다.
- 항목: `{ id: string (uuid), name: string (≤20자), description: string (≤80자) }`, **배열 순서가 사이드 패널 묶음 순서**다. 최대 20개(프롬프트 길이).
  이름은 대소문자·앞뒤 공백 무시하고 중복 금지.
- 문서는 `type_id`로 참조한다. 타입 이름을 바꾸면 문서 묶음 이름도 바뀌고, 타입을 지우면 그 문서들은 미분류로 보인다(문서 행은 건드리지 않는다).
  **기존 문서를 새 타입 목록으로 다시 분류하지 않는다** — 필요하면 회의별로 다시 추출한다.
- 기본 목록: 키가 없으면 **고정 id**의 기본 6개로 읽는다 (설정 키가 없으면 기본값으로 읽는 기존 규칙, 마이그레이션에서 넣지 않는다) —
  `default-product` 제품·기능 / `default-tech` 기술 / `default-schedule` 일정 / `default-budget` 예산·비용 / `default-people` 사람·조직 / `default-process` 프로세스·운영.
  사용자가 한 번 저장하면 그 배열이 기본값을 대신한다. 이름은 사전(`src/shared/locales`)에 두지 않고 한국어 값이다 — 사용자 데이터이지 UI 문구가 아니다.
- "미분류"는 타입 목록에 없는 고정 묶음이고 사이드 패널에서 항상 마지막이다. 비어 있으면 숨긴다.

## 화면

### 사이드 패널 (`widgets/meeting/MeetingSidebarSection` → 탭 추가)

- 패널 맨 위에 탭 두 개 **[결정 문서 | 회의록]** (`role="tablist"`). 기본은 결정 문서. 선택 탭은 `localStorage`(`meetingSidebar.tab`)에 둔다 (열림 상태와 같은 규칙).
- **결정 문서 탭**
  1. 맨 위 **"처리 중" 묶음**: 파이프라인 처리 중·실패이거나 `decision_state`가 `pending`·`error`인 회의. 처리 중이면 회의 제목 + 진행률(`PipelineProgress`, 추출 단계 포함),
     실패면 빨간 한 줄 + "다시 시도"(파이프라인 실패는 기존 다시 시도, 추출 실패는 `decisions:extract`). 없으면 숨긴다.
  2. 타입 묶음(타입 순서, 미분류 마지막): 제목 + 개수, 접기/펼치기(`aria-expanded`, 접힘 상태는 `localStorage`). 묶음 안은 회의 날짜 최신순 → 회의 안 순서.
     행은 문서 제목 한 줄 + 회의 날짜. 누르면 `/decisions/:decisionId`.
  3. 검색 입력은 탭별 대상을 찾는다 — 결정 탭은 문서 제목·결정 내용·배경 (`decisions:search`, D5).
- **회의록 탭**: 지금 패널 목록 그대로(날짜 묶음, 회의 제목). 행에 결정 개수 칩을 붙이고, 추출이 끝났는데 0개면 "결정 없음", 추출한 적 없으면 칩 없음.

### 결정 문서 화면 (`/decisions/:decisionId`, `pages/DecisionDetail`)

- 두 칸: 왼쪽 **문서**(가운데 열 최대 720), 오른쪽 **원문 패널**(기본 400px, 320~640, 기존 레일 리사이즈 규칙·`localStorage` 키만 다르게).
- 문서 헤더: 타입 칩 · 제목(큰 제목) · 메타 줄(출처 회의 제목 링크 → `/meetings/:meetingId`, 회의 날짜, 제안자) · 오른쪽에 "복사"(마크다운) · 더보기("이 회의 다시 추출").
- 본문 절 순서: 결정 → 배경 → 검토한 대안(없으면 절 숨김) → 후속 조치(할 일 · 담당 · 기한 표, 없으면 숨김) → 참여 화자 → 근거(구간 칩 `03:15–04:02`, 누르면 원문 패널이 그 구간으로 스크롤).
  **읽기 전용**이다. 입력 요소를 두지 않는다.
- 원문 패널: `TranscriptSection`을 좁은 변형(`variant="panel"` — 헤더·요약 레일·녹음 바 없이 발화 목록과 화자 편집만, 글자 한 단계 작게)으로 재사용하고,
  `highlightRanges`와 겹치는 발화에 강조 배경을 준다. 들어올 때 첫 근거 구간으로 스크롤한다. 발화 편집·화자 이름·병합은 지금과 같이 동작하고, 화자 이름을 바꾸면 문서의 사람 필드도 바로 바뀐다.
- "다시 추출"은 2단계 인라인 확인("이 회의의 결정 문서 N개를 모두 새로 만듭니다"). 확정하면 `decisions:extract` → 지금 문서 id가 사라지므로 사이드 패널 결정 탭을 연 채 회의 상세로 이동한다.
- 문서가 없으면(삭제된 회의, 다시 추출로 사라진 id) "문서를 찾을 수 없어요" + 결정 탭 안내.

### 회의 상세 (`/meetings/:meetingId`, 회의록 탭 쪽)

- 오른쪽 레일 맨 위에 **"결정 문서" 카드**를 요약 카드 위에 둔다: 이 회의의 문서 제목 목록(누르면 문서 화면) · 추출 상태(진행률/실패 문구) ·
  버튼(추출한 적 없음 → "결정 추출", 있음 → "다시 추출" + 2단계 확인). 0개면 "이 회의에서 찾은 결정이 없어요".
- 회의 삭제·재생·내보내기·다시 인식·요약은 지금 위치 그대로다.

### 설정

- **"결정 타입" 카테고리**: 타입 행(이름·설명 입력, 위/아래 이동, 삭제 2단계 확인) + "타입 추가". 저장은 용어 사전처럼 명시적 저장 버튼.
  "타입을 바꿔도 이미 만든 문서는 다시 분류되지 않습니다" 안내.
- LLM 공급자 경고 문구에 "녹음이 끝날 때마다 회의록이 자동으로 전송됩니다"를 더한다.

## IPC

| 키 | 채널 | 방향 | 요청 → 응답 |
| --- | --- | --- | --- |
| `decisions.list` | `decisions:list` | invoke | 없음 → `DecisionListItem[]` (사이드 패널용 가벼운 행) |
| `decisions.get` | `decisions:get` | invoke | `{ decisionId }` → `GetDecisionResponse` (`Decision` + 출처 회의 `Meeting`) 또는 `null` |
| `decisions.ofMeeting` | `decisions:ofMeeting` | invoke | `{ meetingId }` → `DecisionListItem[]` |
| `decisions.extract` | `decisions:extract` | invoke | `{ meetingId }` → 없음. 큐에 넣고 즉시 반환 (`summary:create`와 같은 예외) |
| `decisions.search` | `decisions:search` | invoke | `{ query }` → `DecisionListItem[]` (D5) |
| `decisionTypes.get` / `.update` | `decisionTypes:get` / `decisionTypes:update` | invoke | 없음 / `{ types }` → `DecisionType[]` |
| `events.decisions` | `decisions:progress` | push | `{ meetingId, stage: DecisionStage, percent, errorMessage? }` — `DecisionStage = 'queued' \| 'extract' \| 'reduce' \| 'done' \| 'error'` (요약·교정처럼 청크 추출·합치기를 나눈다) |

- 목록 갱신은 새 이벤트를 만들지 않고 **`meetings:changed`를 재사용**한다 — 추출 시작·완료·실패, 타입 변경, 회의 삭제·제목 변경 뒤에 보내고,
  사이드 패널은 받으면 두 탭 목록을 모두 다시 읽는다. 로컬 SQLite라 싸다.
- `Meeting`에 `decisionState`·`decisionCount`를 더해 회의록 탭 칩과 "처리 중" 묶음이 추가 호출 없이 그려지게 한다.

## 복사

- 문서 하나를 마크다운으로: `## 제목` → 타입·회의·날짜 한 줄 → 결정 → 배경 → 대안 목록 → 후속 조치 목록(`- [ ] 할 일 (담당, 기한)`) → 근거 시각.
  사람 필드는 복사 시점의 화자 표시 이름으로 푼다. 조립 함수는 데스크탑 `src/shared/decisionFormat.ts`(웹 프로토타입은 결정 문서가 없어 `packages/core`에 올리지 않는다).

## 사용 정보 수집 (이 브랜치)

- 회의 스냅샷(`packages/telemetry/src/snapshot.ts`)에 `decisions`(저장된 문서 전체)와 `decisionTypes`를 더한다. 추출 완료·다시 추출 뒤 스냅샷을 다시 보낸다.
  수집 서버는 스냅샷을 통째로 받으므로 필드 추가만 확인한다(`apps/collector` 스냅샷 검증이 있으면 함께 고친다).
- 이벤트: `decisions_completed { meetingId, provider, elapsedMs, chunkCount, count, droppedCount, trigger: 'auto' | 'manual' | 'reprocess' }`,
  `decisions_failed`(기존 잡 실패 경로), `decision_opened`, `decision_copied`, `decision_types_updated { count }`. 결정 내용 텍스트는 외부 분석 서비스로 보내지 않는다.

## 범위 밖 (제안만)

- 문서 필드 편집·문서별 삭제·병합·분할, 타입 수동 변경 (사용자 결정: 읽기 전용)
- 결정 간 관계(이전 결정을 뒤집음·대체함), 회의 간 같은 결정 묶기
- 후속 조치를 할 일 목록·캘린더로 내보내기, 기한의 절대 날짜 변환
- 홈 카드 변경 (홈은 지금 그대로. "최근 결정" 카드는 후속 후보)
- 기존 회의 일괄 추출
