// Real Estate — 대출 금리 API
import { NextRequest, NextResponse } from 'next/server';

const DUMMY_RATES = [
    { id: '1', category: 'policy_mortgage', product: '보금자리론', type: 'fixed', rateMin: 3.35, rateMax: 3.95, baseDate: '2026-03-01', note: '고정금리 20년' },
    { id: '2', category: 'policy_mortgage', product: '디딤돌대출', type: 'fixed', rateMin: 2.45, rateMax: 3.55, baseDate: '2026-03-01', note: '무주택 서민/실수요자' },
    { id: '3', category: 'policy_mortgage', product: '버팀목 전세', type: 'fixed', rateMin: 2.10, rateMax: 2.90, baseDate: '2026-03-01', note: '전세자금 대출' },
    { id: '4', category: 'bank_mortgage', product: '시중은행 변동', type: 'variable', rateMin: 3.80, rateMax: 5.20, baseDate: '2026-03-01', note: 'COFIX 연동' },
    { id: '5', category: 'bank_mortgage', product: '시중은행 고정', type: 'fixed', rateMin: 3.50, rateMax: 4.80, baseDate: '2026-03-01', note: '금융채 5년물 연동' },
    { id: '6', category: 'bank_mortgage', product: '시중은행 혼합', type: 'mixed', rateMin: 3.60, rateMax: 4.90, baseDate: '2026-03-01', note: '5년 고정 후 변동' },
    { id: '7', category: 'jeonse', product: '전세자금 대출', type: 'variable', rateMin: 3.40, rateMax: 4.80, baseDate: '2026-03-01', note: '임차보증금 담보' },
];

export async function GET() {
    try {
        const prisma = (await import('@/lib/db')).default;
        const rates = await prisma.rELoanRate.findMany({ orderBy: [{ category: 'asc' }, { baseDate: 'desc' }] });
        if (rates.length === 0) return NextResponse.json(DUMMY_RATES);
        return NextResponse.json(rates);
    } catch {
        return NextResponse.json(DUMMY_RATES);
    }
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        return NextResponse.json({ message: '금리 추가 — DB 연결 후 활성화', data: body });
    } catch (error) {
        console.error('RE Loans POST 오류:', error);
        return NextResponse.json({ error: '금리 추가 실패' }, { status: 500 });
    }
}
