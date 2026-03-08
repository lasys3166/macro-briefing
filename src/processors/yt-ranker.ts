// 유튜브 영상 랭킹 + 중복 제거 모듈
import { log, logSuccess } from '../lib/utils';
import type { YouTubeVideoData } from '../fetchers/youtube';
import type { VideoSummary } from './yt-summarizer';
import channelsConfig from '../config/channels.json';

export interface RankedVideo {
    video: YouTubeVideoData;
    summary: VideoSummary;
    scores: {
        trust: number;       // 채널 신뢰도 (0-1)
        impact: number;      // 영향력 (0-1)
        relevance: number;   // 주제 적합도 (0-1)
        freshness: number;   // 최신성 (0-1)
        total: number;       // 종합 점수
    };
}

// 영향력 점수 (조회수/좋아요/댓글수 기반)
function calculateImpactScore(video: YouTubeVideoData): number {
    // 로그 스케일로 정규화
    const viewScore = Math.min(Math.log10(Math.max(video.viewCount, 1)) / 6, 1); // 100만 = 1.0
    const likeScore = Math.min(Math.log10(Math.max(video.likeCount, 1)) / 5, 1); // 10만 = 1.0
    const commentScore = Math.min(Math.log10(Math.max(video.commentCount, 1)) / 4, 1); // 1만 = 1.0

    return viewScore * 0.5 + likeScore * 0.3 + commentScore * 0.2;
}

// 주제 적합도 (키워드 매칭)
function calculateRelevanceScore(video: YouTubeVideoData, summary: VideoSummary | null): number {
    const keywords = channelsConfig.relevanceKeywords;
    const searchText = [
        video.title,
        video.description,
        summary?.summary || '',
        ...(summary?.keyPoints || []),
    ].join(' ').toLowerCase();

    let matchCount = 0;
    for (const keyword of keywords) {
        if (searchText.includes(keyword.toLowerCase())) {
            matchCount++;
        }
    }

    return Math.min(matchCount / 5, 1); // 5개 이상 매칭이면 만점
}

// 최신성 점수
function calculateFreshnessScore(publishedAt: Date): number {
    const hoursAgo = (Date.now() - publishedAt.getTime()) / (1000 * 60 * 60);
    if (hoursAgo <= 6) return 1.0;
    if (hoursAgo <= 12) return 0.8;
    if (hoursAgo <= 24) return 0.6;
    if (hoursAgo <= 48) return 0.3;
    return 0.1;
}

// 채널 신뢰도 가져오기
function getChannelTrust(channelId: string): number {
    const channel = channelsConfig.channels.find(c => c.id === channelId);
    return channel?.trustWeight || 0.5;
}

// 간단한 텍스트 유사도 (중복 제거용)
function textSimilarity(text1: string, text2: string): number {
    const words1 = new Set(text1.toLowerCase().split(/\s+/).filter(w => w.length > 1));
    const words2 = new Set(text2.toLowerCase().split(/\s+/).filter(w => w.length > 1));

    if (words1.size === 0 || words2.size === 0) return 0;

    let intersection = 0;
    for (const word of words1) {
        if (words2.has(word)) intersection++;
    }

    // Jaccard 유사도
    const union = words1.size + words2.size - intersection;
    return union > 0 ? intersection / union : 0;
}

// 랭킹 계산 및 중복 제거
export function rankAndDeduplicate(
    videos: YouTubeVideoData[],
    summaries: Map<string, VideoSummary>,
    topN: number = 10
): RankedVideo[] {
    log('Ranker', `${videos.length}개 영상 랭킹 시작`);

    // 1. 점수 계산
    const scored: RankedVideo[] = videos
        .filter(v => summaries.has(v.videoId))
        .map(video => {
            const summary = summaries.get(video.videoId)!;
            const trust = getChannelTrust(video.channelId);
            const impact = calculateImpactScore(video);
            const relevance = calculateRelevanceScore(video, summary);
            const freshness = calculateFreshnessScore(video.publishedAt);

            // 가중 합산: 신뢰도 30% + 영향력 25% + 적합도 25% + 최신성 20%
            const total = trust * 0.3 + impact * 0.25 + relevance * 0.25 + freshness * 0.2;

            return {
                video,
                summary,
                scores: { trust, impact, relevance, freshness, total },
            };
        })
        .sort((a, b) => b.scores.total - a.scores.total);

    // 2. 중복 제거 (요약 텍스트 유사도 기반)
    const deduplicated: RankedVideo[] = [];
    const SIMILARITY_THRESHOLD = 0.5;

    for (const item of scored) {
        const isDuplicate = deduplicated.some(existing =>
            textSimilarity(existing.summary.summary, item.summary.summary) > SIMILARITY_THRESHOLD
        );

        if (!isDuplicate) {
            deduplicated.push(item);
        }
    }

    const result = deduplicated.slice(0, topN);
    logSuccess('Ranker', `TOP ${result.length} 선별 완료 (중복 ${scored.length - deduplicated.length}건 제거)`);

    return result;
}

export default { rankAndDeduplicate };
