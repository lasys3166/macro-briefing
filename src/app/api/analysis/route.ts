// 매크로 분석 API — 지표 변동 기반 가설 + 내일 체크포인트 자동 생성
import { NextResponse } from 'next/server';
import prisma from '@/lib/db';

// 지표 변동 해석 규칙
interface IndicatorRule {
    name: string;
    label: string;
    hypothesisUp: string;
    hypothesisDown: string;
    checkpointUp: string;
    checkpointDown: string;
    threshold: number; // 유의미한 변동 기준 (%)
}

const RULES: IndicatorRule[] = [
    {
        name: 'USD_KRW', label: '원달러 환율',
        hypothesisUp: '외국인 자금 유출 또는 달러 강세 압력 확대 — 수출주에는 긍정적이나 수입 물가 상승 우려',
        hypothesisDown: '외국인 자금 유입 또는 달러 약세 — 원화 강세로 내수·소비주 수혜 가능',
        checkpointUp: '원달러 1,400원 돌파 시 외국인 매도세 가속 여부 관찰',
        checkpointDown: '원달러 하락 지속 시 수출 기업 실적 전망 하향 가능성 체크',
        threshold: 0.5,
    },
    {
        name: 'DXY', label: '달러 인덱스',
        hypothesisUp: '글로벌 안전자산 선호 강화 — 위험자산(주식·신흥국 통화)에 부정적',
        hypothesisDown: '달러 약세 전환 — 신흥국 자산과 원자재에 긍정적 환경',
        checkpointUp: 'DXY 105 돌파 시 글로벌 긴축 우려 재부각 가능성',
        checkpointDown: 'DXY 100 이하 안착 시 글로벌 유동성 확대 신호 확인',
        threshold: 0.3,
    },
    {
        name: 'KR_3Y_BOND', label: '한국 3년 국채금리',
        hypothesisUp: '한국은행 금리인하 기대 후퇴 또는 채권 매도 압력 — 단기 자금 비용 상승',
        hypothesisDown: '한국은행 금리인하 기대 확대 — 부동산·성장주에 긍정적',
        checkpointUp: '내일 한국은행 금통위 또는 CPI 발표 여부 확인',
        checkpointDown: '금리인하 사이클 진입 시 부동산·REIT 포트폴리오 점검',
        threshold: 0.05,
    },
    {
        name: 'KR_10Y_BOND', label: '한국 10년 국채금리',
        hypothesisUp: '장기 인플레이션 기대 상승 또는 재정지출 확대 우려',
        hypothesisDown: '경기 둔화 또는 디플레이션 우려 — 안전자산 선호 강화',
        checkpointUp: '장단기 금리차(10Y-3Y) 확인 — 역전 시 경기침체 신호',
        checkpointDown: '장기 금리 하락 지속 시 성장주·채권형 ETF 비중 확대 검토',
        threshold: 0.05,
    },
    {
        name: 'US_2Y_BOND', label: '미국 2년 국채금리',
        hypothesisUp: 'Fed 금리인하 기대 후퇴 — 원화 약세 압력과 외국인 매도 가능',
        hypothesisDown: 'Fed 금리인하 기대 확대 — 성장주·나스닥에 긍정적',
        checkpointUp: 'FOMC 의사록 또는 Fed 위원 발언 스케줄 확인',
        checkpointDown: 'CME FedWatch 금리인하 확률 변화 추적',
        threshold: 0.05,
    },
    {
        name: 'US_10Y_BOND', label: '미국 10년 국채금리',
        hypothesisUp: '글로벌 장기금리 상승 — 밸류에이션 압박으로 성장주 부담',
        hypothesisDown: '안전자산 수요 증가 — 경기 둔화 우려 또는 유동성 기대',
        checkpointUp: 'US 10Y 4.5% 돌파 시 글로벌 주식시장 조정 위험 확대',
        checkpointDown: '장단기 금리차(10Y-2Y) 정상화 여부 확인 — 경기 사이클 전환 신호',
        threshold: 0.05,
    },
    {
        name: 'KOSPI', label: '코스피 지수',
        hypothesisUp: '외국인·기관 순매수 확대 또는 실적 개선 기대',
        hypothesisDown: '외국인 매도 또는 대외 불확실성 확대에 따른 위험 회피',
        checkpointUp: '코스피 거래량 추이와 외국인 순매수 동향 확인',
        checkpointDown: '코스피 지지선(2,500pt) 이탈 여부와 공매도 잔고 점검',
        threshold: 1.0,
    },
    {
        name: 'SP500', label: 'S&P500 지수',
        hypothesisUp: '미국 경기 회복 신뢰 또는 AI/테크 랠리 지속',
        hypothesisDown: '미국 기업 실적 우려 또는 통화정책 불확실성 확대',
        checkpointUp: 'S&P500 신고가 경신 시 과열 지표(VIX, RSI) 점검',
        checkpointDown: '주요 기술주 실적 발표 일정과 가이던스 확인',
        threshold: 0.5,
    },
    {
        name: 'NASDAQ', label: '나스닥 지수',
        hypothesisUp: 'AI·반도체 섹터 강세 또는 금리인하 기대에 따른 성장주 선호',
        hypothesisDown: '기술주 차익실현 또는 금리 상승에 따른 성장주 할인율 상승',
        checkpointUp: 'NVIDIA·Apple·MS 등 빅테크 실적 및 AI 투자 발표 일정',
        checkpointDown: 'SOX(반도체지수) 동반 하락 여부 — 섹터 전반 약세 확인',
        threshold: 0.5,
    },
    {
        name: 'EUR_USD', label: '유로/달러',
        hypothesisUp: '유로존 경기 개선 기대 또는 ECB 매파 기조',
        hypothesisDown: '유로존 경기 둔화 또는 달러 강세에 따른 유로 약세',
        checkpointUp: 'ECB 금리 결정 및 유로존 PMI 발표 확인',
        checkpointDown: '유럽 주요국 소비자물가 지표 추이 점검',
        threshold: 0.3,
    },
    {
        name: 'USD_JPY', label: '달러/엔',
        hypothesisUp: '엔화 약세 지속 — BOJ 금리정책 동결 기대 또는 캐리 트레이드 확대',
        hypothesisDown: '엔화 강세 전환 — BOJ 정책 변화 신호 또는 안전자산 수요 증가',
        checkpointUp: 'BOJ 회의 일정과 일본 CPI 발표 확인',
        checkpointDown: 'USD/JPY 150 이하 시 일본 수출주 영향 분석',
        threshold: 0.5,
    },
    {
        name: 'USD_CNY', label: '달러/위안',
        hypothesisUp: '중국 경기 둔화 우려 또는 무역분쟁 리스크 확대',
        hypothesisDown: '중국 경기 회복 기대 또는 위안화 방어 정책 효과',
        checkpointUp: '중국 제조업 PMI 및 PBOC 환율 고시 동향 확인',
        checkpointDown: '위안화 강세 시 한국 수출 경쟁력 영향 분석',
        threshold: 0.3,
    },
];

export async function GET() {
    try {
        // 최근 2일 데이터 조회 (오늘 vs 어제 비교)
        const recentDates = await prisma.macroIndicator.findMany({
            select: { date: true },
            distinct: ['date'],
            orderBy: { date: 'desc' },
            take: 2,
        });

        if (recentDates.length === 0) {
            return NextResponse.json({
                hypotheses: ['수집된 데이터가 없습니다. 먼저 수집을 실행해주세요.'],
                checkpoints: ['데이터 수집 후 분석이 가능합니다.'],
            });
        }

        const latestDate = recentDates[0].date;

        // 최신 날짜의 모든 지표
        const latestData = await prisma.macroIndicator.findMany({
            where: { date: latestDate },
        });

        const dataMap = new Map(latestData.map(d => [d.name, d]));

        // 가설 / 체크포인트 생성
        const hypotheses: string[] = [];
        const checkpoints: string[] = [];

        // 큰 변동부터 정렬
        const significantMoves: { rule: IndicatorRule; changePct: number; value: number }[] = [];

        for (const rule of RULES) {
            const d = dataMap.get(rule.name);
            if (!d || d.value === null) continue;

            const changePct = d.changePct ?? 0;
            const absChange = Math.abs(changePct);

            if (absChange >= rule.threshold) {
                significantMoves.push({ rule, changePct, value: d.value });
            }
        }

        // 변동폭 큰 순으로 정렬
        significantMoves.sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct));

        // 가설 생성 (최대 5개)
        for (const move of significantMoves.slice(0, 5)) {
            const { rule, changePct, value } = move;
            const direction = changePct > 0 ? '상승' : '하락';
            const emoji = changePct > 0 ? '📈' : '📉';
            const pctStr = changePct > 0 ? `+${changePct.toFixed(2)}%` : `${changePct.toFixed(2)}%`;
            const hypothesis = changePct > 0 ? rule.hypothesisUp : rule.hypothesisDown;
            hypotheses.push(`${emoji} ${rule.label} ${direction} (${pctStr}, ${value.toLocaleString()}) — ${hypothesis}`);
        }

        // 체크포인트 생성 (최대 5개)
        for (const move of significantMoves.slice(0, 5)) {
            const { rule, changePct } = move;
            const checkpoint = changePct > 0 ? rule.checkpointUp : rule.checkpointDown;
            checkpoints.push(`🎯 ${checkpoint}`);
        }

        // 크로스 분석: 달러 강세 + 원화 약세 동시
        const usdKrw = dataMap.get('USD_KRW');
        const dxy = dataMap.get('DXY');
        if (usdKrw?.changePct && dxy?.changePct && usdKrw.changePct > 0 && dxy.changePct > 0) {
            hypotheses.push('⚠️ 달러 강세+원화 약세 동시 진행 — 자본 유출 압력 확대, 수입물가 상승 경계');
        }

        // 크로스 분석: 금리 역전
        const us2y = dataMap.get('US_2Y_BOND');
        const us10y = dataMap.get('US_10Y_BOND');
        if (us2y?.value && us10y?.value && us2y.value > us10y.value) {
            checkpoints.push('⚠️ 미국 장단기 금리 역전 지속 — 역사적 경기 침체 선행 지표, 방어적 포트폴리오 검토');
        }

        // 크로스 분석: 한국 장단기 금리 역전
        const kr3y = dataMap.get('KR_3Y_BOND');
        const kr10y = dataMap.get('KR_10Y_BOND');
        if (kr3y?.value && kr10y?.value && kr3y.value > kr10y.value) {
            checkpoints.push('⚠️ 한국 장단기 금리 역전(3Y > 10Y) — 한국 경기 둔화 시그널 확인 필요');
        }

        // 변동 없으면 기본 메시지
        if (hypotheses.length === 0) {
            hypotheses.push('📊 오늘은 주요 지표의 유의미한 변동이 없습니다 — 시장이 안정적으로 움직이고 있습니다');
        }
        if (checkpoints.length === 0) {
            checkpoints.push('📋 내일 주요 경제 이벤트(한국은행 금통위, FOMC, CPI 발표 등) 확인');
            checkpoints.push('📋 외국인 매매 동향과 프로그램 매매 추이 점검');
        }

        return NextResponse.json({
            hypotheses,
            checkpoints,
            analysisDate: latestDate.toISOString(),
            indicatorCount: latestData.length,
            significantMoves: significantMoves.length,
        });
    } catch (error) {
        console.error('[API/analysis] 에러:', error);
        return NextResponse.json({
            hypotheses: ['분석 중 오류 발생'],
            checkpoints: ['시스템 로그 확인 필요'],
        });
    }
}
