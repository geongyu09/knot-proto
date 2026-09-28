// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import type { SummaryProgressEvent } from '@shared/ipc'
import type { LlmStatus, Meeting, MeetingDetail, Utterance } from '@shared/types'

vi.mock('@renderer/shared/api/meetings', () => ({
  getMeetingApi: vi.fn(),
  renameMeetingApi: vi.fn(),
  deleteMeetingApi: vi.fn()
}))
vi.mock('@renderer/shared/api/utterances', () => ({
  updateUtteranceTextApi: vi.fn(),
  reassignUtteranceApi: vi.fn()
}))
vi.mock('@renderer/shared/api/speakers', () => ({
  renameSpeakerApi: vi.fn(),
  mergeSpeakersApi: vi.fn()
}))
vi.mock('@renderer/shared/api/clipboard', () => ({ writeClipboardTextApi: vi.fn() }))
vi.mock('@renderer/shared/api/summary', () => ({ createSummaryApi: vi.fn() }))
vi.mock('@renderer/shared/api/llm', () => ({
  getLlmStatusApi: vi.fn(),
  setLlmProviderApi: vi.fn(),
  setClaudeApiKeyApi: vi.fn(),
  checkLlmApi: vi.fn()
}))
vi.mock('@renderer/shared/api/events', () => ({
  onPipelineProgress: vi.fn(() => () => {}),
  onSummaryProgress: vi.fn(() => () => {}),
  onRefineProgress: vi.fn(() => () => {})
}))

import { writeClipboardTextApi } from '@renderer/shared/api/clipboard'
import { onSummaryProgress } from '@renderer/shared/api/events'
import { getLlmStatusApi } from '@renderer/shared/api/llm'
import { getMeetingApi } from '@renderer/shared/api/meetings'
import { createSummaryApi } from '@renderer/shared/api/summary'
import SummarySection from './index'

const MEETING_ID = 'meeting-1'

const meetingOf = (overrides: Partial<Meeting> = {}): Meeting => ({
  id: MEETING_ID,
  title: '2026-08-26 회의',
  createdAt: new Date(2026, 7, 26, 15, 12).getTime(),
  durationSec: 125,
  status: 'done',
  hasAudio: false,
  decisionState: 'none',
  decisionCount: 0,
  ...overrides
})

const utteranceOf = (): Utterance => ({
  id: 'utterance-1',
  meetingId: MEETING_ID,
  ord: 0,
  speakerLabel: 'speaker_00',
  startSec: 0,
  endSec: 3,
  text: '회의를 시작하겠습니다',
  originalText: null
})

const detailOf = (overrides: Partial<MeetingDetail> = {}): MeetingDetail => ({
  meeting: meetingOf(),
  utterances: [utteranceOf()],
  speakers: [{ meetingId: MEETING_ID, label: 'speaker_00', displayName: null }],
  refineResult: null,
  ...overrides
})

const llmStatusOf = (overrides: Partial<LlmStatus> = {}): LlmStatus => ({
  provider: 'local',
  isLocalModelReady: true,
  apiKeys: {
    anthropic: { isSaved: false, tail: null },
    openai: { isSaved: false, tail: null }
  },
  openaiModel: 'gpt-6-sol',
  claudeCliPath: null,
  claudeCliVersion: null,
  ...overrides
})

interface RenderSectionParams {
  detail: MeetingDetail | null
  llmStatus?: LlmStatus
}

const renderSection = async (
  detail: MeetingDetail | null,
  { llmStatus = llmStatusOf() }: Partial<RenderSectionParams> = {}
) => {
  vi.mocked(getMeetingApi).mockResolvedValue(detail)
  vi.mocked(getLlmStatusApi).mockResolvedValue(llmStatus)

  await act(async () => {
    render(
      <MemoryRouter>
        <SummarySection meetingId={MEETING_ID} />
      </MemoryRouter>
    )
  })
}

/** main이 보내는 요약 진행 이벤트를 흉내 낸다 */
const emitSummaryProgress = async (event: SummaryProgressEvent) => {
  const listener = vi.mocked(onSummaryProgress).mock.calls.at(-1)?.[0]

  await act(async () => {
    listener?.(event)
  })
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('SummarySection', () => {
  it('요약이 없으면 안내와 함께 요약 만들기 버튼을 보여 준다', async () => {
    await renderSection(detailOf())

    expect(screen.getByText(/아직 요약이 없습니다/)).toBeTruthy()
    expect(screen.getByRole('button', { name: '요약 만들기' })).toBeTruthy()
  })

  it('저장된 요약이 있으면 본문과 다시 요약 버튼을 보여 준다', async () => {
    await renderSection(detailOf({ meeting: meetingOf({ summary: '## 핵심 요약\n- 배포 연기' }) }))

    expect(screen.getByText(/배포 연기/)).toBeTruthy()
    expect(screen.getByRole('button', { name: '다시 요약' })).toBeTruthy()
  })

  it('회의록이 아직 없으면(처리 중) 아무것도 그리지 않는다', async () => {
    await renderSection(detailOf({ meeting: meetingOf({ status: 'processing' }) }))

    expect(screen.queryByRole('button', { name: '요약 만들기' })).toBeNull()
  })

  it('요약 모델이 없으면 버튼을 막고 설정으로 가는 링크를 보여 준다', async () => {
    await renderSection(detailOf(), { llmStatus: llmStatusOf({ isLocalModelReady: false }) })

    expect(screen.getByRole('button', { name: '요약 만들기' }).hasAttribute('disabled')).toBe(true)
    expect(screen.getByText(/로컬 요약 모델 파일이 설치되어 있지 않습니다/)).toBeTruthy()
    expect(screen.getByRole('link', { name: '설정에서 준비하기' }).getAttribute('href')).toBe(
      '/settings'
    )
  })

  it('Claude API를 골랐는데 키가 없으면 키 안내로 막고, 키가 있으면 로컬 모델 없이도 요약할 수 있다', async () => {
    await renderSection(detailOf(), {
      llmStatus: llmStatusOf({ provider: 'claude-api', isLocalModelReady: false })
    })

    expect(screen.getByRole('button', { name: '요약 만들기' }).hasAttribute('disabled')).toBe(true)
    expect(screen.getByText(/Claude API 키가 저장되어 있지 않습니다/)).toBeTruthy()

    cleanup()
    await renderSection(detailOf(), {
      llmStatus: llmStatusOf({
        provider: 'claude-api',
        isLocalModelReady: false,
        apiKeys: {
          anthropic: { isSaved: true, tail: 'wxyz' },
          openai: { isSaved: false, tail: null }
        }
      })
    })

    expect(screen.getByRole('button', { name: '요약 만들기' }).hasAttribute('disabled')).toBe(false)
    expect(screen.getByText(/회의록을 Claude API로 요약하며/)).toBeTruthy()
  })

  it('발화가 하나도 없으면 요약 버튼을 막는다', async () => {
    await renderSection(detailOf({ utterances: [] }))

    expect(screen.getByRole('button', { name: '요약 만들기' }).hasAttribute('disabled')).toBe(true)
    expect(screen.getByText('요약할 발화가 없습니다')).toBeTruthy()
  })

  it('버튼을 누르면 요약을 요청하고 진행 상태를 보여 준다', async () => {
    await renderSection(detailOf())

    await userEvent.click(screen.getByRole('button', { name: '요약 만들기' }))

    expect(vi.mocked(createSummaryApi)).toHaveBeenCalledWith({ meetingId: MEETING_ID })
    expect(screen.getByRole('progressbar', { name: '요약 진행률' })).toBeTruthy()
  })

  it('구간을 합치는 단계로 넘어가면 안내 문구가 바뀐다', async () => {
    await renderSection(detailOf())
    await userEvent.click(screen.getByRole('button', { name: '요약 만들기' }))

    await emitSummaryProgress({ meetingId: MEETING_ID, stage: 'reduce', percent: 80 })

    expect(screen.getByText(/하나로 정리하는 중/)).toBeTruthy()
  })

  it('완료 이벤트의 요약 본문을 그대로 보여 준다', async () => {
    await renderSection(detailOf())
    await userEvent.click(screen.getByRole('button', { name: '요약 만들기' }))

    await emitSummaryProgress({
      meetingId: MEETING_ID,
      stage: 'done',
      percent: 100,
      summary: '## 핵심 요약\n- 결제 이슈로 배포 연기'
    })

    expect(screen.getByText(/결제 이슈로 배포 연기/)).toBeTruthy()
    expect(screen.queryByRole('progressbar')).toBeNull()
  })

  it('다른 회의의 진행 이벤트는 무시한다', async () => {
    await renderSection(detailOf())
    await userEvent.click(screen.getByRole('button', { name: '요약 만들기' }))

    await emitSummaryProgress({
      meetingId: 'meeting-2',
      stage: 'done',
      percent: 100,
      summary: '남의 회의 요약'
    })

    expect(screen.queryByText('남의 회의 요약')).toBeNull()
    expect(screen.getByRole('progressbar', { name: '요약 진행률' })).toBeTruthy()
  })

  it('실패하면 한국어 안내를 보여 주고 다시 시도할 수 있다', async () => {
    await renderSection(detailOf())
    await userEvent.click(screen.getByRole('button', { name: '요약 만들기' }))

    await emitSummaryProgress({
      meetingId: MEETING_ID,
      stage: 'error',
      percent: 0,
      errorMessage: '요약 모델이 준비되지 않았습니다'
    })

    expect(screen.getByText('요약 모델이 준비되지 않았습니다')).toBeTruthy()
    expect(screen.getByRole('button', { name: '요약 만들기' }).hasAttribute('disabled')).toBe(false)
  })

  it('제목을 누르면 요약 본문과 버튼을 접고 다시 누르면 펼친다', async () => {
    await renderSection(detailOf({ meeting: meetingOf({ summary: '## 핵심 요약\n- 배포 연기' }) }))
    // 헤더에 복사 버튼도 있어 접기 버튼은 펼침 상태로 찾는다
    const toggle = screen.getByRole('button', { expanded: true })

    expect(toggle.getAttribute('aria-expanded')).toBe('true')

    await userEvent.click(toggle)

    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByText(/배포 연기/)).toBeNull()
    expect(screen.queryByRole('button', { name: '다시 요약' })).toBeNull()

    await userEvent.click(toggle)

    expect(screen.getByText(/배포 연기/)).toBeTruthy()
    expect(screen.getByRole('button', { name: '다시 요약' })).toBeTruthy()
  })

  it('접어 둔 채 요약이 돌면 캡션에 진행률을 보여 준다', async () => {
    await renderSection(detailOf())
    await userEvent.click(screen.getByRole('button', { name: '요약 만들기' }))
    await userEvent.click(screen.getByRole('button', { expanded: true }))

    await emitSummaryProgress({ meetingId: MEETING_ID, stage: 'reduce', percent: 80 })

    expect(screen.getByText('요약 중 80%')).toBeTruthy()
    expect(screen.queryByRole('progressbar')).toBeNull()
  })

  it('요약을 클립보드에 복사한다', async () => {
    await renderSection(detailOf({ meeting: meetingOf({ summary: '## 핵심 요약\n- 배포 연기' }) }))

    await userEvent.click(screen.getByRole('button', { name: '요약 복사' }))

    expect(vi.mocked(writeClipboardTextApi)).toHaveBeenCalledWith({
      text: '## 핵심 요약\n- 배포 연기'
    })
    expect(screen.getByRole('button', { name: '복사됨' })).toBeTruthy()
  })

  it('요약이 있으면 제목 아래 공급자를 적고 헤더에 복사 버튼을 둔다', async () => {
    await renderSection(
      detailOf({ meeting: meetingOf({ summary: '## 핵심 요약\n- 배포 연기' }) }),
      {
        llmStatus: llmStatusOf({
          provider: 'claude-api',
          apiKeys: {
            anthropic: { isSaved: true, tail: 'wxyz' },
            openai: { isSaved: false, tail: null }
          }
        })
      }
    )
    const toggle = screen.getByRole('button', { expanded: true })
    const copyButton = screen.getByRole('button', { name: '요약 복사' })
    const body = screen.getByText(/배포 연기/)

    expect(toggle.textContent).toContain('Claude API')
    expect(
      toggle.compareDocumentPosition(copyButton) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
    expect(copyButton.compareDocumentPosition(body) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})
