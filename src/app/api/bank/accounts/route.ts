// Bank Planner API — 계좌 CRUD + 월급 분배
import { NextRequest, NextResponse } from 'next/server';

const DEFAULT_ACCOUNTS = [
    { id: 'income-1', name: '월급 통장', type: 'income', balance: 0, color: '#3b82f6', icon: '💰', createdAt: new Date().toISOString() },
    { id: 'savings-1', name: '저축 통장', type: 'savings', balance: 0, color: '#10b981', icon: '🏦', createdAt: new Date().toISOString() },
    { id: 'spending-1', name: '생활비 통장', type: 'spending', balance: 0, color: '#f59e0b', icon: '🛒', createdAt: new Date().toISOString() },
    { id: 'emergency-1', name: '비상금 통장', type: 'emergency', balance: 0, color: '#ef4444', icon: '🚨', createdAt: new Date().toISOString() },
    { id: 'seasonal-1', name: '시즌 통장', type: 'seasonal', balance: 0, color: '#8b5cf6', icon: '🎄', createdAt: new Date().toISOString() },
];

export async function GET() {
    try {
        const prisma = (await import('@/lib/db')).default;
        const accounts = await prisma.bankAccount.findMany({ orderBy: { createdAt: 'asc' } });
        if (accounts.length === 0) return NextResponse.json(DEFAULT_ACCOUNTS);
        return NextResponse.json(accounts);
    } catch {
        return NextResponse.json(DEFAULT_ACCOUNTS);
    }
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();

        if (body.action === 'distribute') {
            const { salary } = body;
            if (!salary || salary <= 0) {
                return NextResponse.json({ error: '유효한 월급 금액을 입력하세요' }, { status: 400 });
            }
            // 클라이언트 시뮬레이션이 주이므로, DB 없이도 응답 가능하도록
            return NextResponse.json({
                salary,
                distributions: [
                    { accountName: '저축 통장', type: 'savings', amount: Math.floor(salary * 0.5) },
                    { accountName: '시즌 통장', type: 'seasonal', amount: 500000 },
                    { accountName: '생활비 통장', type: 'spending', amount: Math.floor(salary * 0.4) - 500000 },
                ],
                remaining: 0,
                message: `${salary.toLocaleString()}원 분배 완료`,
            });
        }

        return NextResponse.json({ message: '계좌 관련 기능 — DB 연결 후 활성화' });
    } catch (error) {
        console.error('Bank POST 오류:', error);
        return NextResponse.json({ error: '처리 실패' }, { status: 500 });
    }
}
