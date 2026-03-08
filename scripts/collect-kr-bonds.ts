// 한국 10년 국채 — 여러 소스로 시도
import 'dotenv/config';
import prisma from '../src/lib/db';

async function main() {
    const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let kr10yValue: number | null = null;

    // 시도 1: 네이버 시장지표 (세계금리 페이지)
    try {
        const res = await fetch('https://finance.naver.com/marketindex/worldInterestList.naver?interestCd=BOND_INT', {
            headers: { 'User-Agent': ua }
        });
        const html = await res.text();
        // 한국 10년 찾기
        const kr10Match = html.match(/대한민국[\s\S]*?10년[\s\S]*?class="num">\s*([\d.]+)/);
        if (kr10Match) {
            kr10yValue = parseFloat(kr10Match[1]);
            console.log('시도1 네이버 worldInterest OK:', kr10yValue);
        } else {
            // 금리 테이블에서 찾기
            const allNums = html.match(/class="num">\s*([\d.]+)/g);
            console.log('시도1 실패. num 개수:', allNums?.length || 0);
            console.log('HTML 일부:', html.substring(0, 300));
        }
    } catch (e: unknown) { console.log('시도1 에러:', (e as Error).message); }

    // 시도 2: 네이버 금융 채권 페이지
    if (!kr10yValue) {
        try {
            const res = await fetch('https://finance.naver.com/marketindex/interestDailyQuote.naver?marketindexCd=IRR_GOV10Y', {
                headers: { 'User-Agent': ua }
            });
            const html = await res.text();
            const m = html.match(/class="num">\s*([\d.]+)/);
            if (m) {
                kr10yValue = parseFloat(m[1]);
                console.log('시도2 네이버 IRR_GOV10Y OK:', kr10yValue);
            } else {
                console.log('시도2 실패');
            }
        } catch (e: unknown) { console.log('시도2 에러:', (e as Error).message); }
    }

    // 시도 3: 네이버 — 국고채10년 다양한 코드
    if (!kr10yValue) {
        const codes = ['IRR_KORGOV10Y', 'IRR_BOND10Y', 'IRR_TB10Y', 'IRR_KTB10Y'];
        for (const code of codes) {
            try {
                const res = await fetch(`https://finance.naver.com/marketindex/interestDailyQuote.naver?marketindexCd=${code}`, {
                    headers: { 'User-Agent': ua }
                });
                const html = await res.text();
                const m = html.match(/class="num">\s*([\d.]+)/);
                if (m) {
                    kr10yValue = parseFloat(m[1]);
                    console.log(`시도3 코드 ${code} OK:`, kr10yValue);
                    break;
                }
            } catch { /* next */ }
        }
        if (!kr10yValue) console.log('시도3 모두 실패');
    }

    // 시도 4: koreaexim.go.kr (한국수출입은행)
    if (!kr10yValue) {
        try {
            const res = await fetch('https://www.koreaexim.go.kr/site/program/financial/interestRate.jsp', {
                headers: { 'User-Agent': ua }
            });
            const html = await res.text();
            const m = html.match(/국고채.*?10년[\s\S]*?(\d+\.\d+)/);
            if (m) {
                kr10yValue = parseFloat(m[1]);
                console.log('시도4 koreaexim OK:', kr10yValue);
            } else {
                console.log('시도4 실패');
            }
        } catch (e: unknown) { console.log('시도4 에러:', (e as Error).message); }
    }

    // 최종: DB에 저장
    if (kr10yValue) {
        await prisma.macroIndicator.upsert({
            where: { date_name: { date: today, name: 'KR_10Y_BOND' } },
            update: { value: kr10yValue },
            create: { date: today, category: 'interest_rate', name: 'KR_10Y_BOND', ticker: 'KR_10Y_BOND', value: kr10yValue },
        });
        console.log('\n✅ KR_10Y_BOND 저장:', kr10yValue);
    } else {
        console.log('\n❌ 모든 시도 실패 — 한국 10년 국채 수집 불가');
    }

    // DB 확인
    const all = await prisma.macroIndicator.findMany({
        where: { date: today },
        select: { name: true, value: true },
        orderBy: { name: 'asc' },
    });
    console.log('\nDB today:');
    for (const d of all) console.log(`  ${d.name}: ${d.value}`);

    process.exit(0);
}

main().catch(console.error);
