// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import type { DecisionListItem, DecisionType, Meeting } from '@shared/types'

vi.mock('@renderer/shared/api/meetings', () => ({
  getMeetingsApi: vi.fn(),
  searchMeetingsApi: vi.fn(),
  reprocessMeetingApi: vi.fn()
}))
vi.mock('@renderer/shared/api/decisions', () => ({
  getDecisionsApi: vi.fn(),
  searchDecisionsApi: vi.fn(),
  extractDecisionsApi: vi.fn()
}))
vi.mock('@renderer/shared/api/decisionTypes', () => ({ getDecisionTypesApi: vi.fn() }))
vi.mock('@renderer/shared/api/events', () => ({
  onMeetingsChanged: vi.fn(),
  onPipelineProgress: vi.fn(() => () => {}),
  onDecisionProgress: vi.fn(() => () => {}),
  onRecordingState: vi.fn(() => () => {})
}))
vi.mock('@renderer/shared/api/recording', () => ({
  getRecordingStateApi: vi.fn().mockResolvedValue({ meetingId: null, startedAt: null, level: 0 })
}))

import {
  extractDecisionsApi,
  getDecisionsApi,
  searchDecisionsApi
} from '@renderer/shared/api/decisions'
import { getDecisionTypesApi } from '@renderer/shared/api/decisionTypes'
import { onMeetingsChanged } from '@renderer/shared/api/events'
import {
  getMeetingsApi,
  reprocessMeetingApi,
  searchMeetingsApi
} from '@renderer/shared/api/meetings'
import MeetingSidebarSection from './index'

const NOW = new Date(2026, 8, 24, 15, 0)
const MS_PER_DAY = 86_400_000

const meetingOf = (overrides: Partial<Meeting> = {}): Meeting => ({
  id: 'meeting-1',
  title: '주간 제품 회의',
  createdAt: new Date(2026, 8, 24, 14, 10).getTime(),
  durationSec: 48 * 60 + 12,
  status: 'done',
  hasAudio: false,
  decisionState: 'none',
  decisionCount: 0,
  ...overrides
})

const TYPES: DecisionType[] = [
  { id: 'type-product', name: '제품·기능', description: '' },
  { id: 'type-schedule', name: '일정', description: '' }
]

const decisionOf = (overrides: Partial<DecisionListItem> = {}): DecisionListItem => ({
  id: 'decision-1',
  meetingId: 'meeting-1',
  typeId: 'type-product',
  title: '가격 정책을 월 구독으로 확정',
  meetingTitle: '주간 제품 회의',
  meetingCreatedAt: new Date(2026, 8, 24, 14, 10).getTime(),
  ...overrides
})

/** main이 보내는 목록 변경 알림을 테스트에서 흘려보내기 위해 구독자를 모은다 */
let changedListeners: (() => void)[] = []

const TAB_STORAGE_KEY = 'meetingSidebar.tab'

/** 기본 탭은 결정 문서다. 회의록 탭 테스트는 저장된 선택으로 시작한다 */
const renderSidebar = ({ tab }: { tab?: 'decisions' | 'meetings' } = { tab: 'meetings' }) => {
  if (tab) localStorage.setItem(TAB_STORAGE_KEY, JSON.stringify(tab))

  return render(
    <MemoryRouter>
      <MeetingSidebarSection onClose={vi.fn()} />
    </MemoryRouter>
  )
}

beforeEach(() => {
  // 날짜 묶음을 고정하되 디바운스·userEvent 타이머는 실제로 흐르게 둔다
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  localStorage.clear()
  vi.mocked(getDecisionsApi).mockResolvedValue([])
  vi.mocked(getDecisionTypesApi).mockResolvedValue(TYPES)
  changedListeners = []
  vi.mocked(onMeetingsChanged).mockImplementation((listener) => {
    changedListeners = [...changedListeners, listener]

    return () => {
      changedListeners = changedListeners.filter((candidate) => candidate !== listener)
    }
  })
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.clearAllMocks()
})

describe('MeetingSidebarSection 목록', () => {
  it('회의를 오늘·이번 주·이전으로 묶어 시각과 길이를 보여준다', async () => {
    vi.mocked(getMeetingsApi).mockResolvedValue([
      meetingOf(),
      meetingOf({
        id: 'meeting-2',
        title: '채용 인터뷰 정리',
        createdAt: NOW.getTime() - 2 * MS_PER_DAY,
        durationSec: 31 * 60
      }),
      meetingOf({
        id: 'meeting-3',
        title: '분기 계획 킥오프',
        createdAt: new Date(2026, 7, 1, 10, 0).getTime()
      })
    ])
    renderSidebar()

    const today = await screen.findByRole('region', { name: '오늘' })
    expect(within(today).getByText('주간 제품 회의')).toBeTruthy()
    expect(within(today).getByText('오후 2:10 · 48분')).toBeTruthy()
    expect(
      within(screen.getByRole('region', { name: '이번 주' })).getByText('9월 22일 · 31분')
    ).toBeTruthy()
    expect(
      within(screen.getByRole('region', { name: '이전' })).getByText('분기 계획 킥오프')
    ).toBeTruthy()
  })

  it('처리 중인 회의는 진행률을, 실패한 회의는 오류 한 줄을 보여준다', async () => {
    vi.mocked(getMeetingsApi).mockResolvedValue([
      meetingOf({ status: 'processing' }),
      meetingOf({ id: 'meeting-2', status: 'error', errorMessage: '모델이 준비되지 않았습니다' })
    ])
    renderSidebar()

    expect(await screen.findByRole('progressbar')).toBeTruthy()
    expect(screen.getByText('모델이 준비되지 않았습니다')).toBeTruthy()
  })

  it('회의가 없으면 녹음을 권한다', async () => {
    vi.mocked(getMeetingsApi).mockResolvedValue([])
    renderSidebar()

    expect(await screen.findByText(/아직 녹음한 회의가 없습니다/)).toBeTruthy()
  })

  it('main이 목록 변경을 알리면 다시 불러온다', async () => {
    vi.mocked(getMeetingsApi)
      .mockResolvedValueOnce([meetingOf()])
      .mockResolvedValue([meetingOf({ title: '배포 회고' })])
    renderSidebar()
    expect(await screen.findByText('주간 제품 회의')).toBeTruthy()

    await act(async () => {
      changedListeners.forEach((listener) => listener())
    })

    expect(await screen.findByText('배포 회고')).toBeTruthy()
  })

  it('회의를 누르면 상세로 가는 링크를 건다', async () => {
    vi.mocked(getMeetingsApi).mockResolvedValue([meetingOf({ id: 'abc' })])
    renderSidebar()

    const link = await screen.findByRole('link', { name: /주간 제품 회의/ })
    expect(link.getAttribute('href')).toBe('/meetings/abc')
  })
})

describe('MeetingSidebarSection 검색', () => {
  it('입력이 멈추면 검색하고 일치 부분을 강조한다', async () => {
    const user = userEvent.setup()
    vi.mocked(getMeetingsApi).mockResolvedValue([meetingOf()])
    vi.mocked(searchMeetingsApi).mockResolvedValue([
      {
        meeting: meetingOf(),
        match: { utteranceId: 'u-1', text: '다음 배포 일정을 정합시다', startSec: 65 }
      }
    ])
    renderSidebar()

    await user.type(await screen.findByRole('textbox', { name: '회의록 검색' }), '배포')

    const results = await screen.findByRole('navigation', { name: '검색 결과' })
    expect(await within(results).findByText('배포', { selector: 'mark' })).toBeTruthy()
    expect(within(results).getByText('00:01:05')).toBeTruthy()
    expect(searchMeetingsApi).toHaveBeenLastCalledWith({ query: '배포' })
  })

  it('결과가 없으면 알려 준다', async () => {
    const user = userEvent.setup()
    vi.mocked(getMeetingsApi).mockResolvedValue([meetingOf()])
    vi.mocked(searchMeetingsApi).mockResolvedValue([])
    renderSidebar()

    await user.type(await screen.findByRole('textbox', { name: '회의록 검색' }), '50%')

    expect(await screen.findByText(/“50%”이\(가\) 들어간 회의가 없습니다/)).toBeTruthy()
  })

  it('Esc를 누르면 검색을 끝내고 원래 목록으로 돌아간다', async () => {
    const user = userEvent.setup()
    vi.mocked(getMeetingsApi).mockResolvedValue([meetingOf()])
    vi.mocked(searchMeetingsApi).mockResolvedValue([])
    renderSidebar()

    const input = await screen.findByRole('textbox', { name: '회의록 검색' })
    await user.type(input, '배포')
    await user.keyboard('{Escape}')

    expect((input as HTMLInputElement).value).toBe('')
    expect(screen.getByRole('navigation', { name: '회의 목록' })).toBeTruthy()
    expect(screen.getByText('주간 제품 회의')).toBeTruthy()
  })

  it('공백만 입력하면 검색하지 않는다', async () => {
    const user = userEvent.setup()
    vi.mocked(getMeetingsApi).mockResolvedValue([meetingOf()])
    renderSidebar()

    await user.type(await screen.findByRole('textbox', { name: '회의록 검색' }), '   ')

    expect(searchMeetingsApi).not.toHaveBeenCalled()
    expect(screen.getByRole('navigation', { name: '회의 목록' })).toBeTruthy()
  })
})

describe('MeetingSidebarSection 탭', () => {
  it('처음 열면 결정 문서 탭이고, 회의록 탭으로 바꾸면 선택을 기억한다', async () => {
    const user = userEvent.setup()
    vi.mocked(getMeetingsApi).mockResolvedValue([meetingOf()])
    const { unmount } = renderSidebar({})

    const decisionTab = screen.getByRole('tab', { name: '결정 문서' })
    expect(decisionTab.getAttribute('aria-selected')).toBe('true')
    expect(await screen.findByRole('navigation', { name: '결정 문서 목록' })).toBeTruthy()

    await user.click(screen.getByRole('tab', { name: '회의록' }))

    expect(screen.getByRole('navigation', { name: '회의 목록' })).toBeTruthy()
    expect(await screen.findByText('주간 제품 회의')).toBeTruthy()

    unmount()
    renderSidebar({})
    expect(screen.getByRole('tab', { name: '회의록' }).getAttribute('aria-selected')).toBe('true')
  })

  it('탭마다 검색 대상을 바꾼다', async () => {
    const user = userEvent.setup()
    vi.mocked(getMeetingsApi).mockResolvedValue([])
    vi.mocked(searchDecisionsApi).mockResolvedValue([decisionOf()])
    renderSidebar({ tab: 'decisions' })

    await user.type(screen.getByRole('textbox', { name: '결정 문서 검색' }), '가격')

    const results = await screen.findByRole('navigation', { name: '검색 결과' })
    expect(await within(results).findByText('가격', { selector: 'mark' })).toBeTruthy()
    expect(searchDecisionsApi).toHaveBeenLastCalledWith({ query: '가격' })
    expect(searchMeetingsApi).not.toHaveBeenCalled()
  })
})

describe('MeetingSidebarSection 결정 탭', () => {
  it('타입 순서대로 묶고 지운 타입의 문서는 마지막 미분류로 보낸다', async () => {
    vi.mocked(getMeetingsApi).mockResolvedValue([])
    vi.mocked(getDecisionsApi).mockResolvedValue([
      decisionOf({ id: 'd-1', typeId: 'type-schedule', title: '출시일을 10월로 미룸' }),
      decisionOf({ id: 'd-2', typeId: 'deleted-type', title: '회의록 양식 통일' }),
      decisionOf({ id: 'd-3' })
    ])
    renderSidebar({ tab: 'decisions' })

    const product = await screen.findByRole('region', { name: '제품·기능' })
    const link = within(product).getByRole('link', { name: /가격 정책을 월 구독으로 확정/ })
    expect(link.getAttribute('href')).toBe('/decisions/d-3')
    expect(within(product).getByText('오후 2:10')).toBeTruthy()

    const regions = screen.getAllByRole('region').map((region) => region.getAttribute('aria-label'))
    expect(regions).toEqual(['제품·기능', '일정', '미분류'])
    expect(
      within(screen.getByRole('region', { name: '미분류' })).getByText('회의록 양식 통일')
    ).toBeTruthy()
  })

  it('미분류가 비면 묶음을 숨기고, 문서가 하나도 없으면 안내한다', async () => {
    vi.mocked(getMeetingsApi).mockResolvedValue([])
    vi.mocked(getDecisionsApi).mockResolvedValueOnce([decisionOf()]).mockResolvedValue([])
    renderSidebar({ tab: 'decisions' })

    expect(await screen.findByRole('region', { name: '제품·기능' })).toBeTruthy()
    expect(screen.queryByRole('region', { name: '미분류' })).toBeNull()

    await act(async () => {
      changedListeners.forEach((listener) => listener())
    })

    expect(await screen.findByText(/아직 결정 문서가 없어요/)).toBeTruthy()
  })

  it('묶음을 접으면 문서가 숨고, 다시 열어도 접힌 채로 남는다', async () => {
    const user = userEvent.setup()
    vi.mocked(getMeetingsApi).mockResolvedValue([])
    vi.mocked(getDecisionsApi).mockResolvedValue([decisionOf()])
    const { unmount } = renderSidebar({ tab: 'decisions' })

    const toggle = await screen.findByRole('button', { name: '제품·기능 묶음 접기/펼치기' })
    expect(toggle.getAttribute('aria-expanded')).toBe('true')

    await user.click(toggle)

    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByText('가격 정책을 월 구독으로 확정')).toBeNull()

    unmount()
    renderSidebar({ tab: 'decisions' })
    const reopened = await screen.findByRole('button', { name: '제품·기능 묶음 접기/펼치기' })
    expect(reopened.getAttribute('aria-expanded')).toBe('false')
  })

  it('처리 중인 회의는 맨 위 "처리 중" 묶음에 진행률로 보인다', async () => {
    vi.mocked(getMeetingsApi).mockResolvedValue([
      meetingOf({ id: 'm-1', title: '인식 중인 회의', status: 'processing' }),
      meetingOf({ id: 'm-2', title: '추출 중인 회의', decisionState: 'pending' }),
      meetingOf({ id: 'm-3', title: '끝난 회의', decisionState: 'done', decisionCount: 2 })
    ])
    vi.mocked(getDecisionsApi).mockResolvedValue([decisionOf()])
    renderSidebar({ tab: 'decisions' })

    const processing = await screen.findByRole('region', { name: '처리 중' })
    expect(within(processing).getByText('인식 중인 회의')).toBeTruthy()
    expect(within(processing).getByText('추출 중인 회의')).toBeTruthy()
    expect(within(processing).queryByText('끝난 회의')).toBeNull()
    expect(within(processing).getAllByRole('progressbar')).toHaveLength(2)
    expect(within(processing).getByText('결정 추출을 기다리는 중입니다')).toBeTruthy()
    expect(screen.getAllByRole('region')[0]).toBe(processing)
  })

  it('추출 실패는 결정 추출을, 파이프라인 실패는 다시 인식을 다시 시도한다', async () => {
    const user = userEvent.setup()
    vi.mocked(getMeetingsApi).mockResolvedValue([
      meetingOf({
        id: 'm-1',
        title: '추출 실패 회의',
        decisionState: 'error',
        decisionError: 'Claude API 키가 저장되어 있지 않습니다'
      }),
      meetingOf({
        id: 'm-2',
        title: '인식 실패 회의',
        status: 'error',
        errorMessage: '모델이 준비되지 않았습니다',
        hasAudio: true,
        speakerCount: 3
      })
    ])
    vi.mocked(extractDecisionsApi).mockResolvedValue()
    vi.mocked(reprocessMeetingApi).mockResolvedValue({
      meeting: meetingOf(),
      utterances: [],
      speakers: [],
      refineResult: null
    })
    renderSidebar({ tab: 'decisions' })

    const processing = await screen.findByRole('region', { name: '처리 중' })
    expect(within(processing).getByText('Claude API 키가 저장되어 있지 않습니다')).toBeTruthy()
    expect(within(processing).getByText('모델이 준비되지 않았습니다')).toBeTruthy()

    const [extractRetry, reprocessRetry] = within(processing).getAllByRole('button', {
      name: '다시 시도'
    })
    await user.click(extractRetry)
    await user.click(reprocessRetry)

    expect(extractDecisionsApi).toHaveBeenCalledWith({ meetingId: 'm-1' })
    expect(reprocessMeetingApi).toHaveBeenCalledWith({ meetingId: 'm-2', speakerCount: 3 })
  })
})

describe('MeetingSidebarSection 회의록 탭 결정 칩', () => {
  it('추출이 끝난 회의에만 결정 개수 또는 "결정 없음"을 붙인다', async () => {
    vi.mocked(getMeetingsApi).mockResolvedValue([
      meetingOf({ id: 'm-1', title: '결정 많은 회의', decisionState: 'done', decisionCount: 3 }),
      meetingOf({ id: 'm-2', title: '결정 없는 회의', decisionState: 'done', decisionCount: 0 }),
      meetingOf({ id: 'm-3', title: '추출 안 한 회의' })
    ])
    renderSidebar({ tab: 'meetings' })

    expect(
      within(await screen.findByRole('link', { name: /결정 많은 회의/ })).getByText('결정 3')
    ).toBeTruthy()
    expect(
      within(screen.getByRole('link', { name: /결정 없는 회의/ })).getByText('결정 없음')
    ).toBeTruthy()
    expect(
      within(screen.getByRole('link', { name: /추출 안 한 회의/ })).queryByText(/결정/)
    ).toBeNull()
  })
})
