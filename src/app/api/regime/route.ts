// Macro Regime AI API
import { NextResponse } from 'next/server';

const DUMMY_REGIME = {
    score: 15,
    label: 'NEUTRAL',
    explanation: '현재 시장은 혼합된 신호를 보이고 있습니다. VIX가 안정적이나 금리 방향에 대한 불확실성이 존재합니다.',
    drivers: {
        SP500: { score: 30, reason: '20일 모멘텀 +1.2%' },
        NASDAQ: { score: 25, reason: '20일 모멘텀 +0.8%' },
        VIX: { score: 40, reason: 'VIX 17.5' },
        DXY: { score: -10, reason: '20일 변화 +0.5%' },
        US_10Y_BOND: { score: -15, reason: '일변동 +1.2%' },
        COPPER: { score: 20, reason: '20일 모멘텀 +1.0%' },
        YIELD_CURVE: { score: 10, reason: '10Y-2Y 스프레드 +15bp' },
    },
    tomorrowWatch: 'FOMC 의사록 발표 예정, CPI 데이터 확인 필요, 기술주 실적 시즌 주목',
    date: new Date().toISOString(),
};

export async function GET() {
    try {
        const prisma = (await import('@/lib/db')).default;
        const regime = await prisma.regimeSnapshot.findFirst({
            orderBy: { date: 'desc' },
        });
        return NextResponse.json(regime || DUMMY_REGIME);
    } catch {
        return NextResponse.json(DUMMY_REGIME);
    }
}
