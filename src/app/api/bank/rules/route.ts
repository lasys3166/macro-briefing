// Bank Rules API
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';

// GET: 분배 규칙 목록
export async function GET() {
    try {
        const rules = await prisma.bankRule.findMany({
            include: { source: true, target: true },
            orderBy: { priority: 'asc' },
        });
        return NextResponse.json(rules);
    } catch (error) {
        console.error('Bank Rules GET 오류:', error);
        return NextResponse.json({ error: '규칙 조회 실패' }, { status: 500 });
    }
}

// POST: 규칙 생성
export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const rule = await prisma.bankRule.create({
            data: {
                sourceId: body.sourceId,
                targetId: body.targetId,
                type: body.type, // 'fixed' | 'percentage'
                amount: body.amount,
                percentage: body.percentage,
                priority: body.priority || 0,
            },
            include: { source: true, target: true },
        });
        return NextResponse.json(rule);
    } catch (error) {
        console.error('Bank Rules POST 오류:', error);
        return NextResponse.json({ error: '규칙 생성 실패' }, { status: 500 });
    }
}

// PUT: 규칙 수정
export async function PUT(req: NextRequest) {
    try {
        const body = await req.json();
        const rule = await prisma.bankRule.update({
            where: { id: body.id },
            data: {
                type: body.type,
                amount: body.amount,
                percentage: body.percentage,
                priority: body.priority,
            },
            include: { source: true, target: true },
        });
        return NextResponse.json(rule);
    } catch (error) {
        console.error('Bank Rules PUT 오류:', error);
        return NextResponse.json({ error: '규칙 수정 실패' }, { status: 500 });
    }
}

// DELETE: 규칙 삭제
export async function DELETE(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const id = searchParams.get('id');
        if (!id) return NextResponse.json({ error: 'ID 필요' }, { status: 400 });

        await prisma.bankRule.delete({ where: { id } });
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Bank Rules DELETE 오류:', error);
        return NextResponse.json({ error: '규칙 삭제 실패' }, { status: 500 });
    }
}
