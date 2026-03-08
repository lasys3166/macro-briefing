'use client';

import { useEffect, useState } from 'react';

interface HistoryItem {
    id: string;
    date: string;
    status: string;
    topChanges: Array<{
        label: string;
        changePct: number | null;
        trend: string;
    }>;
    createdAt: string;
}

export default function HistoryPage() {
    const [reports, setReports] = useState<HistoryItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [total, setTotal] = useState(0);

    useEffect(() => {
        fetchHistory();
    }, []);

    async function fetchHistory() {
        try {
            setLoading(true);
            const res = await fetch('/api/history?limit=30');
            if (!res.ok) throw new Error('히스토리 로드 실패');
            const data = await res.json();
            setReports(data.reports || []);
            setTotal(data.total || 0);
        } catch {
            setReports([]);
        } finally {
            setLoading(false);
        }
    }

    if (loading) {
        return (
            <div className="loading">
                <div className="spinner" />
                <p>히스토리 로딩 중...</p>
            </div>
        );
    }

    return (
        <div>
            <div className="page-header">
                <h2>📅 브리핑 히스토리</h2>
                <p className="subtitle">총 {total}일 기록</p>
            </div>

            {reports.length === 0 ? (
                <div className="empty-state">
                    <div className="emoji">📭</div>
                    <h3>아직 히스토리가 없습니다</h3>
                    <p>첫 번째 브리핑이 생성되면 여기에 표시됩니다.</p>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {reports.map((report, i) => {
                        const dateStr = new Date(report.date).toLocaleDateString('ko-KR', {
                            year: 'numeric', month: 'long', day: 'numeric', weekday: 'short',
                        });

                        return (
                            <a
                                key={report.id}
                                href={`/?date=${report.date.split('T')[0]}`}
                                className="card animate-in"
                                style={{
                                    textDecoration: 'none',
                                    color: 'inherit',
                                    animationDelay: `${i * 0.05}s`,
                                    cursor: 'pointer',
                                }}
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div>
                                        <h3 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '8px' }}>{dateStr}</h3>
                                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                            {report.topChanges?.slice(0, 3).map((change, ci) => (
                                                <span
                                                    key={ci}
                                                    className={`badge ${change.trend === 'up' ? 'badge-green' : change.trend === 'down' ? 'badge-red' : 'badge-blue'}`}
                                                >
                                                    {change.trend === 'up' ? '▲' : change.trend === 'down' ? '▼' : '−'}{' '}
                                                    {change.label}: {change.changePct !== null ? `${change.changePct > 0 ? '+' : ''}${change.changePct.toFixed(2)}%` : '-'}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                    <span className={`badge ${report.status === 'published' ? 'badge-green' : 'badge-blue'}`}>
                                        {report.status === 'published' ? '✅ 완료' : '⏳ ' + report.status}
                                    </span>
                                </div>
                            </a>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
