// Correlation Engine API
import { NextResponse } from 'next/server';

const DUMMY_PAIRS: Record<string, number> = {
    SPX_vs_US10Y: -0.42,
    NDX_vs_US10Y: -0.55,
    SPX_vs_DXY: -0.31,
    NDX_vs_DXY: -0.38,
    VIX_vs_SPX: -0.82,
    GOLD_vs_US10Y: -0.25,
    COPPER_vs_SPX: 0.65,
    NIKKEI_vs_USDJPY: 0.72,
    KOSPI_vs_USDKRW: -0.58,
    WTI_vs_DXY: -0.45,
};

const DUMMY = {
    windows: [
        {
            window: 20,
            pairs: DUMMY_PAIRS,
            topPositive: [
                { id: 'NIKKEI_vs_USDJPY', label: '니케이 vs 달러엔', value: 0.72 },
                { id: 'COPPER_vs_SPX', label: '구리 vs S&P500', value: 0.65 },
            ],
            topNegative: [
                { id: 'VIX_vs_SPX', label: 'VIX vs S&P500', value: -0.82 },
                { id: 'KOSPI_vs_USDKRW', label: '코스피 vs 원달러', value: -0.58 },
            ],
            shifts: [],
        },
        {
            window: 60,
            pairs: Object.fromEntries(
                Object.entries(DUMMY_PAIRS).map(([k, v]) => [k, +(v * 0.92).toFixed(4)])
            ),
            topPositive: [],
            topNegative: [],
            shifts: [],
        },
        {
            window: 120,
            pairs: Object.fromEntries(
                Object.entries(DUMMY_PAIRS).map(([k, v]) => [k, +(v * 0.85).toFixed(4)])
            ),
            topPositive: [],
            topNegative: [],
            shifts: [],
        },
    ],
    date: new Date().toISOString(),
};

export async function GET() {
    try {
        const prisma = (await import('@/lib/db')).default;
        const snapshots = await prisma.correlationSnapshot.findMany({
            orderBy: { date: 'desc' },
            take: 3,
            distinct: ['window'],
        });
        if (snapshots.length === 0) return NextResponse.json(DUMMY);
        return NextResponse.json({ windows: snapshots, date: snapshots[0]?.date || new Date().toISOString() });
    } catch {
        return NextResponse.json(DUMMY);
    }
}
