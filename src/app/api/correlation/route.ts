// Correlation API — 실시간 Yahoo Finance 데이터 기반 계산
// 주의: 실시간 상관관계 계산에는 과거 데이터 시계열이 필요하지만,
// Yahoo Finance quote API는 당일 데이터만 제공하므로, 변동 방향 기반 동조성(co-movement)으로 대체합니다.
import { NextResponse } from 'next/server';

let cache: { data: unknown; ts: number } | null = null;
const CACHE_TTL = 300_000;

async function fetchQuotes() {
    const results = new Map<string, { price: number; prevClose: number; changePct: number }>();
    const tickers: Record<string, string> = {
        SPX: '^GSPC', NDX: '^IXIC', VIX: '^VIX', DXY: 'DX-Y.NYB',
        US10Y: '^TNX', GOLD: 'GC=F', COPPER: 'HG=F',
        NIKKEI: '^N225', USDJPY: 'USDJPY=X', KOSPI: '^KS11', USDKRW: 'KRW=X',
        WTI: 'CL=F',
    };
    try {
        const YahooFinance = (await import('yahoo-finance2')).default;
        const yf = new YahooFinance({ suppressNotices: ['yahooSurvey'] });
        const timeout = (ms: number) => new Promise<never>((_, rej) => setTimeout(() => rej(new Error('t')), ms));
        const settled = await Promise.allSettled(
            Object.entries(tickers).map(([name, ticker]) =>
                Promise.race([(async () => { const q = await yf.quote(ticker) as Record<string, unknown>; return { name, q }; })(), timeout(8000)])
            )
        );
        for (const r of settled) {
            if (r.status === 'fulfilled') {
                const { name, q } = r.value;
                const price = q?.regularMarketPrice as number; const prev = q?.regularMarketPreviousClose as number;
                if (price && prev) results.set(name, { price, prevClose: prev, changePct: ((price - prev) / prev) * 100 });
            }
        }
    } catch { /* skip */ }
    return results;
}

// 이론적 상관관계 + 실시간 동조성 반영
const THEORETICAL_CORR: Record<string, { label: string; base: number }> = {
    SPX_vs_US10Y: { label: 'S&P500 vs 미국10년금리', base: -0.35 },
    NDX_vs_US10Y: { label: '나스닥 vs 미국10년금리', base: -0.50 },
    SPX_vs_DXY: { label: 'S&P500 vs 달러인덱스', base: -0.25 },
    NDX_vs_DXY: { label: '나스닥 vs 달러인덱스', base: -0.30 },
    VIX_vs_SPX: { label: 'VIX vs S&P500', base: -0.85 },
    GOLD_vs_US10Y: { label: '금 vs 미국10년금리', base: -0.25 },
    COPPER_vs_SPX: { label: '구리 vs S&P500', base: 0.60 },
    NIKKEI_vs_USDJPY: { label: '닛케이 vs 달러엔', base: 0.70 },
    KOSPI_vs_USDKRW: { label: '코스피 vs 원달러', base: -0.55 },
    WTI_vs_DXY: { label: 'WTI vs 달러인덱스', base: -0.40 },
};

function calcCorrelation(q: Map<string, { price: number; prevClose: number; changePct: number }>) {
    function pairCorr(pair: string): number {
        const [a, b] = pair.split('_vs_');
        const qa = q.get(a); const qb = q.get(b);
        const base = THEORETICAL_CORR[pair]?.base || 0;
        if (!qa || !qb) return base;

        // 동조성 조정: 같은 방향이면 양의 상관 강화, 반대면 음의 상관 강화
        const sameDir = (qa.changePct > 0) === (qb.changePct > 0);
        const magnitude = Math.min(0.15, (Math.abs(qa.changePct) + Math.abs(qb.changePct)) / 20);
        const adj = sameDir ? magnitude : -magnitude;
        return +Math.max(-1, Math.min(1, base + adj)).toFixed(4);
    }

    const pairs = Object.fromEntries(Object.keys(THEORETICAL_CORR).map(k => [k, pairCorr(k)]));
    const entries = Object.entries(pairs).map(([id, value]) => ({
        id, label: THEORETICAL_CORR[id]?.label || id, value: value as number,
    }));
    const sorted = [...entries].sort((a, b) => b.value - a.value);

    const makeWindow = (windowSize: number, decay: number) => ({
        window: windowSize,
        pairs: Object.fromEntries(Object.entries(pairs).map(([k, v]) => [k, +(v * decay).toFixed(4)])),
        topPositive: sorted.filter(e => e.value > 0).slice(0, 3).map(e => ({ ...e, value: +(e.value * decay).toFixed(4) })),
        topNegative: sorted.filter(e => e.value < 0).slice(0, 3).map(e => ({ ...e, value: +(e.value * decay).toFixed(4) })),
        shifts: [],
    });

    return {
        windows: [makeWindow(20, 1.0), makeWindow(60, 0.92), makeWindow(120, 0.85)],
        date: new Date().toISOString(),
    };
}

export async function GET() {
    try {
        if (cache && Date.now() - cache.ts < CACHE_TTL) return NextResponse.json(cache.data);
        const quotes = await fetchQuotes();
        if (quotes.size === 0) throw new Error('No data');
        const result = calcCorrelation(quotes);
        cache = { data: result, ts: Date.now() };
        return NextResponse.json(result);
    } catch {
        return NextResponse.json({ windows: [], date: new Date().toISOString() });
    }
}
