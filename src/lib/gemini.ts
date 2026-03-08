// Gemini API 클라이언트 — 지연 초기화
import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';

let _genAI: GoogleGenerativeAI | null = null;
let _model: GenerativeModel | null = null;

function getModel(): GenerativeModel {
    if (!_model) {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            throw new Error('GEMINI_API_KEY 환경 변수가 설정되지 않았습니다. .env 파일을 확인하세요.');
        }
        _genAI = new GoogleGenerativeAI(apiKey);
        _model = _genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    }
    return _model;
}

export async function generateText(prompt: string, maxTokens: number = 4096): Promise<string> {
    const model = getModel();

    const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
            maxOutputTokens: maxTokens,
            temperature: 0.7,
        },
    });

    const response = result.response;
    return response.text();
}

export async function generateJSON<T>(prompt: string): Promise<T> {
    const jsonPrompt = `${prompt}\n\n반드시 순수 JSON 형식으로만 응답하세요. 마크다운 코드블록이나 설명 없이 JSON만 출력하세요.`;
    const text = await generateText(jsonPrompt, 8192);

    // JSON 추출 (코드블록 안에 있을 수 있음)
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, text];
    const jsonStr = (jsonMatch[1] || text).trim();

    try {
        return JSON.parse(jsonStr) as T;
    } catch (e) {
        console.error('[Gemini] JSON 파싱 실패:', jsonStr.substring(0, 200));
        throw new Error(`Gemini 응답 JSON 파싱 실패: ${(e as Error).message}`);
    }
}

export default { generateText, generateJSON };
