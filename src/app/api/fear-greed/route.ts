// Fear & Greed API — 실시간 Yahoo Finance 데이터 기반 직접 계산
import { NextResponse } from 'next/server';

let cache: { data: unknown; ts: number } | null = null;
const CACHE_TTL = 300_000;

async function fetchQuotes() {
    const results = new Map<string, { price: number; prevClose: number; changePct: number }>();
    const tickers: Record<string, string> = {
        SP500: '^GSPC', NASDAQ: '^IXIC', VIX: '^VIX', DXY: 'DX-Y.NYB',
        US_10Y: '^TNX', US_2Y: '^IRX', KOSPI: '^KS11', USD_KRW: 'KRW=X', GOLD: 'GC=F',
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

function fgLabel(score: number) {
    if (score <= 20) return 'Extreme Fear';
    if (score <= 40) return 'Fear';
    if (score <= 60) return 'Neutral';
    if (score <= 80) return 'Greed';
    return 'Extreme Greed';
}

function krLabel(score: number) {
    if (score <= 20) return '극단적 공포';
    if (score <= 40) return '공포';
    if (score <= 60) return '중립';
    if (score <= 80) return '탐욕';
    return '극단적 탐욕';
}

function calcFearGreed(q: Map<string, { price: number; prevClose: number; changePct: number }>) {
    // US Fear & Greed (0-100)
    const usComponents: Record<string, { value: number; score: number }> = {};
    let usTotal = 0; let usCount = 0;

    // SP500 모멘텀
    const sp = q.get('SP500');
    if (sp) {
        const s = Math.min(100, Math.max(0, 50 + sp.changePct * 15));
        usComponents.SPX_Momentum = { value: sp.changePct, score: Math.round(s) };
        usTotal += s; usCount++;
    }

    // VIX 역수 (낮은 VIX = 탐욕)
    const vix = q.get('VIX');
    if (vix) {
        const s = Math.min(100, Math.max(0, 100 - (vix.price - 10) * 3));
        usComponents.VIX_Inverse = { value: vix.price, score: Math.round(s) };
        usTotal += s; usCount++;
    }

    // 금리 스프레드
    const us10 = q.get('US_10Y'); const us2 = q.get('US_2Y');
    if (us10 && us2) {
        const spread = us10.price - us2.price;
        const s = Math.min(100, Math.max(0, 50 + spread * 30));
        usComponents.Yield_Spread = { value: spread, score: Math.round(s) };
        usTotal += s; usCount++;
    }

    // 안전자산 수요 (금 상승 = 공포)
    const gold = q.get('GOLD');
    if (gold) {
        const s = Math.min(100, Math.max(0, 50 - gold.changePct * 10));
        usComponents.Safe_Haven = { value: gold.changePct, score: Math.round(s) };
        usTotal += s; usCount++;
    }

    // DXY (달러 강세 = 공포)
    const dxy = q.get('DXY');
    if (dxy) {
        const s = Math.min(100, Math.max(0, 50 - dxy.changePct * 12));
        usComponents.DXY_Fear = { value: dxy.changePct, score: Math.round(s) };
        usTotal += s; usCount++;
    }

    const usFG = usCount > 0 ? Math.round(usTotal / usCount) : 50;

    // KR Sentiment (0-100)
    const krComponents: Record<string, { value: number; score: number; weight: number }> = {};
    let krWeightedTotal = 0; let krWeightSum = 0;

    // KOSPI 모멘텀
    const kospi = q.get('KOSPI');
    if (kospi) {
        const s = Math.min(100, Math.max(0, 50 + kospi.changePct * 15));
        krComponents.KOSPI_Momentum = { value: kospi.changePct, score: Math.round(s) / 100, weight: 0.3 };
        krWeightedTotal += (s / 100) * 0.3; krWeightSum += 0.3;
    }

    // VIX 수준
    if (vix) {
        const s = Math.min(1, Math.max(0, 1 - (vix.price - 10) / 30));
        krComponents.VIX_Level = { value: vix.price, score: +s.toFixed(2), weight: 0.2 };
        krWeightedTotal += s * 0.2; krWeightSum += 0.2;
    }

    // 환율 스트레스 (원화 약세 = 공포)
    const krw = q.get('USD_KRW');
    if (krw) {
        const s = Math.min(1, Math.max(0, 1 - (krw.price - 1200) / 300));
        krComponents.FX_Stress = { value: krw.price, score: +s.toFixed(2), weight: 0.3 };
        krWeightedTotal += s * 0.3; krWeightSum += 0.3;
    }

    // NASDAQ 영향
    const ndx = q.get('NASDAQ');
    if (ndx) {
        const s = Math.min(1, Math.max(0, 0.5 + ndx.changePct / 10));
        krComponents.NASDAQ_Impact = { value: ndx.changePct, score: +s.toFixed(2), weight: 0.2 };
        krWeightedTotal += s * 0.2; krWeightSum += 0.2;
    }

    const krSent = krWeightSum > 0 ? Math.round((krWeightedTotal / krWeightSum) * 100) : 50;

    return {
        usFearGreed: usFG, usLabel: fgLabel(usFG),
        krSentiment: krSent, krLabel: krLabel(krSent),
        components: { us: usComponents, kr: krComponents },
        date: new Date().toISOString(),
    };
}

export async function GET() {
    try {
        if (cache && Date.now() - cache.ts < CACHE_TTL) return NextResponse.json(cache.data);
        const quotes = await fetchQuotes();
        if (quotes.size === 0) throw new Error('No data');
        const result = calcFearGreed(quotes);
        cache = { data: result, ts: Date.now() };
        return NextResponse.json(result);
    } catch {
        return NextResponse.json({ usFearGreed: 50, usLabel: 'Neutral', krSentiment: 50, krLabel: '중립', components: { us: {}, kr: {} }, date: new Date().toISOString() });
    }
}
