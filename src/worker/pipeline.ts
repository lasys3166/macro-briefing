// 전체 파이프라인 오케스트레이터
// 순서: 지표수집 → 유튜브수집 → 요약 → 랭킹 → Regime → Correlation → Risk → Sentiment → Story → 리포트 → 알림
import prisma from '../lib/db';
import { log, logError, logSuccess, getTodayDateString } from '../lib/utils';
import { fetchAllIndicators } from '../fetchers/yahoo-finance';
import { calculateMetrics } from '../processors/macro-calculator';
import { fetchAllChannelVideos } from '../fetchers/youtube';
import { summarizeAllVideos } from '../processors/yt-summarizer';
import { rankAndDeduplicate } from '../processors/yt-ranker';
import { generateDailyReport, buildIndicatorSummaryText } from '../processors/report-generator';
import { sendLongMessage } from '../lib/telegram';
import { runRegimeAnalysis } from '../engines/regime';
import { runCorrelationAnalysis } from '../engines/correlation';
import { runRiskAnalysis } from '../engines/risk-radar';
import { runSentimentAnalysis } from '../engines/fear-greed';
import { runMacroStory } from '../engines/macro-story';

async function logJob(jobName: string, status: string, message?: string, details?: unknown) {
    try {
        await prisma.jobLog.create({
            data: {
                jobName,
                status,
                message,
                details: details ? JSON.parse(JSON.stringify(details)) : undefined,
                startedAt: new Date(),
            },
        });
    } catch {
        // DB 로깅 실패는 무시 (파이프라인 중단 방지)
    }
}

export async function runDailyPipeline(): Promise<void> {
    const dateStr = getTodayDateString();
    log('Pipeline', `===== ${dateStr} Daily Pipeline 시작 =====`);
    const startTime = Date.now();

    try {
        // ========== 1단계: 매크로 지표 수집 ==========
        log('Pipeline', '1/10 매크로 지표 수집 중...');
        await logJob('macro_fetch', 'running');

        const rawIndicators = await fetchAllIndicators();
        const indicators = calculateMetrics(rawIndicators);

        // DB 저장
        for (const ind of indicators) {
            if (ind.value === null) continue;
            try {
                await prisma.macroIndicator.upsert({
                    where: {
                        date_name: {
                            date: new Date(dateStr),
                            name: ind.name,
                        },
                    },
                    update: {
                        value: ind.value,
                        prevClose: ind.prevClose,
                        change: ind.change,
                        changePct: ind.changePct,
                        avg7d: ind.avg7d,
                        vs7dAvg: ind.vs7dAvg,
                    },
                    create: {
                        date: new Date(dateStr),
                        category: ind.category,
                        name: ind.name,
                        ticker: ind.ticker,
                        value: ind.value,
                        prevClose: ind.prevClose,
                        change: ind.change,
                        changePct: ind.changePct,
                        avg7d: ind.avg7d,
                        vs7dAvg: ind.vs7dAvg,
                    },
                });
            } catch (err) {
                logError('Pipeline', `지표 저장 실패: ${ind.name}`, err);
            }
        }

        await logJob('macro_fetch', 'success', `${indicators.filter(i => i.value).length}개 수집`);
        logSuccess('Pipeline', '1/10 매크로 지표 수집 완료');

        // ========== 2단계: 유튜브 영상 수집 ==========
        log('Pipeline', '2/10 유튜브 영상 수집 중...');
        await logJob('youtube_fetch', 'running');

        const videos = await fetchAllChannelVideos();

        // DB 저장
        for (const video of videos) {
            try {
                await prisma.youTubeVideo.upsert({
                    where: { videoId: video.videoId },
                    update: {
                        viewCount: video.viewCount,
                        likeCount: video.likeCount,
                        commentCount: video.commentCount,
                    },
                    create: {
                        videoId: video.videoId,
                        channelId: video.channelId,
                        channelName: video.channelName,
                        title: video.title,
                        description: video.description,
                        publishedAt: video.publishedAt,
                        viewCount: video.viewCount,
                        likeCount: video.likeCount,
                        commentCount: video.commentCount,
                        duration: video.duration,
                        transcript: video.transcript,
                        thumbnailUrl: video.thumbnailUrl,
                        hasSubtitle: video.hasSubtitle,
                    },
                });
            } catch (err) {
                logError('Pipeline', `영상 저장 실패: ${video.videoId}`, err);
            }
        }

        await logJob('youtube_fetch', 'success', `${videos.length}개 수집`);
        logSuccess('Pipeline', '2/10 유튜브 영상 수집 완료');

        // ========== 3단계: AI 요약 ==========
        log('Pipeline', '3/10 영상 요약 중...');
        await logJob('summarize', 'running');

        const indicatorsSummary = buildIndicatorSummaryText(indicators);
        const videosWithTranscript = videos.filter(v => v.transcript && v.transcript.length > 100);
        const summaries = await summarizeAllVideos(videosWithTranscript, indicatorsSummary);

        // DB 저장
        for (const [videoId, summary] of summaries) {
            try {
                const video = await prisma.youTubeVideo.findUnique({ where: { videoId } });
                if (!video) continue;

                await prisma.youTubeSummary.upsert({
                    where: { videoId: video.id },
                    update: {
                        summary: summary.summary,
                        keyPoints: summary.keyPoints,
                        evidence: summary.evidence,
                        counterPoints: summary.counterPoints,
                        macroComment: summary.macroComment,
                    },
                    create: {
                        videoId: video.id,
                        summary: summary.summary,
                        keyPoints: summary.keyPoints,
                        evidence: summary.evidence,
                        counterPoints: summary.counterPoints,
                        macroComment: summary.macroComment,
                    },
                });
            } catch (err) {
                logError('Pipeline', `요약 저장 실패: ${videoId}`, err);
            }
        }

        await logJob('summarize', 'success', `${summaries.size}개 요약`);
        logSuccess('Pipeline', '3/10 영상 요약 완료');

        // ========== 4단계: 랭킹 & 중복 제거 ==========
        log('Pipeline', '4/10 랭킹 계산 중...');
        const rankedVideos = rankAndDeduplicate(videosWithTranscript, summaries, 10);
        logSuccess('Pipeline', '4/10 랭킹 완료');

        // ========== 5단계: Regime AI ==========
        log('Pipeline', '5/10 Macro Regime 분석 중...');
        await logJob('regime', 'running');
        const regimeInput = indicators.map(i => ({
            name: i.name,
            value: i.value,
            changePct: i.changePct,
            historicalValues: i.historicalValues,
        }));
        const regimeResult = await runRegimeAnalysis(regimeInput);
        await logJob('regime', 'success', `${regimeResult.label} (${regimeResult.score})`);
        logSuccess('Pipeline', `5/10 Regime: ${regimeResult.label} (${regimeResult.score})`);

        // ========== 6단계: Correlation Engine ==========
        log('Pipeline', '6/10 상관관계 분석 중...');
        await logJob('correlation', 'running');
        const historicalData: Record<string, number[]> = {};
        for (const ind of indicators) {
            if (ind.historicalValues.length > 0) {
                historicalData[ind.name] = ind.historicalValues;
            }
        }
        const corrResults = await runCorrelationAnalysis(historicalData);
        await logJob('correlation', 'success', `${corrResults.length}개 윈도우`);
        logSuccess('Pipeline', '6/10 상관관계 분석 완료');

        // ========== 7단계: Risk Radar ==========
        log('Pipeline', '7/10 Risk Radar 분석 중...');
        await logJob('risk', 'running');
        const riskInput = indicators.map(i => ({
            name: i.name,
            value: i.value,
            changePct: i.changePct,
            historicalValues: i.historicalValues,
        }));
        const corrShifts = corrResults.find(r => r.window === 20)?.shifts;
        const riskResult = await runRiskAnalysis(riskInput, corrShifts);
        await logJob('risk', 'success', `${riskResult.level} (${riskResult.score}/100)`);
        logSuccess('Pipeline', `7/10 Risk: ${riskResult.level} (${riskResult.score})`);

        // ========== 8단계: Fear & Greed ==========
        log('Pipeline', '8/10 Fear & Greed 분석 중...');
        await logJob('sentiment', 'running');
        const sentimentInput = indicators.map(i => ({
            name: i.name,
            value: i.value,
            changePct: i.changePct,
            historicalValues: i.historicalValues,
        }));
        const sentResult = await runSentimentAnalysis(sentimentInput);
        await logJob('sentiment', 'success', `US:${sentResult.usFearGreed} KR:${sentResult.krSentiment}`);
        logSuccess('Pipeline', `8/10 Sentiment: US ${sentResult.usFearGreed} / KR ${sentResult.krSentiment}`);

        // ========== 9단계: Macro Story ==========
        log('Pipeline', '9/10 Macro Story 생성 중...');
        await logJob('story', 'running');
        const storyInput = indicators.map(i => ({
            name: i.name,
            label: i.label,
            value: i.value,
            changePct: i.changePct,
            category: i.category,
        }));
        const storyResult = await runMacroStory(storyInput, regimeResult.label);
        await logJob('story', 'success');
        logSuccess('Pipeline', '9/10 Macro Story 생성 완료');

        // ========== 10단계: 리포트 + 알림 ==========
        log('Pipeline', '10/10 리포트 생성 및 알림 발송 중...');
        await logJob('report', 'running');

        const report = await generateDailyReport(indicators, rankedVideos, dateStr);

        // DB 저장
        try {
            await prisma.dailyReport.upsert({
                where: { date: new Date(dateStr) },
                update: {
                    indicators: report.indicators,
                    topChanges: report.topChanges,
                    hypotheses: report.hypotheses,
                    checkpoints: storyResult.checkpoints || report.checkpoints,
                    ytBriefing: report.ytBriefing,
                    htmlContent: report.htmlContent,
                    textContent: report.textContent,
                    status: 'published',
                },
                create: {
                    date: new Date(dateStr),
                    indicators: report.indicators,
                    topChanges: report.topChanges,
                    hypotheses: report.hypotheses,
                    checkpoints: storyResult.checkpoints || report.checkpoints,
                    ytBriefing: report.ytBriefing,
                    htmlContent: report.htmlContent,
                    textContent: report.textContent,
                    status: 'published',
                    sentVia: [],
                },
            });
        } catch (err) {
            logError('Pipeline', '리포트 저장 실패', err);
        }

        await logJob('report', 'success');

        // 텔레그램 알림
        const telegramSent = await sendLongMessage(report.textContent);
        if (telegramSent) {
            await prisma.dailyReport.update({
                where: { date: new Date(dateStr) },
                data: { sentVia: { push: 'telegram' } },
            });
        }

        await logJob('notify', telegramSent ? 'success' : 'skipped',
            telegramSent ? '텔레그램 발송 완료' : '텔레그램 미설정/발송실패');

        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        logSuccess('Pipeline', `===== ${dateStr} Daily Pipeline 완료 (${elapsed}초) =====`);

    } catch (error) {
        logError('Pipeline', 'Pipeline 실행 중 치명적 오류', error);
        await logJob('pipeline', 'failed', (error as Error).message);
        throw error;
    }
}

// 직접 실행 지원
if (require.main === module) {
    require('dotenv').config();
    runDailyPipeline()
        .then(() => process.exit(0))
        .catch(err => {
            console.error(err);
            process.exit(1);
        });
}

export default { runDailyPipeline };
