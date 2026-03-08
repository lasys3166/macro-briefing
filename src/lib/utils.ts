// 로거 유틸
export function log(module: string, message: string, data?: unknown) {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [${module}] ${message}`, data ?? '');
}

export function logError(module: string, message: string, error?: unknown) {
    const timestamp = new Date().toISOString();
    console.error(`[${timestamp}] [${module}] ❌ ${message}`, error ?? '');
}

export function logSuccess(module: string, message: string) {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [${module}] ✅ ${message}`);
}

// 재시도 래퍼
export async function withRetry<T>(
    fn: () => Promise<T>,
    options: { maxRetries?: number; delay?: number; name?: string } = {}
): Promise<T> {
    const { maxRetries = 3, delay = 1000, name = 'operation' } = options;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            return await fn();
        } catch (error) {
            if (attempt === maxRetries) {
                logError('Retry', `${name} 최종 실패 (${maxRetries}회 시도)`, error);
                throw error;
            }
            const waitTime = delay * Math.pow(2, attempt - 1); // 지수 백오프
            log('Retry', `${name} 실패 (${attempt}/${maxRetries}), ${waitTime}ms 후 재시도...`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
        }
    }

    throw new Error('Unreachable');
}

// 날짜 포맷 (KST)
export function formatDateKST(date: Date = new Date()): string {
    return date.toLocaleDateString('ko-KR', {
        timeZone: 'Asia/Seoul',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).replace(/\. /g, '-').replace('.', '');
}

export function getKSTDate(date: Date = new Date()): Date {
    const kstOffset = 9 * 60 * 60 * 1000;
    const utc = date.getTime() + date.getTimezoneOffset() * 60 * 1000;
    return new Date(utc + kstOffset);
}

export function getTodayDateString(): string {
    const kst = getKSTDate();
    return `${kst.getFullYear()}-${String(kst.getMonth() + 1).padStart(2, '0')}-${String(kst.getDate()).padStart(2, '0')}`;
}
