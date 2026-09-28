import type { MeetingSnapshot } from '@meeting-stt/telemetry/snapshot'

import type { getMeeting } from './adminQueries'
import { formatBytes, formatDuration, formatTime, meetingPathOf } from './adminFormat'
import EventTable, { InstallLink } from './EventTable'
import Layout from './Layout'

const SPEAKER_COLOR_COUNT = 8

interface MeetingDetailPageProps {
  meetingKey: { teamId: string; installId: string; meetingId: string }
  detail: NonNullable<ReturnType<typeof getMeeting>>
}

/** 라벨 등장 순서로 색을 고정한다 — 같은 회의 안에서 화자 색이 바뀌지 않는다 */
const speakerClassesOf = (snapshot: MeetingSnapshot) => {
  const labels = [...new Set(snapshot.utterances.map((utterance) => utterance.speakerLabel))]
  return new Map(
    labels.map((label, index) => [label, `speaker speaker${(index % SPEAKER_COLOR_COUNT) + 1}`])
  )
}

const Transcript = ({ snapshot }: { snapshot: MeetingSnapshot }) => {
  if (snapshot.utterances.length === 0) return <p className="empty">발화가 없습니다.</p>
  const names = new Map(snapshot.speakers.map((speaker) => [speaker.label, speaker.displayName]))
  const classes = speakerClassesOf(snapshot)
  return (
    <div>
      {snapshot.utterances.map((utterance) => (
        <div key={utterance.id} className="utterance">
          <span className="mono muted">{formatDuration(utterance.startSec)}</span>
          <span className={classes.get(utterance.speakerLabel)}>
            {names.get(utterance.speakerLabel) || utterance.speakerLabel}
          </span>
          <div>
            <div>{utterance.text}</div>
            {utterance.originalText !== null && utterance.originalText !== utterance.text ? (
              <div className="original" title="교정 전 원문">
                {utterance.originalText}
              </div>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  )
}

const MeetingMeta = ({ meetingKey, detail }: MeetingDetailPageProps) => {
  const meeting = detail.snapshot?.meeting
  const basePath = meetingPathOf(meetingKey)
  return (
    <dl className="meta">
      <dt>팀</dt>
      <dd>{meetingKey.teamId}</dd>
      <dt>설치</dt>
      <dd>
        <InstallLink installId={meetingKey.installId} />
      </dd>
      <dt>회의 id</dt>
      <dd className="mono">{meetingKey.meetingId}</dd>
      <dt>회의 시각</dt>
      <dd>{formatTime(meeting?.createdAt ?? null)}</dd>
      <dt>길이</dt>
      <dd>{formatDuration(meeting?.durationSec ?? 0)}</dd>
      <dt>상태</dt>
      <dd>
        {meeting?.status ?? '-'}
        {meeting?.errorMessage ? <div className="errorText">{meeting.errorMessage}</div> : null}
      </dd>
      <dt>참석자 수 입력</dt>
      <dd>{meeting?.speakerCount ?? '-'}</dd>
      <dt>교정</dt>
      <dd>{formatTime(meeting?.refinedAt ?? null)}</dd>
      <dt>앱 버전</dt>
      <dd>{detail.snapshot?.appVersion ?? '-'}</dd>
      <dt>스냅샷</dt>
      <dd>
        revision {detail.revision} · 받은 시각 {formatTime(detail.receivedAt)} ·{' '}
        <a href={`${basePath}/snapshot.json`}>JSON 내려받기</a>
      </dd>
      {detail.deletedAt !== null ? (
        <>
          <dt>삭제 표시</dt>
          <dd>
            <span className="badge error">{formatTime(detail.deletedAt)}</span>
          </dd>
        </>
      ) : null}
    </dl>
  )
}

const Recording = ({ meetingKey, detail }: MeetingDetailPageProps) => {
  const recording = detail.recording
  if (!recording) return <p className="empty">받은 녹음이 없습니다.</p>
  if (!recording.isComplete) {
    return (
      <p className="empty">
        업로드 중 — {formatBytes(recording.receivedBytes)} / {formatBytes(recording.totalBytes)}
      </p>
    )
  }
  const src = `${meetingPathOf(meetingKey)}/recording.wav`
  return (
    <div>
      <span className="muted">{formatBytes(recording.totalBytes)}</span> ·{' '}
      <a href={src} download={`${meetingKey.meetingId}.wav`}>
        WAV 내려받기
      </a>
      <audio controls preload="metadata" src={src} />
    </div>
  )
}

export default function MeetingDetailPage({ meetingKey, detail }: MeetingDetailPageProps) {
  const snapshot = detail.snapshot
  return (
    <Layout title={snapshot?.meeting.title || meetingKey.meetingId} activeTab="meetings">
      <h1>{snapshot?.meeting.title || meetingKey.meetingId}</h1>
      {detail.snapshotError ? (
        <p className="notice">저장된 스냅샷을 읽지 못했습니다: {detail.snapshotError}</p>
      ) : null}
      <div className="grid2">
        <section className="card">
          <h2>정보</h2>
          <MeetingMeta meetingKey={meetingKey} detail={detail} />
        </section>
        <section className="card">
          <h2>녹음</h2>
          <Recording meetingKey={meetingKey} detail={detail} />
        </section>
      </div>
      <section className="card">
        <h2>요약</h2>
        {snapshot?.meeting.summary ? (
          <p className="summary">{snapshot.meeting.summary}</p>
        ) : (
          <p className="empty">요약이 없습니다.</p>
        )}
      </section>
      <section className="card">
        <h2>발화 {snapshot?.utterances.length ?? 0}개</h2>
        {snapshot ? <Transcript snapshot={snapshot} /> : null}
      </section>
      {snapshot && snapshot.refinePairs.length > 0 ? (
        <section className="card">
          <h2>자동 교정 쌍</h2>
          <table>
            <thead>
              <tr>
                <th>발화</th>
                <th>전</th>
                <th>후</th>
              </tr>
            </thead>
            <tbody>
              {snapshot.refinePairs.map((pair) => (
                <tr key={`${pair.utteranceId}/${pair.from}`}>
                  <td className="mono">{pair.utteranceId}</td>
                  <td>{pair.from}</td>
                  <td>{pair.to}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}
      {snapshot && snapshot.glossaryTerms.length > 0 ? (
        <section className="card">
          <h2>용어 사전 (보낸 시점)</h2>
          <p>{snapshot.glossaryTerms.join(', ')}</p>
        </section>
      ) : null}
      <section className="card">
        <h2>이 회의의 이벤트</h2>
        <EventTable events={detail.events} />
      </section>
    </Layout>
  )
}
