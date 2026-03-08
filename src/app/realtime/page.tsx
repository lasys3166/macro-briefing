'use client';

import { useEffect, useState, useCallback } from 'react';

// ===== 타입 =====
interface RealtimeItem {
    name: string;
    label: string;
    value: number | string;
    prevClose?: number;
    change?: number;
    changePct?: number;
    unit: string;
    primarySource: string;
}
interface RealtimeGroup {
    category: string;
    categoryLabel: string;
    items: RealtimeItem[];
}
interface RealtimeData {
    indicators: RealtimeGroup[];
    fetchedAt: string;
    elapsed: string;
    collectedDate?: string;
    sources: { yahoo: number; naver: number };
}

interface AnalysisData {
    hypotheses: string[];
    checkpoints: string[];
    significantMoves: number;
}

// ===== 컴포넌트 =====
export default function RealtimePage() {
    const [realtime, setRealtime] = useState<RealtimeData | null>(null);
    const [analysis, setAnalysis] = useState<AnalysisData | null>(null);
    const [loading, setLoading] = useState(true);
    const [lastUpdate, setLastUpdate] = useState<string>('');
    const [triggering, setTriggering] = useState(false);
    const [autoRefresh, setAutoRefresh] = useState(true);
    const [nextRefresh, setNextRefresh] = useState(3600);
    const [sourceFilter, setSourceFilter] = useState<'all' | 'yahoo' | 'naver'>('all');

    const fetchRealtime = useCallback(async () => {
        try {
            const res = await fetch('/api/realtime');
            if (!res.ok) throw new Error('실시간 데이터 로드 실패');
            const data: RealtimeData = await res.json();
            setRealtime(data);
            setLastUpdate(new Date().toLocaleTimeString('ko-KR'));
            setNextRefresh(3600);
        } catch (err) { console.error(err); }
        finally { setLoading(false); }
    }, []);

    const fetchAnalysis = useCallback(async () => {
        try {
            const res = await fetch('/api/analysis');
            if (res.ok) { const data = await res.json(); setAnalysis(data); }
        } catch { /* skip */ }
    }, []);

    useEffect(() => { fetchRealtime(); fetchAnalysis(); }, [fetchRealtime, fetchAnalysis]);

    useEffect(() => {
        if (!autoRefresh) return;
        const interval = setInterval(() => {
            setNextRefresh(prev => {
                if (prev <= 1) { fetchRealtime(); return 3600; }
                return prev - 1;
            });
        }, 1000);
        return () => clearInterval(interval);
    }, [autoRefresh, fetchRealtime]);

    const triggerPipeline = async () => {
        setTriggering(true);
        try {
            const res = await fetch('/api/realtime/collect', { method: 'POST' });
            if (res.ok) { await fetchRealtime(); await fetchAnalysis(); }
        } catch { /* skip */ }
        setTriggering(false);
    };

    const formatTime = (seconds: number) => {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m}:${s.toString().padStart(2, '0')}`;
    };

    if (loading) {
        return <div className="loading"><div className="spinner" /><p>실시간 지표 로딩 중...</p></div>;
    }

    // 소스 필터링
    const filteredIndicators = realtime?.indicators?.map(group => ({
        ...group,
        items: group.items.filter(item => {
            if (sourceFilter === 'all') return true;
            if (sourceFilter === 'yahoo') return item.primarySource === 'Yahoo Finance';
            if (sourceFilter === 'naver') return item.primarySource === '네이버 금융';
            return true;
        }),
    })).filter(g => g.items.length > 0) || [];

    return (
        <div>
            <div className="page-header">
                <h2>📊 실시간 지표</h2>
                <p className="subtitle">
                    {realtime?.collectedDate ? `${realtime.collectedDate} 기준` : 'Yahoo Finance + 네이버 금융'}
                </p>
            </div>

            {/* 출처 필터 탭 */}
            <div style={{ display: 'flex', gap: '6px', marginBottom: '16px' }}>
                {[
                    { key: 'all' as const, label: `🔵 전체 (${realtime?.sources ? realtime.sources.yahoo + realtime.sources.naver : 0})` },
                    { key: 'yahoo' as const, label: `📈 Yahoo Finance (${realtime?.sources?.yahoo || 0})` },
                    { key: 'naver' as const, label: `🟢 네이버 금융 (${realtime?.sources?.naver || 0})` },
                ].map(tab => (
                    <button key={tab.key} onClick={() => setSourceFilter(tab.key)} style={{
                        flex: 1, padding: '10px 8px', borderRadius: '10px', border: '1px solid var(--border)',
                        background: sourceFilter === tab.key ? 'var(--accent-blue)' : 'transparent',
                        color: sourceFilter === tab.key ? '#fff' : 'var(--text-muted)',
                        fontSize: '12px', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s',
                    }}>{tab.label}</button>
                ))}
            </div>

            {/* 업데이트 정보 */}
            <div className="card" style={{ padding: '10px 14px', marginBottom: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                        마지막 업데이트: {lastUpdate}
                    </span>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        (수집: Yahoo {realtime?.sources?.yahoo || 0}개 · 네이버 {realtime?.sources?.naver || 0}개)
                    </span>
                </div>
                <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                    <button onClick={() => setAutoRefresh(!autoRefresh)} className="btn btn-secondary" style={{ flex: 1, fontSize: '12px' }}>
                        {autoRefresh ? `⏱ 자동갱신 ${formatTime(nextRefresh)}` : '⏸ 자동갱신 OFF'}
                    </button>
                    <button onClick={fetchRealtime} className="btn btn-secondary" style={{ flex: 1, fontSize: '12px' }}>
                        🔄 새로고침
                    </button>
                </div>
            </div>

            {/* 지표 카드 */}
            {filteredIndicators.map((group, gi) => {
                const categoryIcons: Record<string, string> = {
                    exchange_rate: '💱', interest_rate: '💰', stock_index: '📈',
                };
                return (
                    <div key={gi} className="card section-gap animate-in" style={{ animationDelay: `${gi * 0.05}s` }}>
                        <div className="card-header">
                            <h3 className="card-title">{categoryIcons[group.category] || '📊'} {group.categoryLabel}</h3>
                            <span className="badge" style={{ fontSize: '10px' }}>{group.items.length}개 지표</span>
                        </div>
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                                <thead>
                                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                                        <th style={{ textAlign: 'left', padding: '8px 12px', color: 'var(--text-muted)', fontWeight: 600, fontSize: '11px' }}>지표</th>
                                        <th style={{ textAlign: 'right', padding: '8px 12px', color: 'var(--text-muted)', fontWeight: 600, fontSize: '11px' }}>현재값</th>
                                        <th style={{ textAlign: 'right', padding: '8px 12px', color: 'var(--text-muted)', fontWeight: 600, fontSize: '11px' }}>전일대비</th>
                                        <th style={{ textAlign: 'center', padding: '8px 12px', color: 'var(--text-muted)', fontWeight: 600, fontSize: '11px' }}>출처</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {group.items.map((item, ii) => {
                                        const pct = item.changePct;
                                        const isUp = pct !== undefined && pct > 0;
                                        const isDown = pct !== undefined && pct < 0;
                                        return (
                                            <tr key={ii} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                                <td style={{ padding: '10px 12px', fontWeight: 600 }}>{item.label}</td>
                                                <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700 }}>
                                                    {typeof item.value === 'number' ? item.value.toLocaleString() : item.value}
                                                    <span style={{ fontSize: '10px', color: 'var(--text-muted)', marginLeft: '3px' }}>{item.unit}</span>
                                                </td>
                                                <td style={{
                                                    padding: '10px 12px', textAlign: 'right', fontWeight: 600,
                                                    color: isUp ? 'var(--accent-green)' : isDown ? 'var(--accent-red)' : 'var(--text-muted)',
                                                }}>
                                                    {pct !== undefined && pct !== null
                                                        ? `${isUp ? '▲' : isDown ? '▼' : ''} ${isUp ? '+' : ''}${pct.toFixed(2)}%`
                                                        : '-'}
                                                </td>
                                                <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                                                    <span style={{
                                                        padding: '3px 8px', borderRadius: '6px', fontSize: '10px', fontWeight: 600,
                                                        background: item.primarySource === 'Yahoo Finance'
                                                            ? 'rgba(99,102,241,0.15)' : item.primarySource === '네이버 금융'
                                                                ? 'rgba(16,185,129,0.15)' : 'rgba(245,158,11,0.15)',
                                                        color: item.primarySource === 'Yahoo Finance'
                                                            ? '#818cf8' : item.primarySource === '네이버 금융'
                                                                ? 'var(--accent-green)' : 'var(--accent-orange)',
                                                    }}>{item.primarySource}</span>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                );
            })}

            {/* AI 인사이트 — 분석 API 기반 */}
            {analysis && (
                <>
                    <div className="grid-2 section-gap animate-in" style={{ animationDelay: '0.15s' }}>
                        <div className="card">
                            <div className="card-header"><h3 className="card-title">🧠 왜 이런 변화가?</h3></div>
                            <ul className="hypothesis-list">
                                {analysis.hypotheses.map((h, i) => (<li key={i} className="hypothesis-item" style={{ fontSize: '13px', lineHeight: 1.6, marginBottom: '8px' }}>{h}</li>))}
                            </ul>
                        </div>
                        <div className="card">
                            <div className="card-header"><h3 className="card-title">🎯 내일 체크 포인트</h3></div>
                            <ul className="checkpoint-list">
                                {analysis.checkpoints.map((c, i) => (<li key={i} className="checkpoint-item" style={{ fontSize: '13px', lineHeight: 1.6, marginBottom: '8px' }}>{c}</li>))}
                            </ul>
                        </div>
                    </div>
                </>
            )}

            {/* 하단 액션 */}
            <div style={{ marginTop: '24px', textAlign: 'center' }}>
                <button className="btn btn-secondary" onClick={triggerPipeline} disabled={triggering}>
                    {triggering ? '⏳ 실행 중...' : '🚀 수동 데이터 수집'}
                </button>
            </div>
        </div>
    );
}
