// Risk Radar 엔진 — 12개 시그널 모니터링, 리스크 스코어 0~100
import prisma from '../lib/db';
import { log, logError, logSuccess, getTodayDateString } from '../lib/utils';
import type { CorrelationResult } from './correlation';

export interface RiskIndicatorData {
    name: string;
    value: number | null;
    changePct: number | null;
    historicalValues: number[]; // 최근 N일 가격
}

export interface RiskSignalResult {
    id: string;
    label: string;
    active: boolean;
    severity: 'low' | 'medium' | 'high';
    value: number; // 0~1 기여도
    detail: string;
}

export interface RiskResult {
    score: number;   // 0 ~ 100
    level: string;   // LOW | MEDIUM | HIGH
    signals: RiskSignalResult[];
    alerts: string[];
}

// 히스토리에서 고점 계산
function highOfPeriod(values: number[], lookback: number): number {
    const slice = values.slice(-lookback);
    return slice.length > 0 ? Math.max(...slice) : 0;
}

// 개별 시그널 평가
function evaluateSignal(
    id: string,
    label: string,
    indicators: RiskIndicatorData[],
    corrShifts?: CorrelationResult['shifts']
): RiskSignalResult {
    const find = (name: string) => indicators.find(i => i.name === name);
    const result: RiskSignalResult = { id, label, active: false, severity: 'low', value: 0, detail: '' };

    switch (id) {
        case 'vix_spike': {
            const vix = find('VIX');
            if (!vix?.value) break;
            const absHigh = vix.value > 25;
            const dailySpike = (vix.changePct ?? 0) > 20;
            if (absHigh || dailySpike) {
                result.active = true;
                result.severity = vix.value > 30 ? 'high' : 'medium';
                result.value = Math.min(1, (vix.value - 18) / 15);
                result.detail = `VIX ${vix.value.toFixed(1)} (변동 ${(vix.changePct ?? 0).toFixed(1)}%)`;
            }
            break;
        }
        case 'dxy_breakout': {
            const dxy = find('DXY');
            if (!dxy?.value || dxy.historicalValues.length < 20) break;
            const high20 = highOfPeriod(dxy.historicalValues, 20);
            if (dxy.value > high20 * 1.01) {
                result.active = true;
                result.severity = 'medium';
                result.value = Math.min(1, (dxy.value - high20) / high20 * 50);
                result.detail = `DXY ${dxy.value.toFixed(1)} > 20일 고점 ${high20.toFixed(1)}`;
            }
            break;
        }
        case 'yield_spike': {
            const us10y = find('US_10Y_BOND');
            if (!us10y?.value) break;
            const changeBp = Math.abs(us10y.changePct ?? 0) * 100;
            if (changeBp > 15) {
                result.active = true;
                result.severity = changeBp > 30 ? 'high' : 'medium';
                result.value = Math.min(1, changeBp / 30);
                result.detail = `US10Y 일변동 ${changeBp.toFixed(0)}bp`;
            }
            break;
        }
        case 'curve_inversion': {
            const us10y = find('US_10Y_BOND')?.value;
            const us2y = find('US_2Y_BOND')?.value;
            if (us10y == null || us2y == null) break;
            const spread = us10y - us2y;
            if (spread < 0) {
                result.active = true;
                result.severity = spread < -0.5 ? 'high' : 'medium';
                result.value = Math.min(1, Math.abs(spread) * 2);
                result.detail = `수익률 커브 역전 ${(spread * 100).toFixed(0)}bp`;
            }
            break;
        }
        case 'equity_drawdown': {
            const spx = find('SP500');
            if (!spx?.value || spx.historicalValues.length < 20) break;
            const high20 = highOfPeriod(spx.historicalValues, 20);
            const drawdown = ((spx.value - high20) / high20) * 100;
            if (drawdown < -5) {
                result.active = true;
                result.severity = drawdown < -10 ? 'high' : 'medium';
                result.value = Math.min(1, Math.abs(drawdown) / 15);
                result.detail = `S&P500 20일 고점 대비 ${drawdown.toFixed(1)}%`;
            }
            break;
        }
        case 'fx_stress': {
            const usdkrw = find('USD_KRW');
            if (!usdkrw?.value) break;
            const absHigh = usdkrw.value > 1380;
            const dailyJump = Math.abs(usdkrw.changePct ?? 0) > 1.5;
            if (absHigh || dailyJump) {
                result.active = true;
                result.severity = usdkrw.value > 1420 ? 'high' : 'medium';
                result.value = Math.min(1, (usdkrw.value - 1300) / 200);
                result.detail = `USDKRW ${usdkrw.value.toFixed(0)} (변동 ${(usdkrw.changePct ?? 0).toFixed(1)}%)`;
            }
            break;
        }
        case 'oil_shock': {
            const wti = find('WTI');
            if (!wti?.value) break;
            if (Math.abs(wti.changePct ?? 0) > 5) {
                result.active = true;
                result.severity = Math.abs(wti.changePct ?? 0) > 8 ? 'high' : 'medium';
                result.value = Math.min(1, Math.abs(wti.changePct ?? 0) / 10);
                result.detail = `WTI 일변동 ${(wti.changePct ?? 0).toFixed(1)}%`;
            }
            break;
        }
        case 'gold_flight': {
            const gold = find('GOLD');
            const vix = find('VIX');
            if (!gold?.value || gold.historicalValues.length < 20) break;
            const high20 = highOfPeriod(gold.historicalValues, 20);
            const above = gold.value > high20 * 1.02;
            const vixUp = (vix?.changePct ?? 0) > 0;
            if (above && vixUp) {
                result.active = true;
                result.severity = 'medium';
                result.value = Math.min(1, (gold.value - high20) / high20 * 25);
                result.detail = `금 ${gold.value.toFixed(0)} > 20일 고점 + VIX 상승`;
            }
            break;
        }
        case 'em_stress': {
            const em = find('MSCI_EM');
            if (!em?.value || em.historicalValues.length < 20) break;
            const high20 = highOfPeriod(em.historicalValues, 20);
            const drawdown = ((em.value - high20) / high20) * 100;
            if (drawdown < -5) {
                result.active = true;
                result.severity = drawdown < -10 ? 'high' : 'medium';
                result.value = Math.min(1, Math.abs(drawdown) / 15);
                result.detail = `MSCI EM 20일 고점 대비 ${drawdown.toFixed(1)}%`;
            }
            break;
        }
        case 'corr_shift': {
            if (corrShifts && corrShifts.length > 0) {
                result.active = true;
                result.severity = corrShifts.length >= 3 ? 'high' : 'medium';
                result.value = Math.min(1, corrShifts.length / 5);
                result.detail = `${corrShifts.length}개 페어 상관관계 급변`;
            }
            break;
        }
        // move_spike, liquidity_tight — 데이터 가용 시 활성화
        default:
            break;
    }

    return result;
}

// 가중치
const SIGNAL_WEIGHTS: Record<string, number> = {
    vix_spike: 0.12,
    move_spike: 0.08,
    dxy_breakout: 0.08,
    yield_spike: 0.10,
    curve_inversion: 0.10,
    equity_drawdown: 0.12,
    fx_stress: 0.08,
    oil_shock: 0.06,
    gold_flight: 0.06,
    em_stress: 0.07,
    liquidity_tight: 0.07,
    corr_shift: 0.06,
};

const SIGNAL_IDS = [
    { id: 'vix_spike', label: 'VIX 급등' },
    { id: 'move_spike', label: 'MOVE 급등' },
    { id: 'dxy_breakout', label: 'DXY 돌파' },
    { id: 'yield_spike', label: '금리 급등' },
    { id: 'curve_inversion', label: '커브 역전' },
    { id: 'equity_drawdown', label: '주식 급락' },
    { id: 'fx_stress', label: '환율 스트레스' },
    { id: 'oil_shock', label: '유가 쇼크' },
    { id: 'gold_flight', label: '안전자산 선호' },
    { id: 'em_stress', label: '신흥국 스트레스' },
    { id: 'liquidity_tight', label: '유동성 긴축' },
    { id: 'corr_shift', label: '상관관계 급변' },
];

export function calculateRiskScore(
    indicators: RiskIndicatorData[],
    corrShifts?: CorrelationResult['shifts']
): RiskResult {
    const signals: RiskSignalResult[] = [];
    let totalScore = 0;

    for (const sig of SIGNAL_IDS) {
        const result = evaluateSignal(sig.id, sig.label, indicators, corrShifts);
        signals.push(result);

        if (result.active) {
            const weight = SIGNAL_WEIGHTS[sig.id] || 0;
            totalScore += result.value * weight * 100;
        }
    }

    const score = Math.min(100, Math.round(totalScore));
    const level = score >= 70 ? 'HIGH' : score >= 40 ? 'MEDIUM' : 'LOW';

    const alerts: string[] = [];
    if (level === 'HIGH') {
        const activeHigh = signals.filter(s => s.severity === 'high');
        for (const s of activeHigh) {
            alerts.push(`⚠️ ${s.label}: ${s.detail}`);
        }
    }

    return { score, level, signals, alerts };
}

// 메인 함수
export async function runRiskAnalysis(
    indicators: RiskIndicatorData[],
    corrShifts?: CorrelationResult['shifts']
): Promise<RiskResult> {
    log('RiskRadar', 'Risk Radar 분석 시작');

    const result = calculateRiskScore(indicators, corrShifts);
    const dateStr = getTodayDateString();

    // DB 저장
    try {
        await prisma.riskSnapshot.upsert({
            where: { date: new Date(dateStr) },
            update: {
                score: result.score,
                level: result.level,
                signals: result.signals as object[],
                alerts: result.alerts,
            },
            create: {
                date: new Date(dateStr),
                score: result.score,
                level: result.level,
                signals: result.signals as object[],
                alerts: result.alerts,
            },
        });
    } catch (err) {
        logError('RiskRadar', 'DB 저장 실패', err);
    }

    // HIGH 시 이벤트 생성
    if (result.level === 'HIGH') {
        try {
            await prisma.event.create({
                data: {
                    type: 'risk_alert',
                    title: `🚨 Risk Level HIGH (${result.score}/100)`,
                    message: result.alerts.join('\n'),
                    severity: 'critical',
                    data: JSON.parse(JSON.stringify({ score: result.score, signals: result.signals.filter(s => s.active) })),
                },
            });
        } catch (err) {
            logError('RiskRadar', '알림 저장 실패', err);
        }
    }

    logSuccess('RiskRadar', `Risk 분석 완료: ${result.level} (${result.score}/100)`);
    return result;
}

export default { calculateRiskScore, runRiskAnalysis };
