// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import type { PipelineProgressEvent } from '@shared/ipc'
import type { LlmStatus, Meeting, MeetingDetail, Speaker, Utterance } from '@shared/types'

vi.mock('@renderer/shared/api/meetings', () => ({
  getMeetingApi: vi.fn(),
  renameMeetingApi: vi.fn(),
  deleteMeetingApi: vi.fn(),
  reprocessMeetingApi: vi.fn(),
  exportMeetingAudioApi: vi.fn()
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
vi.mock('@renderer/shared/api/events', () => ({
  onPipelineProgress: vi.fn(() => () => {}),
  onRefineProgress: vi.fn(() => () => {})
}))
vi.mock('@renderer/shared/api/refine', () => ({ runRefineApi: vi.fn() }))
vi.mock('@renderer/shared/api/llm', () => ({ getLlmStatusApi: vi.fn() }))
vi.mock('@renderer/shared/api/glossary', () => ({ getGlossaryApi: vi.fn() }))

import { writeClipboardTextApi } from '@renderer/shared/api/clipboard'
import { onPipelineProgress, onRefineProgress } from '@renderer/shared/api/events'
import { getGlossaryApi } from '@renderer/shared/api/glossary'
import { getLlmStatusApi } from '@renderer/shared/api/llm'
import {
  deleteMeetingApi,
  exportMeetingAudioApi,
  getMeetingApi,
  renameMeetingApi,
  reprocessMeetingApi
} from '@renderer/shared/api/meetings'
import { mergeSpeakersApi, renameSpeakerApi } from '@renderer/shared/api/speakers'
import {
  reassignUtteranceApi,
  revertUtteranceRefineApi,
  updateUtteranceTextApi
} from '@renderer/shared/api/utterances'
import TranscriptSection from './index'

const MEETING_ID = 'meeting-1'
const HOME_MARKER = '회의 목록 화면'

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

const utteranceOf = (overrides: Partial<Utterance> = {}): Utterance => ({
  id: 'utterance-1',
  meetingId: MEETING_ID,
  ord: 0,
  speakerLabel: 'speaker_00',
  startSec: 0,
  endSec: 3,
  text: '회의를 시작하겠습니다',
  originalText: null,
  ...overrides
})

const secondUtterance = (overrides: Partial<Utterance> = {}) =>
  utteranceOf({
    id: 'utterance-2',
    ord: 1,
    speakerLabel: 'speaker_01',
    startSec: 65,
    endSec: 70,
    text: '네 좋습니다',
    ...overrides
  })

const speakerOf = (overrides: Partial<Speaker> = {}): Speaker => ({
  meetingId: MEETING_ID,
  label: 'speaker_00',
  displayName: null,
  ...overrides
})

const detailOf = (overrides: Partial<MeetingDetail> = {}): MeetingDetail => ({
  meeting: meetingOf(),
  utterances: [utteranceOf()],
  speakers: [speakerOf()],
  refineResult: null,
  ...overrides
})

/** 이름을 지정한 화자 1명 + 지정하지 않은 화자 1명 */
const twoSpeakerDetail = () =>
  detailOf({
    utterances: [utteranceOf(), secondUtterance()],
    speakers: [speakerOf({ displayName: '김팀장' }), speakerOf({ label: 'speaker_01' })]
  })

const renderSection = () =>
  render(
    <MemoryRouter initialEntries={[`/meetings/${MEETING_ID}`]}>
      <Routes>
        <Route path="/" element={<p>{HOME_MARKER}</p>} />
        <Route path="/meetings/:meetingId" element={<TranscriptSection meetingId={MEETING_ID} />} />
      </Routes>
    </MemoryRouter>
  )

const LLM_STATUS: LlmStatus = {
  provider: 'local',
  isLocalModelReady: true,
  apiKeys: {
    anthropic: { isSaved: false, tail: null },
    openai: { isSaved: false, tail: null }
  },
  openaiModel: 'gpt-6-sol',
  claudeCliPath: null,
  claudeCliVersion: null
}

// 레일의 교정 패널이 스스로 읽는 값. 이 테스트의 관심사가 아니라 준비된 상태로 고정한다
beforeEach(() => {
  vi.mocked(getLlmStatusApi).mockResolvedValue(LLM_STATUS)
  vi.mocked(getGlossaryApi).mockResolvedValue({ teamDescription: '', terms: [] })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.mocked(onPipelineProgress).mockReturnValue(() => {})
})

describe('TranscriptSection 자동 교정', () => {
  it('교정 잡이 끝나면 상세를 다시 읽어 바뀐 본문과 고친 용어를 보여준다', async () => {
    const pair = { utteranceId: 'utterance-1', from: '기터브', to: 'GitHub', similarity: 0.8 }
    vi.mocked(getMeetingApi)
      .mockResolvedValueOnce(detailOf({ utterances: [utteranceOf({ text: '기터브에 올립니다' })] }))
      .mockResolvedValueOnce(
        detailOf({
          utterances: [utteranceOf({ text: 'GitHub에 올립니다' })],
          refineResult: { refinedAt: 1, appliedPairs: [pair] }
        })
      )
    renderSection()
    expect(await screen.findByText('기터브에 올립니다')).toBeTruthy()

    // useMeeting과 교정 패널이 각각 구독하므로 main처럼 모든 구독자에게 보낸다
    await act(async () => {
      vi.mocked(onRefineProgress).mock.calls.forEach(([listener]) =>
        listener({ meetingId: MEETING_ID, stage: 'done', percent: 100 })
      )
    })

    expect(await screen.findByText('GitHub에 올립니다')).toBeTruthy()
    expect(screen.getByRole('list', { name: '고친 용어' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /수락/ })).toBeNull()
  })

  it('교정된 발화는 교정 전 원문을 펼쳐 보고 원문으로 되돌릴 수 있다', async () => {
    const user = userEvent.setup()
    const pair = { utteranceId: 'utterance-1', from: '통지를', to: '정지를', similarity: 0.75 }
    vi.mocked(getMeetingApi).mockResolvedValue(
      detailOf({
        utterances: [
          utteranceOf({ text: '차 정지를 해야 되나', originalText: '차 통지를 해야 되나' }),
          secondUtterance()
        ],
        refineResult: { refinedAt: 1, appliedPairs: [pair] }
      })
    )
    vi.mocked(revertUtteranceRefineApi).mockResolvedValue(
      detailOf({
        utterances: [utteranceOf({ text: '차 통지를 해야 되나' }), secondUtterance()],
        refineResult: { refinedAt: 1, appliedPairs: [] }
      })
    )
    renderSection()

    // 교정되지 않은 발화에는 표시가 없다
    const toggles = await screen.findAllByRole('button', { name: '교정 전 원문 보기' })
    expect(toggles).toHaveLength(1)
    expect(screen.queryByText('차 통지를 해야 되나')).toBeNull()

    await user.click(toggles[0])
    expect(screen.getByText('차 통지를 해야 되나')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: '원문으로 되돌리기' }))

    expect(revertUtteranceRefineApi).toHaveBeenCalledWith({
      meetingId: MEETING_ID,
      utteranceId: 'utterance-1'
    })
    expect(await screen.findByText('차 통지를 해야 되나')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /교정 전 원문/ })).toBeNull()
  })

  it('처리 중인 회의에는 교정 패널을 그리지 않는다', async () => {
    vi.mocked(getMeetingApi).mockResolvedValue(
      detailOf({ meeting: meetingOf({ status: 'processing' }), utterances: [], speakers: [] })
    )
    renderSection()

    expect(await screen.findByText(/회의록을 만들고 있습니다/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: '다시 교정' })).toBeNull()
  })
})

describe('TranscriptSection 조회', () => {
  it('완료된 회의의 발화를 시각·화자 이름과 함께 보여준다', async () => {
    vi.mocked(getMeetingApi).mockResolvedValue(twoSpeakerDetail())
    renderSection()

    expect(await screen.findByText('회의를 시작하겠습니다')).toBeTruthy()
    expect(screen.getByText('00:00:00')).toBeTruthy()
    expect(screen.getByText('00:01:05')).toBeTruthy()

    const speakerSelects = screen.getAllByLabelText('화자 변경') as HTMLSelectElement[]
    expect(speakerSelects[0].value).toBe('speaker_00')
    // 이름을 지정하지 않은 화자는 등장 순서대로 번호를 받는다
    expect(screen.getByRole('button', { name: '화자 2 이름 수정' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '김팀장 이름 수정' })).toBeTruthy()
  })

  it('처리 중인 회의는 안내와 진행률을 보여준다', async () => {
    const listeners: ((event: PipelineProgressEvent) => void)[] = []
    vi.mocked(onPipelineProgress).mockImplementation((listener) => {
      listeners.push(listener)

      return () => {}
    })
    vi.mocked(getMeetingApi).mockResolvedValue(
      detailOf({ meeting: meetingOf({ status: 'processing' }), utterances: [], speakers: [] })
    )
    renderSection()

    expect(await screen.findByText(/회의록을 만들고 있습니다/)).toBeTruthy()
    expect(screen.getByText('차례를 기다리는 중')).toBeTruthy()

    await act(async () => {
      listeners.forEach((listener) =>
        listener({ meetingId: MEETING_ID, stage: 'diarize', percent: 50 })
      )
    })

    expect(screen.getByText('화자 구분 중')).toBeTruthy()
    // 화자 분리 가중치 0.6 × 50% = 30%
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('30')
  })

  it('처리에 실패한 회의는 저장된 오류 메시지를 보여준다', async () => {
    vi.mocked(getMeetingApi).mockResolvedValue(
      detailOf({
        meeting: meetingOf({ status: 'error', errorMessage: '모델이 준비되지 않았습니다' }),
        utterances: [],
        speakers: []
      })
    )
    renderSection()

    expect(await screen.findByText('모델이 준비되지 않았습니다')).toBeTruthy()
  })

  it('없는 회의를 열면 찾을 수 없다고 알린다', async () => {
    vi.mocked(getMeetingApi).mockResolvedValue(null)
    renderSection()

    expect(await screen.findByText('회의를 찾을 수 없습니다')).toBeTruthy()
  })

  it('발화가 하나도 없으면 인식된 발화가 없다고 알린다', async () => {
    vi.mocked(getMeetingApi).mockResolvedValue(detailOf({ utterances: [], speakers: [] }))
    renderSection()

    expect(await screen.findByText('인식된 발화가 없습니다')).toBeTruthy()
  })

  it('처리 완료 이벤트를 받으면 회의록을 다시 불러온다', async () => {
    const listeners: ((event: PipelineProgressEvent) => void)[] = []
    vi.mocked(onPipelineProgress).mockImplementation((listener) => {
      listeners.push(listener)

      return () => {}
    })
    vi.mocked(getMeetingApi)
      .mockResolvedValueOnce(
        detailOf({ meeting: meetingOf({ status: 'processing' }), utterances: [], speakers: [] })
      )
      .mockResolvedValue(detailOf())

    renderSection()
    expect(await screen.findByText(/회의록을 만들고 있습니다/)).toBeTruthy()

    await act(async () => {
      listeners.forEach((listener) =>
        listener({ meetingId: MEETING_ID, stage: 'done', percent: 100 })
      )
    })

    expect(await screen.findByText('회의를 시작하겠습니다')).toBeTruthy()
  })
})

describe('TranscriptSection 편집', () => {
  it('발화 텍스트를 고치고 포커스를 옮기면 저장한다', async () => {
    const user = userEvent.setup()
    vi.mocked(getMeetingApi).mockResolvedValue(detailOf())
    vi.mocked(updateUtteranceTextApi).mockResolvedValue(
      detailOf({ utterances: [utteranceOf({ text: '회의를 시작합니다' })] })
    )
    renderSection()

    await user.click(await screen.findByText('회의를 시작하겠습니다'))
    const editor = screen.getByLabelText('발화 내용')
    await user.clear(editor)
    await user.type(editor, '회의를 시작합니다')
    await user.tab()

    expect(vi.mocked(updateUtteranceTextApi).mock.calls[0][0]).toEqual({
      meetingId: MEETING_ID,
      utteranceId: 'utterance-1',
      text: '회의를 시작합니다'
    })
    expect(await screen.findByText('회의를 시작합니다')).toBeTruthy()
  })

  it('발화를 비운 채 포커스를 옮기면 저장하지 않는다', async () => {
    const user = userEvent.setup()
    vi.mocked(getMeetingApi).mockResolvedValue(detailOf())
    renderSection()

    await user.click(await screen.findByText('회의를 시작하겠습니다'))
    await user.clear(screen.getByLabelText('발화 내용'))
    await user.tab()

    expect(updateUtteranceTextApi).not.toHaveBeenCalled()
    expect(screen.getByText('회의를 시작하겠습니다')).toBeTruthy()
  })

  it('편집 중 Escape를 누르면 고친 내용을 버린다', async () => {
    const user = userEvent.setup()
    vi.mocked(getMeetingApi).mockResolvedValue(detailOf())
    renderSection()

    await user.click(await screen.findByText('회의를 시작하겠습니다'))
    await user.type(screen.getByLabelText('발화 내용'), ' 다시{Escape}')

    expect(updateUtteranceTextApi).not.toHaveBeenCalled()
    expect(screen.getByText('회의를 시작하겠습니다')).toBeTruthy()
  })

  it('회의 제목을 고치면 저장한다', async () => {
    const user = userEvent.setup()
    vi.mocked(getMeetingApi).mockResolvedValue(detailOf())
    vi.mocked(renameMeetingApi).mockResolvedValue(
      detailOf({ meeting: meetingOf({ title: '배포 회고' }) })
    )
    renderSection()

    await user.click(await screen.findByRole('button', { name: '회의 제목 수정' }))
    const editor = screen.getByLabelText('회의 제목')
    await user.clear(editor)
    await user.type(editor, '배포 회고{Enter}')

    expect(renameMeetingApi).toHaveBeenCalledWith({ meetingId: MEETING_ID, title: '배포 회고' })
    expect(await screen.findByText('배포 회고')).toBeTruthy()
  })

  it('저장에 실패하면 안내를 보여준다', async () => {
    const user = userEvent.setup()
    vi.mocked(getMeetingApi).mockResolvedValue(detailOf())
    vi.mocked(renameMeetingApi).mockRejectedValue(new Error('회의를 찾을 수 없습니다'))
    renderSection()

    await user.click(await screen.findByRole('button', { name: '회의 제목 수정' }))
    const editor = screen.getByLabelText('회의 제목')
    await user.clear(editor)
    await user.type(editor, '배포 회고{Enter}')

    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(screen.getByText('회의를 찾을 수 없습니다')).toBeTruthy()
  })
})

describe('TranscriptSection 화자 관리', () => {
  it('화자 이름을 지정하면 전체에 반영한다', async () => {
    const user = userEvent.setup()
    vi.mocked(getMeetingApi).mockResolvedValue(twoSpeakerDetail())
    vi.mocked(renameSpeakerApi).mockResolvedValue(
      detailOf({
        utterances: [utteranceOf(), secondUtterance()],
        speakers: [
          speakerOf({ displayName: '김팀장' }),
          speakerOf({ label: 'speaker_01', displayName: '이과장' })
        ]
      })
    )
    renderSection()

    await user.click(await screen.findByRole('button', { name: '화자 2 이름 수정' }))
    const editor = screen.getByLabelText('화자 2 이름')
    await user.clear(editor)
    await user.type(editor, '이과장{Enter}')

    expect(renameSpeakerApi).toHaveBeenCalledWith({
      meetingId: MEETING_ID,
      label: 'speaker_01',
      displayName: '이과장'
    })
    expect(await screen.findByRole('button', { name: '이과장 이름 수정' })).toBeTruthy()
  })

  it('발화 하나의 화자를 다른 화자로 바꾼다', async () => {
    const user = userEvent.setup()
    vi.mocked(getMeetingApi).mockResolvedValue(twoSpeakerDetail())
    vi.mocked(reassignUtteranceApi).mockResolvedValue(twoSpeakerDetail())
    renderSection()

    const selects = (await screen.findAllByLabelText('화자 변경')) as HTMLSelectElement[]
    await user.selectOptions(selects[1], 'speaker_00')

    expect(reassignUtteranceApi).toHaveBeenCalledWith({
      meetingId: MEETING_ID,
      utteranceId: 'utterance-2',
      speakerLabel: 'speaker_00'
    })
  })

  it('화자를 합칠 때는 합칠 대상을 고르는 단계를 거친다', async () => {
    const user = userEvent.setup()
    vi.mocked(getMeetingApi).mockResolvedValue(twoSpeakerDetail())
    vi.mocked(mergeSpeakersApi).mockResolvedValue(
      detailOf({
        utterances: [utteranceOf(), secondUtterance({ speakerLabel: 'speaker_00' })],
        speakers: [speakerOf({ displayName: '김팀장' })]
      })
    )
    renderSection()

    await user.click(await screen.findByRole('button', { name: '화자 합치기' }))
    const mergeButtons = screen.getAllByRole('button', { name: '합치기' })
    await user.click(mergeButtons[1])

    expect(mergeSpeakersApi).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: '김팀장에 합치기' }))

    expect(mergeSpeakersApi).toHaveBeenCalledWith({
      meetingId: MEETING_ID,
      fromLabel: 'speaker_01',
      intoLabel: 'speaker_00'
    })
  })
})

describe('TranscriptSection 복사와 삭제', () => {
  it('회의록 전체를 플레인 텍스트로 복사한다', async () => {
    const user = userEvent.setup()
    vi.mocked(getMeetingApi).mockResolvedValue(twoSpeakerDetail())
    vi.mocked(writeClipboardTextApi).mockResolvedValue(undefined)
    renderSection()

    await user.click(await screen.findByRole('button', { name: '전체 복사' }))

    expect(writeClipboardTextApi).toHaveBeenCalledWith({
      text: '[00:00:00] 김팀장: 회의를 시작하겠습니다\n[00:01:05] 화자 2: 네 좋습니다'
    })
    expect(await screen.findByRole('button', { name: '복사했습니다' })).toBeTruthy()
  })

  it('마크다운으로 복사하면 화자를 굵게 표시한다', async () => {
    const user = userEvent.setup()
    vi.mocked(getMeetingApi).mockResolvedValue(twoSpeakerDetail())
    vi.mocked(writeClipboardTextApi).mockResolvedValue(undefined)
    renderSection()

    await user.click(await screen.findByRole('button', { name: '마크다운으로 복사' }))

    expect(writeClipboardTextApi).toHaveBeenCalledWith({
      text: '[00:00:00] **김팀장**: 회의를 시작하겠습니다\n[00:01:05] **화자 2**: 네 좋습니다'
    })
  })

  it('발화 하나만 복사해도 화자 번호가 그대로 유지된다', async () => {
    const user = userEvent.setup()
    vi.mocked(getMeetingApi).mockResolvedValue(twoSpeakerDetail())
    vi.mocked(writeClipboardTextApi).mockResolvedValue(undefined)
    renderSection()

    const copyButtons = await screen.findAllByRole('button', { name: '이 발화 복사' })
    await user.click(copyButtons[1])

    expect(writeClipboardTextApi).toHaveBeenCalledWith({
      text: '[00:01:05] 화자 2: 네 좋습니다'
    })
  })

  it('회의 삭제는 확인 단계를 거친 뒤 목록으로 돌아간다', async () => {
    const user = userEvent.setup()
    vi.mocked(getMeetingApi).mockResolvedValue(detailOf())
    vi.mocked(deleteMeetingApi).mockResolvedValue(undefined)
    renderSection()

    await user.click(await screen.findByRole('button', { name: '회의 더보기' }))
    await user.click(screen.getByRole('button', { name: '회의 삭제' }))
    expect(deleteMeetingApi).not.toHaveBeenCalled()
    expect(screen.getByText(/되돌릴 수 없습니다/)).toBeTruthy()

    await user.click(screen.getByRole('button', { name: '삭제' }))

    expect(deleteMeetingApi).toHaveBeenCalledWith({ meetingId: MEETING_ID })
    expect(await screen.findByText(HOME_MARKER)).toBeTruthy()
  })

  it('삭제 확인을 취소하면 아무 일도 일어나지 않는다', async () => {
    const user = userEvent.setup()
    vi.mocked(getMeetingApi).mockResolvedValue(detailOf())
    renderSection()

    await user.click(await screen.findByRole('button', { name: '회의 더보기' }))
    await user.click(screen.getByRole('button', { name: '회의 삭제' }))
    await user.click(screen.getByRole('button', { name: '취소' }))

    expect(deleteMeetingApi).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: '삭제' })).toBeNull()
    expect(screen.getByRole('button', { name: '회의 더보기' })).toBeTruthy()
  })
})

describe('TranscriptSection 레일 폭 조절', () => {
  afterEach(() => localStorage.clear())

  const findResizer = () => screen.findByRole('separator', { name: '오른쪽 패널 폭 조절' })

  it('키보드로 폭을 바꾸면 저장하고 다시 열어도 유지한다', async () => {
    vi.mocked(getMeetingApi).mockResolvedValue(detailOf())
    const user = userEvent.setup()
    const { unmount } = renderSection()

    const resizer = await findResizer()
    expect(resizer.getAttribute('aria-valuenow')).toBe('300')

    resizer.focus()
    await user.keyboard('{ArrowLeft}{ArrowLeft}')
    expect(resizer.getAttribute('aria-valuenow')).toBe('332')
    await user.keyboard('{ArrowRight}')
    expect(resizer.getAttribute('aria-valuenow')).toBe('316')

    unmount()
    renderSection()
    expect((await findResizer()).getAttribute('aria-valuenow')).toBe('316')
  })

  it('최소 폭 아래로 줄지 않고, 더블클릭하면 기본 폭으로 돌아간다', async () => {
    localStorage.setItem('meetingDetail.railWidthPx', '250')
    vi.mocked(getMeetingApi).mockResolvedValue(detailOf())
    const user = userEvent.setup()
    renderSection()

    const resizer = await findResizer()
    resizer.focus()
    await user.keyboard('{ArrowRight}')
    expect(resizer.getAttribute('aria-valuenow')).toBe('240')

    await user.dblClick(resizer)
    expect(resizer.getAttribute('aria-valuenow')).toBe('300')
  })
})

describe('TranscriptSection 원본 녹음', () => {
  const audioDetail = () =>
    detailOf({
      meeting: meetingOf({ hasAudio: true, speakerCount: 3 }),
      utterances: [utteranceOf(), secondUtterance()],
      speakers: [speakerOf(), speakerOf({ label: 'speaker_01' })]
    })

  it('원본을 보관하지 않은 회의는 재생 대신 설정 안내를 보여준다', async () => {
    vi.mocked(getMeetingApi).mockResolvedValue(detailOf())
    renderSection()

    expect(await screen.findByText(/원본 녹음을 보관하지 않아/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: '다시 인식' })).toBeNull()
    expect(screen.queryByRole('button', { name: /부터 재생/ })).toBeNull()
  })

  it('발화 시각을 누르면 그 지점부터 재생한다', async () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
    const user = userEvent.setup()
    vi.mocked(getMeetingApi).mockResolvedValue(audioDetail())
    const { container } = renderSection()

    await user.click(await screen.findByRole('button', { name: '00:01:05부터 재생' }))

    const audio = container.querySelector('audio') as HTMLAudioElement
    expect(audio.getAttribute('src')).toBe(`meeting-audio://recording/${MEETING_ID}`)
    expect(audio.currentTime).toBe(65)
    expect(play).toHaveBeenCalled()
    play.mockRestore()
  })

  it('재생 버튼을 누르면 재생하고 일시정지 버튼으로 바뀐다', async () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function (
      this: HTMLMediaElement
    ) {
      this.dispatchEvent(new Event('play'))
      return Promise.resolve()
    })
    const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(function (
      this: HTMLMediaElement
    ) {
      this.dispatchEvent(new Event('pause'))
    })
    const user = userEvent.setup()
    vi.mocked(getMeetingApi).mockResolvedValue(audioDetail())
    renderSection()

    await user.click(await screen.findByRole('button', { name: '재생' }))
    expect(play).toHaveBeenCalled()
    expect(await screen.findByRole('button', { name: '일시정지' })).toBeTruthy()

    await user.click(screen.getByRole('button', { name: '일시정지' }))
    expect(pause).toHaveBeenCalled()
    expect(await screen.findByRole('button', { name: '재생' })).toBeTruthy()
    play.mockRestore()
    pause.mockRestore()
  })

  it('원본 녹음을 WAV로 저장한다', async () => {
    const user = userEvent.setup()
    vi.mocked(getMeetingApi).mockResolvedValue(audioDetail())
    vi.mocked(exportMeetingAudioApi).mockResolvedValue({ isSaved: true })
    renderSection()

    await user.click(await screen.findByRole('button', { name: 'WAV로 저장' }))

    expect(exportMeetingAudioApi).toHaveBeenCalledWith({ meetingId: MEETING_ID })
    expect(await screen.findByRole('button', { name: '저장했습니다' })).toBeTruthy()
  })

  it('다시 인식은 참석자 수를 고르는 확인 단계를 거친 뒤 처리 중으로 바뀐다', async () => {
    const user = userEvent.setup()
    vi.mocked(getMeetingApi).mockResolvedValue(audioDetail())
    vi.mocked(reprocessMeetingApi).mockResolvedValue(
      detailOf({
        meeting: meetingOf({ hasAudio: true, speakerCount: 4, status: 'processing' }),
        utterances: [],
        speakers: []
      })
    )
    renderSection()

    await user.click(await screen.findByRole('button', { name: '다시 인식' }))
    expect(reprocessMeetingApi).not.toHaveBeenCalled()
    expect(screen.getByText(/화자 이름, 직접 고친 내용, 교정 결과가 사라지고/)).toBeTruthy()

    const speakerCount = screen.getByLabelText('참석자 수') as HTMLInputElement
    expect(speakerCount.value).toBe('3')
    await user.click(screen.getByRole('button', { name: '참석자 수 늘리기' }))
    await user.click(screen.getByRole('button', { name: '다시 인식' }))

    expect(reprocessMeetingApi).toHaveBeenCalledWith({ meetingId: MEETING_ID, speakerCount: 4 })
    expect(await screen.findByText(/회의록을 만들고 있습니다/)).toBeTruthy()
  })

  it('다시 인식 확인에서 참석자 수를 비우면 자동(null)으로 요청한다', async () => {
    const user = userEvent.setup()
    vi.mocked(getMeetingApi).mockResolvedValue(audioDetail())
    vi.mocked(reprocessMeetingApi).mockResolvedValue(audioDetail())
    renderSection()

    await user.click(await screen.findByRole('button', { name: '다시 인식' }))
    await user.clear(screen.getByLabelText('참석자 수'))
    await user.click(screen.getByRole('button', { name: '다시 인식' }))

    expect(reprocessMeetingApi).toHaveBeenCalledWith({ meetingId: MEETING_ID, speakerCount: null })
  })

  it('실패한 회의는 저장된 참석자 수로 바로 다시 시도한다', async () => {
    const user = userEvent.setup()
    vi.mocked(getMeetingApi).mockResolvedValue(
      detailOf({
        meeting: meetingOf({
          status: 'error',
          errorMessage: '모델이 준비되지 않았습니다',
          hasAudio: true,
          speakerCount: 2
        }),
        utterances: [],
        speakers: []
      })
    )
    vi.mocked(reprocessMeetingApi).mockRejectedValue(new Error('이미 처리 중인 회의입니다'))
    renderSection()

    await user.click(await screen.findByRole('button', { name: '다시 시도' }))

    expect(reprocessMeetingApi).toHaveBeenCalledWith({ meetingId: MEETING_ID, speakerCount: 2 })
    expect(await screen.findByText('이미 처리 중인 회의입니다')).toBeTruthy()
  })

  it('원본이 없는 실패 회의에는 다시 시도 버튼이 없다', async () => {
    vi.mocked(getMeetingApi).mockResolvedValue(
      detailOf({
        meeting: meetingOf({
          status: 'error',
          errorMessage: '녹음이 너무 짧아 회의록을 만들지 못했습니다'
        }),
        utterances: [],
        speakers: []
      })
    )
    renderSection()

    expect(await screen.findByText(/녹음이 너무 짧아/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: '다시 시도' })).toBeNull()
  })
})
