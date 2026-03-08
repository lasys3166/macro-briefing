// 오늘의 브리핑 API
import { NextResponse } from 'next/server';
import prisma from '@/lib/db';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const dateParam = searchParams.get('date');

        // 특정 날짜 또는 최신 리포트
        let report;
        if (dateParam) {
            report = await prisma.dailyReport.findUnique({
                where: { date: new Date(dateParam) },
            });
        } else {
            report = await prisma.dailyReport.findFirst({
                orderBy: { date: 'desc' },
            });
        }

        if (!report) {
            return NextResponse.json(
                { error: '리포트를 찾을 수 없습니다.' },
                { status: 404 }
            );
        }

        // 해당 날짜의 지표도 함께 조회
        const indicators = await prisma.macroIndicator.findMany({
            where: { date: report.date },
            orderBy: { category: 'asc' },
        });

        return NextResponse.json({
            report: {
                id: report.id,
                date: report.date,
                indicators: report.indicators,
                topChanges: report.topChanges,
                hypotheses: report.hypotheses,
                checkpoints: report.checkpoints,
                ytBriefing: report.ytBriefing,
                htmlContent: report.htmlContent,
                status: report.status,
                createdAt: report.createdAt,
            },
            rawIndicators: indicators,
        });
    } catch (error) {
        console.error('[API/briefing] 에러:', error);
        return NextResponse.json(
            { error: '서버 오류가 발생했습니다.' },
            { status: 500 }
        );
    }
}
