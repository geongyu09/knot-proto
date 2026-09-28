// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import type { Meeting } from '@shared/types'

vi.mock('@renderer/shared/api/meetings', () => ({
  getMeetingsApi: vi.fn(),
  searchMeetingsApi: vi.fn()
}))
vi.mock('@renderer/shared/api/events', () => ({
  onMeetingsChanged: vi.fn(),
  onPipelineProgress: vi.fn(() => () => {}),
  onRecordingState: vi.fn(() => () => {})
}))
vi.mock('@renderer/shared/api/recording', () => ({
  getRecordingStateApi: vi.fn().mockResolvedValue({ meetingId: null, startedAt: null, level: 0 })
}))

import { onMeetingsChanged } from '@renderer/shared/api/events'
import { getMeetingsApi, searchMeetingsApi } from '@renderer/shared/api/meetings'
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
  ...overrides
})

/** main이 보내는 목록 변경 알림을 테스트에서 흘려보내기 위해 구독자를 모은다 */
let changedListeners: (() => void)[] = []

const renderSidebar = () =>
  render(
    <MemoryRouter>
      <MeetingSidebarSection onClose={vi.fn()} />
    </MemoryRouter>
  )

beforeEach(() => {
  // 날짜 묶음을 고정하되 디바운스·userEvent 타이머는 실제로 흐르게 둔다
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
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
