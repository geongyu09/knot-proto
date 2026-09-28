import type { MeetingFilter, listMeetings } from './adminQueries'
import { formatBytes, formatDuration, formatNumber, formatTime, meetingPathOf } from './adminFormat'
import { InstallLink } from './EventTable'
import Layout from './Layout'

interface MeetingsPageProps {
  meetings: ReturnType<typeof listMeetings>
  filter: MeetingFilter
  teamIds: string[]
}

type MeetingItem = MeetingsPageProps['meetings'][number]

const RecordingCell = ({ recording }: Pick<MeetingItem, 'recording'>) => {
  if (!recording) return <span className="muted">없음</span>
  if (recording.isComplete)
    return <span className="badge accent">{formatBytes(recording.totalBytes)}</span>
  return (
    <span className="badge">
      {formatBytes(recording.receivedBytes)} / {formatBytes(recording.totalBytes)}
    </span>
  )
}

export default function MeetingsPage({ meetings, filter, teamIds }: MeetingsPageProps) {
  return (
    <Layout title="회의" activeTab="meetings">
      <h1>회의 {formatNumber(meetings.length)}개</h1>
      <form className="filters" method="get" action="/admin/meetings">
        <label>
          팀
          <select name="teamId">
            <option value="">전체</option>
            {teamIds.map((teamId) => (
              <option key={teamId} value={teamId} selected={teamId === filter.teamId}>
                {teamId}
              </option>
            ))}
          </select>
        </label>
        <label>
          설치 id
          <input name="installId" value={filter.installId ?? ''} placeholder="전체" />
        </label>
        <button className="button" type="submit">
          거르기
        </button>
        <a className="button secondary" href="/admin/meetings">
          초기화
        </a>
      </form>
      <section className="card">
        {meetings.length === 0 ? (
          <p className="empty">받은 회의 스냅샷이 없습니다.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>제목</th>
                <th>회의 시각</th>
                <th className="num">길이</th>
                <th className="num">발화</th>
                <th className="num">화자</th>
                <th>요약</th>
                <th>녹음</th>
                <th>팀</th>
                <th>설치</th>
                <th className="num">rev</th>
                <th>받은 시각</th>
              </tr>
            </thead>
            <tbody>
              {meetings.map((item) => (
                <tr key={meetingPathOf(item)}>
                  <td>
                    <a href={meetingPathOf(item)}>
                      {item.snapshot?.meeting.title || item.meetingId}
                    </a>
                    {item.deletedAt !== null ? <span className="badge error"> 삭제됨</span> : null}
                    {item.snapshot === null ? (
                      <span className="badge error"> 스냅샷 오류</span>
                    ) : null}
                  </td>
                  <td className="nowrap mono">
                    {formatTime(item.snapshot?.meeting.createdAt ?? null)}
                  </td>
                  <td className="num">{formatDuration(item.snapshot?.meeting.durationSec ?? 0)}</td>
                  <td className="num">{formatNumber(item.snapshot?.utterances.length ?? 0)}</td>
                  <td className="num">{formatNumber(item.snapshot?.speakers.length ?? 0)}</td>
                  <td>
                    {item.snapshot?.meeting.summary ? '있음' : <span className="muted">없음</span>}
                  </td>
                  <td>
                    <RecordingCell recording={item.recording} />
                  </td>
                  <td>{item.teamId}</td>
                  <td>
                    <InstallLink installId={item.installId} />
                  </td>
                  <td className="num">{item.revision}</td>
                  <td className="nowrap mono">{formatTime(item.receivedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </Layout>
  )
}
