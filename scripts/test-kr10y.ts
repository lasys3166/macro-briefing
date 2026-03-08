// 한국 10년 국채 Yahoo 티커 테스트
import 'dotenv/config';
import YahooFinance from 'yahoo-finance2';

async function main() {
    const yf = new YahooFinance();
    // 가능한 티커 목록
    const tickers = ['KR10YT=RR', '^KR10YT=RR', 'KR10Y.BND'];
    for (const t of tickers) {
        try {
            const q = await Promise.race([
                yf.quote(t),
                new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 5000))
            ]) as Record<string, unknown>;
            console.log(`${t}: price=${q.regularMarketPrice} prevClose=${q.regularMarketPreviousClose}`);
        } catch (e: unknown) {
            console.log(`${t}: FAIL - ${(e as Error).message?.substring(0, 60)}`);
        }
    }
    process.exit(0);
}
main().catch(console.error);
