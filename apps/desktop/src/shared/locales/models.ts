/**
 * 모델 다운로드·온보딩 문구 (ModelDownloadSection·SummaryModelSection·pages/Onboarding).
 * ko가 타입을 정하고 en은 같은 키를 가져야 한다 (references/architecture.md "UI 언어").
 * 모델 자체의 이름·설명(`whisperOptions[].label`, `items[].label`)은 main의 카탈로그가 준다.
 */
export const modelsKo = {
  status: {
    loading: '모델 상태를 확인하는 중입니다',
    loadError: '모델 상태를 확인하지 못했습니다',
    downloadError: '모델을 내려받지 못했습니다',
    retry: '다시 시도'
  },
  download: {
    legend: '음성 인식 모델 선택',
    sectionLabel: '음성 인식 모델',
    downloading: '받는 중…',
    downloadWithSize: ({ size }: { size: string }) => `다운로드 (${size})`,
    useThisModel: '이 모델 사용',
    ready: '모델이 준비되었습니다',
    keepWindowOpen: '받는 중에 창을 닫지 마세요',
    alreadyApplied: '현재 사용 중인 모델입니다',
    offlineNote:
      '네트워크는 모델을 내려받는 지금 한 번만 씁니다. 회의 녹음·회의록 작성·요약은 모두 이 컴퓨터 안에서 이루어집니다.',
    lowSpecWarning:
      '이 컴퓨터 사양에서는 처리 시간이 오래 걸릴 수 있습니다. 권장 모델은 저사양용입니다.',
    recommended: '이 컴퓨터에 권장',
    installed: '설치됨',
    notInstalled: '설치되지 않음',
    close: '닫기',
    changeModel: '모델 바꾸기',
    itemsHeading: '함께 받는 모델',
    itemDone: '완료',
    itemWaiting: '대기',
    itemProgressLabel: ({ label }: { label: string }) => `${label} 다운로드 진행률`,
    whisperItemLabel: ({ label }: { label: string }) => `음성 인식 모델 (${label})`
  },
  summaryModel: {
    title: '로컬 요약 모델 파일',
    optional: '로컬 방식에만 필요',
    installed: '설치됨',
    notInstalledWithSize: ({ size }: { size: string }) => `설치되지 않음 · ${size}`,
    description:
      '. 이 기기에서 요약·용어 초안을 만들 때 쓰는 모델 파일입니다. Claude를 쓰면 필요 없고, 없어도 녹음과 회의록 작성은 그대로 됩니다.',
    installedStatus: '설치되어 있습니다',
    download: '모델 파일 받기',
    progressLabel: '요약 모델 다운로드 진행률'
  },
  onboarding: {
    eyebrow: '처음 설정',
    title: '인터넷 사용, 비용, 시간 제한 없는 회의록',
    descriptionLine1: '로컬 모델을 사용해 음성 인식·화자 분리를 제한 없이 사용해 보세요.',
    descriptionLine2:
      '처음 한 번 설치하면 인터넷 연결 없이 동작하고, 녹음은 어디로도 보내지 않습니다.',
    features: [
      '서버 없음, 계정 없음',
      '화자별로 나눠진 회의록과 로컬 요약',
      '회의 중엔 메뉴바와 단축키로 녹음'
    ]
  }
}

export const modelsEn: typeof modelsKo = {
  status: {
    loading: 'Checking model status',
    loadError: 'Could not check model status',
    downloadError: 'Could not download the model',
    retry: 'Try again'
  },
  download: {
    legend: 'Choose a speech recognition model',
    sectionLabel: 'Speech recognition model',
    downloading: 'Downloading…',
    downloadWithSize: ({ size }: { size: string }) => `Download (${size})`,
    useThisModel: 'Use this model',
    ready: 'The model is ready',
    keepWindowOpen: 'Keep this window open while downloading',
    alreadyApplied: 'This model is currently in use',
    offlineNote:
      'The network is used only now, to download the model. Recording, transcription and summaries all happen on this computer.',
    lowSpecWarning:
      'Processing may take a long time on this computer. The recommended model is for low-spec machines.',
    recommended: 'Recommended for this computer',
    installed: 'Installed',
    notInstalled: 'Not installed',
    close: 'Close',
    changeModel: 'Change model',
    itemsHeading: 'Models downloaded together',
    itemDone: 'Done',
    itemWaiting: 'Waiting',
    itemProgressLabel: ({ label }: { label: string }) => `${label} download progress`,
    whisperItemLabel: ({ label }: { label: string }) => `Speech recognition model (${label})`
  },
  summaryModel: {
    title: 'Local summary model file',
    optional: 'Only for the local provider',
    installed: 'Installed',
    notInstalledWithSize: ({ size }: { size: string }) => `Not installed · ${size}`,
    description:
      '. The model file used to make summaries and glossary drafts on this device. Not needed with Claude, and recording and transcription work without it.',
    installedStatus: 'Installed',
    download: 'Download model file',
    progressLabel: 'Summary model download progress'
  },
  onboarding: {
    eyebrow: 'First-time setup',
    title: 'Meeting transcripts with no internet, no cost and no time limit',
    descriptionLine1: 'Use local models for unlimited speech recognition and speaker separation.',
    descriptionLine2:
      'After a one-time install it works without an internet connection, and recordings are never sent anywhere.',
    features: [
      'No server, no account',
      'Speaker-separated transcripts and local summaries',
      'Record during meetings from the menu bar or with shortcuts'
    ]
  }
}
