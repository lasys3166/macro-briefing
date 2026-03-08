// Macro Story API
import { NextResponse } from 'next/server';

const DUMMY = {
    summary: '미국 10년 국채금리가 4.25%로 상승하며 기술주에 하방 압력을 가했습니다. 달러 인덱스도 동반 강세를 보이며 신흥국 통화에 스트레스를 주었고, 금은 안전자산 수요 속에 소폭 상승했습니다. VIX는 18선에서 안정적이나, 수익률 커브의 추가 역전이 경기 둔화 우려를 환기시키고 있습니다.',
    drivers: [
        { name: 'US_10Y_BOND', label: '미국 10년 국채금리', changePct: 1.85, direction: 'UP' },
        { name: 'DXY', label: '달러 인덱스', changePct: 0.42, direction: 'UP' },
        { name: 'GOLD', label: '금 선물', changePct: 0.65, direction: 'UP' },
        { name: 'NASDAQ', label: '나스닥 지수', changePct: -0.78, direction: 'DOWN' },
        { name: 'USD_KRW', label: '원달러 환율', changePct: 0.35, direction: 'UP' },
    ],
    effects: [
        { cause: '미국 10년 국채금리 상승 (+1.85%)', effect: 'NASDAQ 하락 압력', description: '금리 상승 → 성장주 밸류에이션 부담' },
        { cause: '미국 10년 국채금리 상승 (+1.85%)', effect: 'DXY 상승', description: '금리 차이 확대 → 달러 강세' },
        { cause: '달러 인덱스 상승 (+0.42%)', effect: '신흥국 통화 약세', description: '달러 강세 → 원화/엔화 등 약세 압력' },
    ],
    regime: 'NEUTRAL',
    checkpoints: [
        'FOMC 의사록 공개 — 금리 인하 시그널 여부 확인',
        '미국 CPI 발표 예정 — 인플레이션 추세 점검',
        '달러/원 환율 1,400원 레벨 지지 여부',
    ],
    date: new Date().toISOString(),
};

export async function GET() {
    try {
        const prisma = (await import('@/lib/db')).default;
        const story = await prisma.macroStory.findFirst({ orderBy: { date: 'desc' } });
        return NextResponse.json(story || DUMMY);
    } catch {
        return NextResponse.json(DUMMY);
    }
}
