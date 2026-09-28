/**
 * LLM 공급자 문구 — 설정의 "요약 · 용어 초안" 카테고리, 준비 안내, API 키 검증 오류.
 * ko가 타입을 정하고 en은 같은 키를 가져야 한다 (references/architecture.md "UI 언어").
 * 공급자·모델 id 유니온은 `src/shared/types.ts`에 있고 여기서는 라벨만 둔다.
 */
export const llmKo = {
  /** 설정·요약 캡션에 쓰는 공급자 이름 */
  providerLabels: {
    local: '로컬 모델',
    'claude-api': 'Claude API',
    'claude-cli': 'Claude Code',
    'openai-api': 'OpenAI API'
  },
  /** 키 입력란 라벨과 준비 안내에 쓰는 이름. 회사 이름이 아니라 사용자가 아는 제품 이름으로 적는다 */
  apiKeyLabels: {
    anthropic: 'Claude API 키',
    openai: 'OpenAI API 키'
  },
  /** 어디서 돌고, 회의록이 어디로 가며, 무엇이 필요한지. 전송 사실은 빼지 않는다 (SKILL.md 1절) */
  providers: {
    local: {
      title: '로컬 모델 (기본)',
      description:
        '이 기기에서 llama.cpp로 실행합니다. 회의 내용이 기기 밖으로 나가지 않습니다. 아래 로컬 요약 모델 파일(약 2.5GB)을 받아야 합니다.'
    },
    'claude-api': {
      title: 'Claude API 키',
      description:
        'Anthropic 콘솔에서 발급한 API 키로 Claude를 호출합니다. 녹음이 끝날 때마다 회의록이 결정 추출을 위해 자동으로 Anthropic 서버로 전송되고 토큰 요금이 부과됩니다.'
    },
    'claude-cli': {
      title: 'Claude Code (구독)',
      description:
        '이 컴퓨터에 설치된 Claude Code(claude 명령)를 실행해 로그인한 구독 계정으로 호출합니다. 녹음이 끝날 때마다 회의록이 결정 추출을 위해 자동으로 Anthropic 서버로 전송되며 구독 사용량에 포함됩니다.'
    },
    'openai-api': {
      title: 'OpenAI API 키 (GPT)',
      description:
        'OpenAI 플랫폼에서 발급한 API 키로 GPT를 호출합니다. 녹음이 끝날 때마다 회의록이 결정 추출을 위해 자동으로 OpenAI 서버로 전송되고 토큰 요금이 부과됩니다. 모델은 아래에서 고릅니다.'
    }
  },
  apiKeyField: {
    anthropic: {
      hint: 'Anthropic 콘솔(console.anthropic.com)에서 발급한 키를 붙여 넣으세요. 키는 이 기기에 암호화해 저장합니다.',
      placeholder: 'sk-ant-…'
    },
    openai: {
      hint: 'OpenAI 플랫폼(platform.openai.com)에서 발급한 키를 붙여 넣으세요. 키는 이 기기에 암호화해 저장합니다.',
      placeholder: 'sk-proj-…'
    },
    savedHint: ({ tail }: { tail: string }) =>
      `저장된 키가 있습니다 (…${tail}). 새 키를 저장하면 바꿉니다.`,
    save: '저장',
    clear: '키 삭제'
  },
  /** GPT-6 계열 셋. 요금 차이가 커서 사용자가 고른다 (references/architecture.md "LLM 공급자") */
  openaiModels: {
    'gpt-6-astra': { title: 'GPT-6 Astra', description: '가장 뛰어난 모델. 요금이 가장 높습니다' },
    'gpt-6-sol': { title: 'GPT-6 Sol', description: '성능과 요금의 균형. 요약에 충분합니다' },
    'gpt-6-luna': { title: 'GPT-6 Luna', description: '가장 저렴하고 빠른 모델' }
  },
  openaiModelSelect: {
    label: 'GPT 모델',
    fallbackDescription: '요약과 용어 초안에 쓸 모델입니다',
    appliesNext: '다음 요약부터 적용됩니다.'
  },
  section: {
    title: '요약 · 용어 초안',
    intro:
      '회의 요약과 용어 초안을 어떤 방식으로 만들지 고릅니다. 회의록 작성(음성 인식·화자 분리)은 어느 쪽을 골라도 이 기기에서만 처리합니다. 진행 중인 요약에는 적용되지 않고 다음 요약부터 바뀝니다.',
    loading: 'LLM 설정을 불러오는 중입니다',
    loadError: 'LLM 설정을 불러오지 못했습니다',
    providerLabel: '실행 방식',
    cliFoundPrefix: '찾은 명령: ',
    /** `<code>경로</code>` 뒤에 붙는다 */
    cliFoundSuffix: ({ version }: { version: string | null }) =>
      `${version ? ` (${version})` : ''}. 터미널에서 로그인한 계정을 그대로 씁니다.`,
    cliMissing:
      'claude 명령을 찾을 수 없습니다. Claude Code를 설치하고 터미널에서 한 번 로그인한 뒤 앱을 다시 켜 주세요.',
    checking: '확인하는 중…',
    checkConnection: '연결 확인',
    checkHint: '짧은 요청 한 번을 보냅니다'
  },
  actions: {
    providerError: 'LLM 공급자를 저장하지 못했습니다',
    keyError: 'API 키를 저장하지 못했습니다',
    modelError: 'GPT 모델을 저장하지 못했습니다',
    checkError: '연결을 확인하지 못했습니다',
    keySaved: 'API 키를 저장했습니다',
    keyCleared: '저장된 API 키를 지웠습니다'
  },
  /** 준비되지 않았을 때의 안내. main(잡 시작 전 확인)과 renderer(버튼 막기)가 같은 문구를 쓴다 */
  missing: {
    cli: 'Claude Code(claude 명령)를 찾을 수 없습니다',
    apiKey: ({ label }: { label: string }) => `${label}가 저장되어 있지 않습니다`,
    localModel: '로컬 요약 모델 파일이 설치되어 있지 않습니다'
  },
  errors: {
    cliOutputUnreadable: 'Claude Code 결과를 읽지 못했습니다 (출력 형식이 예상과 다릅니다)',
    cliFailed: ({ reason }: { reason: string }) =>
      `Claude Code가 요청을 처리하지 못했습니다: ${reason}`,
    unknownReason: '원인 불명',
    invalidVendor: '잘못된 요청입니다 (API 키 회사 없음)',
    missingApiKey: '잘못된 요청입니다 (API 키 없음)',
    invalidApiKeyType: '잘못된 요청입니다 (API 키 형식 오류)',
    emptyApiKey: 'API 키를 입력해 주세요',
    malformedApiKey: 'API 키 형식이 아닙니다. 콘솔에서 복사한 키를 그대로 붙여 넣어 주세요'
  }
}

export const llmEn: typeof llmKo = {
  providerLabels: {
    local: 'Local model',
    'claude-api': 'Claude API',
    'claude-cli': 'Claude Code',
    'openai-api': 'OpenAI API'
  },
  apiKeyLabels: {
    anthropic: 'Claude API key',
    openai: 'OpenAI API key'
  },
  providers: {
    local: {
      title: 'Local model (default)',
      description:
        'Runs on this device with llama.cpp. Meeting content never leaves the device. Requires the local summary model file (about 2.5GB) below.'
    },
    'claude-api': {
      title: 'Claude API key',
      description:
        'Calls Claude with an API key issued from the Anthropic console. Every time a recording ends, the transcript is sent automatically to Anthropic servers for decision extraction, and token fees apply.'
    },
    'claude-cli': {
      title: 'Claude Code (subscription)',
      description:
        'Runs the Claude Code installed on this computer (the claude command) with your logged-in subscription account. Every time a recording ends, the transcript is sent automatically to Anthropic servers for decision extraction, and it counts toward your subscription usage.'
    },
    'openai-api': {
      title: 'OpenAI API key (GPT)',
      description:
        'Calls GPT with an API key issued from the OpenAI platform. Every time a recording ends, the transcript is sent automatically to OpenAI servers for decision extraction, and token fees apply. Choose the model below.'
    }
  },
  apiKeyField: {
    anthropic: {
      hint: 'Paste a key issued from the Anthropic console (console.anthropic.com). The key is stored encrypted on this device.',
      placeholder: 'sk-ant-…'
    },
    openai: {
      hint: 'Paste a key issued from the OpenAI platform (platform.openai.com). The key is stored encrypted on this device.',
      placeholder: 'sk-proj-…'
    },
    savedHint: ({ tail }: { tail: string }) =>
      `A key is saved (…${tail}). Saving a new key replaces it.`,
    save: 'Save',
    clear: 'Delete key'
  },
  openaiModels: {
    'gpt-6-astra': { title: 'GPT-6 Astra', description: 'The most capable model. Highest cost' },
    'gpt-6-sol': {
      title: 'GPT-6 Sol',
      description: 'Balanced quality and cost. Enough for summaries'
    },
    'gpt-6-luna': { title: 'GPT-6 Luna', description: 'The cheapest and fastest model' }
  },
  openaiModelSelect: {
    label: 'GPT model',
    fallbackDescription: 'The model used for summaries and glossary drafts',
    appliesNext: 'Applies from the next summary.'
  },
  section: {
    title: 'Summary & glossary drafts',
    intro:
      'Choose how meeting summaries and glossary drafts are generated. Transcription (speech recognition and speaker separation) always runs on this device regardless of the choice. Summaries in progress are not affected; the change applies from the next one.',
    loading: 'Loading LLM settings',
    loadError: 'Could not load LLM settings',
    providerLabel: 'Provider',
    cliFoundPrefix: 'Found command: ',
    cliFoundSuffix: ({ version }: { version: string | null }) =>
      `${version ? ` (${version})` : ''}. Uses the account you logged in with in the terminal.`,
    cliMissing:
      'The claude command was not found. Install Claude Code, log in once in the terminal, then relaunch the app.',
    checking: 'Checking…',
    checkConnection: 'Check connection',
    checkHint: 'Sends one short request'
  },
  actions: {
    providerError: 'Could not save the LLM provider',
    keyError: 'Could not save the API key',
    modelError: 'Could not save the GPT model',
    checkError: 'Could not check the connection',
    keySaved: 'API key saved',
    keyCleared: 'Saved API key deleted'
  },
  missing: {
    cli: 'Claude Code (the claude command) was not found',
    apiKey: ({ label }: { label: string }) => `No ${label} is saved`,
    localModel: 'The local summary model file is not installed'
  },
  errors: {
    cliOutputUnreadable: 'Could not read the Claude Code result (unexpected output format)',
    cliFailed: ({ reason }: { reason: string }) =>
      `Claude Code could not handle the request: ${reason}`,
    unknownReason: 'unknown reason',
    invalidVendor: 'Invalid request (missing API key vendor)',
    missingApiKey: 'Invalid request (missing API key)',
    invalidApiKeyType: 'Invalid request (API key has the wrong type)',
    emptyApiKey: 'Enter an API key',
    malformedApiKey:
      'This does not look like an API key. Paste the key copied from the console as is'
  }
}
