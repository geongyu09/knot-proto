/** 셸(GNB·독·회의 목록 패널)과 홈·회의록 목록 화면 문구. ko가 타입을 정하고 en은 같은 키를 가져야 한다 (references/architecture.md "UI 언어") */
export const sidebarKo = {
  nav: {
    searchResults: '검색 결과',
    meetingList: '회의 목록'
  },
  gnb: {
    tabs: '화면',
    home: '홈',
    meetings: '회의록',
    settings: '설정',
    openList: '회의 목록 열기',
    closeList: '회의 목록 닫기'
  },
  dock: {
    label: '녹음',
    newRecording: '새 녹음',
    openRecording: ({ elapsed }: { elapsed: string }) => `녹음 화면으로 · ${elapsed}`,
    stop: '녹음 끝내기'
  },
  listItem: {
    recording: '녹음 중',
    defaultError: '회의록을 만들지 못했습니다'
  },
  search: {
    placeholder: '회의록 검색',
    clear: '검색 지우기',
    searching: '찾는 중입니다',
    noResults: ({ query }: { query: string }) => `“${query}”이(가) 들어간 회의가 없습니다`
  },
  list: {
    empty: '아직 녹음한 회의가 없습니다. 새 녹음으로 시작해 보세요'
  },
  dateGroups: {
    today: '오늘',
    week: '이번 주',
    earlier: '이전'
  },
  home: {
    greeting: '오늘 회의를 기록해 볼까요',
    recent: {
      title: '최근 회의',
      viewAll: '전체 보기',
      open: '열기',
      empty: '아직 녹음한 회의가 없어요',
      emptyHint: '아래 마이크로 녹음을 시작하면 여기에 모여요'
    },
    week: {
      title: '이번 주',
      meetings: '회의',
      meetingCount: ({ count }: { count: number }) => `${count}개`,
      totalDuration: '녹음한 시간'
    },
    current: {
      title: '진행 중인 녹음',
      recording: '녹음 중',
      paused: '일시정지',
      name: '지금 녹음',
      hint: '다른 화면으로 이동해도 녹음은 계속돼요',
      open: '녹음 화면으로',
      empty: '진행 중인 녹음이 없어요',
      emptyHint: '아래 마이크로 녹음을 시작하면 여기에서 진행 상황을 볼 수 있어요'
    },
    importer: {
      title: '녹음 파일 가져오기'
    }
  },
  meetingsPage: {
    title: '회의록',
    description: '녹음하고 정리한 회의를 날짜별로 모아뒀어요',
    empty: '아직 회의록이 없어요',
    emptyHint: '아래 마이크로 녹음을 시작해 보세요'
  },
  errors: {
    loadList: '회의 목록을 불러오지 못했습니다',
    search: '회의록을 검색하지 못했습니다'
  }
}

export const sidebarEn: typeof sidebarKo = {
  nav: {
    searchResults: 'Search results',
    meetingList: 'Meetings'
  },
  gnb: {
    tabs: 'Screens',
    home: 'Home',
    meetings: 'Transcripts',
    settings: 'Settings',
    openList: 'Open meeting list',
    closeList: 'Close meeting list'
  },
  dock: {
    label: 'Recording',
    newRecording: 'New recording',
    openRecording: ({ elapsed }) => `Go to recording · ${elapsed}`,
    stop: 'Finish recording'
  },
  listItem: {
    recording: 'Recording',
    defaultError: 'Could not create the transcript'
  },
  search: {
    placeholder: 'Search transcripts',
    clear: 'Clear search',
    searching: 'Searching',
    noResults: ({ query }) => `No meetings contain “${query}”`
  },
  list: {
    empty: 'No meetings recorded yet. Start with a new recording'
  },
  dateGroups: {
    today: 'Today',
    week: 'This week',
    earlier: 'Earlier'
  },
  home: {
    greeting: 'Ready to capture today’s meeting?',
    recent: {
      title: 'Recent meetings',
      viewAll: 'View all',
      open: 'Open',
      empty: 'No meetings recorded yet',
      emptyHint: 'Start recording with the mic below and they’ll show up here'
    },
    week: {
      title: 'This week',
      meetings: 'Meetings',
      meetingCount: ({ count }) => `${count}`,
      totalDuration: 'Recorded'
    },
    current: {
      title: 'Current recording',
      recording: 'Recording',
      paused: 'Paused',
      name: 'Recording now',
      hint: 'Recording continues when you leave this screen',
      open: 'Go to recording',
      empty: 'Nothing is recording',
      emptyHint: 'Start recording with the mic below to follow it here'
    },
    importer: {
      title: 'Import a recording'
    }
  },
  meetingsPage: {
    title: 'Transcripts',
    description: 'Recorded and processed meetings, grouped by date',
    empty: 'No transcripts yet',
    emptyHint: 'Start recording with the mic below'
  },
  errors: {
    loadList: 'Could not load the meeting list',
    search: 'Could not search transcripts'
  }
}
