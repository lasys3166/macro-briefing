// Risk Radar API — 실시간 Yahoo Finance 데이터 기반 직접 계산
import { NextResponse } from 'next/server';

let cache: { data: unknown; ts: number } | null = null;
const CACHE_TTL = 300_000;

async function fetchQuotes() {
    const results = new Map<string, { price: number; prevClose: number; changePct: number }>();
    const tickers: Record<string, string> = {
        VIX: '^VIX', DXY: 'DX-Y.NYB', US_10Y: '^TNX', US_2Y: '^IRX',
        SP500: '^GSPC', NASDAQ: '^IXIC', USD_KRW: 'KRW=X',
        WTI: 'CL=F', GOLD: 'GC=F',
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

function calcRisk(q: Map<string, { price: number; prevClose: number; changePct: number }>) {
    const signals: { id: string; label: string; active: boolean; severity: string; value: number; detail: string }[] = [];
    let totalScore = 0;
    const alerts: string[] = [];

    // VIX 급등
    const vix = q.get('VIX');
    const vixActive = vix ? vix.price > 25 : false;
    const vixSev = vix ? (vix.price > 35 ? 'high' : vix.price > 25 ? 'medium' : 'low') : 'low';
    if (vixActive) totalScore += vix!.price > 35 ? 25 : 15;
    signals.push({ id: 'vix_spike', label: 'VIX 급등', active: vixActive, severity: vixSev, value: vix?.price || 0, detail: vix ? `VIX ${vix.price.toFixed(1)}` : '데이터 없음' });

    // DXY 돌파
    const dxy = q.get('DXY');
    const dxyActive = dxy ? dxy.price > 105 : false;
    if (dxyActive) totalScore += 10;
    signals.push({ id: 'dxy_breakout', label: 'DXY 돌파', active: dxyActive, severity: dxyActive ? 'medium' : 'low', value: dxy?.changePct || 0, detail: dxy ? `DXY ${dxy.price.toFixed(2)} (${dxy.changePct > 0 ? '+' : ''}${dxy.changePct.toFixed(2)}%)` : '데이터 없음' });

    // 금리 급등
    const us10 = q.get('US_10Y');
    const yieldActive = us10 ? us10.changePct > 3 : false;
    if (yieldActive) totalScore += 15;
    signals.push({ id: 'yield_spike', label: '금리 급등', active: yieldActive, severity: yieldActive ? 'high' : 'low', value: us10?.changePct || 0, detail: us10 ? `US10Y ${us10.price.toFixed(3)}% (${us10.changePct > 0 ? '+' : ''}${us10.changePct.toFixed(2)}%)` : '데이터 없음' });

    // 커브 역전
    const us2 = q.get('US_2Y');
    const spread = (us10 && us2) ? us10.price - us2.price : 0;
    const curveActive = spread < 0;
    if (curveActive) totalScore += 10;
    signals.push({ id: 'curve_inversion', label: '커브 역전', active: curveActive, severity: curveActive ? 'medium' : 'low', value: spread, detail: `10Y-2Y 스프레드 ${spread > 0 ? '+' : ''}${(spread * 100).toFixed(0)}bp` });

    // 주식 급락
    const sp = q.get('SP500');
    const eqActive = sp ? sp.changePct < -2 : false;
    if (eqActive) totalScore += sp!.changePct < -3 ? 20 : 12;
    signals.push({ id: 'equity_drawdown', label: '주식 급락', active: eqActive, severity: eqActive && sp!.changePct < -3 ? 'high' : eqActive ? 'medium' : 'low', value: sp?.changePct || 0, detail: sp ? `S&P500 ${sp.changePct > 0 ? '+' : ''}${sp.changePct.toFixed(2)}%` : '데이터 없음' });

    // 환율 스트레스
    const krw = q.get('USD_KRW');
    const fxActive = krw ? krw.price > 1400 : false;
    if (fxActive) totalScore += krw!.price > 1450 ? 12 : 6;
    signals.push({ id: 'fx_stress', label: '환율 스트레스', active: fxActive, severity: fxActive && krw!.price > 1450 ? 'high' : fxActive ? 'medium' : 'low', value: krw?.price || 0, detail: krw ? `USD/KRW ${krw.price.toFixed(0)}원` : '데이터 없음' });

    // 유가 쇼크
    const wti = q.get('WTI');
    const oilActive = wti ? Math.abs(wti.changePct) > 5 : false;
    if (oilActive) totalScore += 10;
    signals.push({ id: 'oil_shock', label: '유가 쇼크', active: oilActive, severity: oilActive ? 'medium' : 'low', value: wti?.changePct || 0, detail: wti ? `WTI $${wti.price.toFixed(2)} (${wti.changePct > 0 ? '+' : ''}${wti.changePct.toFixed(2)}%)` : '데이터 없음' });

    // 안전자산 선호
    const gold = q.get('GOLD');
    const goldActive = gold ? gold.changePct > 2 : false;
    if (goldActive) totalScore += 8;
    signals.push({ id: 'gold_flight', label: '안전자산 선호', active: goldActive, severity: goldActive ? 'medium' : 'low', value: gold?.changePct || 0, detail: gold ? `금 $${gold.price.toFixed(2)} (${gold.changePct > 0 ? '+' : ''}${gold.changePct.toFixed(2)}%)` : '데이터 없음' });

    totalScore = Math.min(100, totalScore);
    const level = totalScore >= 60 ? 'HIGH' : totalScore >= 30 ? 'MEDIUM' : 'LOW';

    if (vixActive && vix!.price > 30) alerts.push(`⚠️ VIX ${vix!.price.toFixed(1)} — 극단적 공포 수준`);
    if (eqActive && sp!.changePct < -3) alerts.push(`🔴 S&P500 ${sp!.changePct.toFixed(2)}% 급락`);
    if (krw && krw.price > 1450) alerts.push(`💱 USD/KRW ${krw.price.toFixed(0)}원 — 환율 경고`);

    return { score: totalScore, level, signals, alerts, date: new Date().toISOString() };
}

export async function GET() {
    try {
        if (cache && Date.now() - cache.ts < CACHE_TTL) return NextResponse.json(cache.data);
        const quotes = await fetchQuotes();
        if (quotes.size === 0) throw new Error('No data');
        const result = calcRisk(quotes);
        cache = { data: result, ts: Date.now() };
        return NextResponse.json(result);
    } catch {
        return NextResponse.json({ score: 0, level: 'LOW', signals: [], alerts: [], date: new Date().toISOString() });
    }
}
