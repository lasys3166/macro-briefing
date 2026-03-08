// Correlation Engine — log return 기반 Pearson 상관관계 계산
import prisma from '../lib/db';
import { log, logError, logSuccess, getTodayDateString } from '../lib/utils';
import corrConfig from '../config/correlation-pairs.json';

export interface CorrelationResult {
    window: number;
    pairs: Record<string, number>;
    topPositive: { id: string; label: string; value: number }[];
    topNegative: { id: string; label: string; value: number }[];
    shifts: { id: string; label: string; shortTerm: number; longTerm: number; diff: number }[];
}

// 로그 수익률 계산
function logReturns(prices: number[]): number[] {
    const returns: number[] = [];
    for (let i = 1; i < prices.length; i++) {
        if (prices[i - 1] > 0 && prices[i] > 0) {
            returns.push(Math.log(prices[i] / prices[i - 1]));
        }
    }
    return returns;
}

// Pearson 상관계수 계산
function pearsonCorrelation(x: number[], y: number[]): number | null {
    const n = Math.min(x.length, y.length);
    if (n < 5) return null; // 최소 5개 데이터 필요

    const xSlice = x.slice(-n);
    const ySlice = y.slice(-n);

    const meanX = xSlice.reduce((a, b) => a + b, 0) / n;
    const meanY = ySlice.reduce((a, b) => a + b, 0) / n;

    let sumXY = 0, sumX2 = 0, sumY2 = 0;
    for (let i = 0; i < n; i++) {
        const dx = xSlice[i] - meanX;
        const dy = ySlice[i] - meanY;
        sumXY += dx * dy;
        sumX2 += dx * dx;
        sumY2 += dy * dy;
    }

    const denom = Math.sqrt(sumX2 * sumY2);
    if (denom === 0) return null;

    return sumXY / denom;
}

// 히스토리 데이터에서 상관관계 계산
export function calculateCorrelations(
    historicalData: Record<string, number[]>, // { "SP500": [price1, price2, ...], ... }
    window: number
): Omit<CorrelationResult, 'shifts'> {
    const pairs: Record<string, number> = {};
    const pairResults: { id: string; label: string; value: number }[] = [];

    for (const pair of corrConfig.pairs) {
        const seriesA = historicalData[pair.a];
        const seriesB = historicalData[pair.b];

        if (!seriesA || !seriesB || seriesA.length < window || seriesB.length < window) {
            pairs[pair.id] = 0;
            continue;
        }

        // 해당 윈도우 크기만큼의 가격 데이터 사용
        const pricesA = seriesA.slice(-window);
        const pricesB = seriesB.slice(-window);

        // 로그 수익률 계산
        const returnsA = logReturns(pricesA);
        const returnsB = logReturns(pricesB);

        const corr = pearsonCorrelation(returnsA, returnsB);
        const value = corr !== null ? +corr.toFixed(4) : 0;

        pairs[pair.id] = value;
        pairResults.push({ id: pair.id, label: pair.label, value });
    }

    // 정렬
    const sorted = [...pairResults].sort((a, b) => b.value - a.value);
    const topPositive = sorted.filter(p => p.value > 0).slice(0, 3);
    const topNegative = sorted.filter(p => p.value < 0).sort((a, b) => a.value - b.value).slice(0, 3);

    return { window, pairs, topPositive, topNegative };
}

// Correlation Shift 감지 (20일 vs 60일 비교)
export function detectShifts(
    short: CorrelationResult,
    long: CorrelationResult
): CorrelationResult['shifts'] {
    const shifts: CorrelationResult['shifts'] = [];

    for (const pair of corrConfig.pairs) {
        const shortVal = short.pairs[pair.id] ?? 0;
        const longVal = long.pairs[pair.id] ?? 0;
        const diff = Math.abs(shortVal - longVal);

        if (diff > 0.3) {
            shifts.push({
                id: pair.id,
                label: pair.label,
                shortTerm: shortVal,
                longTerm: longVal,
                diff: +diff.toFixed(4),
            });
        }
    }

    return shifts;
}

// 메인 함수 — 모든 윈도우 계산
export async function runCorrelationAnalysis(
    historicalData: Record<string, number[]>
): Promise<CorrelationResult[]> {
    log('Correlation', '상관관계 분석 시작');

    const results: CorrelationResult[] = [];
    const dateStr = getTodayDateString();

    for (const window of corrConfig.windows) {
        const result = calculateCorrelations(historicalData, window);
        results.push({ ...result, shifts: [] });
    }

    // Shift 감지: 20일 vs 60일
    const r20 = results.find(r => r.window === 20);
    const r60 = results.find(r => r.window === 60);
    if (r20 && r60) {
        const shifts = detectShifts(r20, r60);
        r20.shifts = shifts;
        r60.shifts = shifts;
        if (shifts.length > 0) {
            log('Correlation', `상관관계 급변 감지: ${shifts.length}개 페어`);
        }
    }

    // DB 저장
    for (const result of results) {
        try {
            await prisma.correlationSnapshot.upsert({
                where: { date_window: { date: new Date(dateStr), window: result.window } },
                update: {
                    pairs: result.pairs as object,
                    topPositive: result.topPositive as object[],
                    topNegative: result.topNegative as object[],
                    shifts: result.shifts as object[] ?? [],
                },
                create: {
                    date: new Date(dateStr),
                    window: result.window,
                    pairs: result.pairs as object,
                    topPositive: result.topPositive as object[],
                    topNegative: result.topNegative as object[],
                    shifts: result.shifts as object[] ?? [],
                },
            });
        } catch (err) {
            logError('Correlation', `DB 저장 실패 (window=${result.window})`, err);
        }
    }

    logSuccess('Correlation', `상관관계 분석 완료: ${corrConfig.windows.join('/')}일`);
    return results;
}

export default { calculateCorrelations, detectShifts, runCorrelationAnalysis };
