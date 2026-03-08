'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';

// ===== 타입 =====
interface LoanRate {
    id: string; category: string; product: string; type: string;
    rateMin: number; rateMax: number; baseDate: string; note: string;
}

const CATEGORY_LABELS: Record<string, string> = {
    policy_mortgage: '🏛️ 정책 모기지', bank_mortgage: '🏦 은행 주담대', jeonse: '🏠 전세 대출',
};
const TYPE_LABELS: Record<string, string> = { fixed: '고정', variable: '변동', mixed: '혼합' };

// ===== 부동산 분석 엔진 (클라이언트) =====
function analyze(p: {
    purchasePrice: number; jeonsePrice: number; monthlyRent: number;
    loanRate: number; ltv: number;
}) {
    const { purchasePrice, jeonsePrice, monthlyRent, loanRate, ltv } = p;
    if (purchasePrice <= 0) return null;

    // 기본 지표
    const jeonseRatio = jeonsePrice / purchasePrice;
    const gap = purchasePrice - jeonsePrice;
    const annualRent = monthlyRent * 12;
    const loanAmount = Math.floor(purchasePrice * ltv);
    const equity = purchasePrice - loanAmount;
    const annualInterest = loanAmount * loanRate;
    const monthlyPayment = Math.round(annualInterest / 12);

    // 명목 수익률 (Cap Rate)
    const nominalYield = purchasePrice > 0 ? (annualRent / purchasePrice) * 100 : 0;

    // 레버리지 수익률 (ROE = (임대수익 - 이자비용) / 자기자본)
    const netOperatingIncome = annualRent - annualInterest;
    const leverageYield = equity > 0 ? (netOperatingIncome / equity) * 100 : 0;

    // 요구 수익률 계산 (기회비용 기반: 무위험수익률3% + 부동산 리스크프리미엄 3%)
    const riskFreeRate = 3.0;
    const riskPremium = 3.0;
    const requiredReturn = riskFreeRate + riskPremium;

    // 기대 성장률 역산 (현 가격이 적정가가 되려면 필요한 성장률)
    // 적정가 = (연임대수익 + 매매가*g) / r → g = (r * P - R) / P
    // g = requiredReturn(%) - nominalYield(%)
    const impliedGrowthRate = requiredReturn - nominalYield;

    // 적정 가격 (DCF: 연임대수익 / (요구수익률 - 기대성장률2%))
    const assumedGrowth = 0.02; // 보수적 2%
    const fairPrice = (requiredReturn / 100 - assumedGrowth) > 0
        ? Math.round(annualRent / (requiredReturn / 100 - assumedGrowth))
        : null;

    // 투자 가치 판단
    const currentPriceVsFair = fairPrice ? ((purchasePrice / fairPrice) * 100) : null;
    const isOvervalued = currentPriceVsFair ? currentPriceVsFair > 110 : false;
    const isUndervalued = currentPriceVsFair ? currentPriceVsFair < 90 : false;

    // DSR (총부채원리금상환비율) — 연소득 6000만 기준
    const annualIncome = 60000000;
    const dsr = (annualInterest / annualIncome) * 100;

    // PIR (Price to Income Ratio)
    const pir = purchasePrice / annualIncome;

    // 월세 커버리지 (월세가 월 이자를 커버하는지)
    const rentCoverage = monthlyPayment > 0 ? (monthlyRent / monthlyPayment) * 100 : 0;

    // 손익분기 성장률 (투자자가 최소한 본전이 되려면)
    const breakEvenGrowth = equity > 0
        ? ((annualInterest - annualRent) / purchasePrice) * 100
        : 0;

    // ===== 실거주 리스크 =====
    const residentialRisks: { level: 'safe' | 'caution' | 'danger'; text: string }[] = [];

    if (dsr > 40) residentialRisks.push({ level: 'danger', text: `DSR ${dsr.toFixed(1)}% — 총부채상환비율 40% 초과, 대출 규제 위험` });
    else if (dsr > 30) residentialRisks.push({ level: 'caution', text: `DSR ${dsr.toFixed(1)}% — 상환 부담 주의` });
    else residentialRisks.push({ level: 'safe', text: `DSR ${dsr.toFixed(1)}% — 안정적 상환 수준` });

    if (pir > 15) residentialRisks.push({ level: 'danger', text: `PIR ${pir.toFixed(1)}배 — 연소득 대비 주택가격 과도` });
    else if (pir > 10) residentialRisks.push({ level: 'caution', text: `PIR ${pir.toFixed(1)}배 — 연소득 대비 주택가격 다소 높음` });
    else residentialRisks.push({ level: 'safe', text: `PIR ${pir.toFixed(1)}배 — 적정 수준` });

    if (ltv > 0.7) residentialRisks.push({ level: 'danger', text: `LTV ${(ltv * 100).toFixed(0)}% — 고레버리지, 하방 리스크 큼` });
    else if (ltv > 0.5) residentialRisks.push({ level: 'caution', text: `LTV ${(ltv * 100).toFixed(0)}% — 적정 레버리지` });
    else residentialRisks.push({ level: 'safe', text: `LTV ${(ltv * 100).toFixed(0)}% — 보수적 레버리지` });

    if (monthlyPayment > annualIncome / 12 * 0.3) {
        residentialRisks.push({ level: 'caution', text: `월 이자 ₩${monthlyPayment.toLocaleString()} — 월소득 30% 초과` });
    }

    if (jeonseRatio > 0.9) residentialRisks.push({ level: 'danger', text: `전세가율 ${(jeonseRatio * 100).toFixed(1)}% — 깡통전세 위험` });
    else if (jeonseRatio > 0.8) residentialRisks.push({ level: 'caution', text: `전세가율 ${(jeonseRatio * 100).toFixed(1)}% — 전세가율 높음, 역전세 주의` });

    // ===== 투자용 리스크 =====
    const investmentRisks: { level: 'safe' | 'caution' | 'danger'; text: string }[] = [];

    if (nominalYield < 3) investmentRisks.push({ level: 'danger', text: `명목 수익률 ${nominalYield.toFixed(1)}% — 예금 금리보다 낮음, 투자 매력 저조` });
    else if (nominalYield < 5) investmentRisks.push({ level: 'caution', text: `명목 수익률 ${nominalYield.toFixed(1)}% — 시장 평균 수준` });
    else investmentRisks.push({ level: 'safe', text: `명목 수익률 ${nominalYield.toFixed(1)}% — 양호한 수익률` });

    if (leverageYield < 0) investmentRisks.push({ level: 'danger', text: `레버리지 수익률 ${leverageYield.toFixed(1)}% — 역레버리지 발생 (이자>임대수익)` });
    else if (leverageYield < requiredReturn) investmentRisks.push({ level: 'caution', text: `레버리지 수익률 ${leverageYield.toFixed(1)}% — 요구수익률 미달` });
    else investmentRisks.push({ level: 'safe', text: `레버리지 수익률 ${leverageYield.toFixed(1)}% — 요구수익률 충족` });

    if (rentCoverage < 100) investmentRisks.push({ level: 'danger', text: `월세 커버리지 ${rentCoverage.toFixed(0)}% — 월세로 이자 미커버, 매월 현금 유출` });
    else investmentRisks.push({ level: 'safe', text: `월세 커버리지 ${rentCoverage.toFixed(0)}% — 월세로 이자 커버 가능` });

    if (isOvervalued) investmentRisks.push({ level: 'danger', text: `적정가 대비 ${currentPriceVsFair?.toFixed(0)}% — 고평가 구간` });
    else if (isUndervalued) investmentRisks.push({ level: 'safe', text: `적정가 대비 ${currentPriceVsFair?.toFixed(0)}% — 저평가 구간, 매수 기회` });
    else if (currentPriceVsFair) investmentRisks.push({ level: 'caution', text: `적정가 대비 ${currentPriceVsFair?.toFixed(0)}% — 적정 수준` });

    if (breakEvenGrowth > 3) investmentRisks.push({ level: 'danger', text: `손익분기 성장률 ${breakEvenGrowth.toFixed(1)}% — 높은 가격 상승이 필요` });
    else if (breakEvenGrowth > 0) investmentRisks.push({ level: 'caution', text: `연 ${breakEvenGrowth.toFixed(1)}% 이상 상승해야 본전` });

    if (gap > 0 && gap < 100000000) investmentRisks.push({ level: 'safe', text: `갭 ₩${(gap / 10000).toLocaleString()}만 — 소액 갭투자 가능 구간` });

    // 종합 투자 판정
    let investmentVerdict: { label: string; color: string; detail: string };
    const dangerCount = investmentRisks.filter(r => r.level === 'danger').length;
    const safeCount = investmentRisks.filter(r => r.level === 'safe').length;

    if (dangerCount >= 2) {
        investmentVerdict = { label: '⛔ 투자 비추천', color: '#ef4444', detail: '다수의 위험 요소가 존재합니다. 신중한 재검토가 필요합니다.' };
    } else if (safeCount >= 3 && dangerCount === 0) {
        investmentVerdict = { label: '✅ 투자 유망', color: '#10b981', detail: '수익률과 리스크 지표가 양호합니다.' };
    } else {
        investmentVerdict = { label: '⚠️ 조건부 투자', color: '#f59e0b', detail: '일부 리스크가 있으나, 시장 상황에 따라 검토 가치 있음.' };
    }

    return {
        jeonseRatio, gap, annualRent, loanAmount, equity, annualInterest, monthlyPayment,
        nominalYield, leverageYield, requiredReturn, impliedGrowthRate,
        fairPrice, currentPriceVsFair, breakEvenGrowth,
        dsr, pir, rentCoverage,
        residentialRisks, investmentRisks, investmentVerdict,
    };
}

// ===== 페이지 =====
export default function RealEstatePage() {
    const [rates, setRates] = useState<LoanRate[]>([]);
    const [loading, setLoading] = useState(true);

    // 계산기 입력 — 핵심 5개 필드
    const [purchasePrice, setPurchasePrice] = useState('50000'); // 만원 단위
    const [jeonsePrice, setJeonsePrice] = useState('35000');
    const [monthlyRent, setMonthlyRent] = useState('100');
    const [loanRate, setLoanRate] = useState('4.0');
    const [ltv, setLtv] = useState('50');

    const fetchRates = useCallback(async () => {
        try {
            const res = await fetch('/api/realestate/loans');
            const data = await res.json();
            setRates(Array.isArray(data) ? data : []);
        } catch (err) { console.error(err); }
        finally { setLoading(false); }
    }, []);

    useEffect(() => { fetchRates(); }, [fetchRates]);

    // 실시간 분석 (입력값 변경 시 자동)
    const result = useMemo(() => {
        const pp = (parseInt(purchasePrice) || 0) * 10000;
        const jp = (parseInt(jeonsePrice) || 0) * 10000;
        const mr = (parseInt(monthlyRent) || 0) * 10000;
        const lr = (parseFloat(loanRate) || 0) / 100;
        const ltvV = (parseFloat(ltv) || 0) / 100;
        return analyze({ purchasePrice: pp, jeonsePrice: jp, monthlyRent: mr, loanRate: lr, ltv: ltvV });
    }, [purchasePrice, jeonsePrice, monthlyRent, loanRate, ltv]);

    // 카테고리별 그룹핑
    const groupedRates = rates.reduce((acc, rate) => {
        if (!acc[rate.category]) acc[rate.category] = [];
        acc[rate.category].push(rate);
        return acc;
    }, {} as Record<string, LoanRate[]>);

    const riskIcon = (level: string) => level === 'danger' ? '🔴' : level === 'caution' ? '🟡' : '🟢';

    if (loading) {
        return <div className="loading"><div className="spinner" /><p>부동산 데이터 로드 중...</p></div>;
    }

    return (
        <div>
            <div className="page-header">
                <h2>🏠 부동산 모듈</h2>
                <p className="subtitle">대출 금리 모니터링 · 투자 수익률 분석 · 리스크 진단</p>
            </div>

            {/* 대출 금리 모니터링 */}
            {Object.keys(groupedRates).length > 0 && (
                <div className="card section-gap animate-in">
                    <div className="card-header">
                        <h3 className="card-title">📊 대출 금리 현황</h3>
                    </div>
                    {Object.entries(groupedRates).map(([category, items]) => (
                        <div key={category} style={{ marginBottom: '20px' }}>
                            <h4 style={{ fontSize: '14px', fontWeight: 700, marginBottom: '10px', color: 'var(--accent-cyan)' }}>
                                {CATEGORY_LABELS[category] || category}
                            </h4>
                            <div style={{ overflowX: 'auto' }}>
                                <table className="indicator-table">
                                    <thead><tr><th>상품</th><th>유형</th><th>최저</th><th>최고</th><th className="hide-mobile">비고</th></tr></thead>
                                    <tbody>
                                        {items.map(rate => (
                                            <tr key={rate.id}>
                                                <td style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{rate.product}</td>
                                                <td>
                                                    <span className="badge" style={{
                                                        background: rate.type === 'fixed' ? 'rgba(59,130,246,0.15)' : rate.type === 'variable' ? 'rgba(245,158,11,0.15)' : 'rgba(139,92,246,0.15)',
                                                        color: rate.type === 'fixed' ? 'var(--accent-blue)' : rate.type === 'variable' ? 'var(--accent-orange)' : 'var(--accent-purple)',
                                                    }}>{TYPE_LABELS[rate.type] || rate.type}</span>
                                                </td>
                                                <td className="value" style={{ color: 'var(--accent-green)' }}>{rate.rateMin}%</td>
                                                <td className="value" style={{ color: 'var(--accent-red)' }}>{rate.rateMax}%</td>
                                                <td className="hide-mobile" style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{rate.note}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* ===== 부동산 계산기 — 입력 영역 ===== */}
            <div className="card section-gap animate-in" style={{ animationDelay: '0.1s' }}>
                <div className="card-header">
                    <h3 className="card-title">🧮 부동산 계산기</h3>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>값 입력 시 실시간 분석</span>
                </div>

                {/* 입력 필드 — PC 3열, 모바일 1열 */}
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                    gap: '16px', marginBottom: '16px',
                }}>
                    <InputField label="매매가" value={purchasePrice} onChange={setPurchasePrice} unit="만원"
                        hint={`${((parseInt(purchasePrice) || 0) / 10000).toFixed(1)}억`}
                        color="#3b82f6" />
                    <InputField label="전세가" value={jeonsePrice} onChange={setJeonsePrice} unit="만원"
                        hint={`${((parseInt(jeonsePrice) || 0) / 10000).toFixed(1)}억`}
                        color="#8b5cf6" />
                    <InputField label="월세" value={monthlyRent} onChange={setMonthlyRent} unit="만원"
                        hint={`연 ${((parseInt(monthlyRent) || 0) * 12).toLocaleString()}만원`}
                        color="#f59e0b" />
                </div>

                {/* 슬라이더 — 2열 */}
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                    gap: '16px',
                }}>
                    <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                            <label style={{ fontSize: '13px', color: 'var(--text-muted)', fontWeight: 600 }}>대출 금리</label>
                            <span style={{ fontSize: '15px', fontWeight: 700, color: '#ef4444' }}>{loanRate}%</span>
                        </div>
                        <input type="range" min="1" max="8" step="0.1" value={loanRate}
                            onChange={e => setLoanRate(e.target.value)}
                            style={{ width: '100%', accentColor: '#ef4444' }} />
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--text-muted)' }}>
                            <span>1%</span><span>8%</span>
                        </div>
                    </div>
                    <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                            <label style={{ fontSize: '13px', color: 'var(--text-muted)', fontWeight: 600 }}>LTV (대출비율)</label>
                            <span style={{ fontSize: '15px', fontWeight: 700, color: '#06b6d4' }}>{ltv}%</span>
                        </div>
                        <input type="range" min="0" max="80" step="5" value={ltv}
                            onChange={e => setLtv(e.target.value)}
                            style={{ width: '100%', accentColor: '#06b6d4' }} />
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--text-muted)' }}>
                            <span>0%</span><span>80%</span>
                        </div>
                    </div>
                </div>

                {/* 입력 요약 박스 */}
                {result && (
                    <div style={{
                        marginTop: '16px', padding: '14px 18px', borderRadius: '12px',
                        background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.15)',
                    }}>
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                            gap: '10px', fontSize: '13px',
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span style={{ color: 'var(--text-muted)' }}>대출금액</span>
                                <span style={{ fontWeight: 600 }}>₩{result.loanAmount.toLocaleString()}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span style={{ color: 'var(--text-muted)' }}>자기자본</span>
                                <span style={{ fontWeight: 600, color: 'var(--accent-green)' }}>₩{result.equity.toLocaleString()}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span style={{ color: 'var(--text-muted)' }}>월 이자</span>
                                <span style={{ fontWeight: 600, color: 'var(--accent-orange)' }}>₩{result.monthlyPayment.toLocaleString()}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span style={{ color: 'var(--text-muted)' }}>갭(매매-전세)</span>
                                <span style={{ fontWeight: 600, color: 'var(--accent-purple)' }}>₩{result.gap.toLocaleString()}</span>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* ===== 분석 결과 ===== */}
            {result ? (
                <>
                    {/* 수익률 지표 — PC 4열, 모바일 2열 */}
                    <div className="card section-gap animate-in" style={{ animationDelay: '0.15s' }}>
                        <div className="card-header">
                            <h3 className="card-title">📈 수익률 분석</h3>
                        </div>
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                            gap: '10px',
                        }}>
                            <MetricCard label="전세가율" value={`${(result.jeonseRatio * 100).toFixed(1)}%`}
                                color={result.jeonseRatio > 0.8 ? '#ef4444' : result.jeonseRatio > 0.7 ? '#f59e0b' : '#3b82f6'} />
                            <MetricCard label="명목 수익률" value={`${result.nominalYield.toFixed(2)}%`}
                                color={result.nominalYield >= 5 ? '#10b981' : result.nominalYield >= 3 ? '#f59e0b' : '#ef4444'}
                                sub="Cap Rate" />
                            <MetricCard label="레버리지 수익률" value={`${result.leverageYield.toFixed(2)}%`}
                                color={result.leverageYield > 0 ? '#10b981' : '#ef4444'}
                                sub={result.leverageYield < 0 ? '역레버리지!' : 'ROE'} />
                            <MetricCard label="요구 수익률" value={`${result.requiredReturn.toFixed(1)}%`}
                                color="#8b5cf6" sub="무위험3%+프리미엄3%" />
                            <MetricCard label="기대 성장률" value={`${result.impliedGrowthRate.toFixed(2)}%`}
                                color={result.impliedGrowthRate > 5 ? '#ef4444' : result.impliedGrowthRate > 3 ? '#f59e0b' : '#10b981'}
                                sub="필요 연 상승률" />
                            <MetricCard label="손익분기 성장률" value={`${result.breakEvenGrowth.toFixed(2)}%`}
                                color={result.breakEvenGrowth > 3 ? '#ef4444' : '#f59e0b'}
                                sub="본전 최소 상승률" />
                            <MetricCard label="적정 가격" value={result.fairPrice ? `${(result.fairPrice / 100000000).toFixed(1)}억` : '-'}
                                color="#06b6d4" sub="DCF 기준" />
                            <MetricCard label="현재가 vs 적정가" value={result.currentPriceVsFair ? `${result.currentPriceVsFair.toFixed(0)}%` : '-'}
                                color={result.currentPriceVsFair && result.currentPriceVsFair > 110 ? '#ef4444'
                                    : result.currentPriceVsFair && result.currentPriceVsFair < 90 ? '#10b981' : '#f59e0b'}
                                sub={result.currentPriceVsFair && result.currentPriceVsFair > 110 ? '고평가' : result.currentPriceVsFair && result.currentPriceVsFair < 90 ? '저평가' : '적정'} />
                        </div>
                    </div>

                    {/* 투자 가치 종합 판정 */}
                    <div className="card section-gap animate-in" style={{
                        animationDelay: '0.2s',
                        background: `linear-gradient(135deg, ${result.investmentVerdict.color}10, ${result.investmentVerdict.color}05)`,
                        border: `1px solid ${result.investmentVerdict.color}30`,
                    }}>
                        <div style={{ textAlign: 'center', padding: '12px' }}>
                            <div style={{ fontSize: '28px', fontWeight: 800, color: result.investmentVerdict.color, marginBottom: '8px' }}>
                                {result.investmentVerdict.label}
                            </div>
                            <p style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>{result.investmentVerdict.detail}</p>
                        </div>
                    </div>

                    {/* 리스크 — PC 2열, 모바일 1열 */}
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
                        gap: '16px',
                    }} className="section-gap">
                        {/* 실거주 리스크 */}
                        <div className="card animate-in" style={{ animationDelay: '0.25s' }}>
                            <div className="card-header">
                                <h3 className="card-title">🏡 실거주 리스크</h3>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                {result.residentialRisks.map((r, i) => (
                                    <RiskRow key={i} icon={riskIcon(r.level)} text={r.text} level={r.level} />
                                ))}
                            </div>
                        </div>

                        {/* 투자용 리스크 */}
                        <div className="card animate-in" style={{ animationDelay: '0.3s' }}>
                            <div className="card-header">
                                <h3 className="card-title">💼 투자용 리스크</h3>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                {result.investmentRisks.map((r, i) => (
                                    <RiskRow key={i} icon={riskIcon(r.level)} text={r.text} level={r.level} />
                                ))}
                            </div>
                        </div>
                    </div>
                </>
            ) : (
                <div className="card section-gap animate-in" style={{ animationDelay: '0.15s' }}>
                    <div className="empty-state" style={{ padding: '40px 20px' }}>
                        <div className="emoji">🏠</div>
                        <h3>매매가를 입력하면 자동 분석됩니다</h3>
                        <p>위에 값을 입력하면 실시간으로 결과가 표시됩니다.</p>
                    </div>
                </div>
            )}
        </div>
    );
}

// ===== 서브 컴포넌트 =====
function InputField({ label, value, onChange, unit, hint, color }:
    { label: string; value: string; onChange: (v: string) => void; unit: string; hint: string; color: string }) {
    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '6px' }}>
                <label style={{ fontSize: '13px', fontWeight: 600, color: color }}>{label}</label>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{hint}</span>
            </div>
            <div style={{ position: 'relative' }}>
                <input type="text" value={value}
                    onChange={e => onChange(e.target.value.replace(/[^0-9]/g, ''))}
                    style={{
                        width: '100%', padding: '10px 50px 10px 14px', borderRadius: '10px',
                        border: `1px solid ${color}40`, background: 'var(--bg-input)',
                        color: 'var(--text-primary)', fontSize: '16px', fontWeight: 700, fontFamily: 'inherit',
                    }} />
                <span style={{
                    position: 'absolute', right: '14px', top: '50%', transform: 'translateY(-50%)',
                    fontSize: '12px', color: 'var(--text-muted)',
                }}>{unit}</span>
            </div>
        </div>
    );
}

function MetricCard({ label, value, color, sub }:
    { label: string; value: string; color: string; sub?: string }) {
    return (
        <div style={{
            padding: '14px', borderRadius: '12px', textAlign: 'center',
            background: `${color}08`, border: `1px solid ${color}20`, minWidth: 0,
        }}>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px', lineHeight: 1.4, fontWeight: 500 }}>{label}</div>
            <div style={{ fontSize: 'clamp(16px, 4vw, 22px)', fontWeight: 800, color, letterSpacing: '-0.02em' }}>{value}</div>
            {sub && <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '3px', lineHeight: 1.3, opacity: 0.8 }}>{sub}</div>}
        </div>
    );
}

function RiskRow({ icon, text, level }: { icon: string; text: string; level: string }) {
    const bgColor = level === 'danger' ? 'rgba(239,68,68,0.06)' : level === 'caution' ? 'rgba(245,158,11,0.06)' : 'rgba(16,185,129,0.06)';
    const borderColor = level === 'danger' ? 'rgba(239,68,68,0.15)' : level === 'caution' ? 'rgba(245,158,11,0.15)' : 'rgba(16,185,129,0.15)';
    return (
        <div style={{
            display: 'flex', alignItems: 'flex-start', gap: '8px',
            padding: '10px 12px', borderRadius: '8px',
            background: bgColor, border: `1px solid ${borderColor}`,
        }}>
            <span style={{ fontSize: '14px', flexShrink: 0 }}>{icon}</span>
            <span style={{ fontSize: '13px', lineHeight: 1.5, color: 'var(--text-secondary)' }}>{text}</span>
        </div>
    );
}
