# 아키텍처: 요약·LLM 공급자·용어 사전·교정

데스크탑 앱(`apps/desktop`) 기준. 목차와 다른 주제는 `references/architecture.md`.

## 로컬 LLM 요약 (Phase 5)

STT·화자 분리와 **같은 방식**(외부 바이너리 spawn)으로 붙인다. 서버·HTTP·추가 런타임을 들이지 않는다.

- 엔진은 llama.cpp의 **`llama-cli`** 를 `child_process.spawn` 한다. `llama-server`(HTTP)는 쓰지 않는다 —
  단발 요약에 상주 서버·포트·프로세스 수명 관리가 필요 없고, "네트워크를 쓰지 않는다"는 원칙을 코드로도 지키기 쉽다.
- 호출 형태:

  ```
  llama-cli -m <gguf> -sysf <system.txt> -f <prompt.txt> -o <out.txt>
            -st --no-display-prompt --no-escape --no-warmup
            -c <ctxSize> -n <maxPredict> --temp <temp> -t <threads>
  ```

  - **프롬프트·시스템 프롬프트·출력은 전부 파일로 주고받는다.** 71분 회의록은 수만 자라 argv에 넣으면 길이 제한에 걸리고,
    `-e`(escape)가 기본 켜져 있어 본문의 `\n`·`\t` 같은 문자열이 제어문자로 바뀐다. `--no-escape`를 함께 준다.
  - `-st`(single-turn)로 한 턴만 돌고 종료한다. 대화 모드로 들어가면 프로세스가 stdin을 기다리며 끝나지 않는다.
  - `--no-display-prompt` + `-o`로 **결과 파일만 읽는다**. stdout에는 로드 로그·타이밍이 섞이므로 파싱하지 않는다.
  - 임시 파일은 `userData/summaries/<meetingId>/`에 만들고 잡이 끝나면 **실패해도 지운다** (정규화본과 같은 규칙).
- **긴 회의록은 map-reduce로 나눈다.** `src/shared/summary.ts`가 회의록을 발화 줄 경계로 청크 예산만큼 자르고,
  청크마다 부분 요약을 만든 뒤 부분 요약들을 이어 붙여 한 번 더 요약한다. 청크가 하나면 reduce 단계를 건너뛴다.
  분할·출력 정리는 순수 함수라 vitest로 검증한다. 청크 예산은 컨텍스트를 통째로 채우지 않고 여유를 둔다(아래 상수 절).
- **파이프라인이 자동으로 요약하지 않는다.** (결정 문서 전환 뒤에도 그대로다 — 자동으로 도는 것은 요약이 아니라 결정 추출이고, `references/decisions.md` "흐름"을 따른다.) 디테일 화면의 "요약 만들기" 버튼이 `summary:create`를 보낸다.
  요약 모델이 없거나 요약이 실패해도 회의록 자체는 이미 `status='done'`이어야 하기 때문이다.
- 저장은 `meetings.summary` 한 컬럼. **진행 상태용 컬럼은 만들지 않는다** — 진행은 이벤트로만 알리고,
  앱이 꺼져 진행 상태가 사라지면 사용자가 버튼을 다시 누르면 된다.

### 잡 큐 통합

요약도 STT와 같은 CPU·GPU를 쓰므로 **`src/main/pipeline/queue.ts`의 같은 큐(동시성 1)** 에 넣는다.
요약 전용 큐를 따로 두면 STT와 요약이 동시에 돌아 둘 다 느려진다 (`references/pitfalls.md`).

- 큐 항목은 `string`이 아니라 `{ kind: 'pipeline' | 'summary'; meetingId: string }`이고, `drain`이 종류에 따라
  `runPipeline` 또는 `runSummary`를 부른다.
  Phase 5-4의 용어 초안은 회의에 묶이지 않고 결과를 돌려받아야 하므로 `{ kind: 'glossary'; run }` 항목으로 넣는다 (아래 "용어 사전" 절).
- 실패 처리는 종류마다 다르다. 파이프라인 실패는 `meetings.status='error'`로 남기지만,
  **요약 실패는 회의 상태를 건드리지 않는다** — 회의록은 멀쩡하고 요약만 없는 상태이므로 이벤트로만 알린다.

### IPC (Phase 5)

```ts
summary: { create: 'summary:create' },
events: { progress: 'pipeline:progress', summary: 'summary:progress' }
```

- `summary:create`는 큐에 넣기만 하고 즉시 반환한다(응답 없음). 요약은 수 분이 걸려 `invoke`를 매달아 둘 수 없다.
  Phase 3의 "뮤테이션은 갱신된 `MeetingDetail`을 돌려준다" 규약의 예외다 — 이 채널은 값을 바꾸는 게 아니라 **잡을 예약**한다.
- 진행은 `summary:progress`로 push한다: `{ meetingId, stage, percent, summary?, errorMessage? }`.
  `stage='done'`일 때 **요약 텍스트를 함께 실어 보내** renderer가 다시 조회하지 않게 한다.
- `stage='error'`이면 `errorMessage`(한국어)를 함께 보낸다. 회의 상태는 그대로 `done`이다.

### 화면

| 경로 | 페이지 | 추가되는 widget |
| --- | --- | --- |
| `/meetings/:meetingId` | `pages/MeetingDetail` | `meeting/SummarySection` (`TranscriptSection` 위) |

- `SummarySection`은 회의가 `done`이고 발화가 있을 때만 버튼을 활성화한다. 요약이 이미 있으면 본문을 보여주고 "다시 만들기"를 제공한다.
- 요약 텍스트는 마크다운으로 렌더링하지 않는다. 라이브러리를 들이지 않기 위해 **줄바꿈을 보존한 일반 텍스트**로 표시한다.

### 바이너리·모델 확보 (Phase 5)

| 대상 | 확보 방법 | 배치 위치 |
| --- | --- | --- |
| `llama-cli` + 의존 dylib | `ggml-org/llama.cpp` 릴리스의 `llama-<build>-bin-macos-arm64.tar.gz`를 받아 필요한 파일만 꺼낸다 | `resources/bin/darwin-arm64/` |
| 요약 모델 | `Qwen3-4B-Instruct-2507-Q4_K_M.gguf` (Hugging Face, Apache-2.0) | `scripts/fixtures/models/` (Phase 1 규칙과 동일), 앱은 `userData/models/` |

- llama.cpp 실행 파일의 rpath는 `@loader_path`라 **바이너리와 dylib을 같은 폴더에** 두면 그대로 동작한다 (sherpa-onnx와 같은 구조).
- 아카이브가 `tar.gz`라 `scripts/shell.ts`의 `extractArchive`는 압축 방식을 고정하지 않고 `tar -xf`로 자동 판별한다.
- 릴리스 빌드 번호(`b10622` 등)는 `scripts/assets.ts`에 상수로 고정한다. 최신 빌드를 자동 추적하면 체크섬이 매번 바뀐다.

## LLM 공급자 (2026-09-24)

요약과 용어 초안은 **LLM을 부르는 방식이 같고 프롬프트만 다르다.** 사용자가 이미 구독하거나 발급받은 Claude·GPT를 쓸 수 있게
LLM 호출을 `src/main/llm/*`의 **공급자 추상화** 뒤로 모으고, 설정에서 공급자를 고른다. 지원 외부 LLM은 Claude와 GPT다 (SKILL.md 1절).

### 네 공급자

| `LlmProvider` | 실행 | 준비 조건 | 비용·전송 |
| --- | --- | --- | --- |
| `local` (기본) | `llama-cli` spawn (기존 방식 그대로) | `llama-cli` + 요약 모델 | 없음. 회의록이 기기 밖으로 나가지 않는다 |
| `claude-api` | `@anthropic-ai/sdk`로 Messages API 호출 (main 프로세스) | 설정에 저장한 Anthropic API 키 | Anthropic 콘솔 토큰 요금. 회의록이 Anthropic 서버로 전송된다 |
| `claude-cli` | 설치된 Claude Code `claude -p`를 `child_process.spawn` | `claude` 실행 파일 + CLI에 로그인된 구독 계정 | 구독 사용량. 회의록이 Anthropic 서버로 전송된다 |
| `openai-api` | `openai` SDK로 Responses API 호출 (main 프로세스) | 설정에 저장한 OpenAI API 키 | OpenAI 플랫폼 토큰 요금. 회의록이 OpenAI 서버로 전송된다 |

- **회의록 전송 사실은 설정 화면의 공급자 설명에 그대로 적는다.** 로컬 우선 약속의 예외를 사용자가 알고 고르게 한다.
  외부 공급자의 자동 교정은 별도 스위치(기본 꺼짐)로 켜고, 켜면 회의가 끝날 때마다 회의록이 전송된다는 것을 스위치 설명에 적는다 (2026-09-28, "회의록 교정" 절).
- 파이프라인(STT·화자 분리)은 공급자와 무관하게 로컬이다. 공급자는 요약·용어 초안·교정에만 적용된다. 교정은 공급자에 따라 방식이 다르다 ("회의록 교정" 절).
- **API 키는 회사(`LlmApiVendor = 'anthropic' | 'openai'`) 단위로 따로 저장한다.** 공급자를 오가며 써도 키를 다시 넣지 않는다.
  키가 필요한 공급자와 회사의 대응은 `apiVendorOf(provider)` 한 곳에 둔다 (`claude-api` → `anthropic`, `openai-api` → `openai`, 나머지 null).
- **모델**: Claude API는 `claude-opus-5` 고정, 적응형 사고(`thinking: { type: 'adaptive' }`) + `output_config.effort: 'medium'`(요약은 정형 작업이라 높은 노력이 필요 없다).
  CLI는 `--model`을 넘기지 않고 **사용자가 CLI에 설정한 기본 모델**을 쓴다 — 구독 등급마다 쓸 수 있는 모델이 달라 앱이 고르면 실패할 수 있다.
  OpenAI는 **GPT-6 계열 셋 중 사용자가 고른다** (`OpenaiModelId = 'gpt-6-astra' | 'gpt-6-sol' | 'gpt-6-luna'`, 기본 `gpt-6-sol`) —
  요금이 모델마다 크게 달라 앱이 하나로 고정하면 비싼 쪽(Astra)이나 부족한 쪽(Luna)을 강요하게 된다. `reasoning.effort`는 `'low'`.
  GPT 모델 목록은 `src/shared/llm.ts`의 `OPENAI_MODELS` 한 곳에만 둔다.
- **컨텍스트 예산은 공급자가 정한다.** `local`은 기존 `CHUNK_BUDGET_CHARS`(8K 컨텍스트)로 map-reduce하고, 외부 API는 컨텍스트가 커서
  `API_CHUNK_BUDGET_CHARS`(40만 자, 약 28만 토큰)까지 한 번에 넣는다. 실무 회의록은 전부 한 번에 들어가 reduce 단계가 없다.
  `splitTranscript`의 `budgetChars` 인자로 넘기므로 순수 로직은 바뀌지 않는다.
- **생성 상한의 하한(`API_MIN_MAX_TOKENS`, 16K)도 외부 API 공통이다.** Claude의 적응형 사고와 GPT-6의 추론 토큰이 모두 출력 상한에 포함되므로 로컬용 상한(1200)을 그대로 주면 사고만 하다 잘린다.
- **GBNF 문법은 `local`에서만 쓸 수 있다.** 용어 초안은 외부 API에서는 문법 대신 출력 형식 지시문을 프롬프트 끝에 붙이고, 파싱(`parseGlossaryDraft`)이
  형식에 맞지 않는 줄을 버리는 것으로 같은 결과를 얻는다.

### 파일과 인터페이스

```
src/shared/llm.ts            # LlmProvider 유니온·기본값·한국어 라벨, API 키 회사(LlmApiVendor)·GPT 모델 목록, 준비 여부 판정(isLlmReady·llmMissingMessage),
                             # claude CLI 인자 조립·JSON 출력 파싱, 외부 API 청크 예산 (순수 함수, vitest)
src/main/llm/types.ts        # LlmClient·LlmCompleteParams 인터페이스
src/main/llm/provider.ts     # 설정을 읽어 LlmClient 하나를 만든다(createLlmClient)·현재 상태(getLlmStatus). 요약·용어 초안은 이것만 부른다
src/main/llm/local.ts        # llama-cli (기존 summary/llama.ts의 인자 조립·답변 추출을 그대로 쓴다)
src/main/llm/claudeApi.ts    # Anthropic SDK. 스트리밍으로 받아 finalMessage()만 쓴다 (긴 출력에서 HTTP 타임아웃 회피)
src/main/llm/claudeCli.ts    # claude 실행 파일 탐색·spawn. 프롬프트는 stdin, 시스템 프롬프트는 --system-prompt
src/main/llm/openaiApi.ts    # OpenAI SDK Responses API. instructions=시스템 프롬프트, input=프롬프트, output_text만 쓴다
src/main/llm/apiKey.ts       # 회사별 API 키 저장·조회 (safeStorage 암호화)
src/main/llm/check.ts        # 설정 화면 "연결 확인" — 짧은 프롬프트 한 번
```

```ts
interface LlmCompleteParams {
  system: string
  prompt: string
  /** 생성 상한. local은 -n, 외부 API는 max_tokens의 하한(사고·추론 토큰이 포함되므로 16K 아래로 내리지 않는다) */
  maxTokens: number
  /** 임시 파일 이름과 로그에 쓰는 꼬리표 */
  label: string
  /** local이 프롬프트·출력 파일을 두는 폴더. 만들고 지우는 것은 호출하는 쪽(요약·용어 초안)의 몫 */
  workDir: string
  /** local 전용. GBNF 문법, 컨텍스트 크기, 온도. 외부 API 공급자는 무시한다 */
  grammar?: string
  contextTokens?: number
  temperature?: number
}

interface LlmClient {
  provider: LlmProvider
  /** 회의록 한 조각의 최대 글자 수. splitTranscript의 budgetChars로 넘긴다 */
  chunkBudgetChars: number
  /** 답변 본문만 돌려준다. llama의 `Assistant:` 표시 제거는 local 구현이 한다 */
  complete: (params: LlmCompleteParams) => Promise<string>
}
```

- `createLlmClient()`는 잡이 **시작할 때** 설정을 한 번 읽는다. 진행 중인 잡의 공급자는 바뀌지 않는다 (조용히 처리 옵션과 같은 규칙).
- 준비되지 않았으면 spawn·요청 전에 한국어 메시지로 멈춘다 (`llmMissingMessage`). 메시지는 renderer의 `SummarySection`도 같은 함수로 만들어 두 곳이 같은 문구를 보여준다.
- 외부 API를 써도 **잡 큐는 그대로 하나**다 (`pipeline/queue.ts`, 동시성 1). 외부 API는 GPU를 쓰지 않아 STT와 동시에 돌 수 있지만,
  큐를 둘로 나누면 "회의 처리 중이면 그 뒤에 만든다"는 화면 안내와 실패 처리가 공급자마다 갈린다. 단순함을 택했다.

### Claude Code CLI 호출

```
claude -p --output-format json --tools "" --no-session-persistence --setting-sources "" --system-prompt <system>
  (프롬프트는 stdin으로)
```

- **`--bare`를 쓰지 않는다.** 키체인 읽기를 끄기 때문에 구독 로그인이 풀려 "Not logged in"이 된다 (2026-09-24 실측). 대신
  `--tools ""`(도구 전부 끔), `--no-session-persistence`(세션 파일 남기지 않음), `--setting-sources ""`(사용자·프로젝트 설정 무시)로 최소 모드를 만든다.
- **`cwd`는 `userData/llm/`** 같은 빈 폴더로 둔다. 프로젝트 폴더에서 돌리면 그곳의 CLAUDE.md가 시스템 프롬프트에 섞인다.
- 프롬프트는 **stdin**으로 준다. 회의록은 수만 자라 argv에 넣을 수 없다 (llama와 같은 이유). 시스템 프롬프트는 수백 자라 `--system-prompt`로 넘긴다.
- 출력은 `--output-format json` 한 덩어리다. `type: 'result'`이고 `is_error`가 거짓일 때 `result` 문자열이 답변이다.
  `is_error`가 참이면 `result`가 오류 문장이다 (예: `Not logged in · Please run /login`) — 그대로 한국어 안내 뒤에 붙인다.
- **실행 파일 탐색**: Finder에서 띄운 Electron 앱의 `PATH`는 `/usr/bin:/bin:/usr/sbin:/sbin`뿐이라 `claude`가 안 잡힌다.
  `~/.local/bin/claude` → `/opt/homebrew/bin/claude` → `/usr/local/bin/claude` → `~/.claude/local/claude` 순서로 존재를 보고,
  없으면 로그인 셸(`$SHELL -ilc 'command -v claude'`)로 한 번 찾아 캐시한다. spawn할 때 `PATH`도 로그인 셸의 값으로 바꿔 준다
  (npm 설치본은 `node`를 PATH에서 찾는다). 결과(`path`·`version`)는 `llm:status`로 설정 화면에 보여준다.

### Claude API 호출

- `new Anthropic({ apiKey })` → `client.messages.stream({...}).finalMessage()`. 스트리밍은 화면에 흘리지 않고 타임아웃 회피용이다.
- `stop_reason === 'refusal'`이면 "요청을 처리하지 않았습니다"로, `max_tokens`면 "답변이 잘렸습니다"로 안내한다.
- 오류는 SDK의 타입으로 나눈다: `AuthenticationError`(키 오류) → `RateLimitError`(한도) → `APIConnectionError`(네트워크) → `APIError`(그 외, 상태 코드 포함).
- **API 키는 `safeStorage.encryptString`으로 암호화해 settings 테이블에 base64로 저장한다** (`llm.claudeApiKey`·`llm.openaiApiKey`). renderer에는 키를 돌려주지 않고
  회사별 유무와 마지막 4자(`apiKeys[vendor].isSaved`·`.tail`)만 준다. `safeStorage.isEncryptionAvailable()`이 거짓이면 저장을 거절한다 — 평문으로 남기지 않는다.

### OpenAI API 호출

- `new OpenAI({ apiKey })` → `client.responses.create({ model, instructions: system, input: prompt, max_output_tokens, reasoning: { effort: 'low' } })`.
  Chat Completions는 쓰지 않는다 — OpenAI가 Responses API를 기본 인터페이스로 안내한다. 응답은 `output_text`만 쓴다.
- `status === 'incomplete'`이면 `incomplete_details.reason`을 본다: `max_output_tokens`면 "답변이 잘렸습니다", `content_filter`면 "요청을 처리하지 않았습니다".
  Claude의 `stop_reason`과 같은 이유로 빈 요약·잘린 요약이 저장되지 않게 오류로 바꾼다.
- 오류는 SDK의 타입으로 나눈다: `AuthenticationError`(키 오류) → `RateLimitError`(한도·잔액) → `APIConnectionError`(네트워크) → `APIError`(그 외, 상태 코드 포함). Claude와 같은 순서·같은 문구 형식이다.
- 스트리밍은 쓰지 않는다. SDK 기본 타임아웃(10분)이 요약 한 번에 충분하다.

### IPC

| 키 | 채널 | 방향 | 용도 |
| --- | --- | --- | --- |
| `llm.status` | `llm:status` | invoke | `LlmStatus` 조회 — 공급자, 로컬 모델 준비 여부, 회사별 키 유무·꼬리, GPT 모델, `claude` 경로·버전 |
| `llm.setProvider` | `llm:setProvider` | invoke | 공급자 저장. 갱신된 `LlmStatus`를 돌려준다 |
| `llm.setApiKey` | `llm:setApiKey` | invoke | 회사(`vendor`)의 키 저장(`apiKey: string`) 또는 삭제(`null`). 갱신된 `LlmStatus`를 돌려준다 |
| `llm.setOpenaiModel` | `llm:setOpenaiModel` | invoke | GPT 모델 저장(`model: OpenaiModelId`). 갱신된 `LlmStatus`를 돌려준다 |
| `llm.check` | `llm:check` | invoke | 현재 공급자로 짧은 프롬프트 한 번. 성공 메시지를 돌려주고 실패는 reject |

- 공급자는 `AppSettings`에 넣지 않는다 — 키 저장·CLI 탐색·연결 확인 같은 비동기 동작이 붙어 있어 용어 사전과 같은 이유로 **자기 채널**을 쓴다 (`references/data-model.md`).
- `llm:check`는 큐를 거치지 않는다. 짧고, 로컬 공급자는 spawn 대신 모델 존재만 확인해 돌려준다.

### 화면

- `setting/LlmSection` — 설정의 **"요약 · 용어 초안"** 카테고리. 용도로 이름을 짓는다 — "언어 모델"은 음성 인식 모델과 겹쳐 들린다.
  "실행 방식" 라디오 네 개(제목·설명·전송 안내), 고른 방식에 따라 아래 행이 바뀐다:
  `local`이면 **로컬 요약 모델 파일** 다운로드 행(`model/SummaryModelSection`, 페이지가 `localModelSlot`으로 넘긴다),
  `claude-api`·`openai-api`면 그 회사의 API 키 입력(`type="password"`, 같은 `ApiKeyField`에 라벨·안내·자리표시자만 다르게)·저장·삭제와 저장 상태(`…abcd`),
  `openai-api`면 그 아래 GPT 모델 선택(`OpenaiModelSelect`, `<select>` 하나 — 셋 중 하나라 라디오를 또 쌓지 않는다),
  `claude-cli`면 찾은 경로·버전 또는 설치 안내.
  "연결 확인" 버튼은 외부 공급자에서만 보인다. 로컬 파일 행은 파일이라는 점을 제목에 드러내고, 외부 공급자를 쓰면 필요 없다고 설명에 적는다.
- `meeting/SummarySection`은 `useModelStatus` 대신 `useLlmStatus`로 준비 여부를 본다. 준비되지 않았을 때의 문구는 공급자별로 다르고(`llmMissingMessage`), 설정 링크는 같다.
  캡션 "로컬 모델"은 공급자 라벨로 바뀐다(위치는 헤더의 제목 아랫줄 — "화면별 구성"의 회의 상세).
- `setting/GlossarySection`의 "초안에는 요약 모델이 필요합니다" 안내는 공급자 라벨을 쓰도록 바꾼다 (그 위젯을 손대는 작업이 끝난 뒤).

## 용어 사전 (Phase 5-4)

교정(발음 유사도 후보 + O/X 판정)과 인식(whisper `--prompt`)은 둘 다 **정답 용어 목록**이 있어야 한다 (`docs/phase5-refine-results.md`).
용어 사전은 **전역 한 층**이다 (2026-09-25 사용자 결정으로 회의별 층 폐기 — 자동 교정에는 회의마다 용어를 적는 단계가 맞지 않는다). 이 절은 그 전역 층을 설정에서 만드는 방법이다.

### 초안은 LLM, 확정은 사람

- 설정의 **팀 소개**(예: "프론트엔드 개발팀, 공용 UI 라이브러리와 패키지 배포를 다룸")를 받아 요약과 같은 `llama-cli` + 요약 모델로 **용어 초안**을 만든다.
- 초안은 저장하지 않는다. renderer가 편집 중인 목록 뒤에 **새 용어만 덧붙이고**(`=` 앞부분 기준, 대소문자 무시) 사용자가 고친 뒤 저장한다.
  모델 초안에는 틀린 읽기(Yarn=와이어너)와 일반어가 섞이고, 일반어 하나가 교정 오탐 수십 개를 만든다 (측정 문서).
- 프롬프트는 "음성 인식이 틀리는 종류(영어 기술 용어·제품·도구 이름·약어·외래어)만, 일반어 제외"로 좁히고 읽기 예시를 준다.
  출력 형식은 GBNF 문법으로 못박는다 (아래). 문법 파일·프롬프트는 `src/shared/glossary.ts`에 둔다.
- **초안은 `영어 표기 = 한글 읽기` 줄만 받는다** (GBNF에서 한글 줄 제거, 2026-09-24). 한글 줄을 허용하면 모델이 문장을 줄 단위로 끊어 적거나
  "버전 관리·소스 코드·기록 템플릿" 같은 일반어로 목록을 채웠다. 한국어 용어(모노레포, 임상시험)는 사용자가 직접 적는다. 저장 형식은 그대로 `용어` 줄도 받는다.
- 프롬프트는 "한국 회의에서 영어 이름 그대로 부르는 말만, 읽기는 뜻이 아니라 소리"를 못박는다. 없으면 `ad performance = 광고 성과`처럼
  한국어 개념을 영어로 번역한 줄이 나오고, 이런 줄은 교정에서 한국어를 영어로 바꾸자는 오탐이 된다.
- **읽기 예시는 기술 용어(Kubernetes·GitHub·React·npm)를 유지한다.** 일상 제품 이름(YouTube·Excel)으로 바꾸면 예시 누출은 줄지만 읽기가 크게 나빠졌다
  (React = 레이크트, Kubernetes = 크로노스). 누출은 한글 줄 제거·줄 수 축소로 대부분 사라졌다.
- **초안은 3~25줄**로 받는다. 5~40줄로 받으면 짧은 팀 소개에서 그 분야의 흔한 이름(프론트엔드 팀에 Nginx·Redis·MongoDB)으로 빈자리를 채운다.
- **팀 소개에 영어로 적힌 이름은 초안 맨 앞에 둔다.** 모델이 적은 줄이면 그 줄을, 빠뜨렸으면 약어는 코드 읽기로, 그 외는 읽기 없이 이름만 넣어 사용자가 읽기를 채우게 한다.
  팀 소개 안내 문구도 "쓰는 기술·도구·제품 이름을 영어 그대로 적어 달라"고 요청한다 — 팀 소개가 짧으면 모델은 실제 회의 용어를 알 수 없다.
- **대문자 약어의 읽기는 코드가 만든다** (`CI/CD` → `씨아이 씨디`). 모델은 약어를 자주 틀리게 읽는다. 대문자·숫자만으로 된 2~6자 토큰(대문자 1자 이상)을 `/`로 나눈 것이 약어다.
  숫자는 영어로 읽는다 (`S3` → `에스쓰리`, `GA4` → `지에이포`).
- **`.js`로 끝나는 이름은 읽기 끝을 `제이에스`로 고친다** (`Next.js = 넥스트 포인트` → `넥스트 제이에스`). 모델이 점을 "포인트·닷"으로 읽는다.
  읽기가 여러 단어면 마지막 단어를 바꾸고, 한 단어면 뒤에 붙인다.
- **사람이 검수한 읽기 사전이 모델 읽기를 덮어쓴다** (2026-09-24). 약어·`.js` 밖의 단어 읽기(Jira=재자, Git=기트, Redux=레덕스, Tailwind=타일윈드, ESLint=엔엘식)는
  4B 모델의 한계라 프롬프트로 못 고친다 (`docs/phase5-refine-results.md` "초안 품질 보강"). 자주 쓰는 개발·제품 용어의 `영어 표기 = 한글 읽기`를
  **`@meeting-stt/core/termReadings`** 에 상수(`TERM_READINGS`)로 두고, `parseGlossaryDraft`가 사전에 있는 용어는 모델 읽기 대신 사전 읽기를 쓴다 — 약어 코드 읽기와 같은 방식이다.
  - 적용 순서는 **사전 → 약어 → `.js`**. 사전은 사람이 검수한 값이라 약어 규칙보다 우선한다 (`SQL = 시퀄`처럼 약어 모양이어도 통째로 부르는 이름을 사전에 적을 수 있다).
  - 찾기는 **대소문자 무시**이고, 맞으면 **표기도 사전 표기로 맞춘다** (`Github = 깃헙` → `GitHub = 깃허브`). 교정·인식은 표기를 그대로 쓰므로 정식 표기가 낫다.
  - 사전은 **읽기만 바꾸고 용어를 더하지 않는다.** 모델이 적지 않은 용어를 사전에서 끌어오면 고정 목록과 같아져 모든 회의를 한 분야로 끌고 간다 (`docs/phase5-results.md`).
    예외는 팀 소개에 적힌 이름(`prependTeamTerms`)이다 — 모델이 빠뜨렸으면 약어와 마찬가지로 사전 읽기를 채운다.
  - 사전에 넣는 것은 **한국 회의에서 영어 이름 그대로 부르는 도구·제품·언어·프레임워크·서비스 이름과 개발·제품 관용어**다. 읽기는 실제로 부르는 소리 하나(흔한 변형이 있으면 쉼표로 2개까지)이고,
    번역어로 부르는 말(배포, 검색)은 넣지 않는다. 사전에 없는 용어는 지금처럼 모델 읽기를 쓰고 사용자가 고친다.
  - 사전은 `packages/core`에 둔다 — 브라우저 프로토타입도 같은 용어 사전 형식을 쓰게 될 때 읽기 값이 갈라지면 안 되고, 런타임 의존이 없는 순수 데이터라서다.
    테스트(`termReadings.test.ts`)는 표기 중복(대소문자 무시)·읽기가 한글뿐인지·찾기 규칙을 본다.
- 요약 모델이 없으면 "초안 만들기"를 막고 요약 모델을 먼저 받으라고 안내한다. 직접 입력은 모델 없이도 된다.

### 실행과 큐

- `glossary:draft`는 **초안을 결과로 돌려주는 invoke**다 (`{ teamDescription }` → `{ terms: string[] }`). 요약과 달리 10~20초로 짧고,
  결과를 DB가 아니라 편집 중인 화면에 넣으므로 push 이벤트·진행률을 두지 않는다.
- 요약과 같은 GPU를 쓰므로 **같은 큐(동시성 1)** 에 `kind: 'glossary'`로 넣고, 잡이 끝나면 invoke가 풀린다.
  회의 처리 중이면 그 뒤에 돈다 — 화면은 "다른 작업이 끝난 뒤 만듭니다"를 함께 보여준다. 실패는 invoke reject(한국어 메시지)로만 알린다.
- 임시 파일은 `userData/glossary/`에 만들고 끝나면 실패해도 지운다 (요약과 같은 규칙).

### IPC

| 키 | 채널 | 방향 | 용도 |
| --- | --- | --- | --- |
| `glossary.get` | `glossary:get` | invoke | `GlossarySettings` 조회 |
| `glossary.update` | `glossary:update` | invoke | `GlossarySettings` 전체 저장. 정리(공백·빈 줄·중복 제거)한 값을 돌려준다 |
| `glossary.draft` | `glossary:draft` | invoke | 팀 소개로 초안 생성. 저장하지 않는다 |

### 화면

- `setting/GlossarySection` — 팀 소개 `textarea`(최대 500자, placeholder에 영어 도구 이름을 섞은 예), "초안 만들기" 버튼, **행 단위 용어 목록**, "저장" 버튼.
- **용어 목록은 한 행에 `용어` 입력 + `한글 읽기(선택)` 입력 + 삭제 버튼**으로 편집한다 (2026-09-24 사용자 결정, 이전의 한 줄 텍스트 `textarea`를 대체).
  텍스트 방식은 사용자가 `=`·쉼표 구분자를 직접 지켜야 했고, `:`·`->`·전각 쉼표를 쓰면 경고 없이 한 용어로 뭉쳤다.
  - 읽기는 **선택**이다. 한글 용어는 그 자체가 발음이고, 읽기가 빈 영어 용어는 교정 때 모델이 읽기를 채운다 (`src/shared/refine.ts`). 적어 두면 모델 읽기보다 정확하다는 점만 안내한다.
  - 읽기가 여러 개면 한 칸에 쉼표로 적는다. `,`·`，`·`、`를 모두 구분자로 받는다. 용어 칸에는 `=`를 입력받지 않는다.
  - 읽기가 빈 대문자 약어는 코드 읽기(`acronymReading`)를 placeholder로 보여 주고, 저장할 때 그 읽기를 채운다.
  - 읽기 칸에서 Enter를 누르면 아래에 새 행을 만들고 그 용어 칸으로 이동한다. 빈 용어 행은 저장하지 않는다.
  - **목록 복사 버튼**을 용어 목록 아래 "용어 추가" 옆에 두고, **붙여넣기는 버튼이 아니라 입력 칸의 실제 붙여넣기(⌘V)** 로 받는다 (2026-09-28 사용자 요청). 다른 기기·다른 사람과 목록을 통째로 주고받기 위해서다.
    - 복사는 **편집 중인 목록**(저장 전 포함)을 저장 형식 줄(`용어` / `용어 = 읽기1, 읽기2`)로 `\n`로 이어 `clipboard:writeText`로 보낸다. 빈 약어 읽기는 저장할 때처럼 코드 읽기로 채운 줄이다.
    - 붙여넣기 형식은 **복사 형식과 같다** (`scripts/refine.ts`의 용어 파일도 같은 형식이라 그대로 옮겨진다). 용어 칸이든 읽기 칸이든 여러 줄 또는 `=`가 든 텍스트를 붙여 넣으면 `parseTermLines`로 줄마다 행을 만들어 **붙여 넣은 행 자리부터** 쭉 채운다 (그 행이 비어 있으면 대신하고, 아니면 바로 아래에 끼운다). 한 줄짜리 일반 텍스트는 평소처럼 그 칸에 들어간다.
    - 목록에 이미 있는 용어(`=` 앞부분, 대소문자 무시)와 붙여 넣은 텍스트 안의 중복은 건너뛴다 — 복사한 목록을 같은 화면에 다시 붙여도 행이 두 배가 되지 않는다. 저장하지 않고 "저장하지 않은 변경" 표시로 확인을 맡긴다.
  - **저장·IPC 형식은 바꾸지 않는다.** 행은 renderer 안에서만 쓰고, 저장할 때 `용어` 또는 `용어 = 읽기1, 읽기2` 줄(`GlossarySettings.terms: string[]`)로 직렬화한다.
- 저장은 버튼으로 한다 (blur 저장 아님). 초안을 덧붙인 직후 사용자가 훑어보고 고칠 시간을 준다. 저장하지 않은 변경이 있으면 버튼 옆에 표시한다.

## 회의록 교정 (Phase 5-4)

**전역 용어 사전**을 근거로 회의록의 오인식을 찾아 **자동으로 고친다**. 방식은 검증에서 확정한 그대로다 (`docs/phase5-refine-results.md`):
코드가 자모 발음 유사도로 치환 후보를 만들고, LLM은 후보마다 문맥상 뜻이 통하는지 O/X만 답하며, 치환은 코드가 한다.

**2026-09-25 사용자 결정으로 두 가지를 바꿨다.** (1) 회의별 용어 층을 없애고 **전역 용어 사전만** 쓴다 — 회의마다 용어를 적는 단계가 자동 교정과 맞지 않는다.
(2) 수정 **제안**을 만들어 사용자가 쌍 단위로 수락·거절하던 흐름을 버리고, 파이프라인이 회의록을 저장한 직후 **교정 잡을 자동으로 이어 돌려 통과한 쌍을 바로 `utterances.text`에 반영**한다.
검증에서 측정한 판정 정밀도는 52%라 틀린 치환도 함께 들어간다 — 그래서 **무엇을 고쳤는지 상세 화면에 남기고**, 잘못 고친 곳은 발화 인라인 편집으로 되돌린다.
인식 단계(`--prompt`)는 여전히 건드리지 않는다 (`roadmap-archive.md` 5-4).

**2026-09-28 사용자 결정으로 교정 방식이 공급자에 따라 둘로 나뉜다.** 용어 사전에 없는 오인식("차 통지를" → "차 정지를")까지 문장 뜻을 보고 고친다.
측정(`docs/phase5-refine-results.md` "문장 교정")에서 외부 공급자는 이것을 해냈고 로컬 4B는 여전히 못 했다.

| 공급자 | 교정 방식 | 근거 | 용어 사전 |
| --- | --- | --- | --- |
| `local` | **용어 교정** — 코드가 발음 후보를 만들고 LLM이 O/X 판정 (아래 "실행과 큐"의 1~5, 변경 없음) | 로컬 4B의 문장 교정은 10분 회의에서 8개 전부 틀림 | 필수 |
| `claude-api`·`claude-cli`·`openai-api` | **문장 교정** — LLM이 고친 줄을 내고 코드가 발음 가드로 거른다 (아래 "문장 교정") | 10분 17개 모두 맞음, 71분 123개 중 명백한 오류 0 | 선택 (있으면 프롬프트에 넣는다) |

- 문장 교정은 용어 교정이 하던 일(카볼→tarball, 기터브→GitHub)을 포함하므로 외부 공급자에서는 **용어 교정을 돌리지 않는다.** 두 방식을 겹쳐 돌리지 않는다.
- 어느 방식이든 교정이 본문을 바꾸면 **발화의 교정 전 원문을 `utterances.original_text`에 보관**하고, 상세 화면에서 발화별로 원문을 보고 되돌릴 수 있다
  (`data-model.md` "자동 교정 결과 저장"). 문장 교정은 고치는 범위가 넓어 잘못 고쳤을 때 인라인 편집만으로 되돌리기 어렵기 때문이다.

### 실행과 큐

- **자동 실행**: 파이프라인 잡이 `status='done'`으로 저장을 끝낸 뒤 `scheduleAutoRefine`이 조건을 보고 **같은 잡 큐(동시성 1)** 에
  `{ kind: 'refine', meetingId }`를 넣는다. 조건은 LLM 공급자가 준비돼 있고(`isLlmReady(await getLlmStatus())`), 공급자별로 다음을 만족하는 것이다.
  - 로컬: 전역 용어가 하나 이상 있다(`getGlossarySettings().terms`).
  - 외부: 설정 **"회의록을 만들면 자동으로 교정"** 스위치(`AppSettings.isAutoRefineExternal`, DB 키 `refine.autoExternal`, **기본 꺼짐**)가 켜져 있다. 용어 사전은 필요 없다.
    자동 교정은 회의가 끝날 때마다 회의록을 그 회사 서버로 보내므로, 요약(버튼으로만 전송)과 달리 사용자가 명시적으로 켜야 한다 (2026-09-28 사용자 결정).
    이 결정 전에는 외부 공급자 + 용어 사전이면 자동으로 돌았는데, 이제 스위치를 켜야 돈다.
    스위치는 설정의 LLM 공급자 섹션에서 외부 공급자를 골랐을 때만 보인다(`LlmSection`의 `externalSlot` ← `features/refine/AutoRefineToggle`).
  조건이 아니면 **조용히 건너뛰고 로그만 남긴다** — 회의마다 오류를 띄우지 않기 위해서다. 회의록은 교정 없이도 `done`이다.
  스위치가 꺼져 있어도 상세의 "다시 교정"은 돈다(사용자가 그 회의를 보내겠다고 누른 것이다).
- **수동 실행**: 상세 레일의 "다시 교정" 버튼이 `refine:run { meetingId }`를 보낸다. 용어 사전을 고친 뒤 기존 회의를 다시 돌리는 용도다.
  이때는 조건을 건너뛰지 않고 실패로 알린다 (로컬인데 용어가 없으면 "전역 용어 사전이 비어 있습니다", LLM 미준비는 `createLlmClient`의 메시지).
  같은 회의의 교정 잡이 이미 줄 서 있으면 다시 넣지 않는다. 다시 교정은 **지금 본문**(이전 교정·사용자 편집이 들어간 것)을 입력으로 쓴다.
- 잡은 `src/main/refine/run.ts`가 돈다. 공급자를 잡 시작 시 한 번 읽어 로컬이면 `runRefine`(용어 교정), 외부면 `runSentenceRefine`(문장 교정)으로 간다.
  용어 교정의 순서는 스크립트(`scripts/refine.ts`)와 같다:
  1. 용어 사전 = `normalizeGlossaryTerms(전역 용어)`.
  2. `read` 단계: 읽기가 없는 라틴 문자 용어가 있으면 LLM에 한글 읽기를 한 번 묻는다 (`buildReadingPrompt`). 없으면 건너뛴다.
  3. 코드가 후보를 만든다 (`findRefineCandidates`). 후보가 없으면 판정 없이 빈 결과로 끝난다.
  4. `verify` 단계: 후보를 `VERIFY_BATCH_SIZE`(40)개씩 잘라 배치마다 LLM에 O/X를 묻는다. 진행률은 배치 수로 잰다.
  5. 통과한 쌍을 `applyRefinePairs`(순수 함수)로 발화에 적용하고, 바뀐 발화 본문과 결과(`refine_applied`, `refined_at`)를 **한 트랜잭션**으로 저장한다.
     결과는 통째로 덮어쓴다 — 다시 돌리면 새 결과가 이전 것을 대체한다.
- LLM 호출은 요약·용어 초안과 같은 **공급자 추상화**(`createLlmClient()`)를 거친다. 로컬은 읽기·판정 모두 GBNF 문법으로 형식을 못박고,
  외부 공급자(Claude·GPT)는 문법이 없으므로 프롬프트 끝에 같은 형식의 지시문을 붙이고 형식에 맞지 않는 줄은 파서가 버린다 (용어 초안과 같은 규칙).
  판정 온도는 `REFINE_TEMPERATURE`(0.1, 로컬 전용).
- 임시 파일은 `userData/refine/<meetingId>/`에 두고 잡이 끝나면 실패해도 지운다 (요약과 같은 규칙).
- **교정 실패는 회의 상태와 본문을 건드리지 않는다.** `refine:progress`의 `'error'`로만 알리고 이전 결과는 그대로 둔다.

### 문장 교정 (외부 공급자, 2026-09-28)

역할 분담을 용어 교정과 반대로 둔다 — **LLM이 고친 줄을 내고, 코드가 거른다.** 순수 로직은 `src/shared/sentenceRefine.ts`(vitest), 호출은 `runSentenceRefine`.

1. 발화를 `SENTENCE_CHUNK_CHARS`(12,000자) 조각으로 자른다. 요약의 외부 예산(40만 자)을 쓰지 않는 이유는 출력이 고친 줄 전체를 다시 적어 길어지기 때문이다
   (71분 회의 = 3조각, Claude CLI 174초). 진행률은 조각 수로 잰다(`stage: 'sentence'`).
2. 프롬프트(`buildSentencePrompt`)는 용어 사전(`표기 = 읽기`, 있을 때만) + 조각 안에서 1부터 매긴 번호의 발화. 발화 id(uuid)는 모델에 보내지 않는다.
   시스템 프롬프트(`SENTENCE_SYSTEM_PROMPT`)의 규칙: 소리가 비슷한 말로만 바꾼다 / 더하거나 빼지 않는다 / 말투·군말·반복·끊긴 문장을 다듬지 않는다 /
   **사람 이름·숫자는 바꾸지 않는다** / 용어 사전은 잘못 적힌 말을 고칠 때만 사전 표기로 쓴다(맞게 말한 "시맨틱 버저닝"을 semver로 바꾸지 않는다) / 확신이 없으면 고치지 않는다.
   출력은 고친 줄만 `[번호] 고친 줄 전체`, 없으면 `없음`. 외부 공급자라 문법이 없으므로 형식 지시는 프롬프트에 있고, 형식에 맞지 않는 줄은 파서가 버린다.
   생성 상한은 `SENTENCE_MAX_TOKENS`(32K) — 적응형 사고·추론 토큰과 다시 적는 줄이 함께 들어간다.
3. **발음 가드**(`guardSentence`): 원문과 수정문을 어절 LCS로 맞춰 바뀐 덩어리를 찾고, 덩어리마다 자모 발음 유사도를 잰다.
   `SENTENCE_MIN_SIMILARITY`(0.5) 이상인 덩어리만 반영하고 나머지 자리에는 원문 어절을 남긴다. 어절을 넣기만 하거나 빼기만 한 덩어리는 유사도 0이라 반영되지 않는다.
   영문은 용어 사전 읽기 → `@meeting-stt/core/termReadings` → `acronymReading`(E2E → 이투이) 순으로 한글 읽기로 바꿔 비교하고, 원래 표기끼리도 비교한다(CIE → CI).
   여러 단어 용어(peer dependency)는 쪼개기 전에 통째로 읽는다. 읽기를 모르는 영어 단어("false negative")는 소리로 확인할 수 없어 떨어진다 — 의도한 동작이다.
4. 반영된 덩어리가 곧 `RefinePair`(`from`, `to`, `similarity`)다. 결과 저장은 용어 교정과 같다(`applyRefineResult`) — 결과 형식·화면을 새로 만들지 않는다.

### 결과 기록

- `MeetingDetail.refineResult`에 마지막 교정 결과가 실린다: `{ refinedAt, appliedPairs }`. 한 번도 교정하지 않았으면 `null`.
  `appliedPairs`는 실제로 본문을 바꾼 쌍(`RefinePair[]`)이고, 비어 있으면 "고칠 곳을 찾지 못했다"는 뜻이다.
- 같은 쌍(from → to)이 여러 발화에 반복되므로(기터브→GitHub 8곳) 화면은 **쌍 단위로 묶어**(`groupRefinePairs`) "무엇을 몇 곳 고쳤는지"만 보여 준다.
- **되돌리기는 발화 단위다** (2026-09-28, 문장 교정과 함께). 교정이 본문을 바꾼 발화는 `Utterance.originalText`(교정 전 원문)를 갖고,
  발화 행에 "교정됨" 표시가 붙는다. 표시를 누르면 원문이 펼쳐지고 "원문으로 되돌리기"로 본문을 원문으로 돌린다(`utterances:revertRefine`).
  되돌리면 그 발화의 쌍은 `refine_applied`에서도 빠진다 — 레일 목록이 본문과 어긋나지 않게 한다.
  쌍 단위 되돌리기는 두지 않는다. 한 발화에 여러 쌍이 겹치고, 사용자가 원문과 비교해 판단하는 단위는 발화다.
- `original_text`는 **처음 교정되기 전 원문**이다. 다시 교정해도, 교정 뒤 사용자가 인라인 편집해도 바뀌지 않는다. 되돌리기는 사용자 편집도 함께 버린다(원문을 펼쳐 보여 주므로 누르기 전에 알 수 있다).
- `done` 이벤트에 결과를 싣지 않는다. 결과는 상세의 일부라 `useMeeting`이 `done`에서 상세를 다시 읽는다 (파이프라인 `done`과 같은 규칙).
  교정이 본문을 바꾸므로 어차피 발화 전체를 main에서 다시 받아야 한다.

### IPC

| 키 | 채널 | 방향 | 용도 |
| --- | --- | --- | --- |
| `refine.run` | `refine:run` | invoke (응답 없음) | `{ meetingId }`. 교정 잡을 큐에 예약한다 (수동 재실행) |
| `events.refine` | `refine:progress` | push | `{ meetingId, stage: 'read' \| 'verify' \| 'sentence' \| 'done' \| 'error', percent, errorMessage? }` |
| `utterances.revertRefine` | `utterances:revertRefine` | invoke | `{ meetingId, utteranceId }` → `MutateMeetingResponse`(회의 상세 — 본문과 `refineResult`가 함께 바뀐다). 한 트랜잭션으로 `text = original_text`, `original_text = NULL`, 그 발화의 쌍을 `refine_applied`에서 뺀다 (2026-09-28) |

### 화면

- `features/refine/RefinePanel` — 상세 오른쪽 레일에서 요약 아래, 화자 목록 위. `TranscriptSection`이 `useMeeting`의 `refineResult`를 넘긴다
  (본문과 결과가 같은 상태여야 하므로 패널이 `useMeeting`을 따로 부르지 않는다). LLM 준비 여부(`useLlmStatus`)·전역 용어(`useGlossary`)·진행률(`useRefine`)은 패널이 스스로 구독한다.
- 본문 구성:
  - 진행 중: 단계 문구("용어 읽기를 정하는 중" / "후보를 판정하는 중" / "문장을 교정하는 중") + 진행률 막대.
  - 로컬 공급자일 때는 "로컬 모델은 용어 사전의 단어만 고칩니다. 문장까지 고치려면 설정에서 외부 공급자를 고르세요"를 한 줄로 보여 준다.
  - 결과가 있을 때: 고친 쌍 목록. 행마다 `«from» → to`와 걸린 발화 수. 쌍이 없으면 "고칠 곳을 찾지 못했습니다".
  - 결과가 없을 때(`null`): 아직 교정하지 않았다는 안내. **로컬 공급자이고** 전역 용어가 없으면 설정 링크와 함께 "용어를 저장하면 회의록이 만들어질 때 자동으로 교정합니다"를 보여 준다.
    LLM이 준비되지 않았으면 요약과 같은 문구(`llmMissingMessage`)와 설정 링크.
  - 아래에 "다시 교정" 버튼. LLM이 준비되지 않았거나, 로컬 공급자인데 전역 용어가 없거나, 진행 중이면 막는다.
- 발화 행(`TranscriptSection/ui/UtteranceRow`): `originalText`가 있으면 "교정됨" 표시 버튼(`aria-expanded`)을 두고, 펼치면 원문과 "원문으로 되돌리기" 버튼을 보여 준다.
  되돌리기는 바로 실행한다 — 되돌린 뒤에도 "다시 교정"으로 복구할 수 있어 2단계 확인 대상(회의 삭제·화자 병합)이 아니다.
