/** 수집 서버의 유일한 로그 출구. 다른 모듈에서 console을 직접 부르지 않는다 */
const write = ({ level, message }: { level: string; message: string }) => {
  process.stdout.write(`${new Date().toISOString()} [${level}] ${message}\n`)
}

export const info = (message: string) => write({ level: 'info', message })
export const warn = (message: string) => write({ level: 'warn', message })
export const error = (message: string) => write({ level: 'error', message })

export const messageOf = (caught: unknown) =>
  caught instanceof Error ? (caught.stack ?? caught.message) : String(caught)
