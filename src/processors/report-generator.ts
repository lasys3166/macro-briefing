// Daily Macro Briefing 리포트 생성기
import { generateText } from '../lib/gemini';
import { log, logSuccess, logError } from '../lib/utils';
import type { CalculatedIndicator } from './macro-calculator';
import { buildIndicatorTable, getTopChanges } from './macro-calculator';
import type { RankedVideo } from './yt-ranker';

export interface DailyReportData {
    date: string;
    indicators: ReturnType<typeof buildIndicatorTable>;
    topChanges: Array<{
        label: string;
        change: number | null;
        changePct: number | null;
        trend: string;
    }>;
    hypotheses: string[];
    checkpoints: string[];
    ytBriefing: Array<{
        rank: number;
        title: string;
        channel: string;
        summary: string;
        keyPoints: string[];
        macroComment: string;
        score: number;
        videoUrl: string;
    }>;
    htmlContent: string;
    textContent: string;
}

// 지표 텍스트 요약 생성 (Gemini 프롬프트용)
function buildIndicatorSummaryText(indicators: CalculatedIndicator[]): string {
    const lines: string[] = [];

    for (const ind of indicators) {
        if (ind.value === null) continue;
        const arrow = ind.trend === 'up' ? '↑' : ind.trend === 'down' ? '↓' : '→';
        const chgStr = ind.changePct !== null ? `${ind.changePct > 0 ? '+' : ''}${ind.changePct}%` : '';
        lines.push(`${ind.label}: ${ind.value} ${ind.unit} (${arrow}${chgStr})`);
    }

    return lines.join('\n');
}

// Gemini로 해석/가설/체크포인트 생성
async function generateAnalysis(indicatorsSummary: string): Promise<{
    hypotheses: string[];
    checkpoints: string[];
}> {
    const prompt = `당신은 매크로 경제 전문 애널리스트입니다. 아래 오늘의 매크로 지표 변동을 분석하세요.

## 오늘의 지표 현황
${indicatorsSummary}

## 요청
1. "왜 이런 변화가 가능했는지" 가설 3개를 작성하세요.
   - 각 가설에 확률(%)과 근거를 포함하세요.
   - 예: "미 연준의 금리 인하 기대감 확대 (확률 60%) - 근거: 최근 고용지표 둔화"

2. "내일 체크해야 할 포인트" 3개를 작성하세요.
   - 구체적인 지표나 이벤트를 명시하세요.
   - 예: "미국 CPI 발표 예정 — 예상치 대비 상회 시 달러 강세 시나리오"

아래 JSON으로 응답:
{
  "hypotheses": ["가설1(확률%)-근거", "가설2(확률%)-근거", "가설3(확률%)-근거"],
  "checkpoints": ["체크포인트1", "체크포인트2", "체크포인트3"]
}`;

    try {
        const text = await generateText(prompt, 2048);
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            return JSON.parse(jsonMatch[0]);
        }
    } catch (error) {
        logError('ReportGen', 'AI 분석 생성 실패', error);
    }

    return {
        hypotheses: ['분석 데이터 부족으로 가설 생성 불가'],
        checkpoints: ['내일 지표 재확인 필요'],
    };
}

// HTML 리포트 생성
function generateHTML(report: DailyReportData): string {
    const indicatorRows = report.indicators.flatMap(group =>
        group.items.map(item => {
            const trendIcon = item.trend === 'up' ? '🟢' : item.trend === 'down' ? '🔴' : '⚪';
            const changeStr = item.changePct !== null
                ? `${item.changePct > 0 ? '+' : ''}${item.changePct}%`
                : '-';
            return `<tr>
        <td>${trendIcon} ${item.label}</td>
        <td><strong>${item.value ?? '-'}</strong> ${item.unit}</td>
        <td>${changeStr}</td>
        <td>${item.avg7d?.toFixed(2) ?? '-'}</td>
      </tr>`;
        })
    ).join('');

    const hypothesesList = report.hypotheses
        .map((h, i) => `<li>${h}</li>`)
        .join('');

    const checkpointsList = report.checkpoints
        .map((c, i) => `<li>${c}</li>`)
        .join('');

    const ytList = report.ytBriefing
        .map((yt, i) => `
      <div class="yt-card">
        <h4>#${yt.rank} ${yt.title}</h4>
        <p class="yt-channel">${yt.channel} · 점수 ${(yt.score * 100).toFixed(0)}</p>
        <p>${yt.summary.substring(0, 200)}...</p>
        <p class="yt-macro">💡 ${yt.macroComment}</p>
      </div>
    `)
        .join('');

    return `
    <div class="daily-report">
      <h2>📊 Daily Macro Briefing — ${report.date}</h2>
      
      <section>
        <h3>1. 오늘의 숫자</h3>
        <table>
          <thead><tr><th>지표</th><th>현재값</th><th>전일대비</th><th>7일평균</th></tr></thead>
          <tbody>${indicatorRows}</tbody>
        </table>
      </section>

      <section>
        <h3>2. 주요 변동</h3>
        <ul>${report.topChanges.map(c => `<li>${c.trend === 'up' ? '↑' : '↓'} ${c.label}: ${c.changePct !== null ? `${c.changePct > 0 ? '+' : ''}${c.changePct}%` : '-'}</li>`).join('')}</ul>
      </section>

      <section>
        <h3>3. 해석: 왜 이런 변화가?</h3>
        <ol>${hypothesesList}</ol>
      </section>

      <section>
        <h3>4. 내일 체크 포인트</h3>
        <ol>${checkpointsList}</ol>
      </section>

      <section>
        <h3>5. 유튜브 브리핑 TOP ${report.ytBriefing.length}</h3>
        ${ytList}
      </section>
    </div>
  `;
}

// 텔레그램용 텍스트 생성
function generateTelegramText(report: DailyReportData): string {
    const lines: string[] = [];

    lines.push(`📊 <b>Daily Macro Briefing — ${report.date}</b>\n`);

    // 지표 요약
    lines.push('<b>▸ 오늘의 숫자</b>');
    for (const group of report.indicators) {
        lines.push(`\n<b>${group.category}</b>`);
        for (const item of group.items) {
            const arrow = item.trend === 'up' ? '↑' : item.trend === 'down' ? '↓' : '→';
            const changeStr = item.changePct !== null
                ? `(${item.changePct > 0 ? '+' : ''}${item.changePct}%)`
                : '';
            lines.push(`  ${arrow} ${item.label}: ${item.value ?? '-'} ${item.unit} ${changeStr}`);
        }
    }

    // 가설
    lines.push('\n<b>▸ 왜 이런 변화가?</b>');
    report.hypotheses.forEach((h, i) => lines.push(`  ${i + 1}. ${h}`));

    // 체크포인트
    lines.push('\n<b>▸ 내일 체크포인트</b>');
    report.checkpoints.forEach((c, i) => lines.push(`  ${i + 1}. ${c}`));

    // 유튜브
    if (report.ytBriefing.length > 0) {
        lines.push('\n<b>▸ 유튜브 브리핑 TOP 5</b>');
        report.ytBriefing.slice(0, 5).forEach(yt => {
            lines.push(`\n  #${yt.rank} <b>${yt.title}</b>`);
            lines.push(`  📺 ${yt.channel}`);
            lines.push(`  💡 ${yt.macroComment}`);
        });
    }

    return lines.join('\n');
}

// 메인: Daily Report 생성
export async function generateDailyReport(
    indicators: CalculatedIndicator[],
    rankedVideos: RankedVideo[],
    dateStr: string
): Promise<DailyReportData> {
    log('ReportGen', `${dateStr} 리포트 생성 시작`);

    // 1. 지표 테이블
    const indicatorTable = buildIndicatorTable(indicators);

    // 2. Top 변동
    const topChanges = getTopChanges(indicators, 5).map(ind => ({
        label: ind.label,
        change: ind.change,
        changePct: ind.changePct,
        trend: ind.trend,
    }));

    // 3. AI 해석 (가설 + 체크포인트)
    const indicatorsSummary = buildIndicatorSummaryText(indicators);
    const { hypotheses, checkpoints } = await generateAnalysis(indicatorsSummary);

    // 4. 유튜브 브리핑 정리
    const ytBriefing = rankedVideos.map((rv, idx) => ({
        rank: idx + 1,
        title: rv.video.title,
        channel: rv.video.channelName,
        summary: rv.summary.summary,
        keyPoints: rv.summary.keyPoints,
        macroComment: rv.summary.macroComment,
        score: rv.scores.total,
        videoUrl: `https://youtube.com/watch?v=${rv.video.videoId}`,
    }));

    const report: DailyReportData = {
        date: dateStr,
        indicators: indicatorTable,
        topChanges,
        hypotheses,
        checkpoints,
        ytBriefing,
        htmlContent: '',
        textContent: '',
    };

    // 5. HTML & 텍스트 렌더링
    report.htmlContent = generateHTML(report);
    report.textContent = generateTelegramText(report);

    logSuccess('ReportGen', `${dateStr} 리포트 생성 완료`);
    return report;
}

export { buildIndicatorSummaryText };
export default { generateDailyReport, buildIndicatorSummaryText };
