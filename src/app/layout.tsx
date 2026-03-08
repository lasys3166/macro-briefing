import type { Metadata } from "next";
import "./globals.css";
import ClientLayout from "@/components/ClientLayout";

export const metadata: Metadata = {
  title: "Investment Agent | 개인 투자 AI 플랫폼",
  description: "매크로 데이터 분석, Regime AI, Risk Radar, 자산 관리 — 개인용 투자 AI 에이전트",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>
        <ClientLayout>
          <div className="app-layout">
            {/* 사이드바 */}
            <aside className="sidebar">
              <div className="sidebar-logo">
                <div className="logo-icon">🧠</div>
                <h1>Investment Agent</h1>
              </div>
              <nav className="sidebar-nav">
                {/* 매크로 섹션 */}
                <div style={{ fontSize: '10px', color: 'var(--text-muted)', padding: '8px 14px 6px', letterSpacing: '0.08em', fontWeight: 600, opacity: 0.7 }}>
                  MACRO
                </div>
                <a href="/" className="nav-item">
                  <span className="nav-icon">🌍</span>
                  세계 경제 현황
                </a>
                <a href="/realtime" className="nav-item">
                  <span className="nav-icon">📊</span>
                  실시간 지표
                </a>
                <a href="/history" className="nav-item">
                  <span className="nav-icon">📅</span>
                  히스토리
                </a>

                {/* 자산 관리 섹션 */}
                <div style={{ fontSize: '10px', color: 'var(--text-muted)', padding: '14px 14px 6px', letterSpacing: '0.08em', fontWeight: 600, opacity: 0.7 }}>
                  ASSET
                </div>
                <a href="/bank" className="nav-item">
                  <span className="nav-icon">🏧</span>
                  Bank Planner
                </a>
                <a href="/realestate" className="nav-item">
                  <span className="nav-icon">🏠</span>
                  부동산 모듈
                </a>
              </nav>
              <div style={{ marginTop: 'auto', padding: '14px 12px', borderTop: '1px solid var(--border)' }}>
                <p style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 500, opacity: 0.7 }}>
                  Investment Agent v1.0
                </p>
                <p style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '3px', opacity: 0.5 }}>
                  자동 실행: 매 정시 (Hourly)
                </p>
              </div>
            </aside>

            {/* 모바일 헤더 */}
            <header className="mobile-header">
              <div className="logo-icon">🧠</div>
              <h1 style={{
                fontSize: '14px', fontWeight: 700, letterSpacing: '-0.02em',
                background: 'linear-gradient(135deg, #3b82f6, #06b6d4)',
                WebkitBackgroundClip: 'text', backgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}>Investment Agent</h1>
            </header>

            {/* 메인 콘텐츠 */}
            <main className="main-content">
              {children}
            </main>

            {/* 모바일 하단 네비 */}
            <nav className="mobile-nav">
              <a href="/" className="nav-item">
                <span className="nav-icon">🌍</span>
                세계경제
              </a>
              <a href="/realtime" className="nav-item">
                <span className="nav-icon">📊</span>
                실시간
              </a>
              <a href="/bank" className="nav-item">
                <span className="nav-icon">🏧</span>
                자산
              </a>
              <a href="/realestate" className="nav-item">
                <span className="nav-icon">🏠</span>
                부동산
              </a>
            </nav>
          </div>
        </ClientLayout>
      </body>
    </html>
  );
}
