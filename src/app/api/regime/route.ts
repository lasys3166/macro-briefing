// Macro Regime API — 실시간 Yahoo Finance 데이터 기반 직접 계산
import { NextResponse } from 'next/server';

// 메모리 캐시 (5분)
let cache: { data: unknown; ts: number } | null = null;
const CACHE_TTL = 300_000;

interface QuoteResult {
    price: number;
    prevClose: number;
    changePct: number;
}

async function fetchQuotes(): Promise<Map<string, QuoteResult>> {
    const results = new Map<string, QuoteResult>();
    const tickers: Record<string, string> = {
        SP500: '^GSPC', NASDAQ: '^IXIC', VIX: '^VIX',
        DXY: 'DX-Y.NYB', US_10Y: '^TNX', US_2Y: '^IRX',
        KOSPI: '^KS11', USD_KRW: 'KRW=X', GOLD: 'GC=F',
        WTI: 'CL=F', COPPER: 'HG=F',
    };

    try {
        const YahooFinance = (await import('yahoo-finance2')).default;
        const yf = new YahooFinance({ suppressNotices: ['yahooSurvey'] });
        const timeout = (ms: number) => new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), ms));

        const settled = await Promise.allSettled(
            Object.entries(tickers).map(([name, ticker]) =>
                Promise.race([
                    (async () => {
                        const q = await yf.quote(ticker) as Record<string, unknown>;
                        return { name, q };
                    })(), timeout(8000),
                ])
            )
        );

        for (const r of settled) {
            if (r.status === 'fulfilled') {
                const { name, q } = r.value;
                const price = q?.regularMarketPrice as number | undefined;
                const prev = q?.regularMarketPreviousClose as number | undefined;
                if (price && prev) {
                    results.set(name, { price, prevClose: prev, changePct: ((price - prev) / prev) * 100 });
                }
            }
        }
    } catch (e) { console.error('[regime] Yahoo error:', e); }
    return results;
}

function calcRegime(quotes: Map<string, QuoteResult>) {
    let score = 0;
    const drivers: Record<string, { score: number; reason: string }> = {};

    // S&P500 모멘텀
    const sp = quotes.get('SP500');
    if (sp) {
        const s = sp.changePct > 1 ? 40 : sp.changePct > 0 ? 20 : sp.changePct > -1 ? -10 : -30;
        score += s * 0.2;
        drivers.SP500 = { score: s, reason: `일변동 ${sp.changePct > 0 ? '+' : ''}${sp.changePct.toFixed(2)}%` };
    }

    // NASDAQ 모멘텀
    const ndx = quotes.get('NASDAQ');
    if (ndx) {
        const s = ndx.changePct > 1 ? 35 : ndx.changePct > 0 ? 15 : ndx.changePct > -1 ? -10 : -30;
        score += s * 0.15;
        drivers.NASDAQ = { score: s, reason: `일변동 ${ndx.changePct > 0 ? '+' : ''}${ndx.changePct.toFixed(2)}%` };
    }

    // VIX (역방향: 낮을수록 RISK_ON)
    const vix = quotes.get('VIX');
    if (vix) {
        const s = vix.price < 15 ? 50 : vix.price < 20 ? 30 : vix.price < 25 ? -10 : vix.price < 30 ? -30 : -50;
        score += s * 0.2;
        drivers.VIX = { score: s, reason: `VIX ${vix.price.toFixed(1)}` };
    }

    // DXY (강달러: 보통 RISK_OFF)
    const dxy = quotes.get('DXY');
    if (dxy) {
        const s = dxy.changePct > 0.5 ? -25 : dxy.changePct > 0 ? -10 : dxy.changePct > -0.5 ? 10 : 25;
        score += s * 0.1;
        drivers.DXY = { score: s, reason: `일변동 ${dxy.changePct > 0 ? '+' : ''}${dxy.changePct.toFixed(2)}%` };
    }

    // US 10Y BOND
    const us10 = quotes.get('US_10Y');
    if (us10) {
        const s = us10.changePct > 2 ? -30 : us10.changePct > 0 ? -10 : us10.changePct > -2 ? 10 : 20;
        score += s * 0.1;
        drivers.US_10Y_BOND = { score: s, reason: `일변동 ${us10.changePct > 0 ? '+' : ''}${us10.changePct.toFixed(2)}%` };
    }

    // COPPER (경기 선행지표)
    const copper = quotes.get('COPPER');
    if (copper) {
        const s = copper.changePct > 1 ? 30 : copper.changePct > 0 ? 15 : copper.changePct > -1 ? -10 : -25;
        score += s * 0.1;
        drivers.COPPER = { score: s, reason: `일변동 ${copper.changePct > 0 ? '+' : ''}${copper.changePct.toFixed(2)}%` };
    }

    // Yield Curve (10Y - 2Y)
    const us2 = quotes.get('US_2Y');
    if (us10 && us2) {
        const spread = us10.price - us2.price;
        const s = spread > 0.5 ? 25 : spread > 0 ? 10 : spread > -0.5 ? -15 : -30;
        score += s * 0.15;
        drivers.YIELD_CURVE = { score: s, reason: `10Y-2Y 스프레드 ${spread > 0 ? '+' : ''}${(spread * 100).toFixed(0)}bp` };
    }

    score = Math.round(Math.max(-100, Math.min(100, score)));
    const label = score > 25 ? 'RISK_ON' : score < -25 ? 'RISK_OFF' : 'NEUTRAL';

    // 설명 생성
    const topDriver = Object.entries(drivers).sort((a, b) => Math.abs(b[1].score) - Math.abs(a[1].score))[0];
    const explanations: Record<string, string> = {
        RISK_ON: `시장이 위험자산 선호 모드입니다. ${topDriver?.[0] || 'VIX'} 신호가 강세를 주도하고 있습니다. 주식시장 상승 모멘텀이 유지되고 있습니다.`,
        RISK_OFF: `시장이 위험회피 모드입니다. ${topDriver?.[0] || 'VIX'} 신호가 약세를 주도하고 있습니다. 안전자산 선호 경향이 강화되고 있습니다.`,
        NEUTRAL: `현재 시장은 혼합된 신호를 보이고 있습니다. ${topDriver?.[0] || 'VIX'}가 핵심 방향성을 결정하고 있으며, 추가 데이터 확인이 필요합니다.`,
    };

    // 내일 관전포인트
    const watches: string[] = [];
    if (vix && vix.price > 20) watches.push('VIX 20선 지지/돌파 여부');
    if (us10 && us10.price > 4.5) watches.push('미국 10년 금리 4.5% 레벨 확인');
    if (dxy && dxy.price > 105) watches.push('달러 인덱스 105 돌파 여부');
    const krw = quotes.get('USD_KRW');
    if (krw && krw.price > 1400) watches.push(`달러/원 ${krw.price.toFixed(0)}원 레벨 지지 확인`);
    if (watches.length === 0) watches.push('주요 지표 변동성 확대 여부 모니터링');

    return {
        score, label,
        explanation: explanations[label],
        drivers, tomorrowWatch: watches.join(', '),
        date: new Date().toISOString(),
    };
}

export async function GET() {
    try {
        if (cache && Date.now() - cache.ts < CACHE_TTL) return NextResponse.json(cache.data);
        const quotes = await fetchQuotes();
        if (quotes.size === 0) throw new Error('No data');
        const result = calcRegime(quotes);
        cache = { data: result, ts: Date.now() };
        return NextResponse.json(result);
    } catch (e) {
        console.error('[regime] error:', e);
        return NextResponse.json({ score: 0, label: 'NEUTRAL', explanation: '데이터 로딩 중...', drivers: {}, tomorrowWatch: '', date: new Date().toISOString() });
    }
}
