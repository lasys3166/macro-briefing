// 수동 수집 트리거 API — 즉시 파이프라인 실행 (지표만)
import { NextResponse } from 'next/server';
import prisma from '@/lib/db';

// 지표 수집 함수 (yahoo-finance.ts의 로직을 인라인)
async function collectIndicators() {
    const YahooFinance = (await import('yahoo-finance2')).default;
    const yf = new YahooFinance();

    const tickers: Record<string, { ticker: string; category: string; unit: string; label: string }> = {
        USD_KRW: { ticker: 'KRW=X', category: 'exchange_rate', unit: '원', label: '원달러 환율' },
        DXY: { ticker: 'DX-Y.NYB', category: 'exchange_rate', unit: 'pt', label: '달러 인덱스' },
        EUR_USD: { ticker: 'EURUSD=X', category: 'exchange_rate', unit: '', label: '유로/달러' },
        USD_JPY: { ticker: 'USDJPY=X', category: 'exchange_rate', unit: '엔', label: '달러/엔' },
        USD_CNY: { ticker: 'USDCNY=X', category: 'exchange_rate', unit: '위안', label: '달러/위안' },
        KOSPI: { ticker: '^KS11', category: 'stock_index', unit: 'pt', label: '코스피 지수' },
        SP500: { ticker: '^GSPC', category: 'stock_index', unit: 'pt', label: 'S&P500 지수' },
        NASDAQ: { ticker: '^IXIC', category: 'stock_index', unit: 'pt', label: '나스닥 지수' },
        US_2Y_BOND: { ticker: '^IRX', category: 'interest_rate', unit: '%', label: '미국 2년 국채금리' },
        US_10Y_BOND: { ticker: '^TNX', category: 'interest_rate', unit: '%', label: '미국 10년 국채금리' },
    };

    // 한국 3년 국채 — 네이버 개별 금리 페이지에서 수집 (10년은 네이버에 코드 없음, Yahoo로 수집)
    const korBondResults: Record<string, number | null> = {
        KR_3Y_BOND: null,
    };

    const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
    // 3년 국채만 네이버에서 수집
    try {
        const res = await fetch('https://finance.naver.com/marketindex/interestDailyQuote.naver?marketindexCd=IRR_GOVT03Y', { headers: { 'User-Agent': ua } });
        if (res.ok) {
            const html = await res.text();
            const match = html.match(/class="num">\s*([\d.]+)/);
            if (match) korBondResults.KR_3Y_BOND = parseFloat(match[1]);
        }
    } catch { /* skip */ }
    console.log('[Collect] 한국 국채:', korBondResults);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const results: { name: string; success: boolean; value?: number }[] = [];

    // Yahoo Finance — 종목별 병렬 + 8초 타임아웃
    const timeout = (ms: number) => new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms));
    const settled = await Promise.allSettled(
        Object.entries(tickers).map(([name, config]) =>
            Promise.race([
                (async () => {
                    const q = await yf.quote(config.ticker) as Record<string, unknown>;
                    return { name, config, q };
                })(),
                timeout(8000),
            ])
        )
    );

    for (const r of settled) {
        if (r.status === 'fulfilled') {
            const { name, config, q } = r.value;
            const price = q?.regularMarketPrice as number | undefined;
            const prevClose = q?.regularMarketPreviousClose as number | undefined;
            if (price) {
                const change = prevClose ? +(price - prevClose).toFixed(4) : 0;
                const changePct = prevClose && prevClose !== 0 ? +(((price - prevClose) / prevClose) * 100).toFixed(4) : 0;
                try {
                    await prisma.macroIndicator.upsert({
                        where: { date_name: { date: today, name } },
                        update: { value: price, prevClose: prevClose ?? null, change, changePct },
                        create: { date: today, category: config.category, name, ticker: config.ticker, value: price, prevClose: prevClose ?? null, change, changePct },
                    });
                    results.push({ name, success: true, value: price });
                } catch (err) {
                    console.error(`[Collect] ${name} DB 저장 실패:`, err);
                    results.push({ name, success: false });
                }
            } else {
                results.push({ name, success: false });
            }
        } else {
            const name = Object.keys(tickers)[settled.indexOf(r)];
            results.push({ name, success: false });
        }
    }

    // 한국 국채 저장
    for (const [name, value] of Object.entries(korBondResults)) {
        if (value !== null) {
            try {
                await prisma.macroIndicator.upsert({
                    where: { date_name: { date: today, name } },
                    update: { value },
                    create: { date: today, category: 'interest_rate', name, ticker: name, value },
                });
                results.push({ name, success: true, value });
            } catch (err) {
                console.error(`[Collect] ${name} DB 저장 실패:`, err);
                results.push({ name, success: false });
            }
        } else {
            results.push({ name, success: false });
        }
    }

    return results;
}

export async function POST() {
    try {
        console.log('[Collect] 수동 수집 시작...');
        const startTime = Date.now();
        const results = await collectIndicators();
        const elapsed = Date.now() - startTime;

        const success = results.filter(r => r.success).length;
        const failed = results.filter(r => !r.success).length;

        console.log(`[Collect] 완료: ${success}/${results.length} 성공 (${elapsed}ms)`);

        return NextResponse.json({
            status: 'ok',
            elapsed: `${elapsed}ms`,
            total: results.length,
            success,
            failed,
            results,
        });
    } catch (error) {
        console.error('[Collect] 수집 실패:', error);
        return NextResponse.json({ error: '수집 실패' }, { status: 500 });
    }
}
