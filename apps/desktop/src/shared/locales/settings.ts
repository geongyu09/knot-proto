/** 설정 화면 문구 (SettingsSection·pages/Settings). ko가 타입을 정하고 en은 같은 키를 가져야 한다 (references/architecture.md "UI 언어") */
export const settingsKo = {
  title: '설정',
  toc: '설정 목차',
  loading: '설정을 불러오는 중입니다',
  loadError: '설정을 불러오지 못했습니다',
  saveError: '설정을 저장하지 못했습니다',
  groups: {
    microphone: '마이크',
    recording: '녹음·처리',
    shortcut: '단축키',
    sttModel: '음성 인식 모델',
    update: '업데이트',
    language: '언어'
  },
  inputDevice: {
    title: '입력 장치',
    description:
      '녹음에 쓸 마이크입니다. 고른 마이크가 연결돼 있지 않으면 시스템 기본 마이크로 녹음합니다.',
    missingWarning:
      '고른 마이크가 연결돼 있지 않습니다. 지금 녹음하면 시스템 기본 마이크를 씁니다.',
    systemDefault: '시스템 기본 마이크',
    previouslyChosen: '이전에 고른 마이크',
    disconnectedSuffix: '(연결되지 않음)'
  },
  microphoneTest: {
    title: '마이크 테스트',
    description: '녹음하지 않고 소리가 들어오는지 확인합니다. 위에서 고른 마이크로 듣습니다.',
    blockedWhileRecording: '녹음 중에는 테스트할 수 없습니다. 녹음을 정지한 뒤 확인해 주세요.',
    start: '테스트 시작',
    stop: '테스트 정지',
    status: {
      idle: '',
      listening: '소리가 잘 들어옵니다.',
      silent:
        '소리가 거의 잡히지 않습니다. 마이크가 음소거되었거나 다른 장치가 선택됐을 수 있습니다.'
    }
  },
  audioKeep: {
    title: '원본 녹음 파일 보관',
    description:
      '꺼 두면 회의록을 만든 뒤 원본 녹음을 지웁니다. 16kHz 녹음은 한 시간에 약 115MB를 차지하며, 보관하지 않은 회의는 나중에 다시 처리할 수 없습니다.'
  },
  quietProcessing: {
    title: '조용히 처리',
    description:
      '회의록을 만들 때 CPU를 절반만 써서 발열과 팬 소음을 줄입니다. 대신 처리 시간이 길어지고, 이미 처리 중인 회의에는 적용되지 않습니다.'
  },
  recordingShortcut: {
    title: '녹음 시작·정지',
    description:
      '다른 앱을 쓰는 중에도 이 키로 녹음을 시작하고 정지합니다. ⌘·⌥·⌃ 중 하나 이상과 문자·숫자·기능키를 함께 누르세요.'
  },
  shortcutField: {
    changeLabel: ({ title }: { title: string }) => `${title} 변경`,
    pressKeys: '키를 누르세요…',
    resetTo: ({ accelerator }: { accelerator: string }) => `기본값 ${accelerator}로`,
    suspendError: '단축키 입력 상태를 바꾸지 못했습니다'
  },
  teamBuild: {
    notice:
      '팀 테스트 빌드입니다. 자동 업데이트를 쓰지 않으며 새 버전은 팀 배포 채널로 받습니다. 사용 기록·오류와 회의 내용(발화·요약·화자 이름·녹음)이 수집 서버로 전송됩니다.'
  },
  updateCheck: {
    title: '시작할 때 업데이트 확인',
    description: '기본은 꺼짐이며, 켜도 다음 실행부터 확인합니다. 회의 내용은 보내지 않습니다.'
  },
  locale: {
    title: 'UI 언어',
    description: '화면·메뉴바 문구의 언어입니다. 음성 인식과 요약은 계속 한국어로 동작합니다.'
  }
}

export const settingsEn: typeof settingsKo = {
  title: 'Settings',
  toc: 'Settings contents',
  loading: 'Loading settings',
  loadError: 'Could not load settings',
  saveError: 'Could not save settings',
  groups: {
    microphone: 'Microphone',
    recording: 'Recording & processing',
    shortcut: 'Shortcuts',
    sttModel: 'Speech recognition model',
    update: 'Updates',
    language: 'Language'
  },
  inputDevice: {
    title: 'Input device',
    description:
      'The microphone used for recording. If the chosen microphone is not connected, the system default is used.',
    missingWarning:
      'The chosen microphone is not connected. Recording now will use the system default microphone.',
    systemDefault: 'System default microphone',
    previouslyChosen: 'Previously chosen microphone',
    disconnectedSuffix: '(not connected)'
  },
  microphoneTest: {
    title: 'Microphone test',
    description:
      'Check that sound is coming in without recording. Listens through the microphone chosen above.',
    blockedWhileRecording: 'Testing is unavailable while recording. Stop the recording first.',
    start: 'Start test',
    stop: 'Stop test',
    status: {
      idle: '',
      listening: 'Sound is coming in clearly.',
      silent:
        'Almost no sound is detected. The microphone may be muted or a different device may be selected.'
    }
  },
  audioKeep: {
    title: 'Keep original recordings',
    description:
      'When off, the original recording is deleted after the transcript is made. A 16kHz recording takes about 115MB per hour, and meetings without a kept recording cannot be reprocessed later.'
  },
  quietProcessing: {
    title: 'Quiet processing',
    description:
      'Uses only half the CPU while making transcripts to reduce heat and fan noise. Processing takes longer, and meetings already in progress are not affected.'
  },
  recordingShortcut: {
    title: 'Start/stop recording',
    description:
      'Start and stop recording with this key even while using other apps. Press at least one of ⌘, ⌥ or ⌃ together with a letter, number or function key.'
  },
  shortcutField: {
    changeLabel: ({ title }: { title: string }) => `Change ${title}`,
    pressKeys: 'Press keys…',
    resetTo: ({ accelerator }: { accelerator: string }) => `Reset to ${accelerator}`,
    suspendError: 'Could not change shortcut capture state'
  },
  teamBuild: {
    notice:
      'This is a team test build. It does not auto-update; new versions come through the team distribution channel. Usage, errors, and meeting content (utterances, summaries, speaker names, recordings) are sent to the collection server.'
  },
  updateCheck: {
    title: 'Check for updates at launch',
    description:
      'Off by default. When on, checks start from the next launch. Meeting content is never sent.'
  },
  locale: {
    title: 'UI language',
    description:
      'The language of on-screen and menu bar text. Speech recognition and summaries keep working in Korean.'
  }
}
