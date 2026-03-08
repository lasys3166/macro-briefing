// 수동 트리거 API — 파이프라인 즉시 실행
import { NextResponse } from 'next/server';

export async function POST() {
    try {
        // Dynamic import (워커 코드는 서버사이드에서만)
        const { runDailyPipeline } = await import('@/worker/pipeline');

        // 비동기 실행 (타임아웃 방지)
        runDailyPipeline()
            .then(() => console.log('[Trigger] 파이프라인 완료'))
            .catch(err => console.error('[Trigger] 파이프라인 실패:', err));

        return NextResponse.json({
            message: '파이프라인이 시작되었습니다. 완료까지 수 분이 소요될 수 있습니다.',
            triggeredAt: new Date().toISOString(),
        });
    } catch (error) {
        console.error('[API/trigger] 에러:', error);
        return NextResponse.json(
            { error: '파이프라인 시작 실패' },
            { status: 500 }
        );
    }
}

// GET은 상태 확인용
export async function GET() {
    try {
        const { PrismaClient } = await import('@prisma/client');
        const prisma = new PrismaClient();

        const latestJob = await prisma.jobLog.findFirst({
            orderBy: { startedAt: 'desc' },
        });

        const latestReport = await prisma.dailyReport.findFirst({
            orderBy: { date: 'desc' },
            select: { date: true, status: true, createdAt: true },
        });

        await prisma.$disconnect();

        return NextResponse.json({
            latestJob,
            latestReport,
            serverTime: new Date().toISOString(),
        });
    } catch (error) {
        return NextResponse.json({
            error: 'DB 연결 실패',
            serverTime: new Date().toISOString(),
        });
    }
}
