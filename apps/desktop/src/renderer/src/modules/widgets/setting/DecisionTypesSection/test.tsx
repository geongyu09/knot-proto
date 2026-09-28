// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('@renderer/shared/api/decisionTypes', () => ({
  getDecisionTypesApi: vi.fn(),
  updateDecisionTypesApi: vi.fn()
}))

import { getDecisionTypesApi, updateDecisionTypesApi } from '@renderer/shared/api/decisionTypes'
import DecisionTypesSection from './index'

const TYPES = [
  { id: 'type-a', name: '제품', description: '기능 범위' },
  { id: 'type-b', name: '일정', description: '' }
]

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('DecisionTypesSection', () => {
  it('타입을 추가·이동해 저장하면 새 타입은 빈 id로 보낸다', async () => {
    const user = userEvent.setup()
    vi.mocked(getDecisionTypesApi).mockResolvedValue(TYPES)
    vi.mocked(updateDecisionTypesApi).mockImplementation(async ({ types }) =>
      types.map((type, index) => ({ ...type, id: type.id || `new-${index}` }))
    )
    render(<DecisionTypesSection />)

    expect(await screen.findByDisplayValue('제품')).toBeTruthy()
    expect(screen.getByText(/이미 만든 문서는 다시 분류되지 않습니다/)).toBeTruthy()
    expect((screen.getByRole('button', { name: '저장' }) as HTMLButtonElement).disabled).toBe(true)

    await user.click(screen.getByRole('button', { name: '타입 추가' }))
    await user.type(screen.getByRole('textbox', { name: '3번째 타입 이름' }), '보안')
    await user.click(screen.getByRole('button', { name: '2번째 타입 위로' }))
    await user.click(screen.getByRole('button', { name: '저장' }))

    expect(updateDecisionTypesApi).toHaveBeenCalledWith({
      types: [
        { id: 'type-b', name: '일정', description: '' },
        { id: 'type-a', name: '제품', description: '기능 범위' },
        { id: '', name: '보안', description: '' }
      ]
    })
    expect(await screen.findByText('결정 타입 3개를 저장했습니다')).toBeTruthy()
  })

  it('삭제는 한 번 더 확인한 뒤에만 행을 지운다', async () => {
    const user = userEvent.setup()
    vi.mocked(getDecisionTypesApi).mockResolvedValue(TYPES)
    render(<DecisionTypesSection />)

    await user.click(await screen.findByRole('button', { name: '1번째 타입 삭제' }))
    expect(screen.getByRole('alert').textContent).toContain('미분류로 보입니다')
    expect(screen.getByDisplayValue('제품')).toBeTruthy()

    await user.click(screen.getByRole('button', { name: '삭제' }))

    expect(screen.queryByDisplayValue('제품')).toBeNull()
    expect(screen.getByText('저장하지 않은 변경이 있습니다')).toBeTruthy()
  })

  it('main 검증 오류를 그대로 보여 준다', async () => {
    const user = userEvent.setup()
    vi.mocked(getDecisionTypesApi).mockResolvedValue(TYPES)
    vi.mocked(updateDecisionTypesApi).mockRejectedValue(
      new Error('같은 이름의 결정 타입이 있습니다: 제품')
    )
    render(<DecisionTypesSection />)

    const name = await screen.findByRole('textbox', { name: '2번째 타입 이름' })
    await user.clear(name)
    await user.type(name, '제품')
    await user.click(screen.getByRole('button', { name: '저장' }))

    expect(await screen.findByText('같은 이름의 결정 타입이 있습니다: 제품')).toBeTruthy()
  })
})
