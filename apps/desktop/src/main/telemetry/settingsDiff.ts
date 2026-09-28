/**
 * 바뀐 설정 **키 이름**만 뽑는다. 값은 싣지 않는다 — 입력 장치 이름처럼 사람이 붙인 문자열이 섞여 있다
 * (references/pitfalls.md "사용 정보 수집"). 값의 분포는 환경 이벤트가 허용 목록으로 따로 보낸다.
 */
export const changedSettingKeys = <T extends object>({
  previous,
  next
}: {
  previous: T
  next: T
}) =>
  (Object.keys(next) as (keyof T & string)[]).filter(
    (key) => JSON.stringify(previous[key]) !== JSON.stringify(next[key])
  )
