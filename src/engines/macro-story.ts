// Macro Story Engine — 원인 → 결과 형태의 일일 시장 스토리 생성
import prisma from '../lib/db';
import { generateJSON } from '../lib/gemini';
import { log, logError, logSuccess, getTodayDateString } from '../lib/utils';

export interface StoryInput {
    name: string;
    label: string;
    value: number | null;
    changePct: number | null;
    category: string;
}

export interface StoryResult {
    summary: string;
    drivers: { name: string; label: string; changePct: number; direction: string }[];
    effects: { cause: string; effect: string; description: string }[];
    regime: string;
    checkpoints: string[];
}

// 인과 관계 맵 (미리 정의)
const CAUSAL_MAP: Record<string, { effect: string; description: string }[]> = {
    'US_10Y_BOND_UP': [
        { effect: 'NASDAQ 하락 압력', description: '금리 상승 → 성장주 밸류에이션 부담' },
        { effect: 'DXY 상승', description: '금리 차이 확대 → 달러 강세' },
        { effect: 'GOLD 하락 압력', description: '실질 금리 상승 → 무이자 자산 매력 감소' },
    ],
    'US_10Y_BOND_DOWN': [
        { effect: 'NASDAQ 상승 지지', description: '금리 하락 → 할인율 감소 → 성장주 반등' },
        { effect: 'GOLD 상승 지지', description: '실질 금리 하락 → 안전자산 매력 증가' },
    ],
    'DXY_UP': [
        { effect: '신흥국 통화 약세', description: '달러 강세 → 원화/엔화 등 약세 압력' },
        { effect: '원자재 하락 압력', description: '달러 표시 원자재 가격 부담 증가' },
        { effect: 'KOSPI 하락 압력', description: '외국인 자금 유출 우려' },
    ],
    'DXY_DOWN': [
        { effect: '신흥국 자산 반등', description: '달러 약세 → EM 투자 매력 증가' },
        { effect: '원자재 상승 지지', description: '달러 약세 → 원자재 가격 반등' },
    ],
    'VIX_UP': [
        { effect: '주식 시장 변동성 확대', description: '공포 지수 상승 → 위험회피 심화' },
        { effect: 'GOLD 상승 지지', description: '안전자산 선호 확대' },
    ],
    'VIX_DOWN': [
        { effect: '위험 자산 선호', description: '공포 해소 → 주식 매수 심리 개선' },
    ],
    'WTI_UP': [
        { effect: '인플레이션 우려', description: '에너지 비용 상승 → CPI 상승 압력' },
        { effect: '소비 심리 위축', description: '유가 상승 → 가계 부담 증가' },
    ],
    'WTI_DOWN': [
        { effect: '인플레이션 완화 기대', description: '에너지 비용 하락 → 물가 안정' },
    ],
    'USD_KRW_UP': [
        { effect: '수입 물가 상승', description: '원화 약세 → 수입 비용 증가' },
        { effect: '외국인 매도 압력', description: '환율 상승 → 외인 주식 처분 유인' },
    ],
    'COPPER_UP': [
        { effect: '경기 회복 시그널', description: '구리 = 닥터 코퍼, 제조업 회복 신호' },
    ],
    'COPPER_DOWN': [
        { effect: '경기 둔화 우려', description: '구리 하락 → 산업 수요 감소 신호' },
    ],
};

// Top N 변화 지표 선택
function getTopChanges(indicators: StoryInput[], topN: number = 5): StoryInput[] {
    return [...indicators]
        .filter(i => i.changePct !== null && i.value !== null)
        .sort((a, b) => Math.abs(b.changePct!) - Math.abs(a.changePct!))
        .slice(0, topN);
}

// 인과관계 매핑
function mapEffects(topChanges: StoryInput[]): StoryResult['effects'] {
    const effects: StoryResult['effects'] = [];

    for (const ind of topChanges) {
        const direction = (ind.changePct ?? 0) > 0 ? 'UP' : 'DOWN';
        const key = `${ind.name}_${direction}`;
        const mapped = CAUSAL_MAP[key];

        if (mapped) {
            for (const effect of mapped) {
                effects.push({
                    cause: `${ind.label} ${direction === 'UP' ? '상승' : '하락'} (${(ind.changePct ?? 0) > 0 ? '+' : ''}${ind.changePct?.toFixed(2)}%)`,
                    effect: effect.effect,
                    description: effect.description,
                });
            }
        }
    }

    return effects.slice(0, 6); // 최대 6개 연쇄 반응
}

// LLM으로 최종 스토리 생성
async function generateStoryWithLLM(
    topChanges: StoryInput[],
    effects: StoryResult['effects'],
    regime: string
): Promise<{ summary: string; checkpoints: string[] }> {
    try {
        const changesText = topChanges.map(i =>
            `${i.label}: ${(i.changePct ?? 0) > 0 ? '+' : ''}${i.changePct?.toFixed(2)}% (${i.value?.toLocaleString()})`
        ).join('\n');

        const effectsText = effects.map(e =>
            `${e.cause} → ${e.effect}: ${e.description}`
        ).join('\n');

        const prompt = `당신은 매크로 시장 스토리 분석가입니다. 아래 데이터로 오늘의 시장 스토리를 작성하세요.

[오늘 주요 변화 (Top 5)]
${changesText}

[연쇄 반응 분석]
${effectsText}

[현재 시장 Regime]
${regime}

다음 JSON 형식으로 답변:
{
  "summary": "오늘 시장 요약 (3~5줄, 한국어)",
  "checkpoints": ["내일 체크포인트 1", "내일 체크포인트 2", "내일 체크포인트 3"]
}`;

        const parsed = await generateJSON<{ summary: string; checkpoints: string[] }>(prompt);
        return {
            summary: parsed.summary || '시장 데이터 기반 스토리 미생성',
            checkpoints: parsed.checkpoints || ['주요 경제 지표 발표 확인'],
        };
    } catch (err) {
        logError('MacroStory', 'LLM 스토리 생성 실패', err);
        const changesText = topChanges.map(i => `${i.label} ${(i.changePct ?? 0) > 0 ? '↑' : '↓'}`).join(', ');
        return {
            summary: `오늘 시장 주요 변화: ${changesText}. 현재 Regime: ${regime}.`,
            checkpoints: ['주요 경제 지표 발표 확인', '글로벌 시장 반응 모니터링', 'Regime 변화 주시'],
        };
    }
}

// 메인 함수
export async function runMacroStory(
    indicators: StoryInput[],
    regime: string
): Promise<StoryResult> {
    log('MacroStory', 'Macro Story 생성 시작');

    // 1) Top 변화 지표
    const topChanges = getTopChanges(indicators, 5);
    const drivers = topChanges.map(i => ({
        name: i.name,
        label: i.label,
        changePct: i.changePct ?? 0,
        direction: (i.changePct ?? 0) > 0 ? 'UP' : 'DOWN',
    }));

    // 2) 연쇄 반응 매핑
    const effects = mapEffects(topChanges);

    // 3) LLM 스토리 생성
    const { summary, checkpoints } = await generateStoryWithLLM(topChanges, effects, regime);

    const result: StoryResult = { summary, drivers, effects, regime, checkpoints };

    // DB 저장
    const dateStr = getTodayDateString();
    try {
        await prisma.macroStory.upsert({
            where: { date: new Date(dateStr) },
            update: {
                summary: result.summary,
                drivers: result.drivers as object[],
                effects: result.effects as object[],
                regime: result.regime,
                checkpoints: result.checkpoints,
            },
            create: {
                date: new Date(dateStr),
                summary: result.summary,
                drivers: result.drivers as object[],
                effects: result.effects as object[],
                regime: result.regime,
                checkpoints: result.checkpoints,
            },
        });
    } catch (err) {
        logError('MacroStory', 'DB 저장 실패', err);
    }

    logSuccess('MacroStory', 'Macro Story 생성 완료');
    return result;
}

export default { runMacroStory };
