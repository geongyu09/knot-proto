/** 라우트 경로의 단일 정의. 컴포넌트는 경로 문자열을 직접 쓰지 않고 여기서 가져온다 */
export const PATHS = {
  home: '/',
  meetings: '/meetings',
  record: '/record',
  meetingDetail: '/meetings/:meetingId',
  settings: '/settings',
  onboarding: '/onboarding',
  recorder: '/recorder'
} as const

export const meetingDetailPath = ({ meetingId }: { meetingId: string }) => `/meetings/${meetingId}`
