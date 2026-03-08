// Macro Story (오늘의 시장 브리핑) API — 실시간 Yahoo Finance 데이터 기반 직접 생성
import { NextResponse } from 'next/server';

let cache: { data: unknown; ts: number } | null = null;
const CACHE_TTL = 300_000;

interface QuoteResult { price: number; prevClose: number; changePct: number; }

async function fetchQuotes() {
    const results = new Map<string, QuoteResult>();
    const tickers: Record<string, { ticker: string; label: string }> = {
        SP500: { ticker: '^GSPC', label: 'S&P500' }, NASDAQ: { ticker: '^IXIC', label: '나스닥' },
        VIX: { ticker: '^VIX', label: 'VIX' }, DXY: { ticker: 'DX-Y.NYB', label: '달러 인덱스' },
        US_10Y: { ticker: '^TNX', label: '미국 10년 국채금리' }, US_2Y: { ticker: '^IRX', label: '미국 2년 국채금리' },
        KOSPI: { ticker: '^KS11', label: '코스피' }, USD_KRW: { ticker: 'KRW=X', label: '원달러 환율' },
        GOLD: { ticker: 'GC=F', label: '금' }, WTI: { ticker: 'CL=F', label: 'WTI 유가' },
    };
    try {
        const YahooFinance = (await import('yahoo-finance2')).default;
        const yf = new YahooFinance({ suppressNotices: ['yahooSurvey'] });
        const timeout = (ms: number) => new Promise<never>((_, rej) => setTimeout(() => rej(new Error('t')), ms));
        const settled = await Promise.allSettled(
            Object.entries(tickers).map(([name, { ticker }]) =>
                Promise.race([(async () => { const q = await yf.quote(ticker) as Record<string, unknown>; return { name, q }; })(), timeout(8000)])
            )
        );
        for (const r of settled) {
            if (r.status === 'fulfilled') {
                const { name, q } = r.value;
                const price = q?.regularMarketPrice as number; const prev = q?.regularMarketPreviousClose as number;
                if (price && prev) results.set(name, { price, prevClose: prev, changePct: +((price - prev) / prev * 100).toFixed(2) });
            }
        }
    } catch { /* skip */ }
    return results;
}

const LABELS: Record<string, string> = {
    SP500: 'S&P500', NASDAQ: '나스닥', VIX: 'VIX', DXY: '달러 인덱스',
    US_10Y: '미국 10년 국채금리', US_2Y: '미국 2년 국채금리', KOSPI: '코스피',
    USD_KRW: '원달러 환율', GOLD: '금', WTI: 'WTI 유가',
};

// 인과 관계 규칙
const EFFECT_RULES: { trigger: string; condition: (q: Map<string, QuoteResult>) => boolean; cause: string; effect: string; desc: string }[] = [
    { trigger: 'US_10Y', condition: q => (q.get('US_10Y')?.changePct || 0) > 1, cause: '미국 10년 금리 상승', effect: '기술주 하락 압력', desc: '금리 상승 → 성장주 밸류에이션 부담 증가' },
    { trigger: 'US_10Y', condition: q => (q.get('US_10Y')?.changePct || 0) < -1, cause: '미국 10년 금리 하락', effect: '기술주 회복 기대', desc: '금리 하락 → 성장주 매력도 증가' },
    { trigger: 'DXY', condition: q => (q.get('DXY')?.changePct || 0) > 0.3, cause: '달러 강세', effect: '신흥국 통화 약세', desc: '달러 강세 → 원화/엔화 등 약세 압력' },
    { trigger: 'DXY', condition: q => (q.get('DXY')?.changePct || 0) < -0.3, cause: '달러 약세', effect: '신흥국 자산 유입 기대', desc: '달러 약세 → 신흥국 투자 매력 증가' },
    { trigger: 'VIX', condition: q => (q.get('VIX')?.price || 0) > 25, cause: 'VIX 급등', effect: '위험회피 심리 확대', desc: 'VIX 상승 → 안전자산 선호, 주식 매도 압력' },
    { trigger: 'WTI', condition: q => Math.abs(q.get('WTI')?.changePct || 0) > 3, cause: '유가 급변동', effect: '인플레이션 기대 변동', desc: '유가 변동 → 소비자물가 및 기업원가 영향' },
    { trigger: 'USD_KRW', condition: q => (q.get('USD_KRW')?.changePct || 0) > 0.5, cause: '원화 약세', effect: '외국인 매도 우려', desc: '환율 상승 → 외국인 원화 자산 가치 하락' },
    { trigger: 'GOLD', condition: q => (q.get('GOLD')?.changePct || 0) > 1, cause: '금 가격 상승', effect: '안전자산 수요 증가', desc: '지정학적 리스크 또는 인플레이션 헤지 수요' },
];

function calcStory(q: Map<string, QuoteResult>) {
    // 주요 변동 지표 정렬
    const movers = Array.from(q.entries())
        .map(([name, data]) => ({ name, label: LABELS[name] || name, changePct: data.changePct, direction: data.changePct > 0 ? 'UP' as const : 'DOWN' as const }))
        .sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct));

    const topDrivers = movers.slice(0, 5);

    // 인과 관계 매칭
    const effects = EFFECT_RULES.filter(rule => rule.condition(q)).map(rule => ({
        cause: rule.cause, effect: rule.effect, description: rule.desc,
    }));

    // Regime 판별
    const sp = q.get('SP500'); const vix = q.get('VIX');
    const spPct = sp?.changePct || 0; const vixLevel = vix?.price || 20;
    const regime = spPct > 0.5 && vixLevel < 20 ? 'RISK_ON' : spPct < -0.5 || vixLevel > 25 ? 'RISK_OFF' : 'NEUTRAL';

    // 요약 생성
    const topMover = topDrivers[0];
    const summaryParts: string[] = [];
    if (topMover) {
        summaryParts.push(`${topMover.label}이(가) ${topMover.changePct > 0 ? '+' : ''}${topMover.changePct.toFixed(2)}%로 가장 큰 변동을 보였습니다.`);
    }
    if (sp) summaryParts.push(`S&P500은 ${sp.changePct > 0 ? '+' : ''}${sp.changePct.toFixed(2)}% 변동했습니다.`);
    const krw = q.get('USD_KRW');
    if (krw) summaryParts.push(`원달러 환율은 ${krw.price.toFixed(0)}원 수준입니다.`);
    if (effects.length > 0) summaryParts.push(`${effects[0].cause}(이)가 ${effects[0].effect}으로 이어지고 있습니다.`);

    // 체크포인트
    const checkpoints: string[] = [];
    const us10 = q.get('US_10Y');
    if (us10) checkpoints.push(`미국 10년 금리 ${us10.price.toFixed(2)}% — 추가 변동 여부 확인`);
    if (vix) checkpoints.push(`VIX ${vix.price.toFixed(1)} — ${vix.price > 20 ? '20선 하회 여부' : '급등 가능성'} 모니터링`);
    if (krw) checkpoints.push(`원달러 ${krw.price.toFixed(0)}원 — ${krw.price > 1400 ? '1,400원 돌파 지속 여부' : '환율 안정 확인'}`);
    const dxy = q.get('DXY');
    if (dxy) checkpoints.push(`달러 인덱스 ${dxy.price.toFixed(2)} — 달러 방향성 확인`);

    return {
        summary: summaryParts.join(' '),
        drivers: topDrivers,
        effects: effects.length > 0 ? effects : [{ cause: '주요 촉발 요인 없음', effect: '시장 관망세', description: '뚜렷한 단일 요인 없이 혼조세 유지 중' }],
        regime, checkpoints,
        date: new Date().toISOString(),
    };
}

export async function GET() {
    try {
        if (cache && Date.now() - cache.ts < CACHE_TTL) return NextResponse.json(cache.data);
        const quotes = await fetchQuotes();
        if (quotes.size === 0) throw new Error('No data');
        const result = calcStory(quotes);
        cache = { data: result, ts: Date.now() };
        return NextResponse.json(result);
    } catch {
        return NextResponse.json({ summary: '데이터 로딩 중...', drivers: [], effects: [], regime: 'NEUTRAL', checkpoints: [], date: new Date().toISOString() });
    }
}
