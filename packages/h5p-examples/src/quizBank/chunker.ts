/**
 * Semantic content chunker for RAG pipeline.
 * Splits text at section/paragraph boundaries instead of hard char limits.
 */

export const TARGET_CHUNK_SIZE = 5000;
export const MAX_PROMPT_SIZE = 30000;

export interface ContentChunk {
    text: string;
    source: string;
    charCount: number;
}

const SECTION_REGEX = /^--- (.+?) ---$/m;

/**
 * Split raw text into labeled chunks by section markers or paragraphs.
 */
export function chunkContent(
    rawText: string,
    pdfText?: string
): ContentChunk[] {
    const chunks: ContentChunk[] = [];

    // 1. Process main text (from Canvas pages)
    if (rawText && rawText.trim()) {
        const sections = rawText.split(/^--- /m).filter(Boolean);

        if (sections.length > 1 || SECTION_REGEX.test(rawText)) {
            // Has section markers from loadSelectedPages()
            for (const section of sections) {
                const lineBreak = section.indexOf('\n');
                if (lineBreak === -1) continue;
                const titleRaw = section.substring(0, lineBreak);
                const title = titleRaw.replace(/ ---$/, '').trim();
                const body = section.substring(lineBreak + 1).trim();
                if (!body) continue;
                chunks.push({
                    text: body,
                    source: title || 'Tài liệu',
                    charCount: body.length
                });
            }
        } else {
            // No markers — manual paste. Split by paragraphs if large.
            chunks.push(...splitByParagraphs(rawText.trim(), 'Tài liệu'));
        }
    }

    // 2. Process PDF text
    if (pdfText && pdfText.trim()) {
        chunks.push(...splitByParagraphs(pdfText.trim(), 'PDF Upload'));
    }

    // Return at least one empty chunk so callers don't need null checks
    if (chunks.length === 0) {
        return [{ text: '', source: 'Tài liệu', charCount: 0 }];
    }

    return chunks;
}

/**
 * Split text by paragraph boundaries into chunks of ~TARGET_CHUNK_SIZE.
 */
function splitByParagraphs(text: string, source: string): ContentChunk[] {
    if (text.length <= MAX_PROMPT_SIZE) {
        return [{ text, source, charCount: text.length }];
    }

    const paragraphs = text.split(/\n\n+/);
    const chunks: ContentChunk[] = [];
    let current = '';

    for (const para of paragraphs) {
        if (
            current.length + para.length + 2 > TARGET_CHUNK_SIZE &&
            current.length > 0
        ) {
            chunks.push({
                text: current.trim(),
                source,
                charCount: current.trim().length
            });
            current = '';
        }
        current += (current ? '\n\n' : '') + para;
    }

    if (current.trim()) {
        chunks.push({
            text: current.trim(),
            source,
            charCount: current.trim().length
        });
    }

    return chunks;
}

/**
 * Group chunks into batches that fit within MAX_PROMPT_SIZE.
 * Returns array of batches, each batch is an array of chunks.
 */
export function groupChunksIntoBatches(
    chunks: ContentChunk[]
): ContentChunk[][] {
    const batches: ContentChunk[][] = [];
    let currentBatch: ContentChunk[] = [];
    let currentSize = 0;

    for (const chunk of chunks) {
        if (
            currentSize + chunk.charCount > MAX_PROMPT_SIZE &&
            currentBatch.length > 0
        ) {
            batches.push(currentBatch);
            currentBatch = [];
            currentSize = 0;
        }
        currentBatch.push(chunk);
        currentSize += chunk.charCount;
    }

    if (currentBatch.length > 0) {
        batches.push(currentBatch);
    }

    return batches;
}
