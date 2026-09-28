import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

import { formatTimestamp } from '@meeting-stt/core/format'
import { SUMMARY_MODEL_ASSET } from '@meeting-stt/models/desktop'
import { DEFAULT_DECISION_TYPES } from '@shared/decisions'
import {
  API_CHUNK_BUDGET_CHARS,
  buildClaudeCliArgs,
  DEFAULT_OPENAI_MODEL_ID,
  parseClaudeCliOutput
} from '@shared/llm'
import { CHUNK_BUDGET_CHARS, SUMMARY_CTX_TOKENS } from '@shared/summary'
import type { LlmProvider } from '@shared/types'

import { extractDecisions } from '../src/main/decisions/extract'
import { buildDecisionLines, type DecisionSourceUtterance } from '../src/main/decisions/lines'
import { completeWithClaudeApi } from '../src/main/llm/claudeApi'
import { completeWithOpenaiApi } from '../src/main/llm/openaiApi'
import type { LlmClient, LlmCompleteParams } from '../src/main/llm/types'
import { buildLlamaArgs, extractAnswer } from '../src/main/summary/llama'
import type { DecisionLine } from '../src/main/types/decisions'
import { fail, info } from './log'
import { BIN_DIR, MODELS_DIR, OUTPUT_DIR } from './paths'
import { run } from './shell'

/**
 * 결정 추출 검증 스크립트 (references/roadmap.md "결정 문서 전환" D0).
 * 프롬프트·청크·검증은 앱과 같은 `src/main/decisions/*`를 쓴다 — 여기서 잰 품질이 앱 품질이다.
 *
 * 사용법:
 *   pnpm --filter meeting-stt exec tsx scripts/decisions.ts --meeting <회의 id> [--db <meetings.db>]
 *   pnpm --filter meeting-stt exec tsx scripts/decisions.ts --transcript <회의록.txt>
 *   공통: [--provider local|claude-cli|claude-api|openai-api]
 * - `--db` 기본값은 이 브랜치 개발 실행의 DB(`~/Library/Application Support/meeting-stt-team/meetings.db`), 읽기 전용으로 연다.
 * - `--transcript`는 앱의 "전체 복사"(일반 텍스트) 형식 `[hh:mm:ss] 화자: 텍스트`. 끝 시각은 다음 줄 시작으로 둔다.
 * - claude-api·openai-api는 환경 변수 `ANTHROPIC_API_KEY`·`OPENAI_API_KEY`를 읽는다.
 * - 로컬은 팬 소음을 피하려고 3스레드 + nice로 돈다.
 * 결과는 `fixtures/output/<이름>.decisions.<provider>.{json,md}` — md에 근거 발화 원문을 붙여 사람이 정답과 비교한다.
 */
const LLAMA_BIN = path.join(BIN_DIR, 'llama-cli')
const LOCAL_MODEL_CANDIDATES = [
  path.join(MODELS_DIR, SUMMARY_MODEL_ASSET.fileName),
  path.join(
    os.homedir(),
    'Library/Application Support/meeting-stt-team/models',
    SUMMARY_MODEL_ASSET.fileName
  )
]
const DEFAULT_DB = path.join(
  os.homedir(),
  'Library/Application Support/meeting-stt-team/meetings.db'
)
const CLAUDE_BIN = path.join(os.homedir(), '.local', 'bin', 'claude')
const LOCAL_THREADS = 3
const TRANSCRIPT_LINE = /^\[(\d{2}):(\d{2}):(\d{2})\] ([^:]+): (.*)$/
const SECONDS_PER_MINUTE = 60
const SECONDS_PER_HOUR = 3600
/** 회의록 텍스트의 마지막 줄은 끝 시각을 알 수 없어 시작 + 이 값으로 둔다 */
const LAST_LINE_SEC = 5
const PROVIDERS: LlmProvider[] = ['local', 'claude-cli', 'claude-api', 'openai-api']

const optionOf = (name: string) => {
  const args = process.argv.slice(2)
  const at = args.indexOf(name)
  return at < 0 ? undefined : args[at + 1]
}

const seconds = (startedAt: number) => ((performance.now() - startedAt) / 1000).toFixed(1)

const completeLocal = async ({
  system,
  prompt,
  maxTokens,
  label,
  workDir,
  temperature,
  grammar
}: LlmCompleteParams) => {
  const modelPath = LOCAL_MODEL_CANDIDATES.find((file) => existsSync(file))
  if (!modelPath) fail(`로컬 요약 모델이 없습니다: ${LOCAL_MODEL_CANDIDATES.join(', ')}`)

  const systemPromptPath = path.join(workDir, `${label}.system.txt`)
  const promptPath = path.join(workDir, `${label}.prompt.txt`)
  const outputPath = path.join(workDir, `${label}.out.txt`)
  const grammarPath = path.join(workDir, `${label}.gbnf`)
  await writeFile(systemPromptPath, system, 'utf8')
  await writeFile(promptPath, prompt, 'utf8')
  await writeFile(grammarPath, grammar ?? '', 'utf8')

  const { code, stderr } = await run({
    command: 'nice',
    args: [
      LLAMA_BIN,
      ...buildLlamaArgs({
        modelPath,
        systemPromptPath,
        promptPath,
        outputPath,
        grammarPath,
        threads: LOCAL_THREADS,
        ctxTokens: SUMMARY_CTX_TOKENS,
        maxPredictTokens: maxTokens,
        temperature: temperature ?? 0
      })
    ]
  })
  if (code !== 0) fail(`llama-cli 비정상 종료 (코드 ${code})\n${stderr.slice(-800)}`)

  return extractAnswer({ raw: await readFile(outputPath, 'utf8'), prompt })
}

const completeClaudeCli = ({ system, prompt }: LlmCompleteParams) =>
  new Promise<string>((resolve, reject) => {
    const child = spawn(CLAUDE_BIN, buildClaudeCliArgs({ system }))
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk: Buffer) => (stdout += chunk.toString()))
    child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString()))
    child.on('error', reject)
    child.on('close', (code) => {
      if (code !== 0) return reject(new Error(`claude 종료 코드 ${code}: ${stderr.slice(-400)}`))
      try {
        resolve(parseClaudeCliOutput(stdout))
      } catch (caught) {
        reject(caught)
      }
    })
    child.stdin.end(prompt)
  })

const requireEnv = (name: string) => process.env[name] || fail(`환경 변수 ${name}가 필요합니다`)

const createClient = (provider: LlmProvider): LlmClient => {
  if (provider === 'local') {
    return { provider, chunkBudgetChars: CHUNK_BUDGET_CHARS, complete: completeLocal }
  }
  if (provider === 'claude-cli') {
    return { provider, chunkBudgetChars: API_CHUNK_BUDGET_CHARS, complete: completeClaudeCli }
  }
  if (provider === 'claude-api') {
    const apiKey = requireEnv('ANTHROPIC_API_KEY')
    return {
      provider,
      chunkBudgetChars: API_CHUNK_BUDGET_CHARS,
      complete: (params) => completeWithClaudeApi({ apiKey, ...params })
    }
  }

  const apiKey = requireEnv('OPENAI_API_KEY')
  return {
    provider,
    chunkBudgetChars: API_CHUNK_BUDGET_CHARS,
    complete: (params) =>
      completeWithOpenaiApi({ apiKey, model: DEFAULT_OPENAI_MODEL_ID, ...params })
  }
}

interface LoadedMeeting {
  name: string
  lines: DecisionLine[]
}

const loadFromDb = ({ dbPath, meetingId }: { dbPath: string; meetingId: string }) => {
  if (!existsSync(dbPath)) fail(`DB가 없습니다: ${dbPath}`)

  const db = new DatabaseSync(dbPath, { readOnly: true })
  try {
    const utterances = db
      .prepare(
        `SELECT speaker_label AS speakerLabel, start_sec AS startSec, end_sec AS endSec, text
         FROM utterances WHERE meeting_id = ? ORDER BY ord`
      )
      .all(meetingId) as unknown as DecisionSourceUtterance[]
    const speakers = db
      .prepare('SELECT label, display_name AS displayName FROM speakers WHERE meeting_id = ?')
      .all(meetingId) as unknown as { label: string; displayName: string | null }[]
    if (!utterances.length) fail(`회의 ${meetingId}에 발화가 없습니다`)

    const displayNames = Object.fromEntries(speakers.map((row) => [row.label, row.displayName]))
    return { name: meetingId, lines: buildDecisionLines({ utterances, displayNames }) }
  } finally {
    db.close()
  }
}

const loadFromTranscript = async (file: string): Promise<LoadedMeeting> => {
  const parsed = (await readFile(file, 'utf8')).split('\n').flatMap((line) => {
    const match = TRANSCRIPT_LINE.exec(line)
    if (!match) return []

    const [, hours, minutes, secs, speaker, text] = match
    const startSec =
      Number(hours) * SECONDS_PER_HOUR + Number(minutes) * SECONDS_PER_MINUTE + Number(secs)
    return [{ speaker: speaker.trim(), startSec, text }]
  })
  if (!parsed.length) fail(`회의록 형식의 줄이 없습니다: ${file}`)

  // 화자 이름을 라벨로 그대로 쓴다. 표시 이름은 없는 것으로 둬야 "화자 N" 번호가 다시 붙지 않는다
  const utterances: DecisionSourceUtterance[] = parsed.map((item, index) => ({
    speakerLabel: item.speaker,
    startSec: item.startSec,
    endSec: parsed[index + 1]?.startSec ?? item.startSec + LAST_LINE_SEC,
    text: item.text
  }))
  const displayNames = Object.fromEntries(parsed.map(({ speaker }) => [speaker, speaker]))

  return {
    name: path.basename(file, path.extname(file)),
    lines: buildDecisionLines({ utterances, displayNames })
  }
}

const formatReport = ({
  name,
  provider,
  elapsedSec,
  lines,
  result
}: {
  name: string
  provider: LlmProvider
  elapsedSec: string
  lines: DecisionLine[]
  result: Awaited<ReturnType<typeof extractDecisions>>
}) => {
  const byNo = new Map(lines.map((line) => [line.lineNo, line]))
  const typeName = (typeId: string | null) =>
    DEFAULT_DECISION_TYPES.find(({ id }) => id === typeId)?.name ?? '미분류'
  const sections = result.decisions.map((decision, index) => {
    const evidence = decision.evidenceLines
      .map((no) => byNo.get(no))
      .filter((line): line is DecisionLine => line !== undefined)
      .map((line) => `> [${line.lineNo}] ${line.speakerName} (${line.timestamp}) ${line.text}`)
    const actions = decision.actionItems.map(
      ({ task, ownerLabel, ownerText, due }) =>
        `- [ ] ${task} (${(ownerLabel ?? ownerText) || '담당 없음'}, ${due || '기한 없음'})`
    )

    return [
      `## ${index + 1}. ${decision.title} — ${typeName(decision.typeId)}`,
      decision.decision,
      decision.background ? `배경: ${decision.background}` : '',
      decision.alternatives.map(({ option, reason }) => `- 대안: ${option} (${reason})`).join('\n'),
      actions.join('\n'),
      `근거 구간: ${decision.evidence
        .map(
          ({ startSec, endSec }) =>
            `${formatTimestamp({ sec: startSec })}–${formatTimestamp({ sec: endSec })}`
        )
        .join(', ')}`,
      evidence.join('\n')
    ]
      .filter(Boolean)
      .join('\n\n')
  })

  return [
    `# 결정 추출 — ${name} (${provider})`,
    `발화 ${lines.length}줄 · 청크 ${result.chunkCount}개 · 후보 ${result.candidateCount}개 · 저장 ${result.decisions.length}개 · 검증에서 버림 ${result.droppedCount}개 · ${elapsedSec}초`,
    ...sections
  ].join('\n\n')
}

const main = async () => {
  const provider = (optionOf('--provider') ?? 'local') as LlmProvider
  if (!PROVIDERS.includes(provider)) fail(`알 수 없는 공급자: ${provider}`)

  const meetingId = optionOf('--meeting')
  const transcript = optionOf('--transcript')
  if (!meetingId && !transcript) fail('--meeting <id> 또는 --transcript <파일>이 필요합니다')

  const loaded = meetingId
    ? loadFromDb({ dbPath: optionOf('--db') ?? DEFAULT_DB, meetingId })
    : await loadFromTranscript(transcript as string)
  const workDir = path.join(OUTPUT_DIR, `.decisions-${loaded.name}-${provider}`)
  await mkdir(workDir, { recursive: true })
  info(`${loaded.name}: 발화 ${loaded.lines.length}줄, 공급자 ${provider}`)

  const startedAt = performance.now()
  try {
    const result = await extractDecisions({
      client: createClient(provider),
      lines: loaded.lines,
      types: DEFAULT_DECISION_TYPES,
      workDir,
      onProgress: ({ stage, percent }) => info(`  ${stage} ${Math.round(percent)}%`)
    })
    const elapsedSec = seconds(startedAt)
    const base = path.join(OUTPUT_DIR, `${loaded.name}.decisions.${provider}`)
    await writeFile(`${base}.json`, JSON.stringify({ provider, elapsedSec, ...result }, null, 2))
    await writeFile(
      `${base}.md`,
      formatReport({ name: loaded.name, provider, elapsedSec, lines: loaded.lines, result })
    )
    info(
      `결정 ${result.decisions.length}개 (버림 ${result.droppedCount}개, ${elapsedSec}초) → ${base}.md`
    )
  } finally {
    await rm(workDir, { recursive: true, force: true })
  }
}

main().catch((caught: unknown) => fail(caught instanceof Error ? caught.message : String(caught)))
