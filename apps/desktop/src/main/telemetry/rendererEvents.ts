import { sanitizeProps } from '@meeting-stt/telemetry/envelope'
import { isRendererEventName, type TelemetryEventMap } from '@meeting-stt/telemetry/events'
import { track } from './track'

/**
 * renderer가 보낸 이벤트를 다시 거른다. 허용 목록 밖의 이름은 조용히 버리고,
 * props는 원시값·짧은 문자열만 남긴다 (references/telemetry.md "싱크별 규칙").
 * 수집이 사용자 동작을 실패시키면 안 되므로 throw하지 않는다.
 */
export const trackRendererEvent = (payload: unknown) => {
  if (typeof payload !== 'object' || payload === null) return

  const { name, props } = payload as Record<string, unknown>
  if (!isRendererEventName(name)) return

  track({
    name,
    // 모양은 이벤트 타입과 다를 수 있지만 원시값만 남아 있어 전송에는 안전하다
    props: sanitizeProps(props) as unknown as TelemetryEventMap[typeof name]
  })
}
