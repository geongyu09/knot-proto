import type { EventFilter, listEvents } from './adminQueries'
import { formatNumber, hrefOf } from './adminFormat'
import EventTable from './EventTable'
import Layout from './Layout'

const CATEGORIES = ['usage', 'performance', 'error', 'environment']

interface EventsPageProps {
  result: ReturnType<typeof listEvents>
  filter: EventFilter
  page: number
  teamIds: string[]
  names: string[]
}

const Select = ({
  label,
  name,
  value,
  options
}: {
  label: string
  name: string
  value: string | undefined
  options: string[]
}) => (
  <label>
    {label}
    <select name={name}>
      <option value="">전체</option>
      {options.map((option) => (
        <option key={option} value={option} selected={option === value}>
          {option}
        </option>
      ))}
    </select>
  </label>
)

export default function EventsPage({ result, filter, page, teamIds, names }: EventsPageProps) {
  const pageHref = (target: number) =>
    hrefOf({ path: '/admin/events', query: { ...filter, page: target > 0 ? target : undefined } })
  return (
    <Layout title="이벤트" activeTab="events">
      <h1>이벤트 {formatNumber(result.total)}개</h1>
      <form className="filters" method="get" action="/admin/events">
        <Select label="팀" name="teamId" value={filter.teamId} options={teamIds} />
        <Select label="이름" name="name" value={filter.name} options={names} />
        <Select label="분류" name="category" value={filter.category} options={CATEGORIES} />
        <label>
          설치 id
          <input name="installId" value={filter.installId ?? ''} placeholder="전체" />
        </label>
        <button className="button" type="submit">
          거르기
        </button>
        <a className="button secondary" href="/admin/events">
          초기화
        </a>
      </form>
      <section className="card">
        <EventTable events={result.events} />
        <div className="pager">
          {page > 0 ? (
            <a className="button secondary" href={pageHref(page - 1)}>
              이전
            </a>
          ) : null}
          <span className="muted">{page + 1}쪽</span>
          {result.hasNext ? (
            <a className="button secondary" href={pageHref(page + 1)}>
              다음
            </a>
          ) : null}
        </div>
      </section>
    </Layout>
  )
}
