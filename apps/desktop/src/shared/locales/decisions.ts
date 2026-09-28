import type { DecisionStage } from '../types'

/**
 * 결정 문서 문구 (references/decisions.md). ko가 타입을 정하고 en은 같은 키를 가져야 한다.
 * 결정 타입의 기본 이름은 사용자 데이터라 여기 두지 않는다 (`src/shared/decisions.ts`).
 */
export const decisionsKo = {
  stages: {
    queued: '결정 추출을 기다리는 중입니다',
    extract: '회의록에서 결정을 찾는 중입니다',
    reduce: '겹치는 결정을 합치는 중입니다',
    done: '결정 추출을 마쳤습니다',
    error: '결정 추출에 실패했습니다'
  } satisfies Record<DecisionStage, string>,
  errors: {
    missingTypes: '잘못된 요청입니다 (결정 타입 목록 없음)',
    invalidType: '잘못된 요청입니다 (결정 타입 형식 오류)',
    tooManyTypes: ({ max }: { max: number }) => `결정 타입은 ${max}개까지 만들 수 있습니다`,
    nameEmpty: '결정 타입 이름을 비워 둘 수 없습니다',
    nameTooLong: ({ max }: { max: number }) => `결정 타입 이름은 ${max}자까지 적을 수 있습니다`,
    descriptionTooLong: ({ max }: { max: number }) =>
      `결정 타입 설명은 ${max}자까지 적을 수 있습니다`,
    duplicateName: ({ name }: { name: string }) => `같은 이름의 결정 타입이 있습니다: ${name}`
  },
  /** 마크다운 복사의 절 제목 (`src/shared/decisionFormat.ts`) */
  copy: {
    decision: '결정',
    background: '배경',
    alternatives: '검토한 대안',
    actionItems: '후속 조치',
    evidence: '근거',
    proposers: '제안',
    unclassified: '미분류'
  },
  /** main의 추출 잡이 던지는 오류. 결정 탭 "처리 중/실패" 항목에 그대로 보인다 */
  extraction: {
    nothingToExtract: '결정을 찾을 발화가 없습니다',
    unreadableOutput: '모델 응답을 결정 목록으로 읽지 못했습니다. 다시 시도해 주세요',
    interruptedByQuit: '앱이 종료되어 결정 추출이 중단되었습니다',
    meetingNotReady: '회의록이 아직 만들어지지 않았습니다'
  },
  /** 사이드 패널 탭과 결정 탭 (references/decisions.md "사이드 패널") */
  sidebar: {
    tabs: '목록 종류',
    decisionsTab: '결정 문서',
    meetingsTab: '회의록',
    navLabel: '결정 문서 목록',
    searchPlaceholder: '결정 문서 검색',
    noResults: ({ query }: { query: string }) => `“${query}”이(가) 들어간 결정 문서가 없습니다`,
    processingGroup: '처리 중',
    unclassified: '미분류',
    empty: '아직 결정 문서가 없어요. 회의를 녹음하면 결정마다 문서가 생깁니다',
    groupToggle: ({ name }: { name: string }) => `${name} 묶음 접기/펼치기`,
    retry: '다시 시도',
    retrying: '다시 시도하는 중',
    pipelineError: '회의록을 만들지 못했습니다',
    extractError: '결정을 추출하지 못했습니다',
    queued: '처리를 기다리는 중입니다',
    loadError: '결정 문서를 불러오지 못했습니다',
    searchError: '결정 문서를 검색하지 못했습니다',
    retryError: '다시 시도하지 못했습니다'
  },
  /** 회의록 탭 행의 결정 개수 칩 */
  chip: {
    count: ({ count }: { count: number }) => `결정 ${count}`,
    none: '결정 없음'
  },
  progressLabel: '결정 추출 진행률',
  /** 결정 문서 화면 (`/decisions/:decisionId`) */
  document: {
    sectionLabel: '결정 문서',
    loading: '결정 문서를 불러오는 중입니다',
    loadError: '결정 문서를 불러오지 못했습니다',
    notFound: '문서를 찾을 수 없어요',
    notFoundHint:
      '다시 추출했거나 회의가 지워졌을 수 있어요. 사이드 패널의 결정 문서 탭에서 다시 골라 주세요',
    typeLabel: '타입',
    meta: '문서 정보',
    sourceMeeting: '출처 회의',
    proposers: ({ names }: { names: string }) => `제안 ${names}`,
    decision: '결정',
    background: '배경',
    alternatives: '검토한 대안',
    actionItems: '후속 조치',
    task: '할 일',
    owner: '담당',
    due: '기한',
    participants: '참여 화자',
    evidence: '근거',
    evidenceJump: ({ range }: { range: string }) => `원문 ${range} 구간으로 이동`,
    empty: '없음',
    copy: '복사',
    copied: '복사했습니다',
    copyError: '결정 문서를 복사하지 못했습니다',
    more: '더보기',
    reextract: '이 회의 다시 추출',
    reextractConfirm: ({ count }: { count: number }) =>
      `이 회의의 결정 문서 ${count}개를 모두 새로 만듭니다`,
    confirmReextract: '다시 추출',
    cancel: '취소',
    reextractError: '다시 추출을 시작하지 못했습니다'
  },
  /** 결정 문서 오른쪽 원문 패널 */
  panel: {
    label: '원문',
    resizerLabel: '원문 패널 폭',
    resizerTitle: '끌어서 원문 패널 폭 조절 · 더블클릭하면 기본 폭'
  },
  /** 회의 상세 오른쪽 레일의 결정 문서 카드 */
  meetingCard: {
    title: '결정 문서',
    listLabel: '이 회의의 결정 문서',
    never: '아직 이 회의에서 결정을 추출하지 않았어요',
    empty: '이 회의에서 찾은 결정이 없어요',
    extract: '결정 추출',
    reextract: '다시 추출',
    reextractConfirm: ({ count }: { count: number }) =>
      `이 회의의 결정 문서 ${count}개를 모두 새로 만듭니다`,
    confirmReextract: '다시 추출',
    cancel: '취소',
    loadError: '결정 문서를 불러오지 못했습니다',
    requestError: '결정 추출을 시작하지 못했습니다'
  },
  /** 설정 "결정 타입" 카테고리 */
  settings: {
    title: '결정 타입',
    intro:
      '회의에서 찾은 결정을 어떤 묶음으로 나눌지 정합니다. 모델이 이름과 설명을 보고 하나를 고르고, 맞는 타입이 없으면 미분류로 둡니다.',
    note: '타입을 바꿔도 이미 만든 문서는 다시 분류되지 않습니다. 필요하면 회의별로 다시 추출해 주세요.',
    loading: '결정 타입을 불러오는 중입니다',
    loadError: '결정 타입을 불러오지 못했습니다',
    listLabel: '결정 타입 목록',
    count: ({ count, max }: { count: number; max: number }) => `타입 ${count}/${max}`,
    nameColumn: '이름',
    descriptionColumn: '설명',
    nameLabel: ({ position }: { position: number }) => `${position}번째 타입 이름`,
    descriptionLabel: ({ position }: { position: number }) => `${position}번째 타입 설명`,
    namePlaceholder: '예: 보안',
    descriptionPlaceholder: '어떤 결정이 이 타입인지 한 줄로',
    moveUp: ({ position }: { position: number }) => `${position}번째 타입 위로`,
    moveDown: ({ position }: { position: number }) => `${position}번째 타입 아래로`,
    remove: ({ position }: { position: number }) => `${position}번째 타입 삭제`,
    removeConfirm: '이 타입을 지울까요? 이 타입의 문서는 미분류로 보입니다',
    confirmRemove: '삭제',
    cancel: '취소',
    add: '타입 추가',
    save: '저장',
    saving: '저장하는 중…',
    unsaved: '저장하지 않은 변경이 있습니다',
    saved: ({ count }: { count: number }) => `결정 타입 ${count}개를 저장했습니다`,
    saveError: '결정 타입을 저장하지 못했습니다'
  }
}

export const decisionsEn: typeof decisionsKo = {
  stages: {
    queued: 'Waiting to extract decisions',
    extract: 'Finding decisions in the transcript',
    reduce: 'Merging overlapping decisions',
    done: 'Decision extraction complete',
    error: 'Decision extraction failed'
  },
  errors: {
    missingTypes: 'Invalid request (missing decision type list)',
    invalidType: 'Invalid request (decision type has the wrong shape)',
    tooManyTypes: ({ max }) => `Up to ${max} decision types can be created`,
    nameEmpty: 'A decision type name cannot be empty',
    nameTooLong: ({ max }) => `A decision type name can be up to ${max} characters`,
    descriptionTooLong: ({ max }) => `A decision type description can be up to ${max} characters`,
    duplicateName: ({ name }) => `A decision type with this name already exists: ${name}`
  },
  copy: {
    decision: 'Decision',
    background: 'Background',
    alternatives: 'Alternatives considered',
    actionItems: 'Follow-ups',
    evidence: 'Evidence',
    proposers: 'Proposed by',
    unclassified: 'Unclassified'
  },
  extraction: {
    nothingToExtract: 'There are no utterances to look for decisions in',
    unreadableOutput: 'Could not read the model response as a decision list. Please try again',
    interruptedByQuit: 'Decision extraction stopped because the app quit',
    meetingNotReady: 'The transcript has not been created yet'
  },
  sidebar: {
    tabs: 'List type',
    decisionsTab: 'Decisions',
    meetingsTab: 'Transcripts',
    navLabel: 'Decision list',
    searchPlaceholder: 'Search decisions',
    noResults: ({ query }) => `No decisions contain “${query}”`,
    processingGroup: 'In progress',
    unclassified: 'Unclassified',
    empty: 'No decisions yet. Record a meeting and each decision becomes a document',
    groupToggle: ({ name }) => `Collapse or expand ${name}`,
    retry: 'Retry',
    retrying: 'Retrying',
    pipelineError: 'Could not create the transcript',
    extractError: 'Could not extract decisions',
    queued: 'Waiting to be processed',
    loadError: 'Could not load decisions',
    searchError: 'Could not search decisions',
    retryError: 'Could not retry'
  },
  chip: {
    count: ({ count }) => `${count} ${count === 1 ? 'decision' : 'decisions'}`,
    none: 'No decisions'
  },
  progressLabel: 'Decision extraction progress',
  document: {
    sectionLabel: 'Decision document',
    loading: 'Loading the decision',
    loadError: 'Could not load the decision',
    notFound: 'Document not found',
    notFoundHint:
      'It may have been re-extracted or its meeting deleted. Pick another one from the Decisions tab in the side panel',
    typeLabel: 'Type',
    meta: 'Document info',
    sourceMeeting: 'Source meeting',
    proposers: ({ names }) => `Proposed by ${names}`,
    decision: 'Decision',
    background: 'Background',
    alternatives: 'Alternatives considered',
    actionItems: 'Follow-ups',
    task: 'Task',
    owner: 'Owner',
    due: 'Due',
    participants: 'Participants',
    evidence: 'Evidence',
    evidenceJump: ({ range }) => `Jump to ${range} in the transcript`,
    empty: 'None',
    copy: 'Copy',
    copied: 'Copied',
    copyError: 'Could not copy the decision',
    more: 'More',
    reextract: 'Re-extract this meeting',
    reextractConfirm: ({ count }) =>
      `All ${count} decision documents from this meeting will be created again`,
    confirmReextract: 'Re-extract',
    cancel: 'Cancel',
    reextractError: 'Could not start re-extraction'
  },
  panel: {
    label: 'Transcript',
    resizerLabel: 'Transcript panel width',
    resizerTitle: 'Drag to resize the transcript panel · double-click for the default width'
  },
  meetingCard: {
    title: 'Decisions',
    listLabel: 'Decisions from this meeting',
    never: 'Decisions have not been extracted from this meeting yet',
    empty: 'No decisions were found in this meeting',
    extract: 'Extract decisions',
    reextract: 'Re-extract',
    reextractConfirm: ({ count }) =>
      `All ${count} decision documents from this meeting will be created again`,
    confirmReextract: 'Re-extract',
    cancel: 'Cancel',
    loadError: 'Could not load decisions',
    requestError: 'Could not start decision extraction'
  },
  settings: {
    title: 'Decision types',
    intro:
      'Choose the groups decisions are sorted into. The model picks one by its name and description, and leaves the decision unclassified when none fits.',
    note: 'Changing types does not reclassify documents that already exist. Re-extract a meeting if needed.',
    loading: 'Loading decision types',
    loadError: 'Could not load decision types',
    listLabel: 'Decision type list',
    count: ({ count, max }) => `${count}/${max} types`,
    nameColumn: 'Name',
    descriptionColumn: 'Description',
    nameLabel: ({ position }) => `Type ${position} name`,
    descriptionLabel: ({ position }) => `Type ${position} description`,
    namePlaceholder: 'e.g. Security',
    descriptionPlaceholder: 'One line on which decisions belong here',
    moveUp: ({ position }) => `Move type ${position} up`,
    moveDown: ({ position }) => `Move type ${position} down`,
    remove: ({ position }) => `Delete type ${position}`,
    removeConfirm: 'Delete this type? Its documents will show as unclassified',
    confirmRemove: 'Delete',
    cancel: 'Cancel',
    add: 'Add type',
    save: 'Save',
    saving: 'Saving…',
    unsaved: 'You have unsaved changes',
    saved: ({ count }) => `Saved ${count} decision types`,
    saveError: 'Could not save decision types'
  }
}
