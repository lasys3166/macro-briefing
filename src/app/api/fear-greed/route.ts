// Fear & Greed API
import { NextResponse } from 'next/server';

const DUMMY = {
    usFearGreed: 55,
    usLabel: 'Neutral',
    krSentiment: 42,
    krLabel: '공포',
    components: {
        us: {
            SPX_Momentum: { value: 1.2, score: 56 },
            VIX_Inverse: { value: 17.5, score: 76 },
            Price_vs_MA: { value: 52, score: 52 },
            Yield_Spread: { value: 48, score: 48 },
            Safe_Haven: { value: -0.3, score: 53 },
        },
        kr: {
            KOSPI_Momentum: { value: -0.5, score: 0.45, weight: 0.25 },
            Volatility: { value: 17.5, score: 0.22, weight: 0.15 },
            FX_Stress: { value: 1350, score: 0.50, weight: 0.20 },
            VIX_Level: { value: 17.5, score: 0.22, weight: 0.20 },
            Trading_Value: { value: 0, score: 0.50, weight: 0.10 },
            Foreign_Flow: { value: 0, score: 0.50, weight: 0.10 },
        },
    },
    date: new Date().toISOString(),
};

export async function GET() {
    try {
        const prisma = (await import('@/lib/db')).default;
        const sentiment = await prisma.sentimentSnapshot.findFirst({ orderBy: { date: 'desc' } });
        return NextResponse.json(sentiment || DUMMY);
    } catch {
        return NextResponse.json(DUMMY);
    }
}
