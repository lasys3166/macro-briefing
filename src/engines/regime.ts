// Macro Regime AI 엔진
// 규칙 기반 스코어 산출 → RISK_ON / NEUTRAL / RISK_OFF
import prisma from '../lib/db';
import { generateJSON } from '../lib/gemini';
import { log, logError, logSuccess, getTodayDateString } from '../lib/utils';

export interface RegimeInput {
    name: string;
    value: number | null;
    changePct: number | null;
    historicalValues: number[];
}

export interface RegimeResult {
    score: number;        // -100 ~ +100
    label: string;        // RISK_ON | NEUTRAL | RISK_OFF
    explanation: string;
    drivers: Record<string, { score: number; reason: string }>;
    tomorrowWatch: string;
}

// 20일 모멘텀 계산 (%)
function momentum20d(values: number[]): number | null {
    if (values.length < 2) return null;
    const recent = values[values.length - 1];
    const past = values[0]; // 가장 오래된 값
    if (past === 0) return null;
    return ((recent - past) / past) * 100;
}

// 수익률 커브 스프레드 (10Y - 2Y)
function yieldCurveSpread(
    indicators: RegimeInput[]
): number | null {
    const us10y = indicators.find(i => i.name === 'US_10Y_BOND')?.value;
    const us2y = indicators.find(i => i.name === 'US_2Y_BOND')?.value;
    if (us10y == null || us2y == null) return null;
    return us10y - us2y;
}

// 개별 지표 스코어 계산 (-100 ~ +100 범위로 정규화)
function scoreIndicator(
    name: string,
    value: number | null,
    changePct: number | null,
    mom: number | null,
    yieldSpread: number | null
): { score: number; reason: string } {
    if (value == null) return { score: 0, reason: '데이터 없음' };

    switch (name) {
        case 'SP500': {
            const m = mom ?? 0;
            const s = m > 2 ? 100 : m < -5 ? -100 : (m / 3.5) * 100;
            return { score: Math.max(-100, Math.min(100, s)), reason: `20일 모멘텀 ${m.toFixed(1)}%` };
        }
        case 'NASDAQ': {
            const m = mom ?? 0;
            const s = m > 2 ? 100 : m < -5 ? -100 : (m / 3.5) * 100;
            return { score: Math.max(-100, Math.min(100, s)), reason: `20일 모멘텀 ${m.toFixed(1)}%` };
        }
        case 'VIX': {
            // VIX 낮으면 RISK_ON, 높으면 RISK_OFF (반전)
            const s = value < 18 ? 100 : value > 28 ? -100 : ((23 - value) / 5) * 100;
            return { score: Math.max(-100, Math.min(100, s)), reason: `VIX ${value.toFixed(1)}` };
        }
        case 'DXY': {
            const m = mom ?? 0;
            // 달러 강세 = RISK_OFF
            const s = m < -1 ? 100 : m > 2 ? -100 : ((-m + 0.5) / 1.5) * 100;
            return { score: Math.max(-100, Math.min(100, s)), reason: `20일 변화 ${m.toFixed(1)}%` };
        }
        case 'US_10Y_BOND': {
            const cp = changePct ?? 0;
            // 금리 급등 = RISK_OFF
            const s = cp < 1 ? 50 : cp > 3 ? -100 : ((2 - cp) / 1) * 100;
            return { score: Math.max(-100, Math.min(100, s)), reason: `일변동 ${cp.toFixed(2)}%` };
        }
        case 'COPPER': {
            const m = mom ?? 0;
            const s = m > 2 ? 100 : m < -5 ? -100 : (m / 3.5) * 100;
            return { score: Math.max(-100, Math.min(100, s)), reason: `20일 모멘텀 ${m.toFixed(1)}%` };
        }
        case 'YIELD_CURVE': {
            if (yieldSpread == null) return { score: 0, reason: '데이터 없음' };
            const s = yieldSpread > 0 ? Math.min(100, yieldSpread * 200) : Math.max(-100, yieldSpread * 200);
            return { score: s, reason: `10Y-2Y 스프레드 ${(yieldSpread * 100).toFixed(0)}bp` };
        }
        default:
            return { score: 0, reason: '알 수 없는 지표' };
    }
}

// 가중치 설정
const WEIGHTS: Record<string, number> = {
    SP500: 0.15,
    NASDAQ: 0.15,
    VIX: 0.20,
    DXY: 0.10,
    US_10Y_BOND: 0.10,
    COPPER: 0.10,
    YIELD_CURVE: 0.10,
    // MOVE는 데이터 가용시 추가 (현재 할당량 나머지: 0.10)
};

export function calculateRegimeScore(
    indicators: RegimeInput[]
): { score: number; label: string; drivers: Record<string, { score: number; reason: string }> } {
    const findInd = (name: string) => indicators.find(i => i.name === name);
    const yieldSpread = yieldCurveSpread(indicators);

    const drivers: Record<string, { score: number; reason: string }> = {};
    let totalScore = 0;
    let totalWeight = 0;

    const targetIndicators = ['SP500', 'NASDAQ', 'VIX', 'DXY', 'US_10Y_BOND', 'COPPER'];

    for (const name of targetIndicators) {
        const ind = findInd(name);
        const weight = WEIGHTS[name] || 0;

        if (ind && weight > 0) {
            const mom = momentum20d(ind.historicalValues);
            const { score, reason } = scoreIndicator(name, ind.value, ind.changePct, mom, null);
            drivers[name] = { score, reason };
            totalScore += score * weight;
            totalWeight += weight;
        }
    }

    // Yield Curve
    const ycWeight = WEIGHTS['YIELD_CURVE'] || 0;
    const { score: ycScore, reason: ycReason } = scoreIndicator('YIELD_CURVE', null, null, null, yieldSpread);
    drivers['YIELD_CURVE'] = { score: ycScore, reason: ycReason };
    totalScore += ycScore * ycWeight;
    totalWeight += ycWeight;

    // 정규화
    const normalizedScore = totalWeight > 0 ? Math.round(totalScore / totalWeight) : 0;
    const finalScore = Math.max(-100, Math.min(100, normalizedScore));

    const label = finalScore >= 20 ? 'RISK_ON' : finalScore <= -20 ? 'RISK_OFF' : 'NEUTRAL';

    return { score: finalScore, label, drivers };
}

// LLM으로 설명 생성
async function generateExplanation(
    score: number,
    label: string,
    drivers: Record<string, { score: number; reason: string }>
): Promise<{ explanation: string; tomorrowWatch: string }> {
    try {
        const driversText = Object.entries(drivers)
            .map(([k, v]) => `${k}: ${v.score.toFixed(0)}점 (${v.reason})`)
            .join('\n');

        const prompt = `당신은 매크로 시장 분석 전문가입니다. 아래 Macro Regime AI 결과를 바탕으로:
1) 현재 시장 상태를 3~4줄로 설명하세요.
2) 내일 주시해야 할 포인트 2~3개를 제시하세요.

[Regime 결과]
점수: ${score} / 100 (범위: -100 ~ +100)
라벨: ${label}

[드라이버별 스코어]
${driversText}

JSON 형식으로 답변:
{ "explanation": "...", "tomorrowWatch": "..." }`;

        const parsed = await generateJSON<{ explanation: string; tomorrowWatch: string }>(prompt);
        return {
            explanation: parsed.explanation || `현재 시장은 ${label} 상태 (스코어: ${score}).`,
            tomorrowWatch: parsed.tomorrowWatch || '주요 경제 지표 발표 및 시장 반응 모니터링.',
        };
    } catch (err) {
        logError('RegimeAI', 'LLM 설명 생성 실패', err);
        return {
            explanation: `현재 시장 Regime: ${label} (스코어: ${score}). 주요 드라이버 분석 결과 기반.`,
            tomorrowWatch: '주요 경제 지표 발표 및 중앙은행 발언에 주목.',
        };
    }
}

// 메인 실행 함수
export async function runRegimeAnalysis(
    indicators: RegimeInput[]
): Promise<RegimeResult> {
    log('RegimeAI', 'Macro Regime 분석 시작');

    const { score, label, drivers } = calculateRegimeScore(indicators);
    log('RegimeAI', `스코어: ${score}, 라벨: ${label}`);

    const { explanation, tomorrowWatch } = await generateExplanation(score, label, drivers);

    // DB 저장
    const dateStr = getTodayDateString();
    try {
        await prisma.regimeSnapshot.upsert({
            where: { date: new Date(dateStr) },
            update: { score, label, explanation, drivers: drivers as object, tomorrowWatch },
            create: { date: new Date(dateStr), score, label, explanation, drivers: drivers as object, tomorrowWatch },
        });
    } catch (err) {
        logError('RegimeAI', 'DB 저장 실패', err);
    }

    logSuccess('RegimeAI', `Regime 분석 완료: ${label} (${score})`);
    return { score, label, explanation, drivers, tomorrowWatch };
}

export default { calculateRegimeScore, runRegimeAnalysis };
