// 실시간 지표 API — Yahoo Finance + 네이버 금융 직접 크롤링
// DB 의존 없이 실시간으로 데이터 수집
import { NextResponse } from 'next/server';

// 지표 정의
const DISPLAY_INDICATORS = [
    { name: 'USD_KRW', label: '원달러 환율', category: 'exchange_rate', categoryLabel: '💱 환율', unit: '원', ticker: 'KRW=X', source: 'yahoo' },
    { name: 'DXY', label: '달러 인덱스', category: 'exchange_rate', categoryLabel: '� 환율', unit: 'pt', ticker: 'DX-Y.NYB', source: 'yahoo' },
    { name: 'EUR_USD', label: '유로/달러', category: 'exchange_rate', categoryLabel: '� 환율', unit: '', ticker: 'EURUSD=X', source: 'yahoo' },
    { name: 'USD_JPY', label: '달러/엔', category: 'exchange_rate', categoryLabel: '� 환율', unit: '엔', ticker: 'USDJPY=X', source: 'yahoo' },
    { name: 'USD_CNY', label: '달러/위안', category: 'exchange_rate', categoryLabel: '� 환율', unit: '위안', ticker: 'USDCNY=X', source: 'yahoo' },
    { name: 'KR_3Y_BOND', label: '한국 3년 국채금리', category: 'interest_rate', categoryLabel: '💰 금리', unit: '%', ticker: '', source: 'naver' },
    { name: 'KR_10Y_BOND', label: '한국 10년 국채금리', category: 'interest_rate', categoryLabel: '💰 금리', unit: '%', ticker: '', source: 'none' },
    { name: 'US_2Y_BOND', label: '미국 2년 국채금리', category: 'interest_rate', categoryLabel: '💰 금리', unit: '%', ticker: '^IRX', source: 'yahoo' },
    { name: 'US_10Y_BOND', label: '미국 10년 국채금리', category: 'interest_rate', categoryLabel: '💰 금리', unit: '%', ticker: '^TNX', source: 'yahoo' },
    { name: 'KOSPI', label: '코스피 지수', category: 'stock_index', categoryLabel: '📈 주가지수', unit: 'pt', ticker: '^KS11', source: 'yahoo' },
    { name: 'SP500', label: 'S&P500 지수', category: 'stock_index', categoryLabel: '📈 주가지수', unit: 'pt', ticker: '^GSPC', source: 'yahoo' },
    { name: 'NASDAQ', label: '나스닥 지수', category: 'stock_index', categoryLabel: '📈 주가지수', unit: 'pt', ticker: '^IXIC', source: 'yahoo' },
];

// 메모리 캐시 (60초)
let cache: { data: unknown; ts: number } | null = null;
const CACHE_TTL = 60_000;

async function fetchYahooQuotes(): Promise<Map<string, { price: number; prevClose: number; changePct: number }>> {
    const results = new Map<string, { price: number; prevClose: number; changePct: number }>();
    const yahooIndicators = DISPLAY_INDICATORS.filter(i => i.source === 'yahoo');

    try {
        const YahooFinance = (await import('yahoo-finance2')).default;
        const yf = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

        const timeout = (ms: number) => new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms));

        const settled = await Promise.allSettled(
            yahooIndicators.map(ind =>
                Promise.race([
                    (async () => {
                        const q = await yf.quote(ind.ticker) as Record<string, unknown>;
                        return { name: ind.name, q };
                    })(),
                    timeout(8000),
                ])
            )
        );

        for (const r of settled) {
            if (r.status === 'fulfilled') {
                const { name, q } = r.value;
                const price = q?.regularMarketPrice as number | undefined;
                const prevClose = q?.regularMarketPreviousClose as number | undefined;
                if (price) {
                    const pct = prevClose && prevClose !== 0 ? ((price - prevClose) / prevClose) * 100 : 0;
                    results.set(name, { price, prevClose: prevClose || price, changePct: +pct.toFixed(4) });
                }
            }
        }
    } catch (err) {
        console.error('[API/realtime] Yahoo 크롤링 실패:', err);
    }

    return results;
}

async function fetchNaverBonds(): Promise<Map<string, number>> {
    const results = new Map<string, number>();
    const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

    try {
        const res = await fetch('https://finance.naver.com/marketindex/interestDailyQuote.naver?marketindexCd=IRR_GOVT03Y', {
            headers: { 'User-Agent': ua },
        });
        if (res.ok) {
            const html = await res.text();
            const match = html.match(/class="num">\s*([\d.]+)/);
            if (match) results.set('KR_3Y_BOND', parseFloat(match[1]));
        }
    } catch { /* skip */ }

    return results;
}

export async function GET() {
    try {
        // 캐시 체크
        if (cache && Date.now() - cache.ts < CACHE_TTL) {
            return NextResponse.json(cache.data);
        }

        const startTime = Date.now();

        // 병렬로 Yahoo + Naver 수집
        const [yahooData, naverData] = await Promise.all([
            fetchYahooQuotes(),
            fetchNaverBonds(),
        ]);

        // 지표 데이터 매핑
        const indicators = DISPLAY_INDICATORS.map(def => {
            const yahoo = yahooData.get(def.name);
            const naver = naverData.get(def.name);

            let value: number | string = '-';
            let changePct: number | null = null;
            let primarySource = 'Yahoo Finance';

            if (yahoo) {
                value = yahoo.price;
                changePct = yahoo.changePct;
                primarySource = 'Yahoo Finance';
            } else if (naver) {
                value = naver;
                primarySource = '네이버 금융';
            } else if (def.source === 'none') {
                primarySource = 'API 연동 필요';
            }

            return {
                name: def.name,
                label: def.label,
                value,
                unit: def.unit,
                changePct,
                primarySource,
            };
        });

        // 카테고리별 그룹핑
        const grouped: Record<string, { category: string; categoryLabel: string; items: typeof indicators }> = {};
        for (let i = 0; i < DISPLAY_INDICATORS.length; i++) {
            const def = DISPLAY_INDICATORS[i];
            const key = def.category;
            if (!grouped[key]) grouped[key] = { category: key, categoryLabel: def.categoryLabel, items: [] };
            grouped[key].items.push(indicators[i]);
        }

        const elapsed = Date.now() - startTime;

        const yahooCount = indicators.filter(i => i.value !== '-' && i.primarySource === 'Yahoo Finance').length;
        const naverCount = indicators.filter(i => i.value !== '-' && i.primarySource === '네이버 금융').length;

        const response = {
            indicators: Object.values(grouped),
            fetchedAt: new Date().toISOString(),
            elapsed: `${elapsed}ms`,
            collectedDate: new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' }),
            sources: {
                yahoo: yahooCount,
                naver: naverCount,
            },
        };

        // 캐시 저장
        cache = { data: response, ts: Date.now() };

        return NextResponse.json(response);
    } catch (error) {
        console.error('[API/realtime] 에러:', error);
        return NextResponse.json({ error: '실시간 지표 조회 실패' }, { status: 500 });
    }
}
