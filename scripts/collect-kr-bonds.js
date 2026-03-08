// 한국 국채 금리만 빠르게 수집하여 DB 저장
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

async function main() {
    const prisma = new PrismaClient();
    const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

    const bonds = {
        KR_3Y_BOND: 'https://finance.naver.com/marketindex/interestDailyQuote.naver?marketindexCd=IRR_GOVT03Y',
        KR_10Y_BOND: 'https://finance.naver.com/marketindex/interestDailyQuote.naver?marketindexCd=IRR_GOVT10Y',
    };

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (const [name, url] of Object.entries(bonds)) {
        try {
            const res = await fetch(url, { headers: { 'User-Agent': ua } });
            const html = await res.text();
            const match = html.match(/class="num">\s*([\d.]+)/);
            if (match) {
                const value = parseFloat(match[1]);
                await prisma.macroIndicator.upsert({
                    where: { date_name: { date: today, name } },
                    update: { value },
                    create: { date: today, category: 'interest_rate', name, ticker: name, value },
                });
                console.log('OK ' + name + ': ' + value + '%');
            } else {
                console.log('FAIL ' + name + ': parse error');
            }
        } catch (e) {
            console.log('ERR ' + name + ': ' + e.message);
        }
    }

    const all = await prisma.macroIndicator.findMany({
        where: { date: today },
        select: { name: true, value: true },
        orderBy: { name: 'asc' },
    });
    console.log('DB today:');
    for (const d of all) {
        console.log('  ' + d.name + ': ' + d.value);
    }

    await prisma.$disconnect();
}

main().catch(console.error);
