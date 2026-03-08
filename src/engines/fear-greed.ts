// Fear & Greed Index 엔진
// US Fear & Greed (프록시 합성) + KR Sentiment Index (명세 기반)
import prisma from '../lib/db';
import { log, logError, logSuccess, getTodayDateString } from '../lib/utils';

export interface SentimentInput {
    name: string;
    value: number | null;
    changePct: number | null;
    historicalValues: number[];
}

export interface SentimentResult {
    usFearGreed: number;   // 0 ~ 100
    usLabel: string;        // Extreme Fear ~ Extreme Greed
    krSentiment: number;    // 0 ~ 100
    krLabel: string;
    components: {
        us: Record<string, { value: number; score: number }>;
        kr: Record<string, { value: number; score: number; weight: number }>;
    };
}

// 백분위 함수: 180일 기준으로 현재 값의 위치 (0=최소, 1=최대)
function percentile(values: number[], current: number): number {
    if (values.length === 0) return 0.5;
    const sorted = [...values].sort((a, b) => a - b);
    const below = sorted.filter(v => v <= current).length;
    return below / sorted.length;
}

// 모멘텀 (최근값/과거값 - 1)
function momentum(values: number[], lookback: number): number {
    if (values.length < lookback + 1) return 0;
    const recent = values[values.length - 1];
    const past = values[values.length - 1 - lookback];
    if (past === 0) return 0;
    return (recent / past) - 1;
}

// ===== US Fear & Greed (프록시 합성) =====
function calculateUSFearGreed(indicators: SentimentInput[]): { score: number; components: Record<string, { value: number; score: number }> } {
    const find = (name: string) => indicators.find(i => i.name === name);
    const components: Record<string, { value: number; score: number }> = {};

    // 1. SPX 모멘텀 (20일) — 높으면 Greed
    const spx = find('SP500');
    const spxMom = spx ? momentum(spx.historicalValues, 20) * 100 : 0;
    const spxScore = Math.max(0, Math.min(100, 50 + spxMom * 5));
    components['SPX_Momentum'] = { value: spxMom, score: spxScore };

    // 2. VIX 역수 — 낮으면 Greed
    const vix = find('VIX');
    let vixScore = 50;
    if (vix?.value) {
        // VIX 12 = 극도의 Greed(100), VIX 35 = 극도의 Fear(0)
        vixScore = Math.max(0, Math.min(100, ((35 - vix.value) / 23) * 100));
    }
    components['VIX_Inverse'] = { value: vix?.value ?? 0, score: vixScore };

    // 3. 주가/20일 이동평균 비율
    let maScore = 50;
    if (spx?.value && spx.historicalValues.length >= 20) {
        const ma20 = spx.historicalValues.slice(-20).reduce((a, b) => a + b, 0) / 20;
        const ratio = ((spx.value / ma20) - 1) * 100;
        maScore = Math.max(0, Math.min(100, 50 + ratio * 10));
    }
    components['Price_vs_MA'] = { value: maScore, score: maScore };

    // 4. 수익률 스프레드 (10Y-2Y 양수면 Greed)
    const us10y = find('US_10Y_BOND')?.value;
    const us2y = find('US_2Y_BOND')?.value;
    let yieldScore = 50;
    if (us10y != null && us2y != null) {
        const spread = us10y - us2y;
        yieldScore = Math.max(0, Math.min(100, 50 + spread * 50));
    }
    components['Yield_Spread'] = { value: yieldScore, score: yieldScore };

    // 5. 안전자산 수요 (Gold 변화 — 급등하면 Fear)
    const gold = find('GOLD');
    let safeHavenScore = 50;
    if (gold?.changePct != null) {
        safeHavenScore = Math.max(0, Math.min(100, 50 - gold.changePct * 10));
    }
    components['Safe_Haven'] = { value: gold?.changePct ?? 0, score: safeHavenScore };

    // 가중 평균
    const weights = [0.25, 0.25, 0.20, 0.15, 0.15];
    const scores = [spxScore, vixScore, maScore, yieldScore, safeHavenScore];
    const totalScore = scores.reduce((sum, s, i) => sum + s * weights[i], 0);

    return { score: Math.round(totalScore), components };
}

// ===== KR Sentiment Index (명세 기반) =====
function calculateKRSentiment(indicators: SentimentInput[]): { score: number; components: Record<string, { value: number; score: number; weight: number }> } {
    const find = (name: string) => indicators.find(i => i.name === name);
    const components: Record<string, { value: number; score: number; weight: number }> = {};

    // S1: KOSPI 모멘텀 (180일 pct) — weight 0.25
    const kospi = find('KOSPI');
    const kospiMom = kospi ? momentum(kospi.historicalValues, Math.min(kospi.historicalValues.length - 1, 20)) : 0;
    const s1 = kospiMom > 0 ? Math.min(1, kospiMom * 5) : Math.max(0, 0.5 + kospiMom * 5);
    components['KOSPI_Momentum'] = { value: kospiMom * 100, score: s1, weight: 0.25 };

    // S2: Volatility (VIX proxy) — weight 0.15
    const vix = find('VIX');
    let s2 = 0.5;
    if (vix?.value) {
        // VIX 높으면 Fear (s2 높음 = Fear)
        s2 = Math.max(0, Math.min(1, (vix.value - 12) / 25));
    }
    components['Volatility'] = { value: vix?.value ?? 0, score: s2, weight: 0.15 };

    // S3: FX Stress (USDKRW) — weight 0.20
    const usdkrw = find('USD_KRW');
    let s3 = 0.5;
    if (usdkrw?.value) {
        // 환율 높으면 Fear
        s3 = Math.max(0, Math.min(1, (usdkrw.value - 1200) / 300));
    }
    components['FX_Stress'] = { value: usdkrw?.value ?? 0, score: s3, weight: 0.20 };

    // S4: VIX 수준 — weight 0.20
    let s4 = 0.5;
    if (vix?.value) {
        s4 = Math.max(0, Math.min(1, (vix.value - 12) / 25));
    }
    components['VIX_Level'] = { value: vix?.value ?? 0, score: s4, weight: 0.20 };

    // S5: Trading Value deviation (dummy — DB에서 실제 거래값 필요시 연결)
    const s5 = 0.5;
    components['Trading_Value'] = { value: 0, score: s5, weight: 0.10 };

    // S6: Foreign Flow (dummy — DB에서 실제 외인 데이터 필요시 연결)
    const s6 = 0.5;
    components['Foreign_Flow'] = { value: 0, score: s6, weight: 0.10 };

    // 가중 합산
    const fearScore = s1 * 0.25 + s2 * 0.15 + s3 * 0.20 + s4 * 0.20 + s5 * 0.10 + s6 * 0.10;
    const krFearGreed = Math.round(100 * (1 - fearScore));

    return { score: krFearGreed, components };
}

// 라벨 결정
function getLabel(score: number): string {
    if (score <= 20) return 'Extreme Fear';
    if (score <= 40) return 'Fear';
    if (score <= 60) return 'Neutral';
    if (score <= 80) return 'Greed';
    return 'Extreme Greed';
}

function getKRLabel(score: number): string {
    if (score <= 20) return '극도의 공포';
    if (score <= 40) return '공포';
    if (score <= 60) return '중립';
    if (score <= 80) return '탐욕';
    return '극도의 탐욕';
}

// 메인 함수
export async function runSentimentAnalysis(
    indicators: SentimentInput[]
): Promise<SentimentResult> {
    log('Sentiment', 'Fear & Greed 분석 시작');

    const us = calculateUSFearGreed(indicators);
    const kr = calculateKRSentiment(indicators);

    const result: SentimentResult = {
        usFearGreed: us.score,
        usLabel: getLabel(us.score),
        krSentiment: kr.score,
        krLabel: getKRLabel(kr.score),
        components: { us: us.components, kr: kr.components },
    };

    // DB 저장
    const dateStr = getTodayDateString();
    try {
        await prisma.sentimentSnapshot.upsert({
            where: { date: new Date(dateStr) },
            update: {
                usFearGreed: result.usFearGreed,
                usLabel: result.usLabel,
                krSentiment: result.krSentiment,
                krLabel: result.krLabel,
                components: result.components as object,
            },
            create: {
                date: new Date(dateStr),
                usFearGreed: result.usFearGreed,
                usLabel: result.usLabel,
                krSentiment: result.krSentiment,
                krLabel: result.krLabel,
                components: result.components as object,
            },
        });
    } catch (err) {
        logError('Sentiment', 'DB 저장 실패', err);
    }

    logSuccess('Sentiment', `US F&G: ${result.usFearGreed} (${result.usLabel}), KR: ${result.krSentiment} (${result.krLabel})`);
    return result;
}

export default { runSentimentAnalysis };
