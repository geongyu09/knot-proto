/** 회의 상세(회의록·화자·하단 녹음 바) 문구. ko가 타입을 정하고 en은 같은 키를 가져야 한다 (references/architecture.md "UI 언어") */
export const transcriptKo = {
  // 이름을 지정하지 않은 화자의 기본 표시. 복사 텍스트에도 그대로 들어간다 (@meeting-stt/core/format)
  defaultSpeakerNames: {
    numbered: ({ index }: { index: number }) => `화자 ${index}`,
    unknown: '화자 미상'
  },
  sectionLabel: '회의록',
  loading: '회의를 불러오는 중입니다',
  notFound: '회의를 찾을 수 없습니다',
  status: {
    recording: '녹음이 진행 중입니다',
    processing: '회의록을 만들고 있습니다. 시간이 걸릴 수 있으니 잠시만 기다려 주세요',
    defaultError: '회의록을 만들지 못했습니다',
    retry: '다시 시도',
    noUtterances: '인식된 발화가 없습니다'
  },
  header: {
    titleLabel: '회의 제목',
    speakerCount: ({ count }: { count: number }) => `화자 ${count}명`
  },
  actions: {
    copied: '복사했습니다',
    copyAll: '전체 복사',
    copyMarkdown: '마크다운으로 복사',
    more: '회의 더보기',
    deleteMeeting: '회의 삭제',
    deleteConfirm: '이 회의와 회의록, 원본 녹음이 모두 사라집니다. 되돌릴 수 없습니다.',
    cancel: '취소',
    confirmDelete: '삭제'
  },
  recordingBar: {
    sectionLabel: '원본 녹음',
    notKeptBefore: '원본 녹음을 보관하지 않아 재생·다시 인식을 할 수 없습니다.',
    notKeptLink: '설정에서 원본 녹음 보관',
    notKeptAfter: '을 켜면 이후 회의부터 남습니다',
    loadFailed: '녹음 파일을 불러오지 못했습니다. 원본이 지워졌을 수 있습니다',
    play: '재생',
    pause: '일시정지',
    seekLabel: '재생 위치',
    reprocessConfirm:
      '회의록을 처음부터 다시 만듭니다. 화자 이름, 직접 고친 내용, 교정 결과가 사라지고 요약은 남습니다',
    speakerCountHint: '참석자 수 (비우면 자동)',
    speakerCountInvalid: ({ min, max }: { min: number; max: number }) =>
      `${min}~${max} 사이의 정수만 쓸 수 있습니다`,
    speakerCountLabel: '참석자 수',
    speakerCountPlaceholder: '모름',
    cancel: '취소',
    reprocess: '다시 인식',
    exported: '저장했습니다',
    exportWav: 'WAV로 저장'
  },
  speakerPanel: {
    sectionLabel: '화자',
    title: '화자',
    mergeTargetsLabel: ({ name }: { name: string }) => `${name}을(를) 누구에게 합칠까요?`,
    mergeInto: ({ name }: { name: string }) => `${name}에 합치기`,
    finishMerging: '합치기 끝내기',
    startMerging: '화자 합치기',
    nameLabel: ({ name }: { name: string }) => `${name} 이름`,
    cancel: '취소',
    merge: '합치기',
    utteranceCount: ({ count }: { count: number }) => `발화 ${count}`,
    hint: '이름을 누르면 바로 바꿀 수 있습니다. Enter로 저장, Esc로 취소.'
  },
  utterance: {
    seekFrom: ({ timestamp }: { timestamp: string }) => `${timestamp}부터 재생`,
    changeSpeaker: '화자 변경',
    textLabel: '발화 내용',
    copied: '복사했습니다',
    copyThis: '이 발화 복사',
    refined: '교정됨',
    showOriginal: '교정 전 원문 보기',
    hideOriginal: '교정 전 원문 숨기기',
    originalLabel: '교정 전',
    revert: '원문으로 되돌리기',
    revertHint: '이 발화에서 직접 고친 내용도 함께 원문으로 돌아갑니다'
  },
  railResizer: {
    label: '오른쪽 패널 폭 조절',
    title: '끌어서 폭 조절 · 더블클릭하면 원래 폭으로'
  },
  errors: {
    load: '회의를 불러오지 못했습니다',
    save: '변경 사항을 저장하지 못했습니다',
    remove: '회의를 지우지 못했습니다',
    exportAudio: '녹음 파일을 저장하지 못했습니다'
  }
}

export const transcriptEn: typeof transcriptKo = {
  sectionLabel: 'Transcript',
  loading: 'Loading the meeting',
  notFound: 'Meeting not found',
  defaultSpeakerNames: {
    numbered: ({ index }) => `Speaker ${index}`,
    unknown: 'Unknown speaker'
  },
  status: {
    recording: 'Recording in progress',
    processing: 'Creating the transcript. This may take a while, please wait',
    defaultError: 'Could not create the transcript',
    retry: 'Retry',
    noUtterances: 'No speech was recognized'
  },
  header: {
    titleLabel: 'Meeting title',
    speakerCount: ({ count }) => `${count} ${count === 1 ? 'speaker' : 'speakers'}`
  },
  actions: {
    copied: 'Copied',
    copyAll: 'Copy all',
    copyMarkdown: 'Copy as Markdown',
    more: 'More meeting actions',
    deleteMeeting: 'Delete meeting',
    deleteConfirm:
      'This meeting, its transcript, and the original recording will be deleted. This cannot be undone.',
    cancel: 'Cancel',
    confirmDelete: 'Delete'
  },
  recordingBar: {
    sectionLabel: 'Original recording',
    notKeptBefore:
      'The original recording was not kept, so playback and re-transcription are unavailable.',
    notKeptLink: 'Turn on keeping recordings in Settings',
    notKeptAfter: ' to keep them for future meetings',
    loadFailed: 'Could not load the recording. The original may have been deleted',
    play: 'Play',
    pause: 'Pause',
    seekLabel: 'Playback position',
    reprocessConfirm:
      'The transcript will be rebuilt from scratch. Speaker names, manual edits, and corrections will be lost; the summary is kept',
    speakerCountHint: 'Number of participants (leave blank for automatic)',
    speakerCountInvalid: ({ min, max }) => `Enter an integer between ${min} and ${max}`,
    speakerCountLabel: 'Number of participants',
    speakerCountPlaceholder: 'Unknown',
    cancel: 'Cancel',
    reprocess: 'Re-transcribe',
    exported: 'Saved',
    exportWav: 'Save as WAV'
  },
  speakerPanel: {
    sectionLabel: 'Speakers',
    title: 'Speakers',
    mergeTargetsLabel: ({ name }) => `Merge ${name} into whom?`,
    mergeInto: ({ name }) => `Merge into ${name}`,
    finishMerging: 'Done merging',
    startMerging: 'Merge speakers',
    nameLabel: ({ name }) => `${name} name`,
    cancel: 'Cancel',
    merge: 'Merge',
    utteranceCount: ({ count }) => `${count} ${count === 1 ? 'utterance' : 'utterances'}`,
    hint: 'Click a name to rename it. Enter saves, Esc cancels.'
  },
  utterance: {
    seekFrom: ({ timestamp }) => `Play from ${timestamp}`,
    changeSpeaker: 'Change speaker',
    textLabel: 'Utterance text',
    copied: 'Copied',
    copyThis: 'Copy this utterance',
    refined: 'Corrected',
    showOriginal: 'Show text before correction',
    hideOriginal: 'Hide text before correction',
    originalLabel: 'Before correction',
    revert: 'Revert to original',
    revertHint: 'Your own edits to this utterance are reverted as well'
  },
  railResizer: {
    label: 'Resize right panel',
    title: 'Drag to resize · double-click to reset'
  },
  errors: {
    load: 'Could not load the meeting',
    save: 'Could not save changes',
    remove: 'Could not delete the meeting',
    exportAudio: 'Could not save the recording'
  }
}
