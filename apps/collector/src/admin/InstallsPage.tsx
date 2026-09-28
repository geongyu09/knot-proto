import type { listInstalls } from './adminQueries'
import { formatNumber, formatTime, hrefOf } from './adminFormat'
import { InstallLink } from './EventTable'
import Layout from './Layout'

/** environment 이벤트에서 표에 보일 항목. 전체 값은 이벤트 목록에서 본다 */
const ENVIRONMENT_FIELDS: { key: string; label: string }[] = [
  { key: 'appVersion', label: '앱' },
  { key: 'osVersion', label: 'OS' },
  { key: 'cpuModel', label: '칩' },
  { key: 'totalMemoryGb', label: '메모리 GB' },
  { key: 'whisperModelId', label: 'STT 모델' },
  { key: 'llmProvider', label: 'LLM' },
  { key: 'locale', label: '언어' }
]

interface InstallsPageProps {
  installs: ReturnType<typeof listInstalls>
}

export default function InstallsPage({ installs }: InstallsPageProps) {
  return (
    <Layout title="설치" activeTab="installs">
      <h1>설치 {formatNumber(installs.length)}곳</h1>
      <section className="card">
        {installs.length === 0 ? (
          <p className="empty">이벤트를 보낸 설치가 없습니다.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>팀</th>
                <th>설치</th>
                <th>첫 이벤트</th>
                <th>마지막 이벤트</th>
                <th className="num">이벤트</th>
                <th className="num">회의</th>
                {ENVIRONMENT_FIELDS.map((field) => (
                  <th key={field.key}>{field.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {installs.map((install) => (
                <tr key={`${install.teamId}/${install.installId}`}>
                  <td>{install.teamId}</td>
                  <td>
                    <InstallLink installId={install.installId} />
                  </td>
                  <td className="nowrap mono">{formatTime(install.firstAt)}</td>
                  <td className="nowrap mono">{formatTime(install.lastAt)}</td>
                  <td className="num">{formatNumber(install.eventCount)}</td>
                  <td className="num">
                    <a
                      href={hrefOf({
                        path: '/admin/meetings',
                        query: { teamId: install.teamId, installId: install.installId }
                      })}
                    >
                      {formatNumber(install.meetingCount)}
                    </a>
                  </td>
                  {ENVIRONMENT_FIELDS.map((field) => (
                    <td key={field.key} className="nowrap">
                      {String(install.environment?.[field.key] ?? '-')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </Layout>
  )
}
