// 히스토리 API — 과거 리포트 목록
import { NextResponse } from 'next/server';
import prisma from '@/lib/db';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const limit = parseInt(searchParams.get('limit') || '30');
        const offset = parseInt(searchParams.get('offset') || '0');

        const reports = await prisma.dailyReport.findMany({
            orderBy: { date: 'desc' },
            take: Math.min(limit, 100),
            skip: offset,
            select: {
                id: true,
                date: true,
                status: true,
                topChanges: true,
                createdAt: true,
            },
        });

        const total = await prisma.dailyReport.count();

        return NextResponse.json({
            reports,
            total,
            limit,
            offset,
        });
    } catch (error) {
        console.error('[API/history] 에러:', error);
        return NextResponse.json(
            { error: '서버 오류가 발생했습니다.' },
            { status: 500 }
        );
    }
}
