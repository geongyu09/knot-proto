// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import type { Meeting } from '@shared/types'

vi.mock('@renderer/shared/api/decisions', () => ({
  getMeetingDecisionsApi: vi.fn(),
  extractDecisionsApi: vi.fn()
}))
vi.mock('@renderer/shared/api/meetings', () => ({ getMeetingApi: vi.fn() }))
vi.mock('@renderer/shared/api/events', () => ({
  onMeetingsChanged: vi.fn(() => () => {}),
  onPipelineProgress: vi.fn(() => () => {}),
  onRefineProgress: vi.fn(() => () => {}),
  onDecisionProgress: vi.fn(() => () => {})
}))

import { extractDecisionsApi, getMeetingDecisionsApi } from '@renderer/shared/api/decisions'
import { getMeetingApi } from '@renderer/shared/api/meetings'
import MeetingDecisionsCard from './index'

const MEETING_ID = 'meeting-1'

const meetingOf = (overrides: Partial<Meeting> = {}): Meeting => ({
  id: MEETING_ID,
  title: '주간 제품 회의',
  createdAt: 0,
  durationSec: 600,
  status: 'done',
  hasAudio: false,
  decisionState: 'none',
  decisionCount: 0,
  ...overrides
})

const renderCard = (meeting: Meeting) => {
  vi.mocked(getMeetingApi).mockResolvedValue({
    meeting,
    utterances: [],
    speakers: [],
    refineResult: null
  })

  return render(
    <MemoryRouter>
      <MeetingDecisionsCard meetingId={MEETING_ID} />
    </MemoryRouter>
  )
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('MeetingDecisionsCard', () => {
  it('추출한 적 없는 회의는 확인 없이 "결정 추출"로 요청한다', async () => {
    const user = userEvent.setup()
    vi.mocked(getMeetingDecisionsApi).mockResolvedValue([])
    vi.mocked(extractDecisionsApi).mockResolvedValue()
    renderCard(meetingOf())

    expect(await screen.findByText(/아직 이 회의에서 결정을 추출하지 않았어요/)).toBeTruthy()
    await user.click(screen.getByRole('button', { name: '결정 추출' }))

    expect(extractDecisionsApi).toHaveBeenCalledWith({ meetingId: MEETING_ID })
    expect(screen.getByRole('progressbar', { name: '결정 추출 진행률' })).toBeTruthy()
  })

  it('문서 목록을 링크로 보이고, 다시 추출은 한 번 더 확인한다', async () => {
    const user = userEvent.setup()
    vi.mocked(getMeetingDecisionsApi).mockResolvedValue([
      {
        id: 'd-1',
        meetingId: MEETING_ID,
        typeId: null,
        title: '출시일을 10월로 미룸',
        meetingTitle: '주간 제품 회의',
        meetingCreatedAt: 0
      }
    ])
    renderCard(meetingOf({ decisionState: 'done', decisionCount: 1 }))

    const link = await screen.findByRole('link', { name: '출시일을 10월로 미룸' })
    expect(link.getAttribute('href')).toBe('/decisions/d-1')

    await user.click(screen.getByRole('button', { name: '다시 추출' }))
    expect(screen.getByRole('alert').textContent).toContain('결정 문서 1개를 모두 새로 만듭니다')
    expect(extractDecisionsApi).not.toHaveBeenCalled()
  })

  it('추출이 끝났는데 결정이 없으면 알려 준다', async () => {
    vi.mocked(getMeetingDecisionsApi).mockResolvedValue([])
    renderCard(meetingOf({ decisionState: 'done' }))

    expect(await screen.findByText('이 회의에서 찾은 결정이 없어요')).toBeTruthy()
  })

  it('추출 실패 문구를 보여 준다', async () => {
    vi.mocked(getMeetingDecisionsApi).mockResolvedValue([])
    renderCard(meetingOf({ decisionState: 'error', decisionError: '모델 응답을 읽지 못했습니다' }))

    expect(await screen.findByText('모델 응답을 읽지 못했습니다')).toBeTruthy()
  })
})
