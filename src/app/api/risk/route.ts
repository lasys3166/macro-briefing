// Risk Radar API
import { NextResponse } from 'next/server';

const DUMMY_RISK = {
    score: 35,
    level: 'LOW',
    signals: [
        { id: 'vix_spike', label: 'VIX 급등', active: false, severity: 'low', value: 0, detail: 'VIX 17.5 — 안정' },
        { id: 'move_spike', label: 'MOVE 급등', active: false, severity: 'low', value: 0, detail: '데이터 없음' },
        { id: 'dxy_breakout', label: 'DXY 돌파', active: false, severity: 'low', value: 0, detail: 'DXY 안정' },
        { id: 'yield_spike', label: '금리 급등', active: false, severity: 'low', value: 0, detail: 'US10Y 안정' },
        { id: 'curve_inversion', label: '커브 역전', active: true, severity: 'medium', value: 0.3, detail: '수익률 커브 역전 -15bp' },
        { id: 'equity_drawdown', label: '주식 급락', active: false, severity: 'low', value: 0, detail: '조정 없음' },
        { id: 'fx_stress', label: '환율 스트레스', active: false, severity: 'low', value: 0, detail: 'USDKRW 안정' },
        { id: 'oil_shock', label: '유가 쇼크', active: false, severity: 'low', value: 0, detail: 'WTI 안정' },
        { id: 'gold_flight', label: '안전자산 선호', active: false, severity: 'low', value: 0, detail: '금 안정' },
        { id: 'em_stress', label: '신흥국 스트레스', active: false, severity: 'low', value: 0, detail: 'EM 안정' },
        { id: 'liquidity_tight', label: '유동성 긴축', active: false, severity: 'low', value: 0, detail: '데이터 없음' },
        { id: 'corr_shift', label: '상관관계 급변', active: false, severity: 'low', value: 0, detail: '변화 없음' },
    ],
    alerts: [],
    date: new Date().toISOString(),
};

export async function GET() {
    try {
        const prisma = (await import('@/lib/db')).default;
        const risk = await prisma.riskSnapshot.findFirst({ orderBy: { date: 'desc' } });
        return NextResponse.json(risk || DUMMY_RISK);
    } catch {
        return NextResponse.json(DUMMY_RISK);
    }
}
