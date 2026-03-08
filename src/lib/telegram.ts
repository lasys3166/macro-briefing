// 텔레그램 봇 알림 모듈 (선택 기능)
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

interface TelegramResponse {
    ok: boolean;
    description?: string;
}

export async function sendTelegramMessage(text: string): Promise<boolean> {
    if (!BOT_TOKEN || !CHAT_ID) {
        console.warn('[Telegram] BOT_TOKEN 또는 CHAT_ID 미설정. 알림 건너뜀.');
        return false;
    }

    try {
        // 텔레그램 메시지 길이 제한: 4096자
        const truncated = text.length > 4000
            ? text.substring(0, 3997) + '...'
            : text;

        const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: CHAT_ID,
                text: truncated,
                parse_mode: 'HTML',
                disable_web_page_preview: true,
            }),
        });

        const data = (await response.json()) as TelegramResponse;

        if (!data.ok) {
            console.error('[Telegram] 발송 실패:', data.description);
            return false;
        }

        console.log('[Telegram] 메시지 발송 성공');
        return true;
    } catch (error) {
        console.error('[Telegram] 발송 오류:', error);
        return false;
    }
}

// 긴 텍스트를 여러 메시지로 분할 발송
export async function sendLongMessage(text: string): Promise<boolean> {
    if (!BOT_TOKEN || !CHAT_ID) return false;

    const chunks: string[] = [];
    const lines = text.split('\n');
    let current = '';

    for (const line of lines) {
        if ((current + '\n' + line).length > 3900) {
            chunks.push(current);
            current = line;
        } else {
            current = current ? current + '\n' + line : line;
        }
    }
    if (current) chunks.push(current);

    let allSuccess = true;
    for (const chunk of chunks) {
        const success = await sendTelegramMessage(chunk);
        if (!success) allSuccess = false;
        // 연속 발송 시 Rate limit 방지
        await new Promise(resolve => setTimeout(resolve, 500));
    }

    return allSuccess;
}

export default { sendTelegramMessage, sendLongMessage };
