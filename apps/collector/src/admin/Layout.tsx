import type { Child } from 'hono/jsx'

export type AdminTab = 'overview' | 'events' | 'installs' | 'meetings'

const TABS: { key: AdminTab; label: string; href: string }[] = [
  { key: 'overview', label: '개요', href: '/admin' },
  { key: 'events', label: '이벤트', href: '/admin/events' },
  { key: 'installs', label: '설치', href: '/admin/installs' },
  { key: 'meetings', label: '회의', href: '/admin/meetings' }
]

interface LayoutProps {
  title: string
  activeTab: AdminTab
  children?: Child
}

export default function Layout({ title, activeTab, children }: LayoutProps) {
  return (
    <html lang="ko">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="robots" content="noindex" />
        <title>{`${title} · 수집 서버 관리자`}</title>
        <link rel="stylesheet" href="/admin/assets/base.css" />
        <link rel="stylesheet" href="/admin/assets/admin.css" />
      </head>
      <body>
        <div className="shell">
          <header className="gnb">
            <div className="brand">
              meeting-stt<small>수집 서버 관리자</small>
            </div>
            <nav className="tabs" aria-label="관리자 메뉴">
              {TABS.map((tab) => (
                <a
                  key={tab.key}
                  className={tab.key === activeTab ? 'tab isActive' : 'tab'}
                  href={tab.href}
                  aria-current={tab.key === activeTab ? 'page' : undefined}
                >
                  {tab.label}
                </a>
              ))}
            </nav>
          </header>
          <main>{children}</main>
        </div>
      </body>
    </html>
  )
}
