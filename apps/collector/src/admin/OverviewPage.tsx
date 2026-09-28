import type { getOverview } from './adminQueries'
import { formatBytes, formatNumber, hrefOf } from './adminFormat'
import EventTable, { CategoryBadge } from './EventTable'
import Layout from './Layout'

const PERCENT = 100

interface OverviewPageProps {
  overview: ReturnType<typeof getOverview>
}

const Stat = ({ label, value }: { label: string; value: string }) => (
  <div className="stat">
    <div className="statLabel">{label}</div>
    <div className="statValue">{value}</div>
  </div>
)

/** 단일 계열이라 범례 없이 제목이 계열을 말한다. 막대 위 값 라벨과 title 툴팁으로 색에만 기대지 않는다 */
const DailyBars = ({ dailyCounts }: Pick<OverviewPageProps['overview'], 'dailyCounts'>) => {
  if (dailyCounts.length === 0)
    return <p className="empty">최근 14일 동안 받은 이벤트가 없습니다.</p>
  const max = Math.max(...dailyCounts.map((day) => day.count))
  return (
    <div className="bars" role="img" aria-label="최근 14일 일별 이벤트 수">
      {dailyCounts.map((day) => (
        <div key={day.day} className="barColumn" title={`${day.day}: ${formatNumber(day.count)}개`}>
          <span className="barValue">{formatNumber(day.count)}</span>
          <div className="bar" style={`height: ${(day.count / max) * PERCENT}%`} />
          <span className="barLabel">{day.day.slice(5)}</span>
        </div>
      ))}
    </div>
  )
}

export default function OverviewPage({ overview }: OverviewPageProps) {
  const { totals, dailyCounts, nameCounts, recentErrors } = overview
  return (
    <Layout title="개요" activeTab="overview">
      <h1>개요</h1>
      <div className="stats">
        <Stat label="팀" value={formatNumber(totals.teams)} />
        <Stat label="설치" value={formatNumber(totals.installs)} />
        <Stat label="이벤트" value={formatNumber(totals.events)} />
        <Stat label="오류 이벤트" value={formatNumber(totals.errors)} />
        <Stat label="회의 (삭제 제외)" value={formatNumber(totals.meetings)} />
        <Stat label="완료된 녹음" value={formatNumber(totals.recordings)} />
        <Stat label="녹음 용량" value={formatBytes(totals.recordingBytes)} />
      </div>
      <section className="card">
        <h2>일별 이벤트 수 (최근 14일, KST)</h2>
        <DailyBars dailyCounts={dailyCounts} />
      </section>
      <section className="card">
        <h2>이벤트 이름별 개수</h2>
        {nameCounts.length === 0 ? (
          <p className="empty">이벤트가 없습니다.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>이름</th>
                <th>분류</th>
                <th className="num">개수</th>
              </tr>
            </thead>
            <tbody>
              {nameCounts.map((row) => (
                <tr key={`${row.name}/${row.category}`}>
                  <td>
                    <a href={hrefOf({ path: '/admin/events', query: { name: row.name } })}>
                      {row.name}
                    </a>
                  </td>
                  <td>
                    <CategoryBadge category={row.category} />
                  </td>
                  <td className="num">{formatNumber(row.count)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      <section className="card">
        <h2>
          최근 오류{' '}
          <a className="muted" href="/admin/events?category=error">
            전체 보기
          </a>
        </h2>
        <EventTable events={recentErrors} />
      </section>
    </Layout>
  )
}
