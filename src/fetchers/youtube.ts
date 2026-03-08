// YouTube 영상 수집기 — yt-dlp 기반
import { execSync } from 'child_process';
import { log, logError, logSuccess, withRetry } from '../lib/utils';
import channelsConfig from '../config/channels.json';

const YT_DLP = process.env.YT_DLP_PATH || 'python -m yt_dlp';

export interface YouTubeVideoData {
    videoId: string;
    channelId: string;
    channelName: string;
    title: string;
    description: string;
    publishedAt: Date;
    viewCount: number;
    likeCount: number;
    commentCount: number;
    duration: number;
    thumbnailUrl: string;
    transcript: string | null;
    hasSubtitle: boolean;
}

// yt-dlp JSON 결과 타입
interface YtDlpEntry {
    id: string;
    channel_id?: string;
    channel?: string;
    uploader?: string;
    title: string;
    description?: string;
    upload_date?: string;
    timestamp?: number;
    view_count?: number;
    like_count?: number;
    comment_count?: number;
    duration?: number;
    thumbnail?: string;
    subtitles?: Record<string, unknown[]>;
    automatic_captions?: Record<string, unknown[]>;
}

// 채널에서 최근 24시간 영상 메타데이터 수집
function fetchChannelVideos(channelUrl: string, maxVideos: number = 10): YtDlpEntry[] {
    try {
        const cmd = [
            YT_DLP,
            '--flat-playlist',
            '--dump-json',
            '--no-download',
            '--playlist-end', String(maxVideos),
            '--dateafter', 'today-1day',
            `"${channelUrl}/videos"`,
        ].join(' ');

        const output = execSync(cmd, {
            encoding: 'utf-8',
            timeout: 60000,
            stdio: ['pipe', 'pipe', 'pipe'],
        });

        // 각 줄이 하나의 JSON 객체
        return output
            .split('\n')
            .filter(line => line.trim())
            .map(line => {
                try {
                    return JSON.parse(line) as YtDlpEntry;
                } catch {
                    return null;
                }
            })
            .filter((v): v is YtDlpEntry => v !== null);
    } catch (error) {
        logError('YouTube', `채널 영상 목록 조회 실패: ${channelUrl}`, error);
        return [];
    }
}

// 개별 영상 상세 메타데이터 수집
function fetchVideoDetails(videoId: string): YtDlpEntry | null {
    try {
        const cmd = [
            YT_DLP,
            '--dump-json',
            '--no-download',
            `"https://www.youtube.com/watch?v=${videoId}"`,
        ].join(' ');

        const output = execSync(cmd, {
            encoding: 'utf-8',
            timeout: 60000,
            stdio: ['pipe', 'pipe', 'pipe'],
        });

        return JSON.parse(output.trim()) as YtDlpEntry;
    } catch (error) {
        logError('YouTube', `영상 상세 조회 실패: ${videoId}`, error);
        return null;
    }
}

// 자막(자동/공식) 추출
function fetchTranscript(videoId: string): string | null {
    try {
        // 먼저 자막 파일 다운로드 시도 (한국어 → 영어 순)
        const tmpDir = process.env.TEMP || '/tmp';
        const cmd = [
            YT_DLP,
            '--write-sub',
            '--write-auto-sub',
            '--sub-lang', 'ko,en',
            '--sub-format', 'vtt',
            '--skip-download',
            '--output', `"${tmpDir}/yt_sub_${videoId}"`,
            `"https://www.youtube.com/watch?v=${videoId}"`,
        ].join(' ');

        execSync(cmd, {
            encoding: 'utf-8',
            timeout: 60000,
            stdio: ['pipe', 'pipe', 'pipe'],
        });

        // 자막 파일 읽기
        const fs = require('fs');
        const path = require('path');
        const possibleFiles = [
            path.join(tmpDir, `yt_sub_${videoId}.ko.vtt`),
            path.join(tmpDir, `yt_sub_${videoId}.en.vtt`),
        ];

        for (const file of possibleFiles) {
            if (fs.existsSync(file)) {
                const vttContent = fs.readFileSync(file, 'utf-8');
                // VTT → 순수 텍스트 변환
                const text = parseVTT(vttContent);
                // 정리
                try { fs.unlinkSync(file); } catch { /* ignore */ }
                return text;
            }
        }

        return null;
    } catch (error) {
        logError('YouTube', `자막 추출 실패: ${videoId}`, error);
        return null;
    }
}

// VTT 자막을 순수 텍스트로 변환
function parseVTT(vttContent: string): string {
    const lines = vttContent.split('\n');
    const textLines: string[] = [];
    const seen = new Set<string>();

    for (const line of lines) {
        // 타임코드, WEBVTT 헤더, 빈 줄 건너뛰기
        if (
            line.startsWith('WEBVTT') ||
            line.includes('-->') ||
            line.trim() === '' ||
            /^\d+$/.test(line.trim()) ||
            line.startsWith('NOTE') ||
            line.startsWith('Kind:') ||
            line.startsWith('Language:')
        ) {
            continue;
        }

        // HTML 태그 제거
        const clean = line.replace(/<[^>]*>/g, '').trim();
        if (clean && !seen.has(clean)) {
            seen.add(clean);
            textLines.push(clean);
        }
    }

    return textLines.join(' ');
}

// 전체 채널에서 영상 수집
export async function fetchAllChannelVideos(): Promise<YouTubeVideoData[]> {
    const channels = channelsConfig.channels;
    log('YouTube', `${channels.length}개 채널에서 영상 수집 시작`);

    const allVideos: YouTubeVideoData[] = [];

    for (const channel of channels) {
        log('YouTube', `채널 수집 중: ${channel.name}`);

        const entries = await withRetry(
            async () => fetchChannelVideos(channel.url, 5),
            { maxRetries: 2, delay: 2000, name: `Channel:${channel.name}` }
        ).catch(() => [] as YtDlpEntry[]);

        for (const entry of entries) {
            if (!entry.id) continue;

            // 상세 정보 수집
            const details = fetchVideoDetails(entry.id);
            const data = details || entry;

            // 자막 수집
            let transcript: string | null = null;
            let hasSubtitle = false;

            // 자막 가용 여부 확인
            if (data.subtitles || data.automatic_captions) {
                transcript = fetchTranscript(entry.id);
                hasSubtitle = !!transcript;
            }

            const uploadDate = data.upload_date
                ? new Date(`${data.upload_date.slice(0, 4)}-${data.upload_date.slice(4, 6)}-${data.upload_date.slice(6, 8)}`)
                : data.timestamp
                    ? new Date(data.timestamp * 1000)
                    : new Date();

            allVideos.push({
                videoId: entry.id,
                channelId: channel.id,
                channelName: channel.name,
                title: data.title,
                description: data.description || '',
                publishedAt: uploadDate,
                viewCount: data.view_count || 0,
                likeCount: data.like_count || 0,
                commentCount: data.comment_count || 0,
                duration: data.duration || 0,
                thumbnailUrl: data.thumbnail || '',
                transcript,
                hasSubtitle,
            });
        }

        // 채널 간 간격
        await new Promise(resolve => setTimeout(resolve, 2000));
    }

    logSuccess('YouTube', `총 ${allVideos.length}개 영상 수집 완료`);
    return allVideos;
}

export default { fetchAllChannelVideos };
