// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import type { Decision, Meeting, MeetingDetail, Speaker, Utterance } from '@shared/types'

vi.mock('@renderer/shared/api/decisions', () => ({
  getDecisionApi: vi.fn(),
  extractDecisionsApi: vi.fn()
}))
vi.mock('@renderer/shared/api/decisionTypes', () => ({ getDecisionTypesApi: vi.fn() }))
vi.mock('@renderer/shared/api/meetings', () => ({
  getMeetingApi: vi.fn(),
  renameMeetingApi: vi.fn(),
  deleteMeetingApi: vi.fn(),
  reprocessMeetingApi: vi.fn()
}))
vi.mock('@renderer/shared/api/utterances', () => ({
  updateUtteranceTextApi: vi.fn(),
  reassignUtteranceApi: vi.fn(),
  revertUtteranceRefineApi: vi.fn()
}))
vi.mock('@renderer/shared/api/speakers', () => ({
  renameSpeakerApi: vi.fn(),
  mergeSpeakersApi: vi.fn()
}))
vi.mock('@renderer/shared/api/clipboard', () => ({ writeClipboardTextApi: vi.fn() }))
vi.mock('@renderer/shared/api/telemetry', () => ({ trackApi: vi.fn() }))
vi.mock('@renderer/shared/api/events', () => ({
  onMeetingsChanged: vi.fn(() => () => {}),
  onPipelineProgress: vi.fn(() => () => {}),
  onRefineProgress: vi.fn(() => () => {}),
  onDecisionProgress: vi.fn(() => () => {})
}))

import { writeClipboardTextApi } from '@renderer/shared/api/clipboard'
import { extractDecisionsApi, getDecisionApi } from '@renderer/shared/api/decisions'
import { getDecisionTypesApi } from '@renderer/shared/api/decisionTypes'
import { getMeetingApi } from '@renderer/shared/api/meetings'
import { renameSpeakerApi } from '@renderer/shared/api/speakers'
import { trackApi } from '@renderer/shared/api/telemetry'
import TranscriptSection from '@renderer/modules/widgets/meeting/TranscriptSection'
import DecisionDocumentSection from './index'

const MEETING_ID = 'meeting-1'
const DECISION_ID = 'decision-1'
const MEETING_DETAIL_MARKER = '회의 상세 화면'

const meetingOf = (overrides: Partial<Meeting> = {}): Meeting => ({
  id: MEETING_ID,
  title: '주간 제품 회의',
  createdAt: new Date(2026, 8, 24, 14, 10).getTime(),
  durationSec: 600,
  status: 'done',
  hasAudio: false,
  decisionState: 'done',
  decisionCount: 2,
  ...overrides
})

const decisionOf = (overrides: Partial<Decision> = {}): Decision => ({
  id: DECISION_ID,
  meetingId: MEETING_ID,
  ord: 0,
  typeId: 'type-product',
  title: '가격 정책을 월 구독으로 확정',
  decision: '다음 분기부터 월 구독 요금제만 판다.',
  background: '연 결제 이탈이 커서 가격을 다시 봤다.',
  alternatives: [{ option: '연 결제 유지', reason: '이탈이 계속된다' }],
  actionItems: [
    { task: '요금 페이지 수정', ownerLabel: 'SPEAKER_01', ownerText: '', due: '다음 주 금요일' }
  ],
  proposerLabels: ['SPEAKER_00'],
  participantLabels: ['SPEAKER_00', 'SPEAKER_01'],
  evidence: [{ startSec: 60, endSec: 75 }],
  createdAt: 0,
  ...overrides
})

const utteranceOf = (overrides: Partial<Utterance> = {}): Utterance => ({
  id: 'u-1',
  meetingId: MEETING_ID,
  ord: 0,
  speakerLabel: 'SPEAKER_00',
  startSec: 0,
  endSec: 10,
  text: '회의를 시작하겠습니다',
  originalText: null,
  ...overrides
})

const speakerOf = (overrides: Partial<Speaker> = {}): Speaker => ({
  meetingId: MEETING_ID,
  label: 'SPEAKER_00',
  displayName: '김팀장',
  ...overrides
})

const detailOf = (speakers: Speaker[]): MeetingDetail => ({
  meeting: meetingOf(),
  utterances: [
    utteranceOf(),
    utteranceOf({ id: 'u-2', ord: 1, startSec: 60, endSec: 70, text: '월 구독으로 가죠' }),
    utteranceOf({
      id: 'u-3',
      ord: 2,
      speakerLabel: 'SPEAKER_01',
      startSec: 70,
      endSec: 75,
      text: '좋습니다'
    }),
    utteranceOf({ id: 'u-4', ord: 3, startSec: 75, endSec: 90, text: '다음 안건입니다' })
  ],
  speakers,
  refineResult: null
})

const renderDocument = () =>
  render(
    <MemoryRouter initialEntries={[`/decisions/${DECISION_ID}`]}>
      <Routes>
        <Route path="/meetings/:meetingId" element={<p>{MEETING_DETAIL_MARKER}</p>} />
        <Route
          path="/decisions/:decisionId"
          element={
            <DecisionDocumentSection
              decisionId={DECISION_ID}
              renderLayout={({ meetingId, document, highlightRanges, scrollRequest }) => (
                <TranscriptSection
                  variant="panel"
                  meetingId={meetingId}
                  main={document}
                  highlightRanges={highlightRanges}
                  scrollRequest={scrollRequest}
                />
              )}
            />
          }
        />
      </Routes>
    </MemoryRouter>
  )

beforeEach(() => {
  localStorage.clear()
  vi.mocked(getDecisionApi).mockResolvedValue({ decision: decisionOf(), meeting: meetingOf() })
  vi.mocked(getDecisionTypesApi).mockResolvedValue([
    { id: 'type-product', name: '제품·기능', description: '' }
  ])
  vi.mocked(getMeetingApi).mockResolvedValue(
    detailOf([speakerOf(), speakerOf({ label: 'SPEAKER_01', displayName: null })])
  )
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('DecisionDocumentSection 문서', () => {
  it('결정·배경·대안·후속 조치·참여 화자·근거를 입력 요소 없이 읽기 전용으로 그린다', async () => {
    renderDocument()

    const article = await screen.findByRole('article', { name: '결정 문서' })
    const document = within(article)
    expect(
      document.getByRole('heading', { level: 1, name: '가격 정책을 월 구독으로 확정' })
    ).toBeTruthy()
    expect(await document.findByText('제품·기능')).toBeTruthy()
    expect(document.getByRole('link', { name: '주간 제품 회의' }).getAttribute('href')).toBe(
      `/meetings/${MEETING_ID}`
    )
    expect(document.getByText('다음 분기부터 월 구독 요금제만 판다.')).toBeTruthy()
    expect(document.getByText('연 결제 이탈이 커서 가격을 다시 봤다.')).toBeTruthy()
    expect(document.getByText('연 결제 유지')).toBeTruthy()
    expect(document.getByRole('cell', { name: '다음 주 금요일' })).toBeTruthy()
    expect(await document.findByText('제안 김팀장')).toBeTruthy()
    expect(document.getByRole('cell', { name: '화자 2' })).toBeTruthy()
    expect(document.getByText('김팀장, 화자 2')).toBeTruthy()
    expect(
      document.getByRole('button', { name: '원문 00:01:00–00:01:15 구간으로 이동' })
    ).toBeTruthy()

    expect(document.queryAllByRole('textbox')).toHaveLength(0)
    expect(document.queryAllByRole('combobox')).toHaveLength(0)
    expect(
      article.querySelectorAll('input, textarea, select, [contenteditable="true"]')
    ).toHaveLength(0)
    expect(trackApi).toHaveBeenCalledWith({
      name: 'decision_opened',
      props: { decisionId: DECISION_ID, meetingId: MEETING_ID }
    })
  })

  it('대안·후속 조치가 없으면 그 절을 숨긴다', async () => {
    vi.mocked(getDecisionApi).mockResolvedValue({
      decision: decisionOf({ alternatives: [], actionItems: [], typeId: null }),
      meeting: meetingOf()
    })
    renderDocument()

    const article = await screen.findByRole('article', { name: '결정 문서' })
    expect(within(article).queryByRole('region', { name: '검토한 대안' })).toBeNull()
    expect(within(article).queryByRole('region', { name: '후속 조치' })).toBeNull()
    expect(within(article).getByText('미분류')).toBeTruthy()
  })

  it('없는 문서면 결정 탭에서 다시 고르라고 안내한다', async () => {
    vi.mocked(getDecisionApi).mockResolvedValue(null)
    renderDocument()

    expect(await screen.findByRole('heading', { name: '문서를 찾을 수 없어요' })).toBeTruthy()
    expect(screen.getByText(/결정 문서 탭에서 다시 골라/)).toBeTruthy()
  })

  it('마크다운으로 복사하고 사용 정보를 남긴다', async () => {
    const user = userEvent.setup()
    vi.mocked(writeClipboardTextApi).mockResolvedValue()
    renderDocument()

    await screen.findByText('제안 김팀장')
    await user.click(screen.getByRole('button', { name: '복사' }))

    const [[{ text }]] = vi.mocked(writeClipboardTextApi).mock.calls
    expect(text).toContain('## 가격 정책을 월 구독으로 확정')
    expect(text).toContain('- [ ] 요금 페이지 수정 (화자 2, 다음 주 금요일)')
    expect(trackApi).toHaveBeenCalledWith({
      name: 'decision_copied',
      props: { decisionId: DECISION_ID }
    })
    expect(screen.getByRole('button', { name: '복사했습니다' })).toBeTruthy()
  })

  it('다시 추출은 한 번 더 확인한 뒤 요청하고 회의 상세로 옮긴다', async () => {
    const user = userEvent.setup()
    vi.mocked(extractDecisionsApi).mockResolvedValue()
    renderDocument()

    await user.click(await screen.findByRole('button', { name: '더보기' }))
    await user.click(screen.getByRole('button', { name: '이 회의 다시 추출' }))

    expect(screen.getByRole('alert').textContent).toContain(
      '이 회의의 결정 문서 2개를 모두 새로 만듭니다'
    )
    expect(extractDecisionsApi).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: '다시 추출' }))

    expect(extractDecisionsApi).toHaveBeenCalledWith({ meetingId: MEETING_ID })
    expect(await screen.findByText(MEETING_DETAIL_MARKER)).toBeTruthy()
  })
})

describe('DecisionDocumentSection 원문 패널', () => {
  it('근거 구간과 겹치는 발화만 강조하고 맞닿은 이웃 발화는 두지 않는다', async () => {
    renderDocument()

    const panel = await screen.findByRole('region', { name: '회의록' })
    const rowOf = async (text: string) => (await within(panel).findByText(text)).closest('li')

    expect((await rowOf('월 구독으로 가죠'))?.getAttribute('data-highlighted')).toBe('true')
    expect((await rowOf('좋습니다'))?.getAttribute('data-highlighted')).toBe('true')
    expect((await rowOf('회의를 시작하겠습니다'))?.getAttribute('data-highlighted')).toBe('false')
    expect((await rowOf('다음 안건입니다'))?.getAttribute('data-highlighted')).toBe('false')
  })

  it('근거 칩을 누르면 원문 패널을 그 구간으로 스크롤한다', async () => {
    const user = userEvent.setup()
    const scrollTo = vi.fn()
    vi.spyOn(HTMLElement.prototype, 'scrollTo').mockImplementation(scrollTo)
    renderDocument()

    await screen.findByText('월 구독으로 가죠')
    scrollTo.mockClear()
    await user.click(screen.getByRole('button', { name: '원문 00:01:00–00:01:15 구간으로 이동' }))

    expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ behavior: 'smooth' }))
  })

  it('원문 패널에서 화자 이름을 바꾸면 문서의 사람 필드도 바로 바뀐다', async () => {
    const user = userEvent.setup()
    vi.mocked(renameSpeakerApi).mockResolvedValue(
      detailOf([speakerOf(), speakerOf({ label: 'SPEAKER_01', displayName: '이과장' })])
    )
    renderDocument()

    await user.click(await screen.findByRole('button', { name: '화자 2 이름 수정' }))
    const editor = screen.getByLabelText('화자 2 이름')
    await user.clear(editor)
    await user.type(editor, '이과장{Enter}')

    const article = screen.getByRole('article', { name: '결정 문서' })
    expect(await within(article).findByRole('cell', { name: '이과장' })).toBeTruthy()
    expect(within(article).getByText('김팀장, 이과장')).toBeTruthy()
  })
})
