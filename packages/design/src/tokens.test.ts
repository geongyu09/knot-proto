import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// 패키지 본체는 fs를 쓰지 않는다. 파일 자체를 검사하는 이 테스트만 Node에서 읽는다
const readSource = (name: string) => readFileSync(new URL(name, import.meta.url), 'utf8')
const hasSource = (name: string) => existsSync(new URL(name, import.meta.url))

const baseCss = readSource('./base.css')
const fontsCss = readSource('./fonts.css')

/** 두 앱의 공통 컴포넌트가 기대는 토큰. 이름이 바뀌면 한쪽 화면이 조용히 색을 잃는다 */
const REQUIRED_TOKENS = [
  '--color-bg',
  '--color-sidebar',
  '--color-surface',
  '--color-surface-hover',
  '--color-border',
  '--color-border-strong',
  '--color-divider',
  '--color-disabled',
  '--color-text',
  '--color-text-muted',
  '--color-text-inverse',
  '--color-accent',
  '--color-accent-soft',
  '--color-danger',
  '--color-danger-soft',
  '--color-success',
  '--color-success-soft',
  '--color-thumb',
  '--color-disabled-text',
  '--color-speaker-1',
  '--color-speaker-4',
  '--color-speaker-8',
  '--space-1',
  '--space-6',
  '--radius-sm',
  '--radius-md',
  '--radius-lg',
  '--radius-full',
  '--font-sans',
  '--font-mono'
]

const fontUrlsOf = (css: string) => [...css.matchAll(/url\('([^']+)'\)/g)].map((match) => match[1])

describe('디자인 토큰', () => {
  it.each(REQUIRED_TOKENS)('%s를 정의한다', (token) => {
    expect(baseCss).toContain(`${token}:`)
  })

  it('다크 모드 블록이 없다 (다크 모드는 없다 — 2026-09-28 사용자 결정, SKILL.md 1절 "비주얼 디자인")', () => {
    expect(baseCss).not.toContain('prefers-color-scheme: dark')
    expect(baseCss).not.toContain('data-theme')
  })
})

describe('동봉 글꼴', () => {
  it('fonts.css가 가리키는 파일이 모두 있다', () => {
    const urls = fontUrlsOf(fontsCss)

    expect(urls.length).toBeGreaterThan(0)
    for (const url of urls) expect(hasSource(url), url).toBe(true)
  })

  it('글꼴 폴더마다 OFL.txt가 있다', () => {
    const folders = new Set(
      fontUrlsOf(fontsCss).map((url) => url.split('/').slice(0, -1).join('/'))
    )

    for (const folder of folders) expect(hasSource(`${folder}/OFL.txt`), folder).toBe(true)
  })
})
