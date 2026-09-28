/**
 * 관리자 페이지 전용 규칙. 값은 전부 `@meeting-stt/design/base.css` 변수로만 쓴다 (telemetry.md "관리자 페이지").
 * base.css 뒤에 불러오므로 토큰을 다시 정의하지 않는다.
 */
export const ADMIN_CSS = `
body { font-size: var(--font-sm); }
.shell { max-width: 1280px; margin: 0 auto; padding: var(--space-5) var(--space-4) var(--space-6); }
.gnb { display: flex; align-items: center; gap: var(--space-4); flex-wrap: wrap; margin-bottom: var(--space-5); }
.brand { font-weight: 700; font-size: var(--font-md); margin-right: var(--space-2); }
.brand small { color: var(--color-text-muted); font-weight: 500; margin-left: var(--space-2); }
.tabs { display: flex; gap: var(--space-1); background: var(--color-surface); padding: var(--space-1);
  border-radius: var(--radius-full); box-shadow: var(--shadow-1); }
.tab { padding: var(--space-1) var(--space-4); border-radius: var(--radius-full); text-decoration: none;
  color: var(--color-text-secondary); }
.tab:hover { background: var(--color-surface-hover); }
.tab.isActive { background: var(--color-primary); color: var(--color-text-inverse); }
h1 { font-size: var(--font-xl); margin: 0 0 var(--space-4); }
h2 { font-size: var(--font-md); margin: 0 0 var(--space-3); }
.card { background: var(--color-surface); border-radius: var(--radius-xl); box-shadow: var(--shadow-1);
  padding: var(--space-5); margin-bottom: var(--space-4); overflow-x: auto; }
.grid2 { display: grid; grid-template-columns: repeat(auto-fit, minmax(420px, 1fr)); gap: var(--space-4);
  margin-bottom: var(--space-4); }
.grid2 > .card { margin-bottom: 0; }
.stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: var(--space-3);
  margin-bottom: var(--space-4); }
.stat { background: var(--color-surface); border-radius: var(--radius-lg); box-shadow: var(--shadow-1);
  padding: var(--space-4); }
.statLabel { color: var(--color-text-muted); font-size: var(--font-xs); }
.statValue { font-family: var(--font-mono); font-size: var(--font-xl); font-weight: 600; }
table { border-collapse: collapse; width: 100%; }
th, td { text-align: left; padding: var(--space-2) var(--space-3); border-bottom: 1px solid var(--color-divider);
  vertical-align: top; }
th { color: var(--color-text-muted); font-weight: 500; font-size: var(--font-xs); white-space: nowrap; }
tr:last-child td { border-bottom: none; }
td.num, th.num { text-align: right; font-family: var(--font-mono); }
.mono { font-family: var(--font-mono); font-size: var(--font-xs); word-break: break-all; }
.errorText { color: var(--color-danger); font-size: var(--font-xs); word-break: break-all; }
.muted { color: var(--color-text-muted); }
.nowrap { white-space: nowrap; }
.props { font-family: var(--font-mono); font-size: var(--font-xs); white-space: pre-wrap; word-break: break-all;
  margin: 0; max-width: 520px; }
.badge { display: inline-block; padding: 0 var(--space-2); border-radius: var(--radius-full);
  font-size: var(--font-xs); background: var(--color-surface-hover); color: var(--color-text-secondary);
  white-space: nowrap; }
.badge.error { background: var(--color-danger-soft); color: var(--color-danger); }
.badge.accent { background: var(--color-accent-soft); color: var(--color-text); }
.filters { display: flex; flex-wrap: wrap; gap: var(--space-2); align-items: end; margin-bottom: var(--space-4); }
.filters label { display: flex; flex-direction: column; gap: 2px; font-size: var(--font-xs); color: var(--color-text-muted); }
.filters input, .filters select { padding: var(--space-1) var(--space-2); border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-sm); background: var(--color-surface); color: var(--color-text); min-width: 140px; }
.button { display: inline-block; padding: var(--space-1) var(--space-4); border-radius: var(--radius-full);
  border: none; background: var(--color-primary); color: var(--color-text-inverse); text-decoration: none; cursor: pointer; }
.button.secondary { background: var(--color-surface); color: var(--color-text); border: 1px solid var(--color-border-strong); }
.pager { display: flex; gap: var(--space-2); align-items: center; margin-top: var(--space-4); }
.bars { display: flex; align-items: flex-end; gap: 2px; height: 160px; padding-top: var(--space-4); }
.barColumn { flex: 1; display: flex; flex-direction: column; justify-content: flex-end; align-items: center;
  height: 100%; min-width: 0; }
.bar { width: 100%; max-width: 32px; background: var(--color-accent); border-radius: var(--radius-xs) var(--radius-xs) 0 0;
  min-height: 1px; }
.barValue { font-family: var(--font-mono); font-size: var(--font-xs); color: var(--color-text-secondary); }
.barLabel { font-size: var(--font-xs); color: var(--color-text-muted); margin-top: var(--space-1); white-space: nowrap; }
.meta { display: grid; grid-template-columns: max-content 1fr; gap: var(--space-1) var(--space-4); margin: 0; }
.meta dt { color: var(--color-text-muted); }
.meta dd { margin: 0; }
.summary { white-space: pre-wrap; margin: 0; line-height: 1.7; }
.utterance { display: grid; grid-template-columns: 64px 120px 1fr; gap: var(--space-3); padding: var(--space-2) 0;
  border-bottom: 1px solid var(--color-divider); }
.utterance:last-child { border-bottom: none; }
.speaker { font-weight: 600; }
.original { color: var(--color-text-muted); font-size: var(--font-xs); margin-top: 2px; text-decoration: line-through; }
.speaker1 { color: var(--color-speaker-1); } .speaker2 { color: var(--color-speaker-2); }
.speaker3 { color: var(--color-speaker-3); } .speaker4 { color: var(--color-speaker-4); }
.speaker5 { color: var(--color-speaker-5); } .speaker6 { color: var(--color-speaker-6); }
.speaker7 { color: var(--color-speaker-7); } .speaker8 { color: var(--color-speaker-8); }
audio { width: 100%; margin-top: var(--space-2); }
.empty { color: var(--color-text-muted); padding: var(--space-4) 0; }
.notice { background: var(--color-danger-soft); color: var(--color-danger); padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-md); margin-bottom: var(--space-4); }
@media (max-width: 640px) {
  .grid2 { grid-template-columns: 1fr; }
  .utterance { grid-template-columns: 1fr; gap: 2px; }
}
`
