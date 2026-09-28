import type { TrackTelemetryRequest } from '@shared/ipc'

const warnTrackFailure = (caught: unknown) => console.warn('사용 정보 전송 실패', caught)

/**
 * @description 사용 정보 이벤트를 main에 넘깁니다. 네트워크 전송은 main이 합니다. 수집 실패가 사용자 동작을 막지 않도록 오류를 던지지 않습니다.
 * @param event - 이벤트 이름과 props (renderer가 보낼 수 있는 이벤트만)
 * @returns 없음
 * @example
 * trackApi({ name: 'summary_copied', props: {} })
 */
export const trackApi = (event: TrackTelemetryRequest) => {
  try {
    window.api.telemetry.track(event).catch(warnTrackFailure)
  } catch (caught) {
    warnTrackFailure(caught)
  }
}
