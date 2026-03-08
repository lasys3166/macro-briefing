// Bank Transactions API
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';

// GET: 거래 내역 조회
export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const accountId = searchParams.get('accountId');
        const month = searchParams.get('month'); // YYYY-MM

        const where: Record<string, unknown> = {};
        if (accountId) where.accountId = accountId;
        if (month) {
            const [y, m] = month.split('-').map(Number);
            where.date = {
                gte: new Date(y, m - 1, 1),
                lt: new Date(y, m, 1),
            };
        }

        const transactions = await prisma.bankTransaction.findMany({
            where,
            include: { account: true },
            orderBy: { date: 'desc' },
            take: 100,
        });

        // 월별 요약
        const summary = {
            totalPlan: 0,
            totalActual: 0,
        };
        for (const tx of transactions) {
            if (tx.type === 'plan') summary.totalPlan += tx.amount;
            else if (tx.type === 'actual') summary.totalActual += tx.amount;
        }

        return NextResponse.json({ transactions, summary });
    } catch (error) {
        console.error('Bank Transactions GET 오류:', error);
        return NextResponse.json({ error: '거래 조회 실패' }, { status: 500 });
    }
}

// POST: 거래 기록
export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const tx = await prisma.bankTransaction.create({
            data: {
                accountId: body.accountId,
                date: new Date(body.date),
                type: body.type,
                category: body.category,
                amount: body.amount,
                memo: body.memo,
            },
            include: { account: true },
        });

        // 실제 지출인 경우 잔액 차감
        if (body.type === 'actual') {
            await prisma.bankAccount.update({
                where: { id: body.accountId },
                data: { balance: { decrement: body.amount } },
            });
        }

        return NextResponse.json(tx);
    } catch (error) {
        console.error('Bank Transactions POST 오류:', error);
        return NextResponse.json({ error: '거래 기록 실패' }, { status: 500 });
    }
}
