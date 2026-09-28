import type { EventRow } from './adminQueries'
import { SMOKE_INSTALL_ID, formatTime, hrefOf, shortId } from './adminFormat'

interface EventTableProps {
  events: EventRow[]
}

const PROPS_INDENT = 1

export const CategoryBadge = ({ category }: { category: string }) => (
  <span className={category === 'error' ? 'badge error' : 'badge'}>{category}</span>
)

export const InstallLink = ({ installId }: { installId: string }) => (
  <a
    className="mono nowrap"
    href={hrefOf({ path: '/admin/events', query: { installId } })}
    title={installId}
  >
    {shortId(installId)}
    {installId === SMOKE_INSTALL_ID ? ' (스모크)' : ''}
  </a>
)

export default function EventTable({ events }: EventTableProps) {
  if (events.length === 0) return <p className="empty">이벤트가 없습니다.</p>
  return (
    <table>
      <thead>
        <tr>
          <th>시각</th>
          <th>팀</th>
          <th>설치</th>
          <th>이름</th>
          <th>분류</th>
          <th>버전</th>
          <th>props</th>
        </tr>
      </thead>
      <tbody>
        {events.map((event) => (
          <tr key={event.id}>
            <td className="nowrap mono">{formatTime(event.occurredAt)}</td>
            <td>{event.teamId}</td>
            <td>
              <InstallLink installId={event.installId} />
            </td>
            <td className="nowrap">
              <a href={hrefOf({ path: '/admin/events', query: { name: event.name } })}>
                {event.name}
              </a>
            </td>
            <td>
              <CategoryBadge category={event.category} />
            </td>
            <td className="mono nowrap">{event.appVersion}</td>
            <td>
              <pre className="props">{JSON.stringify(event.props, null, PROPS_INDENT)}</pre>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
