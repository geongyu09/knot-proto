/** 녹음 화면·녹음 훅 문구. ko가 타입을 정하고 en은 같은 키를 가져야 한다 (references/architecture.md "UI 언어") */
export const recordingKo = {
  status: {
    recording: '녹음 중',
    paused: '일시정지됨',
    idle: '대기 중'
  },
  pause: {
    pause: '녹음 일시정지',
    resume: '녹음 재개',
    error: '일시정지·재개하지 못했습니다. 잠시 후 다시 시도해 주세요'
  },
  speakerCount: {
    label: '참석자 수',
    unknown: '모름',
    hint: '알면 적어 주세요. 비우면 자동으로 나눕니다',
    invalid: ({ min, max }: { min: number; max: number }) =>
      `${min}~${max} 사이의 정수만 쓸 수 있습니다`
  },
  panel: {
    label: '녹음 옵션',
    optionsTitle: '녹음 설정',
    importTitle: '파일로 만들기'
  },
  recorder: {
    sectionLabel: '녹음',
    start: '녹음 시작',
    stopAndTranscribe: '녹음 정지하고 회의록 만들기',
    controlError: '녹음 요청을 보내지 못했습니다. 잠시 후 다시 시도해 주세요',
    keepsRunning: '창을 닫거나 다른 화면으로 옮겨도 녹음은 계속됩니다.',
    shortcutHintPrefix: '메뉴바 아이콘이나 ',
    shortcutHintSuffix: '로도 시작·정지할 수 있습니다.',
    shortcutHintPlain: '메뉴바 아이콘과 전역 단축키로도 시작·정지할 수 있습니다.'
  },
  live: {
    viewLabel: '녹음 화면 보기',
    waveform: '파형',
    transcript: '라이브 받아쓰기',
    regionLabel: '라이브 받아쓰기',
    idle: '녹음을 시작하면 들리는 말이 여기에 바로 글자로 나타납니다',
    listening: '듣고 있습니다…',
    hint: '미리보기입니다. 회의록은 녹음을 마친 뒤 더 정확하게 다시 만듭니다',
    resourceNotice:
      '말하는 동안 GPU를 계속 써서 발열과 배터리 소모가 늘 수 있습니다. 필요 없을 때는 파형으로 바꿔 두세요',
    toggleError: '보기를 바꾸지 못했습니다. 잠시 후 다시 시도해 주세요'
  },
  systemAudio: {
    label: '온라인 회의 소리 함께 녹음',
    hint: 'Zoom·Meet 상대방 목소리도 회의록에 넣습니다. 이어폰을 쓰면 더 정확합니다. 시작 전에 켜 두세요',
    badge: '상대방 소리 포함',
    toggleError: '설정을 바꾸지 못했습니다. 잠시 후 다시 시도해 주세요'
  },
  importer: {
    label: '녹음 파일 가져오기',
    action: '가져오기',
    importing: '가져오는 중…',
    hint: '음성 메모·회의 녹화 파일도 됩니다. 참석자 수를 함께 씁니다',
    failed: '녹음 파일을 가져오지 못했습니다'
  },
  errors: {
    permissionDenied: '마이크 사용 권한이 없습니다. 시스템 설정에서 마이크 접근을 허용해 주세요',
    modelNotReady:
      '녹음하려면 음성 인식 모델이 필요합니다. 설정의 음성 인식 모델에서 내려받아 주세요',
    unknown: '녹음 중 알 수 없는 오류가 발생했습니다',
    stateUnavailable: '녹음 상태를 불러오지 못했습니다',
    devicesUnavailable: '마이크 목록을 불러오지 못했습니다',
    microphoneOpenFailed: '마이크를 열지 못했습니다',
    sampleRateUnsupported: ({ expected, actual }: { expected: number; actual: number }) =>
      `이 마이크는 ${expected}Hz 녹음을 지원하지 않습니다 (현재 ${actual}Hz)`
  },
  devices: {
    unnamed: ({ index }: { index: number }) => `마이크 ${index}`
  }
}

export const recordingEn: typeof recordingKo = {
  status: {
    recording: 'Recording',
    paused: 'Paused',
    idle: 'Idle'
  },
  pause: {
    pause: 'Pause recording',
    resume: 'Resume recording',
    error: 'Could not pause or resume. Please try again shortly'
  },
  speakerCount: {
    label: 'Participants',
    unknown: 'Unknown',
    hint: 'Enter it if you know. Leave blank to detect automatically',
    invalid: ({ min, max }) => `Enter a whole number between ${min} and ${max}`
  },
  panel: {
    label: 'Recording options',
    optionsTitle: 'Recording settings',
    importTitle: 'From a file'
  },
  recorder: {
    sectionLabel: 'Recording',
    start: 'Start recording',
    stopAndTranscribe: 'Stop and create transcript',
    controlError: 'Could not send the recording command. Please try again shortly',
    keepsRunning: 'Recording continues even if you close this window or switch screens.',
    shortcutHintPrefix: 'You can also start and stop from the menu bar icon or with ',
    shortcutHintSuffix: '.',
    shortcutHintPlain:
      'You can also start and stop from the menu bar icon or with the global shortcut.'
  },
  live: {
    viewLabel: 'Recording view',
    waveform: 'Waveform',
    transcript: 'Live transcript',
    regionLabel: 'Live transcript',
    idle: 'Start recording and what is said will appear here as text right away',
    listening: 'Listening…',
    hint: 'This is a preview. The transcript is recreated more accurately after you stop',
    resourceNotice:
      'It keeps the GPU busy while people talk, which can add heat and drain the battery. Switch to the waveform when you do not need it',
    toggleError: 'Could not switch the view. Please try again shortly'
  },
  systemAudio: {
    label: 'Also record online meeting audio',
    hint: 'Captures what others say in Zoom, Meet and similar apps. Headphones give better results. Turn it on before you start',
    badge: 'Includes speaker audio',
    toggleError: 'Could not change this setting. Please try again shortly'
  },
  importer: {
    label: 'Import a recording',
    action: 'Import',
    importing: 'Importing…',
    hint: 'Voice memos and recordings work too. Uses the participant count',
    failed: 'Could not import the recording'
  },
  errors: {
    permissionDenied: 'Microphone access is not allowed. Allow it in System Settings',
    modelNotReady:
      'Recording needs the speech recognition model. Download it under Speech recognition model in Settings',
    unknown: 'An unknown error occurred while recording',
    stateUnavailable: 'Could not load the recording state',
    devicesUnavailable: 'Could not load the microphone list',
    microphoneOpenFailed: 'Could not open the microphone',
    sampleRateUnsupported: ({ expected, actual }) =>
      `This microphone does not support ${expected}Hz recording (currently ${actual}Hz)`
  },
  devices: {
    unnamed: ({ index }) => `Microphone ${index}`
  }
}
