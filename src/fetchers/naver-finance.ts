// 네이버 금융 크롤러 — 실시간 시세 수집
// 출처: 네이버 증권 (finance.naver.com)
import { log, logError, logSuccess } from '../lib/utils';

interface NaverQuote {
    name: string;
    label: string;
    value: number | null;
    change: number | null;
    changePct: number | null;
    source: string;
    fetchedAt: string;
}

// 네이버 환율 페이지 크롤링
async function fetchNaverExchangeRates(): Promise<NaverQuote[]> {
    const results: NaverQuote[] = [];

    try {
        // 네이버 금융 환율 API
        const res = await fetch('https://finance.naver.com/marketindex/exchangeList.naver', {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'text/html,application/xhtml+xml',
            },
        });
        const html = await res.text();

        // USD/KRW 추출
        const usdMatch = html.match(/미국[\s\S]*?<td class="sale">\s*([\d,.]+)/);
        if (usdMatch) {
            const val = parseFloat(usdMatch[1].replace(/,/g, ''));
            results.push({
                name: 'USD_KRW', label: '원달러 환율',
                value: val, change: null, changePct: null,
                source: 'naver', fetchedAt: new Date().toISOString(),
            });
        }

        // JPY/KRW (100엔당)
        const jpyMatch = html.match(/일본[\s\S]*?<td class="sale">\s*([\d,.]+)/);
        if (jpyMatch) {
            const val100 = parseFloat(jpyMatch[1].replace(/,/g, ''));
            // 100엔당 → 1엔당으로 역산하여 USD/JPY 대략 계산
            results.push({
                name: 'JPY_KRW_100', label: '일본 100엔',
                value: val100, change: null, changePct: null,
                source: 'naver', fetchedAt: new Date().toISOString(),
            });
        }

        // EUR/KRW
        const eurMatch = html.match(/유럽연합[\s\S]*?<td class="sale">\s*([\d,.]+)/);
        if (eurMatch) {
            const val = parseFloat(eurMatch[1].replace(/,/g, ''));
            results.push({
                name: 'EUR_KRW', label: '유로/원',
                value: val, change: null, changePct: null,
                source: 'naver', fetchedAt: new Date().toISOString(),
            });
        }

        // CNY/KRW
        const cnyMatch = html.match(/중국[\s\S]*?<td class="sale">\s*([\d,.]+)/);
        if (cnyMatch) {
            const val = parseFloat(cnyMatch[1].replace(/,/g, ''));
            results.push({
                name: 'CNY_KRW', label: '위안/원',
                value: val, change: null, changePct: null,
                source: 'naver', fetchedAt: new Date().toISOString(),
            });
        }
    } catch (error) {
        logError('Naver', '환율 크롤링 실패', error);
    }

    return results;
}

// 네이버 국내 주가지수 크롤링
async function fetchNaverStockIndices(): Promise<NaverQuote[]> {
    const results: NaverQuote[] = [];

    try {
        // KOSPI
        const kospiRes = await fetch('https://finance.naver.com/sise/sise_index.naver?code=KOSPI', {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        });
        const kospiHtml = await kospiRes.text();
        const kospiMatch = kospiHtml.match(/현재[\s\S]*?<em id="now_value">([\d,.]+)/);
        const kospiChangeMatch = kospiHtml.match(/id="change_value_and_rate"[^>]*>[\s\S]*?<em[\s\S]*?>([\d,.]+)[\s\S]*?<em[\s\S]*?>([\d,.]+)%/);

        if (kospiMatch) {
            const value = parseFloat(kospiMatch[1].replace(/,/g, ''));
            let change: number | null = null;
            let changePct: number | null = null;
            if (kospiChangeMatch) {
                change = parseFloat(kospiChangeMatch[1].replace(/,/g, ''));
                changePct = parseFloat(kospiChangeMatch[2]);
            }
            results.push({
                name: 'KOSPI', label: '코스피 지수',
                value, change, changePct,
                source: 'naver', fetchedAt: new Date().toISOString(),
            });
        }
    } catch (error) {
        logError('Naver', '코스피 크롤링 실패', error);
    }

    return results;
}

// 네이버 해외지수 API
async function fetchNaverWorldIndices(): Promise<NaverQuote[]> {
    const results: NaverQuote[] = [];

    try {
        // 네이버 해외지수 JSON API
        const res = await fetch('https://api.stock.naver.com/index/worldIndexList', {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'application/json',
            },
        });
        const data = await res.json() as Array<{
            nationName?: string;
            indexName?: string;
            closePrice?: string;
            compareToPreviousClosePrice?: string;
            fluctuationsRatio?: string;
        }>;

        // 관심 지수 매핑
        const mapping: Record<string, { name: string; label: string }> = {
            '다우존스': { name: 'DJI', label: '다우존스' },
            'S&P500': { name: 'SP500', label: 'S&P500 지수' },
            '나스닥 종합': { name: 'NASDAQ', label: '나스닥 지수' },
            '닛케이225': { name: 'NIKKEI225', label: '니케이225 지수' },
        };

        if (Array.isArray(data)) {
            for (const item of data) {
                const key = item.indexName || '';
                const map = mapping[key];
                if (map && item.closePrice) {
                    results.push({
                        name: map.name,
                        label: map.label,
                        value: parseFloat(item.closePrice.replace(/,/g, '')),
                        change: item.compareToPreviousClosePrice ? parseFloat(item.compareToPreviousClosePrice.replace(/,/g, '')) : null,
                        changePct: item.fluctuationsRatio ? parseFloat(item.fluctuationsRatio) : null,
                        source: 'naver',
                        fetchedAt: new Date().toISOString(),
                    });
                }
            }
        }
    } catch (error) {
        logError('Naver', '해외지수 크롤링 실패', error);
    }

    return results;
}

// 네이버 달러인덱스(DXY) — 증권정보에서 크롤링
async function fetchNaverDXY(): Promise<NaverQuote | null> {
    try {
        const res = await fetch('https://finance.naver.com/marketindex/exchangeDailyQuote.naver?marketindexCd=FX_USDKRW', {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        });
        // DXY는 네이버에서 직접 제공하지 않으므로 null 반환
        return null;
    } catch {
        return null;
    }
}

// 전체 수집
export async function fetchAllNaverData(): Promise<NaverQuote[]> {
    log('Naver', '네이버 금융 데이터 수집 시작');

    const [exchange, stock, world] = await Promise.all([
        fetchNaverExchangeRates(),
        fetchNaverStockIndices(),
        fetchNaverWorldIndices(),
    ]);

    const all = [...exchange, ...stock, ...world];
    logSuccess('Naver', `${all.length}개 데이터 수집 완료`);
    return all;
}

export default { fetchAllNaverData };
