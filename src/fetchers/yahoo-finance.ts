// Yahoo Finance 매크로 지표 수집기 (yahoo-finance2 v3 호환)
import YahooFinance from 'yahoo-finance2';
import { log, logError, logSuccess, withRetry } from '../lib/utils';
import indicatorsConfig from '../config/indicators.json';

// v3: 인스턴스 생성 필요
const yf = new YahooFinance();

export interface FetchedIndicator {
    name: string;
    label: string;
    category: string;
    ticker: string;
    unit: string;
    value: number | null;
    prevClose: number | null;
    change: number | null;
    changePct: number | null;
    historicalValues: number[];
    fetchedAt: Date;
    source: string;
}

// Yahoo Finance에서 현재 시세 조회
async function fetchQuote(ticker: string): Promise<{ price: number; prevClose: number } | null> {
    try {
        const result = await yf.quote(ticker) as Record<string, unknown>;
        const price = result?.regularMarketPrice as number | undefined;
        const prevClose = result?.regularMarketPreviousClose as number | undefined;

        if (!price) return null;

        return {
            price,
            prevClose: prevClose ?? price,
        };
    } catch (error) {
        logError('YahooFinance', `시세 조회 실패: ${ticker}`, error);
        return null;
    }
}

// Yahoo Finance에서 최근 N일 히스토리 조회
async function fetchHistory(ticker: string, days: number = 10): Promise<number[]> {
    try {
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days - 5); // 주말/공휴일 대비 여유

        const history = await yf.historical(ticker, {
            period1: startDate,
            period2: endDate,
            interval: '1d',
        }) as Array<Record<string, unknown>>;

        return history
            .slice(-days)
            .map((item: Record<string, unknown>) => (item.close as number) ?? 0)
            .filter((v: number) => v > 0);
    } catch (error) {
        logError('YahooFinance', `히스토리 조회 실패: ${ticker}`, error);
        return [];
    }
}

// 단일 지표 수집 (재시도 포함)
async function fetchSingleIndicator(
    config: typeof indicatorsConfig.indicators[0]
): Promise<FetchedIndicator> {
    const result: FetchedIndicator = {
        name: config.name,
        label: config.label,
        category: config.category,
        ticker: config.ticker,
        unit: config.unit,
        value: null,
        prevClose: null,
        change: null,
        changePct: null,
        historicalValues: [],
        fetchedAt: new Date(),
        source: 'yahoo',
    };

    // 1차: Yahoo Finance 시도
    const quote = await withRetry(
        () => fetchQuote(config.ticker),
        { maxRetries: 3, delay: 1000, name: `Quote:${config.name}` }
    ).catch(() => null);

    if (quote && quote.price) {
        result.value = quote.price;
        result.prevClose = quote.prevClose;
        result.change = +(quote.price - quote.prevClose).toFixed(4);
        result.changePct = quote.prevClose !== 0
            ? +(((quote.price - quote.prevClose) / quote.prevClose) * 100).toFixed(4)
            : 0;
    }

    // 히스토리 조회 (7일 평균 계산용)
    const history = await fetchHistory(config.ticker, 10).catch(() => [] as number[]);
    result.historicalValues = history;

    if (!result.value) {
        logError('YahooFinance', `${config.name} 데이터 수집 실패 — 백업 소스 필요`);
    } else {
        logSuccess('YahooFinance', `${config.name}: ${result.value} ${config.unit}`);
    }

    return result;
}

// 전체 지표 수집
export async function fetchAllIndicators(): Promise<FetchedIndicator[]> {
    log('YahooFinance', `매크로 지표 수집 시작 (${indicatorsConfig.indicators.length}개)`);

    const results: FetchedIndicator[] = [];

    // 순차 실행 (Rate limit 방지)
    for (const config of indicatorsConfig.indicators) {
        const indicator = await fetchSingleIndicator(config);
        results.push(indicator);
        // 요청 간격
        await new Promise(resolve => setTimeout(resolve, 500));
    }

    const successCount = results.filter(r => r.value !== null).length;
    log('YahooFinance', `수집 완료: ${successCount}/${results.length} 성공`);

    return results;
}

export default { fetchAllIndicators };
