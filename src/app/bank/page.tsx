'use client';

import { useEffect, useState, useCallback } from 'react';

// ===== 타입 =====
interface BankAccount {
    id: string;
    name: string;
    type: string;
    balance: number;
    color: string;
    icon: string;
}

interface Distribution {
    accountId: string;
    accountName: string;
    type: string;
    amount: number;
}

// ===== Bank Planner =====
export default function BankPage() {
    const [accounts, setAccounts] = useState<BankAccount[]>([]);
    const [salary, setSalary] = useState<string>('');
    const [loading, setLoading] = useState(true);
    const [distributing, setDistributing] = useState(false);
    const [lastDistribution, setLastDistribution] = useState<Distribution[] | null>(null);
    const [editingAccount, setEditingAccount] = useState<string | null>(null);
    const [editBalance, setEditBalance] = useState<string>('');

    // 분배 규칙
    const [rules, setRules] = useState<{ targetType: string; type: 'fixed' | 'percentage'; value: number }[]>([
        { targetType: 'savings', type: 'percentage', value: 50 },
        { targetType: 'seasonal', type: 'fixed', value: 500000 },
        { targetType: 'spending', type: 'percentage', value: 40 },
    ]);

    const fetchAccounts = useCallback(async () => {
        try {
            const res = await fetch('/api/bank/accounts');
            const data = await res.json();
            setAccounts(Array.isArray(data) ? data : []);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchAccounts(); }, [fetchAccounts]);

    // 타입별 아이콘/색상
    const typeConfig: Record<string, { icon: string; color: string; label: string }> = {
        income: { icon: '💰', color: '#3b82f6', label: '월급 통장' },
        savings: { icon: '🏦', color: '#10b981', label: '저축 통장' },
        spending: { icon: '🛒', color: '#f59e0b', label: '생활비 통장' },
        seasonal: { icon: '🎄', color: '#8b5cf6', label: '시즌 통장' },
        emergency: { icon: '🚨', color: '#ef4444', label: '비상금 통장' },
    };

    // ===== 잔액 직접 편집 =====
    function startEditBalance(account: BankAccount) {
        setEditingAccount(account.id);
        setEditBalance(account.balance > 0 ? account.balance.toString() : '');
    }

    function saveBalance(accountId: string) {
        const newBalance = parseInt(editBalance.replace(/,/g, '')) || 0;
        setAccounts(prev => prev.map(a =>
            a.id === accountId ? { ...a, balance: newBalance } : a
        ));
        setEditingAccount(null);
        setEditBalance('');
    }

    function cancelEdit() {
        setEditingAccount(null);
        setEditBalance('');
    }

    // ===== 분배 시뮬레이션 =====
    function simulateDistribution(): Distribution[] {
        const salaryNum = parseInt(salary.replace(/,/g, ''));
        if (!salaryNum || salaryNum <= 0) return [];

        const distributions: Distribution[] = [];
        let remaining = salaryNum;

        for (const rule of rules) {
            const account = accounts.find(a => a.type === rule.targetType);
            if (!account) continue;

            let amount = 0;
            if (rule.type === 'fixed') {
                amount = Math.min(rule.value, remaining);
            } else {
                amount = Math.floor(salaryNum * (rule.value / 100));
                amount = Math.min(amount, remaining);
            }

            if (amount > 0) {
                distributions.push({ accountId: account.id, accountName: account.name, type: account.type, amount });
                remaining -= amount;
            }
        }

        // 잔여분 → emergency
        if (remaining > 0) {
            const emergency = accounts.find(a => a.type === 'emergency');
            if (emergency) {
                distributions.push({ accountId: emergency.id, accountName: emergency.name, type: 'emergency', amount: remaining });
            }
        }

        return distributions;
    }

    // ===== 분배 실행 (통장 잔액 업데이트) =====
    function executeDistribution() {
        const salaryNum = parseInt(salary.replace(/,/g, ''));
        if (!salaryNum || salaryNum <= 0) return;

        setDistributing(true);
        const dists = simulateDistribution();

        // 통장 잔액에 분배 금액 반영
        setAccounts(prev => {
            const updated = [...prev];
            // 월급 통장에 총액 입금
            const incomeIdx = updated.findIndex(a => a.type === 'income');
            if (incomeIdx >= 0) {
                updated[incomeIdx] = { ...updated[incomeIdx], balance: updated[incomeIdx].balance + salaryNum };
            }
            // 각 통장에 분배 금액 입금
            for (const dist of dists) {
                const idx = updated.findIndex(a => a.id === dist.accountId);
                if (idx >= 0) {
                    updated[idx] = { ...updated[idx], balance: updated[idx].balance + dist.amount };
                }
            }
            return updated;
        });

        setLastDistribution(dists);
        setTimeout(() => setDistributing(false), 500);
    }

    const simulation = salary ? simulateDistribution() : [];
    const salaryNum = parseInt((salary || '0').replace(/,/g, ''));

    // 총 자산
    const totalAsset = accounts.reduce((sum, a) => sum + a.balance, 0);

    if (loading) {
        return <div className="loading"><div className="spinner" /><p>통장 데이터 로드 중...</p></div>;
    }

    return (
        <div>
            <div className="page-header">
                <h2>🏧 Bank Planner</h2>
                <p className="subtitle">월급 자동 분배 · 통장 관리 · 예산 추적</p>
            </div>

            {/* 총 자산 요약 */}
            {totalAsset > 0 && (
                <div className="card section-gap animate-in" style={{
                    background: 'linear-gradient(135deg, rgba(59,130,246,0.15), rgba(16,185,129,0.15))',
                    borderColor: 'rgba(59,130,246,0.3)',
                    textAlign: 'center', padding: '24px',
                }}>
                    <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>💎 총 자산</p>
                    <div style={{ fontSize: 'clamp(24px, 6vw, 36px)', fontWeight: 800, color: 'var(--accent-cyan)' }}>
                        ₩{totalAsset.toLocaleString()}
                    </div>
                </div>
            )}

            {/* 통장 카드 그리드 */}
            <div className="grid-3 section-gap">
                {accounts.map(account => {
                    const config = typeConfig[account.type] || { icon: '📋', color: '#94a3b8', label: account.type };
                    const isEditing = editingAccount === account.id;

                    return (
                        <div key={account.id} className="card animate-in" style={{ borderTop: `3px solid ${config.color}`, position: 'relative' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                                <span style={{ fontSize: '24px' }}>{account.icon || config.icon}</span>
                                <div style={{ flex: 1 }}>
                                    <h4 style={{ fontSize: '14px', fontWeight: 700 }}>{account.name}</h4>
                                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{config.label}</span>
                                </div>
                            </div>

                            {isEditing ? (
                                /* 편집 모드 */
                                <div>
                                    <input
                                        type="text"
                                        value={editBalance}
                                        onChange={(e) => setEditBalance(e.target.value.replace(/[^0-9]/g, ''))}
                                        placeholder="금액 입력"
                                        autoFocus
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') saveBalance(account.id);
                                            if (e.key === 'Escape') cancelEdit();
                                        }}
                                        style={{
                                            width: '100%', padding: '8px 12px', borderRadius: '8px',
                                            border: `2px solid ${config.color}`, background: 'var(--bg-input)',
                                            color: config.color, fontSize: '18px', fontWeight: 700,
                                            fontFamily: 'inherit', outline: 'none',
                                        }}
                                    />
                                    {editBalance && (
                                        <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                                            ₩{parseInt(editBalance).toLocaleString()} 원
                                        </p>
                                    )}
                                    <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
                                        <button
                                            onClick={() => saveBalance(account.id)}
                                            style={{
                                                flex: 1, padding: '6px 12px', borderRadius: '6px',
                                                background: config.color, color: '#fff', border: 'none',
                                                cursor: 'pointer', fontSize: '12px', fontWeight: 600,
                                            }}
                                        >
                                            ✓ 저장
                                        </button>
                                        <button
                                            onClick={cancelEdit}
                                            style={{
                                                flex: 1, padding: '6px 12px', borderRadius: '6px',
                                                background: 'rgba(255,255,255,0.1)', color: 'var(--text-muted)',
                                                border: '1px solid var(--border)', cursor: 'pointer',
                                                fontSize: '12px', fontWeight: 600,
                                            }}
                                        >
                                            ✕ 취소
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                /* 보기 모드 — 클릭하면 편집 */
                                <div
                                    onClick={() => startEditBalance(account)}
                                    style={{ cursor: 'pointer', position: 'relative' }}
                                    title="클릭하여 잔액 수정"
                                >
                                    <div style={{ fontSize: 'clamp(18px, 5vw, 24px)', fontWeight: 800, color: config.color }}>
                                        ₩{account.balance.toLocaleString()}
                                    </div>
                                    <div style={{
                                        position: 'absolute', top: '-4px', right: '0',
                                        fontSize: '10px', color: 'var(--text-muted)', opacity: 0.6,
                                        display: 'flex', alignItems: 'center', gap: '2px',
                                    }}>
                                        ✏️ 수정
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* 월급 입력 + 분배 규칙 */}
            <div className="grid-2 section-gap">
                {/* 월급 입력 */}
                <div className="card animate-in" style={{ animationDelay: '0.1s' }}>
                    <div className="card-header">
                        <h3 className="card-title">💵 월급 입력</h3>
                    </div>
                    <div style={{ marginBottom: '16px' }}>
                        <label style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>
                            세후 월급 (원)
                        </label>
                        <input
                            type="text"
                            value={salary}
                            onChange={(e) => setSalary(e.target.value.replace(/[^0-9]/g, ''))}
                            placeholder="5,000,000"
                            style={{
                                width: '100%', padding: '12px 16px', borderRadius: '10px',
                                border: '1px solid var(--border)', background: 'var(--bg-input)',
                                color: 'var(--text-primary)', fontSize: '18px', fontWeight: 700,
                                fontFamily: 'inherit',
                            }}
                        />
                        {salary && (
                            <p style={{ fontSize: '13px', color: 'var(--accent-blue)', marginTop: '8px' }}>
                                ₩{parseInt(salary).toLocaleString()} 원
                            </p>
                        )}
                    </div>
                    <button
                        className="btn btn-primary"
                        onClick={executeDistribution}
                        disabled={!salary || distributing}
                        style={{ width: '100%' }}
                    >
                        {distributing ? '⏳ 분배 중...' : '🚀 월급 분배 실행'}
                    </button>
                    {lastDistribution && (
                        <p style={{ fontSize: '11px', color: 'var(--accent-green)', marginTop: '8px', textAlign: 'center' }}>
                            ✅ 분배 결과가 통장 잔액에 반영되었습니다
                        </p>
                    )}
                </div>

                {/* 분배 규칙 */}
                <div className="card animate-in" style={{ animationDelay: '0.15s' }}>
                    <div className="card-header">
                        <h3 className="card-title">⚙️ 분배 규칙</h3>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {rules.map((rule, i) => {
                            const config = typeConfig[rule.targetType] || { icon: '📋', color: '#94a3b8', label: rule.targetType };
                            return (
                                <div key={i} style={{
                                    display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap',
                                    padding: '10px', borderRadius: '8px', background: 'rgba(255,255,255,0.03)',
                                }}>
                                    <span style={{ fontSize: '16px' }}>{config.icon}</span>
                                    <span style={{ fontSize: '13px', fontWeight: 600, minWidth: '70px' }}>{config.label}</span>
                                    <select
                                        value={rule.type}
                                        onChange={(e) => {
                                            const updated = [...rules];
                                            updated[i].type = e.target.value as 'fixed' | 'percentage';
                                            setRules(updated);
                                        }}
                                        style={{
                                            padding: '6px 28px 6px 10px', borderRadius: '8px', border: '1px solid var(--border)',
                                            background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: '12px',
                                            fontWeight: 500, cursor: 'pointer',
                                        }}
                                    >
                                        <option value="percentage">%</option>
                                        <option value="fixed">고정</option>
                                    </select>
                                    <input
                                        type="number"
                                        value={rule.value}
                                        onChange={(e) => {
                                            const updated = [...rules];
                                            updated[i].value = parseInt(e.target.value) || 0;
                                            setRules(updated);
                                        }}
                                        style={{
                                            width: '90px', padding: '6px 10px', borderRadius: '8px',
                                            border: '1px solid var(--border)', background: 'var(--bg-input)',
                                            color: 'var(--text-primary)', fontSize: '13px', textAlign: 'right',
                                            fontWeight: 600, fontVariantNumeric: 'tabular-nums',
                                        }}
                                    />
                                    <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 500 }}>
                                        {rule.type === 'percentage' ? '%' : '원'}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* ===== 분배 결과 (실행 후) ===== */}
            {lastDistribution && lastDistribution.length > 0 && (
                <div className="card section-gap animate-in" style={{
                    background: 'linear-gradient(135deg, rgba(16,185,129,0.08), rgba(59,130,246,0.08))',
                    border: '1px solid rgba(16,185,129,0.2)',
                }}>
                    <div className="card-header">
                        <h3 className="card-title">✅ 분배 실행 결과</h3>
                        <span style={{ fontSize: '14px', color: 'var(--accent-green)', fontWeight: 700 }}>
                            총 ₩{salaryNum.toLocaleString()}
                        </span>
                    </div>

                    {/* 결과 테이블 */}
                    <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' as const }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '400px' }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                                    <th style={{ textAlign: 'left', padding: '8px 12px', fontSize: '12px', color: 'var(--text-muted)' }}>통장</th>
                                    <th style={{ textAlign: 'right', padding: '8px 12px', fontSize: '12px', color: 'var(--text-muted)' }}>분배 금액</th>
                                    <th style={{ textAlign: 'right', padding: '8px 12px', fontSize: '12px', color: 'var(--text-muted)' }}>비율</th>
                                    <th style={{ textAlign: 'right', padding: '8px 12px', fontSize: '12px', color: 'var(--text-muted)' }}>분배 후 잔액</th>
                                </tr>
                            </thead>
                            <tbody>
                                {lastDistribution.map((dist, i) => {
                                    const config = typeConfig[dist.type] || { icon: '📋', color: '#94a3b8', label: dist.type };
                                    const account = accounts.find(a => a.id === dist.accountId || a.type === dist.type);
                                    const currentBalance = account?.balance ?? 0;
                                    const pct = salaryNum > 0 ? ((dist.amount / salaryNum) * 100).toFixed(1) : '0';

                                    return (
                                        <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                            <td style={{ padding: '10px 12px' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <span style={{ fontSize: '18px' }}>{config.icon}</span>
                                                    <span style={{ fontSize: '13px', fontWeight: 600 }}>{dist.accountName}</span>
                                                </div>
                                            </td>
                                            <td style={{ textAlign: 'right', padding: '10px 12px', fontSize: '15px', fontWeight: 700, color: config.color }}>
                                                +₩{dist.amount.toLocaleString()}
                                            </td>
                                            <td style={{ textAlign: 'right', padding: '10px 12px', fontSize: '13px', color: 'var(--text-muted)' }}>
                                                {pct}%
                                            </td>
                                            <td style={{ textAlign: 'right', padding: '10px 12px', fontSize: '14px', fontWeight: 600, color: 'var(--text-secondary)' }}>
                                                ₩{currentBalance.toLocaleString()}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                            <tfoot>
                                <tr style={{ borderTop: '2px solid var(--border)' }}>
                                    <td style={{ padding: '10px 12px', fontSize: '13px', fontWeight: 700 }}>합계</td>
                                    <td style={{ textAlign: 'right', padding: '10px 12px', fontSize: '15px', fontWeight: 800, color: 'var(--accent-green)' }}>
                                        ₩{lastDistribution.reduce((s, d) => s + d.amount, 0).toLocaleString()}
                                    </td>
                                    <td style={{ textAlign: 'right', padding: '10px 12px', fontSize: '13px', color: 'var(--accent-green)' }}>100%</td>
                                    <td></td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </div>
            )}

            {/* ===== 분배 시뮬레이션 (실행 전 미리보기) ===== */}
            {simulation.length > 0 && !lastDistribution && (
                <div className="card section-gap animate-in" style={{ animationDelay: '0.2s' }}>
                    <div className="card-header">
                        <h3 className="card-title">📊 분배 미리보기</h3>
                        <span style={{ fontSize: '14px', color: 'var(--accent-blue)', fontWeight: 700 }}>
                            총 ₩{salaryNum.toLocaleString()}
                        </span>
                    </div>

                    {/* 플로우 다이어그램 */}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0', padding: '20px 0' }}>
                        {/* 월급 */}
                        <div style={{
                            padding: '12px 20px', borderRadius: '12px', textAlign: 'center',
                            background: 'linear-gradient(135deg, #3b82f6, #06b6d4)',
                            color: 'white', fontWeight: 700, fontSize: '14px', maxWidth: '100%',
                        }}>
                            💰 월급 ₩{salaryNum.toLocaleString()}
                        </div>

                        {/* 화살표들 */}
                        {simulation.map((dist, i) => {
                            const config = typeConfig[dist.type] || { icon: '📋', color: '#94a3b8', label: dist.type };
                            const pct = ((dist.amount / salaryNum) * 100).toFixed(0);
                            return (
                                <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
                                    <div style={{ width: '2px', height: '24px', background: 'var(--border)' }} />
                                    <div style={{ color: 'var(--text-muted)', fontSize: '11px' }}>▼ {pct}%</div>
                                    <div style={{ width: '2px', height: '8px', background: 'var(--border)' }} />
                                    <div style={{
                                        display: 'flex', alignItems: 'center', gap: '12px',
                                        padding: '12px 24px', borderRadius: '10px', width: '100%', maxWidth: '400px',
                                        background: `${config.color}15`, border: `1px solid ${config.color}40`,
                                    }}>
                                        <span style={{ fontSize: '20px' }}>{config.icon}</span>
                                        <div style={{ flex: 1 }}>
                                            <span style={{ fontSize: '13px', fontWeight: 600 }}>{dist.accountName}</span>
                                        </div>
                                        <span style={{ fontSize: '16px', fontWeight: 800, color: config.color }}>
                                            ₩{dist.amount.toLocaleString()}
                                        </span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Refresh */}
            <div style={{ textAlign: 'center', marginTop: '24px', marginBottom: '40px' }}>
                <button className="btn btn-secondary" onClick={() => { setLastDistribution(null); setSalary(''); }}>
                    🔄 초기화
                </button>
            </div>
        </div>
    );
}
