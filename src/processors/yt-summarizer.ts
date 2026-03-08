// 유튜브 영상 요약 모듈 — Gemini API
import { generateJSON } from '../lib/gemini';
import { log, logError, logSuccess } from '../lib/utils';
import type { YouTubeVideoData } from '../fetchers/youtube';

export interface VideoSummary {
    summary: string;         // 8줄 요약
    keyPoints: string[];     // 핵심 주장 3개
    evidence: Array<{
        claim: string;
        type: 'fact' | 'data' | 'estimate';
        detail: string;
    }>;
    counterPoints: string[]; // 반론/리스크 2개
    macroComment: string;    // 오늘 지표 연결 코멘트
}

// 단일 영상 요약
export async function summarizeVideo(
    video: YouTubeVideoData,
    todayIndicatorsSummary: string
): Promise<VideoSummary | null> {
    if (!video.transcript || video.transcript.length < 100) {
        log('Summarizer', `자막 부족으로 건너뜀: ${video.title}`);
        return null;
    }

    // 자막 길이 제한 (Gemini 토큰 한도 고려)
    const maxTranscriptLength = 15000;
    const transcript = video.transcript.length > maxTranscriptLength
        ? video.transcript.substring(0, maxTranscriptLength) + '...(이하 생략)'
        : video.transcript;

    const prompt = `당신은 경제/금융 분석 전문가입니다. 아래 유튜브 영상의 자막을 분석하여 투자 브리핑을 작성하세요.

## 영상 정보
- 제목: ${video.title}
- 채널: ${video.channelName}
- 조회수: ${video.viewCount.toLocaleString()}
- 업로드: ${video.publishedAt.toISOString().split('T')[0]}

## 오늘의 매크로 지표 현황
${todayIndicatorsSummary}

## 자막 내용
${transcript}

## 요청 출력 (JSON)
{
  "summary": "8줄로 핵심 내용을 요약하세요. 줄바꿈(\\n)으로 구분하세요.",
  "keyPoints": ["핵심 주장 1", "핵심 주장 2", "핵심 주장 3"],
  "evidence": [
    {"claim": "주장 내용", "type": "fact|data|estimate", "detail": "근거 설명"}
  ],
  "counterPoints": ["반론/리스크 1", "반론/리스크 2"],
  "macroComment": "오늘의 매크로 지표(금리/환율/주가)와 이 영상 내용의 연관성을 1줄로 설명"
}`;

    try {
        const result = await generateJSON<VideoSummary>(prompt);
        logSuccess('Summarizer', `요약 완료: ${video.title.substring(0, 30)}...`);
        return result;
    } catch (error) {
        logError('Summarizer', `요약 실패: ${video.title}`, error);
        return null;
    }
}

// 여러 영상 일괄 요약
export async function summarizeAllVideos(
    videos: YouTubeVideoData[],
    todayIndicatorsSummary: string
): Promise<Map<string, VideoSummary>> {
    log('Summarizer', `${videos.length}개 영상 요약 시작`);

    const summaries = new Map<string, VideoSummary>();

    for (const video of videos) {
        const summary = await summarizeVideo(video, todayIndicatorsSummary);
        if (summary) {
            summaries.set(video.videoId, summary);
        }
        // Gemini API rate limit 방지
        await new Promise(resolve => setTimeout(resolve, 2000));
    }

    logSuccess('Summarizer', `${summaries.size}/${videos.length} 요약 완료`);
    return summaries;
}

export default { summarizeVideo, summarizeAllVideos };
