// 매크로 지표 계산 모듈 — 전일 대비, 7일 평균 대비
import type { FetchedIndicator } from '../fetchers/yahoo-finance';

export interface CalculatedIndicator extends FetchedIndicator {
    avg7d: number | null;
    vs7dAvg: number | null;
    vs7dAvgPct: number | null;
    trend: 'up' | 'down' | 'flat';
}

// 7일 평균 및 대비 계산
export function calculateMetrics(indicators: FetchedIndicator[]): CalculatedIndicator[] {
    return indicators.map(ind => {
        const recent7 = ind.historicalValues.slice(-7);
        const avg7d = recent7.length > 0
            ? +(recent7.reduce((a, b) => a + b, 0) / recent7.length).toFixed(4)
            : null;

        const vs7dAvg = avg7d && ind.value
            ? +(ind.value - avg7d).toFixed(4)
            : null;

        const vs7dAvgPct = avg7d && avg7d !== 0 && ind.value
            ? +(((ind.value - avg7d) / avg7d) * 100).toFixed(4)
            : null;

        // 추세 판단
        let trend: 'up' | 'down' | 'flat' = 'flat';
        if (ind.changePct !== null) {
            if (ind.changePct > 0.05) trend = 'up';
            else if (ind.changePct < -0.05) trend = 'down';
        }

        return {
            ...ind,
            avg7d,
            vs7dAvg,
            vs7dAvgPct,
            trend,
        };
    });
}

// 변동폭 기준 상위 N개 추출
export function getTopChanges(
    indicators: CalculatedIndicator[],
    topN: number = 3
): CalculatedIndicator[] {
    return [...indicators]
        .filter(ind => ind.changePct !== null)
        .sort((a, b) => Math.abs(b.changePct!) - Math.abs(a.changePct!))
        .slice(0, topN);
}

// 카테고리별 그룹핑
export function groupByCategory(
    indicators: CalculatedIndicator[]
): Record<string, CalculatedIndicator[]> {
    return indicators.reduce((acc, ind) => {
        if (!acc[ind.category]) acc[ind.category] = [];
        acc[ind.category].push(ind);
        return acc;
    }, {} as Record<string, CalculatedIndicator[]>);
}

// 오늘의 숫자 테이블 데이터 (리포트용)
export function buildIndicatorTable(indicators: CalculatedIndicator[]) {
    const categoryLabels: Record<string, string> = {
        interest_rate: '📊 금리',
        stock_index: '📈 주가지수',
        exchange_rate: '💱 환율',
        volatility: '🌊 변동성',
        commodity: '🛢️ 원자재',
        liquidity: '💧 유동성',
    };

    const grouped = groupByCategory(indicators);

    return Object.entries(grouped).map(([category, items]) => ({
        category: categoryLabels[category] || category,
        items: items.map(item => ({
            label: item.label,
            value: item.value,
            unit: item.unit,
            change: item.change,
            changePct: item.changePct,
            avg7d: item.avg7d,
            vs7dAvg: item.vs7dAvg,
            trend: item.trend,
        })),
    }));
}

export default { calculateMetrics, getTopChanges, groupByCategory, buildIndicatorTable };
