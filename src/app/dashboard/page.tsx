'use client';

import { useEffect, useState, useCallback } from 'react';
import {
    ResponsiveContainer, RadialBarChart, RadialBar,
    Tooltip, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from 'recharts';

// ===== 타입 =====
interface RegimeData {
    score: number; label: string; explanation: string;
    drivers: Record<string, { score: number; reason: string }>;
    tomorrowWatch: string;
}
interface CorrelationWindow {
    window: number; pairs: Record<string, number>;
    topPositive: { id: string; label: string; value: number }[];
    topNegative: { id: string; label: string; value: number }[];
    shifts: { id: string; label: string; shortTerm: number; longTerm: number; diff: number }[];
}
interface RiskSignal { id: string; label: string; active: boolean; severity: string; value: number; detail: string; }
interface RiskData { score: number; level: string; signals: RiskSignal[]; alerts: string[]; }
interface SentimentData { usFearGreed: number; usLabel: string; krSentiment: number; krLabel: string; }
interface StoryEffect { cause: string; effect: string; description: string; }
interface StoryData {
    summary: string;
    drivers: { name: string; label: string; changePct: number; direction: string }[];
    effects: StoryEffect[]; regime: string; checkpoints: string[];
}

// ===== 대시보드 메인 =====
export default function DashboardPage() {
    const [regime, setRegime] = useState<RegimeData | null>(null);
    const [correlation, setCorrelation] = useState<CorrelationWindow[] | null>(null);
    const [risk, setRisk] = useState<RiskData | null>(null);
    const [sentiment, setSentiment] = useState<SentimentData | null>(null);
    const [story, setStory] = useState<StoryData | null>(null);
    const [loading, setLoading] = useState(true);
    const [activeWindow, setActiveWindow] = useState(20);

    const fetchAll = useCallback(async () => {
        setLoading(true);
        try {
            const [regimeRes, corrRes, riskRes, sentRes, storyRes] = await Promise.allSettled([
                fetch('/api/regime').then(r => r.json()),
                fetch('/api/correlation').then(r => r.json()),
                fetch('/api/risk').then(r => r.json()),
                fetch('/api/fear-greed').then(r => r.json()),
                fetch('/api/macro-story').then(r => r.json()),
            ]);
            if (regimeRes.status === 'fulfilled') setRegime(regimeRes.value);
            if (corrRes.status === 'fulfilled') setCorrelation(corrRes.value.windows);
            if (riskRes.status === 'fulfilled') setRisk(riskRes.value);
            if (sentRes.status === 'fulfilled') setSentiment(sentRes.value);
            if (storyRes.status === 'fulfilled') setStory(storyRes.value);
        } catch (err) { console.error('대시보드 데이터 로드 실패:', err); }
        finally { setLoading(false); }
    }, []);

    useEffect(() => { fetchAll(); }, [fetchAll]);

    const regimeColor = (label: string) => {
        if (label === 'RISK_ON') return 'var(--accent-green)';
        if (label === 'RISK_OFF') return 'var(--accent-red)';
        return 'var(--accent-orange)';
    };
    const riskLevelColor = (level: string) => {
        if (level === 'HIGH') return 'var(--accent-red)';
        if (level === 'MEDIUM') return 'var(--accent-orange)';
        return 'var(--accent-green)';
    };
    const fgColor = (score: number) => {
        if (score <= 25) return '#ef4444';
        if (score <= 45) return '#f97316';
        if (score <= 55) return '#eab308';
        if (score <= 75) return '#84cc16';
        return '#22c55e';
    };

    if (loading) {
        return <div className="loading"><div className="spinner" /><p>대시보드 데이터 분석 중...</p></div>;
    }

    return (
        <div>
            <div className="page-header">
                <h2>🏦 매크로 대시보드</h2>
                <p className="subtitle">Macro Regime · Risk Radar · Fear &amp; Greed · Correlation · Story</p>
            </div>

            {/* Row 1: Regime + Fear & Greed */}
            <div className="grid-2 section-gap">
                {/* Regime Panel */}
                <div className="card animate-in">
                    <div className="card-header" style={{ flexWrap: 'wrap', gap: '8px' }}>
                        <h3 className="card-title">🎯 Macro Regime</h3>
                        {regime && (
                            <span className="badge" style={{
                                background: `${regimeColor(regime.label)}20`,
                                color: regimeColor(regime.label),
                                fontSize: '13px', padding: '6px 16px', fontWeight: 700,
                            }}>{regime.label}</span>
                        )}
                    </div>
                    {regime && (
                        <>
                            <div style={{ textAlign: 'center', margin: '12px 0' }}>
                                <div style={{
                                    fontSize: 'clamp(32px, 8vw, 48px)', fontWeight: 800,
                                    color: regimeColor(regime.label), lineHeight: 1,
                                }}>
                                    {regime.score > 0 ? '+' : ''}{regime.score}
                                </div>
                                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                                    -100 (RISK_OFF) ← → +100 (RISK_ON)
                                </div>
                                <div style={{
                                    margin: '12px auto', width: '100%', maxWidth: '300px',
                                    height: '8px', borderRadius: '4px',
                                    background: 'linear-gradient(to right, #ef4444, #f59e0b, #10b981)',
                                    position: 'relative',
                                }}>
                                    <div style={{
                                        position: 'absolute',
                                        left: `${((regime.score + 100) / 200) * 100}%`,
                                        top: '-4px', width: '16px', height: '16px',
                                        borderRadius: '50%', background: '#fff',
                                        border: `3px solid ${regimeColor(regime.label)}`,
                                        transform: 'translateX(-50%)',
                                        boxShadow: `0 0 10px ${regimeColor(regime.label)}80`,
                                    }} />
                                </div>
                            </div>
                            <p style={{ fontSize: '13px', lineHeight: 1.7, color: 'var(--text-secondary)', marginBottom: '12px' }}>
                                {regime.explanation}
                            </p>
                            {/* 드라이버 태그 */}
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '12px' }}>
                                {Object.entries(regime.drivers).map(([key, val]) => (
                                    <span key={key} style={{
                                        padding: '3px 8px', borderRadius: '6px', fontSize: '10px',
                                        background: val.score > 20 ? 'rgba(16,185,129,0.15)' : val.score < -20 ? 'rgba(239,68,68,0.15)' : 'rgba(245,158,11,0.15)',
                                        color: val.score > 20 ? 'var(--accent-green)' : val.score < -20 ? 'var(--accent-red)' : 'var(--accent-orange)',
                                    }}>{key}: {val.score > 0 ? '+' : ''}{val.score}</span>
                                ))}
                            </div>
                            {regime.tomorrowWatch && (
                                <div style={{
                                    background: 'rgba(59,130,246,0.08)', borderLeft: '3px solid var(--accent-blue)',
                                    padding: '8px 12px', borderRadius: '0 8px 8px 0', fontSize: '12px',
                                    color: 'var(--accent-cyan)', lineHeight: 1.6,
                                }}>📌 {regime.tomorrowWatch}</div>
                            )}
                        </>
                    )}
                </div>

                {/* Fear & Greed Panel */}
                <div className="card animate-in" style={{ animationDelay: '0.05s' }}>
                    <div className="card-header">
                        <h3 className="card-title">😱 Fear &amp; Greed</h3>
                    </div>
                    {sentiment && (
                        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
                            {/* US */}
                            <div style={{ textAlign: 'center', flex: 1, minWidth: '120px' }}>
                                <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>🇺🇸 US</p>
                                <ResponsiveContainer width="100%" height={140}>
                                    <RadialBarChart cx="50%" cy="50%" innerRadius="60%" outerRadius="90%"
                                        startAngle={180} endAngle={0}
                                        data={[{ value: sentiment.usFearGreed, fill: fgColor(sentiment.usFearGreed) }]}>
                                        <RadialBar dataKey="value" cornerRadius={10} />
                                    </RadialBarChart>
                                </ResponsiveContainer>
                                <div style={{ marginTop: '-36px', position: 'relative', zIndex: 1 }}>
                                    <div style={{ fontSize: 'clamp(24px, 6vw, 32px)', fontWeight: 800, color: fgColor(sentiment.usFearGreed) }}>
                                        {sentiment.usFearGreed}
                                    </div>
                                    <div style={{ fontSize: '11px', fontWeight: 600, color: fgColor(sentiment.usFearGreed) }}>
                                        {sentiment.usLabel}
                                    </div>
                                </div>
                            </div>
                            {/* KR */}
                            <div style={{ textAlign: 'center', flex: 1, minWidth: '120px' }}>
                                <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>🇰🇷 KR</p>
                                <ResponsiveContainer width="100%" height={140}>
                                    <RadialBarChart cx="50%" cy="50%" innerRadius="60%" outerRadius="90%"
                                        startAngle={180} endAngle={0}
                                        data={[{ value: sentiment.krSentiment, fill: fgColor(sentiment.krSentiment) }]}>
                                        <RadialBar dataKey="value" cornerRadius={10} />
                                    </RadialBarChart>
                                </ResponsiveContainer>
                                <div style={{ marginTop: '-36px', position: 'relative', zIndex: 1 }}>
                                    <div style={{ fontSize: 'clamp(24px, 6vw, 32px)', fontWeight: 800, color: fgColor(sentiment.krSentiment) }}>
                                        {sentiment.krSentiment}
                                    </div>
                                    <div style={{ fontSize: '11px', fontWeight: 600, color: fgColor(sentiment.krSentiment) }}>
                                        {sentiment.krLabel}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Row 2: Risk Radar */}
            <div className="card section-gap animate-in" style={{ animationDelay: '0.1s' }}>
                <div className="card-header" style={{ flexWrap: 'wrap', gap: '8px' }}>
                    <h3 className="card-title">🛡️ Risk Radar</h3>
                    {risk && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: 'clamp(20px, 5vw, 28px)', fontWeight: 800, color: riskLevelColor(risk.level) }}>
                                {risk.score}/100
                            </span>
                            <span className="badge" style={{
                                background: `${riskLevelColor(risk.level)}20`, color: riskLevelColor(risk.level), fontWeight: 700,
                            }}>{risk.level}</span>
                        </div>
                    )}
                </div>
                {risk && (
                    <>
                        <div style={{
                            display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
                            gap: '6px', marginBottom: '16px',
                        }}>
                            {risk.signals.map(sig => (
                                <div key={sig.id} style={{
                                    padding: '8px 10px', borderRadius: '8px',
                                    background: sig.active
                                        ? sig.severity === 'high' ? 'rgba(239,68,68,0.12)'
                                            : sig.severity === 'medium' ? 'rgba(245,158,11,0.12)' : 'rgba(16,185,129,0.12)'
                                        : 'rgba(255,255,255,0.03)',
                                    border: `1px solid ${sig.active
                                        ? sig.severity === 'high' ? 'rgba(239,68,68,0.3)'
                                            : sig.severity === 'medium' ? 'rgba(245,158,11,0.3)' : 'rgba(16,185,129,0.3)'
                                        : 'var(--border)'}`,
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '3px' }}>
                                        <span style={{
                                            width: '7px', height: '7px', borderRadius: '50%',
                                            background: sig.active
                                                ? sig.severity === 'high' ? 'var(--accent-red)'
                                                    : sig.severity === 'medium' ? 'var(--accent-orange)' : 'var(--accent-green)'
                                                : 'var(--text-muted)',
                                        }} />
                                        <span style={{ fontSize: '11px', fontWeight: 600 }}>{sig.label}</span>
                                    </div>
                                    <p style={{ fontSize: '10px', color: 'var(--text-muted)', lineHeight: 1.4 }}>{sig.detail}</p>
                                </div>
                            ))}
                        </div>
                        {risk.alerts.length > 0 && (
                            <div style={{
                                background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
                                borderRadius: '10px', padding: '10px 14px',
                            }}>
                                {risk.alerts.map((alert, i) => (
                                    <p key={i} style={{ fontSize: '12px', color: 'var(--accent-red)', lineHeight: 1.6 }}>{alert}</p>
                                ))}
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* Row 3: Correlation Heatmap */}
            <div className="card section-gap animate-in" style={{ animationDelay: '0.15s' }}>
                <div className="card-header" style={{ flexWrap: 'wrap', gap: '8px' }}>
                    <h3 className="card-title">📊 상관관계</h3>
                    <div style={{ display: 'flex', gap: '4px' }}>
                        {[20, 60, 120].map(w => (
                            <button key={w} onClick={() => setActiveWindow(w)} style={{
                                padding: '4px 10px', borderRadius: '6px', border: '1px solid var(--border)',
                                background: activeWindow === w ? 'var(--accent-blue)' : 'transparent',
                                color: activeWindow === w ? '#fff' : 'var(--text-muted)',
                                cursor: 'pointer', fontSize: '11px', fontWeight: 600,
                            }}>{w}일</button>
                        ))}
                    </div>
                </div>
                {correlation && (() => {
                    const activeCorr = correlation.find(c => c.window === activeWindow) || correlation[0];
                    if (!activeCorr) return null;
                    const pairEntries = Object.entries(activeCorr.pairs).map(([id, value]) => ({
                        id, label: id.replace(/_vs_/g, ' / ').replace(/_/g, ' '),
                        value: typeof value === 'number' ? value : 0,
                    }));
                    return (
                        <>
                            <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
                                <div style={{ minWidth: '400px' }}>
                                    <ResponsiveContainer width="100%" height={Math.max(280, pairEntries.length * 32)}>
                                        <BarChart data={pairEntries} layout="vertical" margin={{ left: 90, right: 16, top: 5, bottom: 5 }}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
                                            <XAxis type="number" domain={[-1, 1]} tick={{ fill: '#94a3b8', fontSize: 10 }} />
                                            <YAxis dataKey="label" type="category" tick={{ fill: '#f1f5f9', fontSize: 10 }} width={85} />
                                            <Tooltip
                                                contentStyle={{ background: '#1a2332', border: '1px solid rgba(148,163,184,0.2)', borderRadius: '8px', fontSize: '12px' }}
                                                labelStyle={{ color: '#f1f5f9' }}
                                                formatter={(value: number | undefined) => [value !== undefined ? value.toFixed(4) : '-', '상관계수']}
                                            />
                                            <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                                                {pairEntries.map((entry, i) => (
                                                    <Cell key={i} fill={entry.value > 0 ? `rgba(16,185,129,${Math.abs(entry.value)})` : `rgba(239,68,68,${Math.abs(entry.value)})`} />
                                                ))}
                                            </Bar>
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>
                            {activeCorr.shifts && activeCorr.shifts.length > 0 && (
                                <div style={{
                                    marginTop: '12px', background: 'rgba(245,158,11,0.08)',
                                    border: '1px solid rgba(245,158,11,0.2)', borderRadius: '10px', padding: '10px 14px',
                                }}>
                                    <p style={{ fontSize: '12px', fontWeight: 700, color: 'var(--accent-orange)', marginBottom: '6px' }}>⚠️ 상관관계 급변</p>
                                    {activeCorr.shifts.map((s, i) => (
                                        <p key={i} style={{ fontSize: '11px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                                            {s.label}: {s.shortTerm.toFixed(2)} → {s.longTerm.toFixed(2)} (Δ{s.diff.toFixed(2)})
                                        </p>
                                    ))}
                                </div>
                            )}
                        </>
                    );
                })()}
            </div>

            {/* Row 4: Macro Story */}
            <div className="card section-gap animate-in" style={{ animationDelay: '0.2s' }}>
                <div className="card-header" style={{ flexWrap: 'wrap', gap: '8px' }}>
                    <h3 className="card-title">📝 오늘의 매크로 스토리</h3>
                    {story && <span className="badge badge-blue">{story.regime}</span>}
                </div>
                {story && (
                    <>
                        <p style={{ fontSize: '14px', lineHeight: 1.8, color: 'var(--text-secondary)', marginBottom: '16px' }}>
                            {story.summary}
                        </p>
                        {/* 드라이버 */}
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '16px' }}>
                            {story.drivers.map((d, i) => (
                                <span key={i} style={{
                                    padding: '5px 10px', borderRadius: '8px', fontSize: '11px', fontWeight: 600,
                                    background: d.direction === 'UP' ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)',
                                    color: d.direction === 'UP' ? 'var(--accent-green)' : 'var(--accent-red)',
                                }}>
                                    {d.label} {d.direction === 'UP' ? '▲' : '▼'} {d.changePct > 0 ? '+' : ''}{d.changePct.toFixed(2)}%
                                </span>
                            ))}
                        </div>
                        {/* 인과 관계 */}
                        <h4 style={{ fontSize: '13px', fontWeight: 700, marginBottom: '10px' }}>🔗 원인 → 결과</h4>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '16px' }}>
                            {story.effects.map((e, i) => (
                                <div key={i} style={{
                                    display: 'flex', flexDirection: 'column', gap: '4px',
                                    background: 'rgba(255,255,255,0.03)', borderRadius: '8px', padding: '10px 12px',
                                }}>
                                    <div style={{ fontSize: '11px', color: 'var(--accent-orange)', fontWeight: 600 }}>{e.cause}</div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <span style={{ color: 'var(--accent-cyan)', fontSize: '14px' }}>→</span>
                                        <div>
                                            <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>{e.effect}</span>
                                            <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '1px' }}>{e.description}</p>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                        {/* 체크포인트 */}
                        <h4 style={{ fontSize: '13px', fontWeight: 700, marginBottom: '10px' }}>🎯 내일 체크 포인트</h4>
                        <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            {story.checkpoints.map((cp, i) => (
                                <li key={i} style={{
                                    padding: '10px 14px', background: 'var(--bg-primary)',
                                    borderRadius: 'var(--radius-sm)', borderLeft: '3px solid var(--accent-orange)',
                                    fontSize: '13px', lineHeight: 1.7,
                                }}>{cp}</li>
                            ))}
                        </ul>
                    </>
                )}
            </div>

            {/* Refresh */}
            <div style={{ textAlign: 'center', marginTop: '20px', marginBottom: '40px' }}>
                <button className="btn btn-secondary" onClick={fetchAll}>🔄 대시보드 새로고침</button>
            </div>
        </div>
    );
}
