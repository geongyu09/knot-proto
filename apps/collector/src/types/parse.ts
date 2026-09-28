/** 외부 입력 검증 결과. 실패하면 어느 필드가 왜 틀렸는지 한 줄로 돌려준다 */
export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string }
