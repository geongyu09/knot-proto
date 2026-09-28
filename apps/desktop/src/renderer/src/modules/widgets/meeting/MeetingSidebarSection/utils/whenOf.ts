import type { Locale } from '@shared/i18n'
import { formatMeetingDay, formatMeetingTime } from '@renderer/shared/utils/formatMeetingDate'
import { meetingDateGroupOf } from '@renderer/shared/utils/meetingDateGroup'

interface WhenOfParams {
  epochMs: number
  now: number
  locale: Locale
}

/** 오늘 회의는 시각을, 그 전 회의는 날짜를 보여 준다 */
export const whenOf = ({ epochMs, now, locale }: WhenOfParams) =>
  meetingDateGroupOf({ epochMs, now }) === 'today'
    ? formatMeetingTime({ epochMs, locale })
    : formatMeetingDay({ epochMs, now, locale })
