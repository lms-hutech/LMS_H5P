/**
 * AI Question Generator using Google Gemini API.
 * Generates H5P-compatible questions from document text with
 * semantic chunking, citation tracking, and caching support.
 */
import { createHash } from 'crypto';

import {
    type ContentChunk,
    chunkContent,
    groupChunksIntoBatches
} from './chunker';

export { chunkContent };

export interface AIGenerateRequest {
    text: string;
    notes?: string;
    pdfText?: string;
    numQuestions: number;
    questionType: 'MultiChoice' | 'TrueFalse' | 'Blanks';
    difficulty: 'easy' | 'medium' | 'hard';
    skipCache?: boolean;
}

export interface GeneratedQuestion {
    title: string;
    questionText: string;
    answers: Array<{ text: string; correct: boolean }>;
    explanation?: string;
    source?: string;
}

const DIFFICULTY_DESC: Record<string, string> = {
    easy: 'dễ, kiến thức cơ bản, nhận biết',
    medium: 'trung bình, cần hiểu và vận dụng',
    hard: 'khó, phân tích, so sánh, tổng hợp'
};

const TYPE_DESC: Record<string, string> = {
    MultiChoice: 'trắc nghiệm nhiều lựa chọn (4 đáp án, 1 đáp án đúng)',
    TrueFalse: 'đúng/sai (2 đáp án: Đúng và Sai)',
    Blanks: 'điền vào chỗ trống (câu có chỗ trống cần điền)'
};

/**
 * Build a prompt string from content chunks with source labels.
 */
export function buildPrompt(
    chunks: ContentChunk[],
    req: AIGenerateRequest
): string {
    const labeledContent = chunks
        .filter((c) => c.text.trim())
        .map((c) => `[Nguồn: ${c.source}]\n${c.text}`)
        .join('\n\n');

    const notesSection = req.notes ? `\n\nGhi chú bổ sung:\n${req.notes}` : '';

    return `Bạn là giáo viên đại học Việt Nam. Hãy tạo ${req.numQuestions} câu hỏi ${TYPE_DESC[req.questionType]} ở mức độ ${DIFFICULTY_DESC[req.difficulty]} từ nội dung sau:

---
${labeledContent}${notesSection}
---

Yêu cầu:
- Câu hỏi bằng tiếng Việt
- Mỗi câu có giải thích đáp án ngắn gọn
${req.questionType === 'MultiChoice' ? '- Mỗi câu có đúng 4 đáp án, đánh dấu 1 đáp án đúng' : ''}
${req.questionType === 'TrueFalse' ? '- Mỗi câu chỉ có 2 đáp án: "Đúng" và "Sai", đánh dấu đáp án đúng' : ''}
${req.questionType === 'Blanks' ? '- Tạo câu điền vào chỗ trống. Trong questionText, đặt đáp án đúng trong dấu *đáp án*. VD: "Hội nghị *Dartmouth* năm *1956* khai sinh thuật ngữ AI." Mỗi câu có 1-2 chỗ trống. Trường answers để mảng rỗng [].' : ''}
- Trường "source" ghi chính xác tên nguồn [Nguồn: ...] mà câu hỏi dựa vào

Trả về JSON array, mỗi phần tử có format:
{
  "title": "tiêu đề ngắn gọn",
  "questionText": "${req.questionType === 'Blanks' ? 'câu có *đáp án* trong dấu sao' : 'nội dung câu hỏi'}",
  "answers": [${req.questionType === 'Blanks' ? '' : '{"text": "đáp án", "correct": true/false}'}],
  "explanation": "giải thích",
  "source": "tên nguồn"
}

CHỈ trả về JSON array, không có text khác.`;
}

/**
 * Compute SHA-256 hash of the final prompt for caching.
 */
export function computePromptHash(prompt: string): string {
    return createHash('sha256').update(prompt).digest('hex');
}

/**
 * Compute content hash for deduplication.
 */
export function computeQuestionHash(
    questionText: string,
    answers: Array<{ text: string }>
): string {
    const normalized =
        questionText.toLowerCase().replace(/\s+/g, ' ').trim() +
        '||' +
        answers
            .map((a) => a.text.toLowerCase().replace(/\s+/g, ' ').trim())
            .sort()
            .join('||');
    return createHash('sha256')
        .update(normalized)
        .digest('hex')
        .substring(0, 16);
}

/**
 * Validate returned source values against known chunk sources.
 */
function validateSources(
    questions: GeneratedQuestion[],
    knownSources: string[]
): GeneratedQuestion[] {
    return questions.map((q) => {
        if (
            q.source &&
            !knownSources.some(
                (s) =>
                    s === q.source ||
                    s.includes(q.source!) ||
                    q.source!.includes(s)
            )
        ) {
            return { ...q, source: '' };
        }
        return q;
    });
}

/**
 * Call Gemini API with retry on rate limit (429).
 */
async function callGeminiWithRetry(
    url: string,
    body: object,
    maxRetries: number = 3
): Promise<Response> {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        if (response.status === 429 && attempt < maxRetries) {
            const delay = Math.pow(2, attempt + 2) * 1000;
            await new Promise((r) => setTimeout(r, delay));
            continue;
        }

        return response;
    }
    throw new Error('Gemini API quá tải. Vui lòng thử lại sau vài phút.');
}

/**
 * Call Gemini for a single prompt and return parsed questions.
 */
async function callGeminiForQuestions(
    apiKey: string,
    prompt: string,
    numQuestions: number
): Promise<GeneratedQuestion[]> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`;
    const response = await callGeminiWithRetry(url, {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 8192
        }
    });

    if (!response.ok) {
        const err = await response.text();
        if (response.status === 400) {
            throw new Error('Nội dung không hợp lệ hoặc quá ngắn');
        }
        if (response.status === 403) {
            throw new Error('API key không hợp lệ hoặc đã hết hạn');
        }
        throw new Error(`Gemini API lỗi: ${response.status} - ${err}`);
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
        throw new Error('Gemini không trả về JSON hợp lệ. Hãy thử lại.');
    }

    const questions: GeneratedQuestion[] = JSON.parse(jsonMatch[0]);

    return questions
        .filter(
            (q) =>
                q.title &&
                q.questionText &&
                (q.questionText.includes('*') ||
                    (Array.isArray(q.answers) && q.answers.length >= 2))
        )
        .map((q) => {
            // Shuffle answers so correct answer isn't always first
            if (q.answers && q.answers.length > 1) {
                const shuffled = [...q.answers];
                for (let i = shuffled.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
                }
                return { ...q, answers: shuffled };
            }
            return q;
        })
        .slice(0, numQuestions);
}

/**
 * Main entry point: generate questions from chunked content.
 * Handles single-batch and multi-batch generation.
 */
export async function generateQuestions(
    apiKey: string,
    req: AIGenerateRequest
): Promise<{ questions: GeneratedQuestion[]; promptHash: string }> {
    if (!apiKey) {
        throw new Error(
            'GEMINI_API_KEY chưa được cấu hình. Thêm vào file .env'
        );
    }

    const chunks = chunkContent(req.text, req.pdfText);
    const totalChars = chunks.reduce((sum, c) => sum + c.charCount, 0);

    if (totalChars === 0 && !req.notes) {
        throw new Error('Không có nội dung để tạo câu hỏi');
    }

    const knownSources = chunks
        .filter((c) => c.text.trim())
        .map((c) => c.source);

    const batches = groupChunksIntoBatches(chunks);
    let allQuestions: GeneratedQuestion[] = [];

    if (batches.length === 1) {
        // Single batch — most common case
        const prompt = buildPrompt(batches[0], req);
        const promptHash = computePromptHash(prompt);

        const questions = await callGeminiForQuestions(
            apiKey,
            prompt,
            req.numQuestions
        );

        return {
            questions: validateSources(questions, knownSources),
            promptHash
        };
    }

    // Multi-batch generation
    let firstPromptHash = '';
    for (let i = 0; i < batches.length; i++) {
        const batchChars = batches[i].reduce((s, c) => s + c.charCount, 0);
        const batchQuestions = Math.max(
            1,
            Math.ceil(req.numQuestions * (batchChars / totalChars))
        );

        const batchReq = { ...req, numQuestions: batchQuestions };
        const prompt = buildPrompt(batches[i], batchReq);
        if (i === 0) {
            firstPromptHash = computePromptHash(prompt);
        }

        try {
            const questions = await callGeminiForQuestions(
                apiKey,
                prompt,
                batchQuestions
            );
            allQuestions.push(...questions);
        } catch (err) {
            console.log(
                `AI batch ${i + 1}/${batches.length} failed:`,
                (err as Error).message
            );
        }
    }

    // Dedup across batches by normalized title
    const seen = new Set<string>();
    allQuestions = allQuestions.filter((q) => {
        const key = q.title.toLowerCase().trim();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });

    return {
        questions: validateSources(
            allQuestions.slice(0, req.numQuestions),
            knownSources
        ),
        promptHash: firstPromptHash
    };
}
