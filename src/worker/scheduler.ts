// Cron 스케줄러 — 매일 KST 21:30 자동 실행
import cron from 'node-cron';
import { runDailyPipeline } from './pipeline';
import { log, logSuccess, logError } from '../lib/utils';

// dotenv 로드
require('dotenv').config();

const CRON_SCHEDULE = process.env.CRON_SCHEDULE || '0 0 * * *'; // UTC 00:00 = KST 09:00

log('Scheduler', `스케줄러 시작 — CRON: ${CRON_SCHEDULE} (KST 09:00 매일 실행)`);

// 스케줄 유효성 검사
if (!cron.validate(CRON_SCHEDULE)) {
    logError('Scheduler', `잘못된 CRON 표현식: ${CRON_SCHEDULE}`);
    process.exit(1);
}

// Cron 작업 등록
const task = cron.schedule(CRON_SCHEDULE, async () => {
    log('Scheduler', '===== 스케줄 트리거: Daily Pipeline 시작 =====');

    try {
        await runDailyPipeline();
        logSuccess('Scheduler', '파이프라인 정상 완료');
    } catch (error) {
        logError('Scheduler', '파이프라인 실행 실패', error);
        // 실패해도 스케줄러는 계속 동작
    }
}, {
    timezone: 'Asia/Seoul',
});

// Graceful shutdown
process.on('SIGINT', () => {
    log('Scheduler', '종료 신호 수신. 스케줄러 정지...');
    task.stop();
    process.exit(0);
});

process.on('SIGTERM', () => {
    log('Scheduler', '종료 신호 수신. 스케줄러 정지...');
    task.stop();
    process.exit(0);
});

log('Scheduler', '스케줄러 대기 중... (다음 실행: KST 09:00)');
log('Scheduler', '수동 실행: npx tsx src/worker/pipeline.ts');
