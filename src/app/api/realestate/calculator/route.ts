// Real Estate Calculator API
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();

        const {
            purchasePrice: P,   // 매매가
            jeonsePrice: J,      // 전세가
            monthlyRent: CF,     // 월세
            growthRate: g,        // 기대 성장률
            requiredReturn: R,   // 요구 수익률
            loanRate: i,          // 대출 금리
            ltv,                  // LTV
            label,                // 시나리오 이름
        } = body;

        // 계산
        const jeonseRatio = P > 0 ? +(J / P).toFixed(4) : null;
        const gap = P - J;
        const annualRent = J * 0.06; // 전세 보증금 기준 연 임대수익
        const nominalYield = P > 0 ? +(annualRent / P * 100).toFixed(2) : null;

        // 가격 모델: P = CF / (R - g) → CF는 연간 현금흐름
        const annualCF = CF ? CF * 12 : annualRent;
        const fairPrice = (R - g) > 0 ? Math.round(annualCF / (R - g)) : null;

        // 레버리지 경고
        const yieldNum = nominalYield || 0;
        const leverageWarning = yieldNum < (i * 100);

        // LTV 기반 대출 계산
        const loanAmount = P * ltv;
        const equity = P - loanAmount;
        const monthlyPayment = loanAmount > 0 ? Math.round((loanAmount * (i / 12)) / (1 - Math.pow(1 + i / 12, -360))) : 0;

        const result = {
            input: { purchasePrice: P, jeonsePrice: J, monthlyRent: CF, growthRate: g, requiredReturn: R, loanRate: i, ltv },
            output: {
                jeonseRatio,
                jeonseRatioPct: jeonseRatio ? +(jeonseRatio * 100).toFixed(1) : null,
                gap,
                annualRent: Math.round(annualRent),
                nominalYield,
                fairPrice,
                loanAmount: Math.round(loanAmount),
                equity: Math.round(equity),
                monthlyPayment,
                leverageWarning,
                warnings: [] as string[],
            },
        };

        // 경고 메시지
        if (leverageWarning) {
            result.output.warnings.push(`⚠️ 수익률(${nominalYield}%)이 대출금리(${(i * 100).toFixed(1)}%)보다 낮습니다. 역레버리지 위험!`);
        }
        if (jeonseRatio && jeonseRatio > 0.8) {
            result.output.warnings.push(`⚠️ 전세가율 ${(jeonseRatio * 100).toFixed(0)}%로 매우 높습니다. 갭 투자 위험!`);
        }
        if (gap < 0) {
            result.output.warnings.push(`🚨 역전세 상태입니다! 전세가가 매매가를 초과합니다.`);
        }

        // DB 저장 (선택)
        if (label) {
            try {
                await prisma.rECalculation.create({
                    data: {
                        label,
                        purchasePrice: P,
                        jeonsePrice: J,
                        monthlyRent: CF || 0,
                        growthRate: g,
                        requiredReturn: R,
                        loanRate: i,
                        ltv,
                        jeonseRatio,
                        gap,
                        nominalYield,
                        fairPrice: fairPrice ? fairPrice : null,
                        leverageWarning,
                    },
                });
            } catch {
                // 저장 실패해도 결과는 반환
            }
        }

        return NextResponse.json(result);
    } catch (error) {
        console.error('RE Calculator API 오류:', error);
        return NextResponse.json({ error: '계산 실패' }, { status: 500 });
    }
}
