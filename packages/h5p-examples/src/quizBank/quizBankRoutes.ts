/**
 * Express routes for Question Bank + Question CRUD.
 * All routes require LTI authentication + instructor role.
 * Course ID extracted from LTI token for isolation.
 */
import { Router } from 'express';
import * as H5P from '@lumieducation/h5p-server';
import { PDFParse } from 'pdf-parse';
import { convert } from 'html-to-text';
// youtube-transcript is ESM, imported dynamically below

import { QuestionBank, BankQuestion, GenerationCache } from './schemas';
import { resolveCanvasCourseId } from './canvasUtils';
import { LIBRARY_TO_TYPE, SUPPORTED_QUESTION_TYPES } from './types';
import {
    generateQuestions,
    computeQuestionHash,
    chunkContent,
    buildPrompt,
    computePromptHash,
    type GeneratedQuestion
} from './aiGenerator';

/**
 * Escape HTML special characters to prevent XSS.
 */
function escapeHtml(str: string): string {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * JSON.stringify safe for embedding in HTML script tags.
 * Escapes </ sequences that could break out of script blocks.
 */
function safeJsonStringify(obj: any): string {
    return JSON.stringify(obj).replace(/<\//g, '<\\/');
}

/**
 * Sanitize tags input: ensure it's an array of trimmed strings.
 */
function sanitizeTags(tags: unknown): string[] {
    if (!Array.isArray(tags)) return [];
    return tags
        .filter((t) => typeof t === 'string')
        .map((t: string) => t.trim())
        .filter(Boolean);
}

/**
 * Extract courseId and userId from LTI token on res.locals.
 * Returns null if token is missing or courseId/userId are empty.
 */
function getLtiContext(res: any): {
    courseId: string;
    userId: string;
    userName: string;
} | null {
    const token = res.locals?.token;
    if (!token) return null;
    const courseId =
        token.platformContext?.context?.id ||
        token.platformContext?.custom?.canvas_course_id ||
        '';
    const userId = token.user || '';
    if (!courseId || !userId) return null;
    return {
        courseId,
        userId,
        userName: token.userInfo?.name || 'Unknown'
    };
}

/**
 * Middleware: require instructor role on all quiz-bank routes.
 */
function requireInstructor(_req: any, res: any, next: any): void {
    const roles = res.locals?.token?.platformContext?.roles || [];
    const isInstructor = roles.some(
        (r: string) =>
            r.includes('Instructor') ||
            r.includes('Administrator') ||
            r.includes('ContentDeveloper') ||
            r.includes('TeachingAssistant')
    );
    if (!isInstructor) {
        res.status(403).json({
            error: 'Chỉ giảng viên mới có quyền thực hiện thao tác này'
        });
        return;
    }
    next();
}

/**
 * Verify a bank belongs to the current course.
 * Returns the bank document or null.
 */
async function verifyBankOwnership(
    bankId: string,
    courseId: string
): Promise<any> {
    return QuestionBank.findOne({ _id: bankId, courseId });
}

export default function quizBankRoutes(
    h5pEditor: H5P.H5PEditor,
    h5pPlayer?: H5P.H5PPlayer
): Router {
    const router = Router();

    // All quiz-bank routes require instructor role
    router.use(requireInstructor);

    // ── Question Bank CRUD ──

    /**
     * GET /api/quiz-bank/banks
     * List all banks for the current course with question counts.
     */
    router.get('/banks', async (_req: any, res: any) => {
        try {
            const ctx = getLtiContext(res);
            if (!ctx) {
                return res
                    .status(401)
                    .json({ error: 'Không có thông tin khóa học' });
            }

            const banks = await QuestionBank.find({
                courseId: ctx.courseId
            }).sort({ updatedAt: -1 });

            // Single aggregation instead of N+1 countDocuments calls
            const bankIds = banks.map((b) => b._id);
            const counts = await BankQuestion.aggregate([
                { $match: { bankId: { $in: bankIds } } },
                { $group: { _id: '$bankId', count: { $sum: 1 } } }
            ]);
            const countMap = new Map(
                counts.map((c: any) => [c._id.toString(), c.count as number])
            );

            const result = banks.map((bank) => ({
                _id: bank._id,
                name: bank.name,
                description: bank.description,
                tags: bank.tags,
                questionCount: countMap.get(bank._id.toString()) || 0,
                createdAt: bank.createdAt,
                updatedAt: bank.updatedAt
            }));

            return res.json(result);
        } catch (err: any) {
            return res.status(500).json({ error: err.message });
        }
    });

    /**
     * POST /api/quiz-bank/banks
     * Create a new question bank.
     */
    router.post('/banks', async (req: any, res: any) => {
        try {
            const ctx = getLtiContext(res);
            if (!ctx) {
                return res
                    .status(401)
                    .json({ error: 'Không có thông tin khóa học' });
            }

            const { name, description, tags } = req.body;
            if (!name || typeof name !== 'string' || !name.trim()) {
                return res
                    .status(400)
                    .json({ error: 'Tên ngân hàng không được để trống' });
            }

            const bank = await QuestionBank.create({
                courseId: ctx.courseId,
                name: name.trim(),
                description:
                    typeof description === 'string' ? description.trim() : '',
                tags: sanitizeTags(tags),
                createdBy: ctx.userId
            });

            return res.status(201).json(bank);
        } catch (err: any) {
            return res.status(500).json({ error: err.message });
        }
    });

    /**
     * PUT /api/quiz-bank/banks/:bankId
     * Update bank name/description/tags.
     */
    router.put('/banks/:bankId', async (req: any, res: any) => {
        try {
            const ctx = getLtiContext(res);
            if (!ctx) {
                return res
                    .status(401)
                    .json({ error: 'Không có quyền truy cập' });
            }

            const updates: any = {};
            if (req.body.name && typeof req.body.name === 'string') {
                updates.name = req.body.name.trim();
            }
            if (req.body.description !== undefined) {
                updates.description =
                    typeof req.body.description === 'string'
                        ? req.body.description.trim()
                        : '';
            }
            if (req.body.tags) {
                updates.tags = sanitizeTags(req.body.tags);
            }

            const bank = await QuestionBank.findOneAndUpdate(
                { _id: req.params.bankId, courseId: ctx.courseId },
                { $set: updates },
                { new: true }
            );

            if (!bank) {
                return res
                    .status(404)
                    .json({ error: 'Không tìm thấy ngân hàng' });
            }
            return res.json(bank);
        } catch (err: any) {
            return res.status(500).json({ error: err.message });
        }
    });

    /**
     * DELETE /api/quiz-bank/banks/:bankId
     * Delete a bank and all its questions. Questions deleted first for safety.
     */
    router.delete('/banks/:bankId', async (req: any, res: any) => {
        try {
            const ctx = getLtiContext(res);
            if (!ctx) {
                return res
                    .status(401)
                    .json({ error: 'Không có quyền truy cập' });
            }

            // Verify ownership first
            const bank = await verifyBankOwnership(
                req.params.bankId,
                ctx.courseId
            );
            if (!bank) {
                return res
                    .status(404)
                    .json({ error: 'Không tìm thấy ngân hàng' });
            }

            // Delete questions first, then bank (safer if crash occurs)
            await BankQuestion.deleteMany({ bankId: bank._id });
            await QuestionBank.deleteOne({ _id: bank._id });

            return res.json({ ok: true });
        } catch (err: any) {
            return res.status(500).json({ error: err.message });
        }
    });

    // ── Bank Question CRUD ──

    /**
     * GET /api/quiz-bank/banks/:bankId/questions
     * List questions with optional filters and pagination.
     */
    router.get('/banks/:bankId/questions', async (req: any, res: any) => {
        try {
            const ctx = getLtiContext(res);
            if (!ctx) {
                return res
                    .status(401)
                    .json({ error: 'Không có quyền truy cập' });
            }

            const bank = await verifyBankOwnership(
                req.params.bankId,
                ctx.courseId
            );
            if (!bank) {
                return res
                    .status(404)
                    .json({ error: 'Không tìm thấy ngân hàng' });
            }

            const filter: any = { bankId: bank._id };
            if (req.query.type) {
                filter.questionType = req.query.type;
            }
            if (req.query.tag) {
                filter.tags = req.query.tag;
            }
            if (req.query.difficulty) {
                filter.difficulty = req.query.difficulty;
            }

            const page = parseInt(req.query.page) || 1;
            const limit = Math.min(parseInt(req.query.limit) || 20, 100);
            const skip = (page - 1) * limit;

            const [questions, total] = await Promise.all([
                BankQuestion.find(filter)
                    .sort({ createdAt: -1 })
                    .skip(skip)
                    .limit(limit)
                    .select('-contentSnapshot'),
                BankQuestion.countDocuments(filter)
            ]);

            return res.json({ questions, total, page, limit });
        } catch (err: any) {
            return res.status(500).json({ error: err.message });
        }
    });

    /**
     * GET /api/quiz-bank/banks/:bankId/count
     * Count questions with optional type/difficulty filter.
     */
    router.get('/banks/:bankId/count', async (req: any, res: any) => {
        try {
            const ctx = getLtiContext(res);
            if (!ctx) {
                return res.status(401).json({ error: 'Unauthorized' });
            }
            const bank = await verifyBankOwnership(
                req.params.bankId,
                ctx.courseId
            );
            if (!bank) {
                return res.json({ count: 0 });
            }
            const filter: any = { bankId: bank._id };
            if (req.query.type) {
                filter.questionType = req.query.type;
            }
            if (req.query.difficulty) {
                filter.difficulty = req.query.difficulty;
            }
            const count = await BankQuestion.countDocuments(filter);
            return res.json({ count });
        } catch (_err) {
            return res.json({ count: 0 });
        }
    });

    /**
     * POST /api/quiz-bank/banks/:bankId/questions
     * Add an existing H5P content to the bank (snapshots it).
     */
    router.post('/banks/:bankId/questions', async (req: any, res: any) => {
        try {
            const ctx = getLtiContext(res);
            if (!ctx) {
                return res
                    .status(401)
                    .json({ error: 'Không có quyền truy cập' });
            }

            const bank = await verifyBankOwnership(
                req.params.bankId,
                ctx.courseId
            );
            if (!bank) {
                return res
                    .status(404)
                    .json({ error: 'Không tìm thấy ngân hàng' });
            }

            const { h5pContentId, tags, difficulty, points } = req.body;
            if (!h5pContentId) {
                return res.status(400).json({ error: 'Thiếu h5pContentId' });
            }

            const user = {
                id: ctx.userId,
                name: ctx.userName,
                email: 'lti@example.com',
                type: 'local' as const
            };

            const contentParams =
                await h5pEditor.contentManager.getContentParameters(
                    h5pContentId,
                    user as any
                );
            const contentMeta =
                await h5pEditor.contentManager.getContentMetadata(
                    h5pContentId,
                    user as any
                );

            const mainLib = contentMeta.mainLibrary || '';
            const questionType = LIBRARY_TO_TYPE[mainLib];
            if (!questionType) {
                return res.status(400).json({
                    error: `Loại nội dung "${escapeHtml(mainLib)}" không được hỗ trợ. Chỉ hỗ trợ: ${SUPPORTED_QUESTION_TYPES.join(', ')}`
                });
            }

            const libDep = (contentMeta.preloadedDependencies || []).find(
                (d: any) => d.machineName === mainLib
            );
            const library = libDep
                ? `${libDep.machineName} ${libDep.majorVersion}.${libDep.minorVersion}`
                : mainLib;

            let contentFiles: string[] = [];
            try {
                contentFiles = await h5pEditor.contentManager.listContentFiles(
                    h5pContentId,
                    user as any
                );
            } catch (_e) {
                // No files is fine
            }

            const question = await BankQuestion.create({
                bankId: bank._id,
                h5pContentId,
                contentSnapshot: {
                    params: contentParams,
                    metadata: contentMeta,
                    library
                },
                questionType,
                title: contentMeta.title || `Câu hỏi ${questionType}`,
                tags: sanitizeTags(tags),
                difficulty: difficulty || 'medium',
                points: points || 1,
                contentFiles,
                createdBy: ctx.userId
            });

            return res.status(201).json(question);
        } catch (err: any) {
            return res.status(500).json({ error: err.message });
        }
    });

    /**
     * PUT /api/quiz-bank/banks/:bankId/questions/:questionId
     * Update question metadata (tags, difficulty, points).
     */
    router.put(
        '/banks/:bankId/questions/:questionId',
        async (req: any, res: any) => {
            try {
                const ctx = getLtiContext(res);
                if (!ctx) {
                    return res
                        .status(401)
                        .json({ error: 'Không có quyền truy cập' });
                }

                // Verify bank belongs to this course
                const bank = await verifyBankOwnership(
                    req.params.bankId,
                    ctx.courseId
                );
                if (!bank) {
                    return res
                        .status(404)
                        .json({ error: 'Không tìm thấy ngân hàng' });
                }

                const updates: any = {};
                if (req.body.tags) {
                    updates.tags = sanitizeTags(req.body.tags);
                }
                if (
                    req.body.difficulty &&
                    ['easy', 'medium', 'hard'].includes(req.body.difficulty)
                ) {
                    updates.difficulty = req.body.difficulty;
                }
                if (
                    req.body.points !== undefined &&
                    typeof req.body.points === 'number' &&
                    req.body.points > 0
                ) {
                    updates.points = req.body.points;
                }

                const question = await BankQuestion.findOneAndUpdate(
                    {
                        _id: req.params.questionId,
                        bankId: bank._id
                    },
                    { $set: updates },
                    { new: true }
                );

                if (!question) {
                    return res
                        .status(404)
                        .json({ error: 'Không tìm thấy câu hỏi' });
                }
                return res.json(question);
            } catch (err: any) {
                return res.status(500).json({ error: err.message });
            }
        }
    );

    /**
     * PATCH /api/quiz-bank/banks/:bankId/questions/:questionId
     * Partial update of question metadata (difficulty, points).
     */
    router.patch(
        '/banks/:bankId/questions/:questionId',
        async (req: any, res: any) => {
            try {
                const ctx = getLtiContext(res);
                if (!ctx) {
                    return res
                        .status(401)
                        .json({ error: 'Không có quyền truy cập' });
                }

                const bank = await verifyBankOwnership(
                    req.params.bankId,
                    ctx.courseId
                );
                if (!bank) {
                    return res
                        .status(404)
                        .json({ error: 'Không tìm thấy ngân hàng' });
                }

                const updates: any = {};
                if (
                    req.body.difficulty &&
                    ['easy', 'medium', 'hard'].includes(req.body.difficulty)
                ) {
                    updates.difficulty = req.body.difficulty;
                }
                if (
                    req.body.points !== undefined &&
                    typeof req.body.points === 'number' &&
                    req.body.points >= 0.5
                ) {
                    updates.points = req.body.points;
                }

                if (Object.keys(updates).length === 0) {
                    return res
                        .status(400)
                        .json({ error: 'Không có dữ liệu cập nhật' });
                }

                const question = await BankQuestion.findOneAndUpdate(
                    {
                        _id: req.params.questionId,
                        bankId: bank._id
                    },
                    { $set: updates },
                    { new: true }
                );

                if (!question) {
                    return res
                        .status(404)
                        .json({ error: 'Không tìm thấy câu hỏi' });
                }
                return res.json(question);
            } catch (err: any) {
                return res.status(500).json({ error: err.message });
            }
        }
    );

    /**
     * DELETE /api/quiz-bank/banks/:bankId/questions/:questionId
     * Remove a question from the bank.
     */
    router.delete(
        '/banks/:bankId/questions/:questionId',
        async (req: any, res: any) => {
            try {
                const ctx = getLtiContext(res);
                if (!ctx) {
                    return res
                        .status(401)
                        .json({ error: 'Không có quyền truy cập' });
                }

                // Verify bank belongs to this course
                const bank = await verifyBankOwnership(
                    req.params.bankId,
                    ctx.courseId
                );
                if (!bank) {
                    return res
                        .status(404)
                        .json({ error: 'Không tìm thấy ngân hàng' });
                }

                const question = await BankQuestion.findOneAndDelete({
                    _id: req.params.questionId,
                    bankId: bank._id
                });

                if (!question) {
                    return res
                        .status(404)
                        .json({ error: 'Không tìm thấy câu hỏi' });
                }
                return res.json({ ok: true });
            } catch (err: any) {
                return res.status(500).json({ error: err.message });
            }
        }
    );

    /**
     * GET /api/quiz-bank/banks/:bankId/questions/:questionId/preview
     * Render H5P player for question preview.
     */
    router.get(
        '/banks/:bankId/questions/:questionId/preview',
        async (req: any, res: any) => {
            try {
                const ctx = getLtiContext(res);
                if (!ctx) {
                    return res
                        .status(401)
                        .json({ error: 'Không có quyền truy cập' });
                }

                const bank = await verifyBankOwnership(
                    req.params.bankId,
                    ctx.courseId
                );
                if (!bank) {
                    return res
                        .status(404)
                        .json({ error: 'Không tìm thấy ngân hàng' });
                }

                const question = await BankQuestion.findOne({
                    _id: req.params.questionId,
                    bankId: bank._id
                });
                if (!question) {
                    return res
                        .status(404)
                        .json({ error: 'Không tìm thấy câu hỏi' });
                }

                const safeTitle = escapeHtml(question.title || 'Câu hỏi');
                const params = question.contentSnapshot?.params;
                const library = question.contentSnapshot?.library || '';
                const typeName =
                    library.split(' ')[0]?.replace('H5P.', '') || '';

                if (!params) {
                    return res
                        .status(500)
                        .json({ error: 'Không có dữ liệu câu hỏi' });
                }

                // Build quiz-like preview with correct answers pre-selected
                let previewHtml = '';

                if (typeName === 'MultiChoice') {
                    const qText = params.question || '';
                    const answers = (params.answers || [])
                        .map((a: any, i: number) => {
                            const isCorrect = !!a.correct;
                            return `<label style="display:flex;align-items:flex-start;gap:10px;padding:10px 14px;margin:6px 0;border-radius:8px;cursor:default;
                            ${isCorrect ? 'background:#e8f5e9;border:2px solid #4caf50;' : 'background:#f5f5f5;border:2px solid transparent;'}">
                            <input type="radio" ${isCorrect ? 'checked' : ''} disabled style="margin-top:3px;accent-color:#4caf50;width:18px;height:18px;">
                            <span style="${isCorrect ? 'color:#2e7d32;font-weight:600;' : 'color:#555;'}">${a.text || ''}</span>
                        </label>`;
                        })
                        .join('');
                    previewHtml = `<div style="font-size:15px;line-height:1.6;margin-bottom:16px;">${qText}</div>${answers}`;
                } else if (typeName === 'TrueFalse') {
                    const qText = params.question || '';
                    const correct = params.correct === 'true';
                    previewHtml = `<div style="font-size:15px;line-height:1.6;margin-bottom:16px;">${qText}</div>
                        <label style="display:flex;align-items:center;gap:10px;padding:10px 14px;margin:6px 0;border-radius:8px;cursor:default;
                            ${correct ? 'background:#e8f5e9;border:2px solid #4caf50;' : 'background:#f5f5f5;border:2px solid transparent;'}">
                            <input type="radio" ${correct ? 'checked' : ''} disabled style="accent-color:#4caf50;width:18px;height:18px;">
                            <span style="${correct ? 'color:#2e7d32;font-weight:600;' : 'color:#555;'}">Đúng</span>
                        </label>
                        <label style="display:flex;align-items:center;gap:10px;padding:10px 14px;margin:6px 0;border-radius:8px;cursor:default;
                            ${!correct ? 'background:#e8f5e9;border:2px solid #4caf50;' : 'background:#f5f5f5;border:2px solid transparent;'}">
                            <input type="radio" ${!correct ? 'checked' : ''} disabled style="accent-color:#4caf50;width:18px;height:18px;">
                            <span style="${!correct ? 'color:#2e7d32;font-weight:600;' : 'color:#555;'}">Sai</span>
                        </label>`;
                } else if (typeName === 'Blanks') {
                    const questions = params.questions || [];
                    let html = '';
                    for (let qi = 0; qi < questions.length; qi++) {
                        const raw = questions[qi] || '';
                        const hasStarFormat = /\*[^*]+\*/.test(raw);
                        let sentence: string;
                        if (hasStarFormat) {
                            sentence = raw.replace(
                                /\*([^*]+)\*/g,
                                (_m: string, match: string) => {
                                    const answer = match
                                        .split(':')[0]
                                        .split('/')[0];
                                    return `<span style="display:inline-block;min-width:80px;padding:4px 12px;margin:0 4px;background:#e8f5e9;border:2px solid #4caf50;border-radius:6px;font-weight:600;color:#2e7d32;text-align:center;">${escapeHtml(answer)}</span>`;
                                }
                            );
                        } else {
                            // AI-generated: ______ underscores without embedded answers
                            sentence = raw.replace(
                                /_{3,}/g,
                                () =>
                                    `<span style="display:inline-block;min-width:80px;padding:4px 12px;margin:0 4px;background:#fff3e0;border:2px dashed #e65100;border-radius:6px;font-weight:600;color:#e65100;text-align:center;">?</span>`
                            );
                        }
                        html += `<div style="padding:12px 16px;margin:8px 0;background:#fafafa;border-radius:8px;border:1px solid #e0e0e0;line-height:2;font-size:15px;">${sentence}</div>`;
                    }
                    previewHtml = `${params.text ? `<div style="font-size:15px;margin-bottom:12px;color:#333;">${params.text}</div>` : ''}${html}`;
                } else if (typeName === 'DragText') {
                    const rawText = params.textField || '';
                    const words: string[] = [];
                    const displayed = rawText.replace(
                        /\*([^*]+)\*/g,
                        (_m: string, word: string) => {
                            const w = word.split(':')[0];
                            words.push(w);
                            return `<span style="display:inline-block;padding:4px 12px;margin:2px;background:#e8f5e9;border:2px solid #4caf50;border-radius:6px;font-weight:600;color:#2e7d32;">${escapeHtml(w)}</span>`;
                        }
                    );
                    previewHtml = `<div style="font-size:15px;line-height:2.2;padding:16px;background:#fafafa;border-radius:8px;border:1px solid #e0e0e0;">${displayed}</div>`;
                } else if (typeName === 'MarkTheWords') {
                    const rawText = params.taskDescription || '';
                    const displayed = rawText.replace(
                        /\*([^*]+)\*/g,
                        (_m: string, word: string) => {
                            return `<span style="background:#e8f5e9;padding:2px 8px;border-radius:4px;border:2px solid #4caf50;font-weight:600;color:#2e7d32;">${escapeHtml(word)}</span>`;
                        }
                    );
                    previewHtml = `<div style="font-size:15px;line-height:2.2;padding:16px;background:#fafafa;border-radius:8px;border:1px solid #e0e0e0;">${displayed}</div>`;
                } else if (typeName === 'SingleChoiceSet') {
                    let html = '';
                    const choices = params.choices || [];
                    for (let ci = 0; ci < choices.length; ci++) {
                        const choice = choices[ci];
                        const q = choice.question || '';
                        const answers = choice.answers || [];
                        html += `<div style="margin-bottom:20px;padding:16px;background:#fafafa;border-radius:8px;border:1px solid #e0e0e0;">
                            <div style="font-weight:600;font-size:14px;margin-bottom:10px;color:#333;">Câu ${ci + 1}: ${q}</div>`;
                        answers.forEach((a: string, i: number) => {
                            const isCorrect = i === 0;
                            html += `<label style="display:flex;align-items:center;gap:10px;padding:8px 12px;margin:4px 0;border-radius:6px;cursor:default;
                                ${isCorrect ? 'background:#e8f5e9;border:2px solid #4caf50;' : 'background:white;border:2px solid transparent;'}">
                                <input type="radio" ${isCorrect ? 'checked' : ''} disabled style="accent-color:#4caf50;width:16px;height:16px;">
                                <span style="${isCorrect ? 'color:#2e7d32;font-weight:600;' : 'color:#555;'}">${a}</span>
                            </label>`;
                        });
                        html += '</div>';
                    }
                    previewHtml = html;
                } else if (typeName === 'MultiMediaChoice') {
                    const qText = params.question || '';
                    const options = (params.options || [])
                        .map((opt: any) => {
                            const label =
                                opt.media?.params?.alt ||
                                opt.media?.params?.text ||
                                '[Media]';
                            const isCorrect = !!opt.correct;
                            return `<label style="display:flex;align-items:center;gap:10px;padding:10px 14px;margin:6px 0;border-radius:8px;cursor:default;
                            ${isCorrect ? 'background:#e8f5e9;border:2px solid #4caf50;' : 'background:#f5f5f5;border:2px solid transparent;'}">
                            <input type="checkbox" ${isCorrect ? 'checked' : ''} disabled style="accent-color:#4caf50;width:18px;height:18px;">
                            <span style="${isCorrect ? 'color:#2e7d32;font-weight:600;' : 'color:#555;'}">${escapeHtml(label)}</span>
                        </label>`;
                        })
                        .join('');
                    previewHtml = `<div style="font-size:15px;margin-bottom:16px;">${qText}</div>${options}`;
                } else if (typeName === 'DragQuestion') {
                    const elements =
                        params.question?.task?.params?.elements || [];
                    const dropZones =
                        params.question?.task?.params?.dropZones || [];
                    let html = '';
                    for (const dz of dropZones) {
                        const dzLabel = dz.label || dz.showLabel || '';
                        const correctIds: number[] = dz.correctElements || [];
                        const sources = correctIds.map(
                            (idx: number) =>
                                elements[idx]?.type?.params?.text || `[${idx}]`
                        );
                        html += `<div style="display:flex;align-items:center;gap:8px;padding:10px 14px;margin:6px 0;background:#fafafa;border-radius:8px;border:1px solid #e0e0e0;">
                            <span style="color:#666;min-width:100px;">${escapeHtml(dzLabel)}</span>
                            <span style="color:#999;">←</span>
                            ${sources.map((s) => `<span style="padding:4px 12px;background:#e8f5e9;border:2px solid #4caf50;border-radius:6px;font-weight:600;color:#2e7d32;">${escapeHtml(s)}</span>`).join(' ')}
                        </div>`;
                    }
                    previewHtml = html || '<em>Kéo thả hình ảnh</em>';
                } else if (typeName === 'InteractiveVideo') {
                    const iv = params.interactiveVideo || {};
                    const videoTitle = iv.video?.title || 'Video';
                    const interactions = iv.assets?.interactions || [];
                    let rows = '';
                    for (const inter of interactions) {
                        const time = inter.duration?.from || 0;
                        const mins = Math.floor(time / 60);
                        const secs = Math.floor(time % 60);
                        const timeStr = `${mins}:${secs.toString().padStart(2, '0')}`;
                        const iLib = inter.action?.library || '';
                        const iType =
                            iLib.split(' ')[0]?.replace('H5P.', '') ||
                            'Unknown';
                        const p = inter.action?.params || {};
                        // Render each interaction like a mini quiz
                        let content = '';
                        const typeColors: Record<string, string> = {
                            MultiChoice: '#1565c0',
                            TrueFalse: '#6a1b9a',
                            Blanks: '#e65100',
                            DragText: '#2e7d32',
                            SingleChoiceSet: '#00838f',
                            MarkTheWords: '#4e342e'
                        };
                        if (iType === 'TrueFalse') {
                            const c = p.correct === 'true';
                            content = `<div style="margin-bottom:8px;">${p.question || ''}</div>
                                <label style="display:flex;align-items:center;gap:8px;padding:6px 10px;margin:3px 0;border-radius:6px;${c ? 'background:#e8f5e9;border:1.5px solid #4caf50;' : 'background:#f5f5f5;border:1.5px solid transparent;'}">
                                    <input type="radio" ${c ? 'checked' : ''} disabled style="accent-color:#4caf50;"> <span style="${c ? 'font-weight:600;color:#2e7d32;' : 'color:#555;'}">Đúng</span></label>
                                <label style="display:flex;align-items:center;gap:8px;padding:6px 10px;margin:3px 0;border-radius:6px;${!c ? 'background:#e8f5e9;border:1.5px solid #4caf50;' : 'background:#f5f5f5;border:1.5px solid transparent;'}">
                                    <input type="radio" ${!c ? 'checked' : ''} disabled style="accent-color:#4caf50;"> <span style="${!c ? 'font-weight:600;color:#2e7d32;' : 'color:#555;'}">Sai</span></label>`;
                        } else if (iType === 'MultiChoice') {
                            content = `<div style="margin-bottom:8px;">${p.question || ''}</div>`;
                            for (const a of p.answers || []) {
                                const ok = !!a.correct;
                                content += `<label style="display:flex;align-items:flex-start;gap:8px;padding:6px 10px;margin:3px 0;border-radius:6px;${ok ? 'background:#e8f5e9;border:1.5px solid #4caf50;' : 'background:#f5f5f5;border:1.5px solid transparent;'}">
                                    <input type="radio" ${ok ? 'checked' : ''} disabled style="accent-color:#4caf50;margin-top:2px;"> <span style="${ok ? 'font-weight:600;color:#2e7d32;' : 'color:#555;'}">${a.text || ''}</span></label>`;
                            }
                        } else if (iType === 'Blanks' && p.questions?.length) {
                            let sentence = p.questions[0] || '';
                            // First try *answer* format (standard H5P Blanks)
                            const hasStarFormat = /\*[^*]+\*/.test(sentence);
                            if (hasStarFormat) {
                                sentence = sentence.replace(
                                    /\*([^*]+)\*/g,
                                    (_m: string, m: string) => {
                                        const ans = m
                                            .split(':')[0]
                                            .split('/')[0];
                                        return `<span style="display:inline-block;padding:3px 10px;margin:0 3px;background:#e8f5e9;border:1.5px solid #4caf50;border-radius:5px;font-weight:600;color:#2e7d32;">${ans}</span>`;
                                    }
                                );
                            } else {
                                // Fallback: ______ underscores format (AI-generated)
                                sentence = sentence.replace(
                                    /_{3,}/g,
                                    () =>
                                        `<span style="display:inline-block;min-width:80px;padding:3px 10px;margin:0 3px;background:#fff3e0;border:1.5px dashed #e65100;border-radius:5px;font-weight:600;color:#e65100;text-align:center;">?</span>`
                                );
                            }
                            content = `<div style="line-height:2;">${sentence}</div>`;
                        } else if (iType === 'DragText' && p.textField) {
                            content = p.textField.replace(
                                /\*([^*]+)\*/g,
                                (_m: string, m: string) =>
                                    `<span style="display:inline-block;padding:3px 10px;margin:0 3px;background:#e8f5e9;border:1.5px solid #4caf50;border-radius:5px;font-weight:600;color:#2e7d32;">${m.split(':')[0]}</span>`
                            );
                            content = `<div style="line-height:2;">${content}</div>`;
                        } else if (iType === 'MarkTheWords') {
                            content = (p.taskDescription || '').replace(
                                /\*([^*]+)\*/g,
                                (_m: string, w: string) =>
                                    `<span style="background:#e8f5e9;padding:2px 6px;border-radius:4px;border:1.5px solid #4caf50;font-weight:600;color:#2e7d32;">${escapeHtml(w)}</span>`
                            );
                            content = `<div style="line-height:2;">${content}</div>`;
                        } else if (
                            iType === 'SingleChoiceSet' &&
                            p.choices?.length
                        ) {
                            const ch = p.choices[0];
                            content = `<div style="margin-bottom:8px;">${ch?.question || ''}</div>`;
                            for (
                                let ai = 0;
                                ai < (ch?.answers || []).length;
                                ai++
                            ) {
                                const ok = ai === 0;
                                content += `<label style="display:flex;align-items:center;gap:8px;padding:6px 10px;margin:3px 0;border-radius:6px;${ok ? 'background:#e8f5e9;border:1.5px solid #4caf50;' : 'background:#f5f5f5;border:1.5px solid transparent;'}">
                                    <input type="radio" ${ok ? 'checked' : ''} disabled style="accent-color:#4caf50;"> <span style="${ok ? 'font-weight:600;color:#2e7d32;' : 'color:#555;'}">${ch.answers[ai]}</span></label>`;
                            }
                        } else {
                            content =
                                p.question ||
                                p.taskDescription ||
                                p.text ||
                                '—';
                        }
                        const typeColor = typeColors[iType] || '#455a64';
                        rows += `<tr><td style="padding:10px;border-bottom:1px solid #eee;font-family:monospace;white-space:nowrap;color:#555;vertical-align:top;">${timeStr}</td>
                            <td style="padding:10px;border-bottom:1px solid #eee;vertical-align:top;"><span style="background:${typeColor};color:white;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;">${escapeHtml(iType)}</span></td>
                            <td style="padding:10px;border-bottom:1px solid #eee;font-size:13px;line-height:1.5;">${content}</td></tr>`;
                    }
                    previewHtml = `<div style="margin-bottom:12px;font-size:15px;"><strong>${escapeHtml(videoTitle)}</strong> <span style="color:#666;font-size:13px;">(${interactions.length} tương tác)</span></div>
                        <table style="width:100%;border-collapse:collapse;"><thead><tr style="background:#f5f5f5;">
                        <th style="padding:8px 10px;text-align:left;font-size:12px;">Thời gian</th>
                        <th style="padding:8px 10px;text-align:left;font-size:12px;">Loại</th>
                        <th style="padding:8px 10px;text-align:left;font-size:12px;">Nội dung</th>
                        </tr></thead><tbody>${rows}</tbody></table>`;
                } else {
                    previewHtml = `<pre style="white-space:pre-wrap;font-size:13px;">${escapeHtml(JSON.stringify(params, null, 2))}</pre>`;
                }

                const page = `<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<title>${safeTitle}</title>
<style>
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 20px; margin: 0; color: #333; }
</style>
</head><body>
${previewHtml}
</body></html>`;

                return res.send(page);
            } catch (err: any) {
                return res.status(500).json({ error: err.message });
            }
        }
    );

    // =====================================================
    // Canvas Modules + Pages
    // =====================================================

    /**
     * GET /api/quiz-bank/canvas-modules
     * Fetch list of modules from Canvas course.
     */
    router.get('/canvas-modules', async (req: any, res: any) => {
        try {
            const canvasUrl = process.env.PLATFORM_URL;
            const canvasToken = process.env.CANVAS_API_TOKEN;
            if (!canvasUrl || !canvasToken) {
                return res.json({ modules: [] });
            }

            const ctx = getLtiContext(res);
            const token = res.locals?.token;
            const canvasCourseId =
                req.query.courseId ||
                (await resolveCanvasCourseId(token, ctx?.courseId));

            if (!canvasCourseId) {
                return res.json({ modules: [] });
            }

            const resp = await fetch(
                `${canvasUrl}/api/v1/courses/${canvasCourseId}/modules?include[]=items&per_page=50`,
                {
                    headers: {
                        Authorization: `Bearer ${canvasToken}`
                    }
                }
            );

            if (!resp.ok) {
                return res.json({ modules: [] });
            }

            const modules = await resp.json();
            return res.json({
                modules: modules.map((m: any) => ({
                    id: m.id,
                    name: m.name,
                    position: m.position,
                    items: (m.items || [])
                        .filter(
                            (item: any) =>
                                item.type === 'Page' ||
                                item.type === 'SubHeader'
                        )
                        .map((item: any) => ({
                            title: item.title,
                            type: item.type,
                            pageUrl: item.page_url || ''
                        }))
                }))
            });
        } catch (_err) {
            return res.json({ modules: [] });
        }
    });

    /**
     * GET /api/quiz-bank/canvas-pages
     * Fetch list of pages from Canvas course.
     */
    router.get('/canvas-pages', async (req: any, res: any) => {
        try {
            const ctx = getLtiContext(res);
            if (!ctx) {
                return res
                    .status(401)
                    .json({ error: 'Không có quyền truy cập' });
            }

            const canvasUrl = process.env.PLATFORM_URL;
            const canvasToken = process.env.CANVAS_API_TOKEN;
            if (!canvasUrl || !canvasToken) {
                return res.status(500).json({
                    error: 'CANVAS_API_TOKEN chưa cấu hình'
                });
            }

            // Use Canvas numeric course ID (not LTI context ID)
            const token = res.locals?.token;
            const canvasCourseId =
                req.query.courseId ||
                (await resolveCanvasCourseId(token, ctx.courseId));

            const resp = await fetch(
                `${canvasUrl}/api/v1/courses/${canvasCourseId}/pages?per_page=50&sort=title&order=asc`,
                {
                    headers: {
                        Authorization: `Bearer ${canvasToken}`
                    }
                }
            );

            if (!resp.ok) {
                return res.status(resp.status).json({
                    error: 'Không lấy được danh sách bài học từ Canvas'
                });
            }

            const pages = await resp.json();
            return res.json({
                pages: pages.map((p: any) => ({
                    url: p.url,
                    title: p.title,
                    updatedAt: p.updated_at
                }))
            });
        } catch (err: any) {
            return res.status(500).json({ error: err.message });
        }
    });

    /**
     * GET /api/quiz-bank/canvas-pages/:pageUrl
     * Fetch a single page's body content (text only).
     */
    router.get('/canvas-pages/:pageUrl', async (req: any, res: any) => {
        try {
            const ctx = getLtiContext(res);
            if (!ctx) {
                return res
                    .status(401)
                    .json({ error: 'Không có quyền truy cập' });
            }

            const canvasUrl = process.env.PLATFORM_URL;
            const canvasToken = process.env.CANVAS_API_TOKEN;
            if (!canvasUrl || !canvasToken) {
                return res.status(500).json({
                    error: 'CANVAS_API_TOKEN chưa cấu hình'
                });
            }

            const token = res.locals?.token;
            const canvasCourseId =
                req.query.courseId ||
                (await resolveCanvasCourseId(token, ctx.courseId));

            const resp = await fetch(
                `${canvasUrl}/api/v1/courses/${canvasCourseId}/pages/${encodeURIComponent(req.params.pageUrl)}`,
                {
                    headers: {
                        Authorization: `Bearer ${canvasToken}`
                    }
                }
            );

            if (!resp.ok) {
                return res.status(resp.status).json({
                    error: 'Không lấy được nội dung bài học'
                });
            }

            const page = await resp.json();
            // Convert HTML → plain text
            const body = convert(page.body || '', {
                wordwrap: false,
                selectors: [
                    { selector: 'img', format: 'skip' },
                    { selector: 'a', options: { ignoreHref: true } }
                ]
            }).trim();

            return res.json({
                title: page.title,
                body
            });
        } catch (err: any) {
            return res.status(500).json({ error: err.message });
        }
    });

    // =====================================================
    // PDF Parsing
    // =====================================================

    /**
     * POST /api/quiz-bank/parse-pdf
     * Extract text from uploaded PDF file (server-side).
     */
    router.post('/parse-pdf', async (req: any, res: any) => {
        try {
            const ctx = getLtiContext(res);
            if (!ctx) {
                return res
                    .status(401)
                    .json({ error: 'Không có quyền truy cập' });
            }

            const file = req.files?.pdf;
            if (!file) {
                return res
                    .status(400)
                    .json({ error: 'Vui lòng upload file PDF' });
            }

            // Max 10MB
            if (file.size > 10 * 1024 * 1024) {
                return res
                    .status(400)
                    .json({ error: 'File PDF quá lớn (tối đa 10MB)' });
            }

            const parser = new PDFParse({ data: file.data });
            const result = await parser.getText();
            await parser.destroy();
            const text = (result.text || '').substring(0, 50000);

            return res.json({ text });
        } catch (err: any) {
            return res.status(500).json({
                error: 'Không thể đọc file PDF: ' + err.message
            });
        }
    });

    // =====================================================
    // AI Question Generation
    // =====================================================

    /**
     * POST /api/quiz-bank/banks/:bankId/ai-generate
     * Generate questions preview using Gemini API (not saved yet).
     */
    router.post('/banks/:bankId/ai-generate', async (req: any, res: any) => {
        try {
            const ctx = getLtiContext(res);
            if (!ctx) {
                return res
                    .status(401)
                    .json({ error: 'Không có quyền truy cập' });
            }

            const bank = await verifyBankOwnership(
                req.params.bankId,
                ctx.courseId
            );
            if (!bank) {
                return res
                    .status(404)
                    .json({ error: 'Không tìm thấy ngân hàng' });
            }

            const geminiKey = process.env.GEMINI_API_KEY;
            if (!geminiKey) {
                return res.status(500).json({
                    error: 'GEMINI_API_KEY chưa được cấu hình trên server'
                });
            }

            const {
                text,
                notes,
                pdfText,
                numQuestions,
                questionType,
                difficulty,
                skipCache
            } = req.body;
            if (!text && !pdfText) {
                return res.status(400).json({
                    error: 'Vui lòng nhập nội dung hoặc upload PDF'
                });
            }

            const aiReq = {
                text: text || '',
                notes,
                pdfText,
                numQuestions: Math.min(parseInt(numQuestions) || 5, 20),
                questionType: questionType || 'MultiChoice',
                difficulty: difficulty || 'medium',
                skipCache: !!skipCache
            };

            // Build prompt hash for cache lookup
            const chunks = chunkContent(aiReq.text, aiReq.pdfText);
            const prompt = buildPrompt(chunks, aiReq as any);
            const promptHash = computePromptHash(prompt);

            // Check cache (unless skipCache)
            if (!skipCache) {
                try {
                    const cached = await GenerationCache.findOne({
                        promptHash
                    });
                    if (cached) {
                        console.log('AI cache hit');
                        return res.json({
                            questions: cached.questions,
                            cached: true
                        });
                    }
                } catch (_e) {
                    // Cache lookup failed — proceed without cache
                }
            }

            // Cache miss — generate
            const result = await generateQuestions(geminiKey, aiReq as any);

            // Save to cache
            try {
                await GenerationCache.findOneAndUpdate(
                    { promptHash: result.promptHash },
                    {
                        promptHash: result.promptHash,
                        questions: result.questions
                    },
                    { upsert: true }
                );
            } catch (_e) {
                console.log('AI cache write failed:', (_e as Error).message);
            }

            return res.json({
                questions: result.questions,
                cached: false
            });
        } catch (err: any) {
            return res.status(500).json({ error: err.message });
        }
    });

    /**
     * POST /api/quiz-bank/banks/:bankId/ai-import
     * Import AI-generated questions into the bank as H5P content.
     */
    router.post('/banks/:bankId/ai-import', async (req: any, res: any) => {
        try {
            const ctx = getLtiContext(res);
            if (!ctx) {
                return res
                    .status(401)
                    .json({ error: 'Không có quyền truy cập' });
            }

            const bank = await verifyBankOwnership(
                req.params.bankId,
                ctx.courseId
            );
            if (!bank) {
                return res
                    .status(404)
                    .json({ error: 'Không tìm thấy ngân hàng' });
            }

            const {
                questions,
                questionType,
                difficulty
            }: {
                questions: GeneratedQuestion[];
                questionType: string;
                difficulty: string;
            } = req.body;

            if (
                !questions ||
                !Array.isArray(questions) ||
                questions.length === 0
            ) {
                return res
                    .status(400)
                    .json({ error: 'Không có câu hỏi để import' });
            }

            const fs = await import('fs');
            const path = await import('path');
            const contentDir = path.join(__dirname, '../../h5p/content');
            const imported: any[] = [];
            const skippedTitles: string[] = [];

            for (const q of questions) {
                // Dedup: check content hash
                const hash = computeQuestionHash(q.questionText, q.answers);
                const existing = await BankQuestion.findOne({
                    bankId: bank._id,
                    contentHash: hash
                });
                if (existing) {
                    skippedTitles.push(q.title);
                    continue;
                }

                // Build H5P content based on question type
                let contentJson: any;
                let library: string;

                if (questionType === 'TrueFalse') {
                    library = 'H5P.TrueFalse 1.8';
                    const correctAnswer = q.answers.find((a) => a.correct);
                    contentJson = {
                        question: `<p>${q.questionText}</p>`,
                        correct:
                            correctAnswer?.text === 'Đúng' ? 'true' : 'false',
                        l10n: {
                            trueText: 'Đúng',
                            falseText: 'Sai',
                            score: 'Bạn đạt @score / @total điểm',
                            checkAnswer: 'Kiểm tra',
                            submitAnswer: 'Nộp',
                            showSolutionButton: 'Xem đáp án',
                            tryAgain: 'Thử lại',
                            wrongAnswerMessage: 'Sai rồi',
                            correctAnswerMessage: 'Đúng rồi'
                        },
                        behaviour: {
                            enableRetry: false,
                            enableSolutionsButton: false,
                            confirmCheckDialog: false
                        }
                    };
                } else if (questionType === 'Blanks') {
                    library = 'H5P.Blanks 1.14';
                    // questionText contains *answer* markers
                    // H5P.Blanks format: questions is array of strings, each with *answer*
                    const blankText = q.questionText || '';
                    contentJson = {
                        text: '<p>Điền vào chỗ trống:</p>',
                        questions: [blankText],
                        behaviour: {
                            enableRetry: false,
                            enableSolutionsButton: false,
                            caseSensitive: false,
                            autoCheck: false
                        },
                        showSolutions: 'Xem đáp án',
                        tryAgain: 'Thử lại',
                        checkAnswer: 'Kiểm tra',
                        notFilledOut: 'Vui lòng điền tất cả chỗ trống',
                        answerIsCorrect: 'Đúng',
                        answerIsWrong: 'Sai'
                    };
                } else {
                    // MultiChoice (default)
                    library = 'H5P.MultiChoice 1.16';
                    contentJson = {
                        question: `<p>${q.questionText}</p>`,
                        answers: q.answers.map((a) => ({
                            text: `<div>${a.text}</div>`,
                            correct: a.correct,
                            tpiMs: {
                                chosenFeedback: a.correct
                                    ? '<div>Đúng!</div>'
                                    : '<div>Sai!</div>',
                                notChosenFeedback: ''
                            }
                        })),
                        overallFeedback: [],
                        behaviour: {
                            enableRetry: false,
                            enableSolutionsButton: false,
                            singlePoint: true,
                            type: 'auto',
                            confirmCheckDialog: false,
                            autoCheck: false,
                            passPercentage: 0,
                            showSolutionsRequiresInput: true
                        },
                        UI: {
                            checkAnswerButton: 'Kiểm tra',
                            submitAnswerButton: 'Nộp',
                            showSolutionButton: 'Xem đáp án',
                            tryAgainButton: 'Thử lại',
                            tipsLabel: 'Gợi ý',
                            scoreBarLabel: 'Bạn đạt :num / :total điểm',
                            tipAvailable: 'Có gợi ý',
                            feedbackAvailable: 'Có phản hồi',
                            readFeedback: 'Đọc phản hồi',
                            wrongAnswer: 'Sai',
                            correctAnswer: 'Đúng',
                            shouldCheck: 'Nên chọn',
                            shouldNotCheck: 'Không nên chọn',
                            noInput: 'Vui lòng chọn đáp án',
                            a11yCheck: 'Kiểm tra đáp án. Phản hồi sẽ hiện.',
                            a11yShowSolution: 'Xem đáp án đúng.',
                            a11yRetry: 'Thử lại bài này.'
                        }
                    };
                }

                // Write H5P content to filesystem
                const contentId = `ai-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
                const newDir = path.join(contentDir, contentId);
                fs.mkdirSync(newDir, { recursive: true });

                fs.writeFileSync(
                    path.join(newDir, 'content.json'),
                    JSON.stringify(contentJson)
                );

                const machineName = library.split(' ')[0];
                const [major, minor] = library
                    .split(' ')[1]
                    .split('.')
                    .map(Number);
                const h5pJson = {
                    mainLibrary: machineName,
                    title: q.title,
                    language: 'vi',
                    license: 'U',
                    embedTypes: ['iframe'] as ('iframe' | 'div')[],
                    preloadedDependencies: [
                        {
                            machineName,
                            majorVersion: major,
                            minorVersion: minor
                        }
                    ]
                };
                fs.writeFileSync(
                    path.join(newDir, 'h5p.json'),
                    JSON.stringify(h5pJson)
                );

                // Save to bank
                const typeName = LIBRARY_TO_TYPE[machineName] || questionType;
                const bankQuestion = await BankQuestion.create({
                    bankId: bank._id,
                    h5pContentId: contentId,
                    contentSnapshot: {
                        params: contentJson,
                        metadata: h5pJson,
                        library
                    },
                    questionType: typeName,
                    title: q.title,
                    tags: [],
                    difficulty: difficulty || 'medium',
                    points: 1,
                    contentHash: hash,
                    sourceDocument: (q.source || '')
                        .replace(/^\[Nguồn:\s*/, '')
                        .replace(/\]$/, ''),
                    contentFiles: [],
                    createdBy: ctx.userId
                });

                imported.push(bankQuestion);
            }

            return res.json({
                imported: imported.length,
                skipped: skippedTitles.length,
                skippedTitles,
                questions: imported
            });
        } catch (err: any) {
            return res.status(500).json({ error: err.message });
        }
    });

    // =====================================================
    // AI Interactive Video Generation
    // =====================================================

    /**
     * POST /api/quiz-bank/banks/:bankId/ai-video
     * Generate Interactive Video with questions from YouTube transcript.
     */
    router.post('/banks/:bankId/ai-video', async (req: any, res: any) => {
        try {
            const ctx = getLtiContext(res);
            if (!ctx) {
                return res.status(401).json({ error: 'Không có quyền' });
            }
            const bank = await verifyBankOwnership(
                req.params.bankId,
                ctx.courseId
            );
            if (!bank) {
                return res
                    .status(404)
                    .json({ error: 'Không tìm thấy ngân hàng' });
            }

            const geminiKey = process.env.GEMINI_API_KEY;
            if (!geminiKey) {
                return res.status(500).json({
                    error: 'GEMINI_API_KEY chưa cấu hình'
                });
            }

            const { youtubeUrl, numQuestions, questionType, manualText } =
                req.body;
            if (!youtubeUrl) {
                return res.status(400).json({
                    error: 'Vui lòng nhập YouTube URL'
                });
            }

            // 1. Fetch YouTube transcript (fallback to manual text)
            let transcript: Array<{
                text: string;
                offset: number;
                duration: number;
            }> = [];
            try {
                // Force real ESM import (tsc compiles await import() to require() in CJS mode)
                const ytMod = await (new Function(
                    'return import("youtube-transcript")'
                )() as Promise<any>);
                const YoutubeTranscript = ytMod.YoutubeTranscript;
                transcript =
                    await YoutubeTranscript.fetchTranscript(youtubeUrl);
            } catch (_e) {
                // Fallback 1: Whisper transcription via Groq
                const groqKey = process.env.GROQ_API_KEY;
                if (groqKey) {
                    try {
                        console.log(
                            'YouTube transcript failed, trying Whisper...'
                        );
                        const { execSync } = await import('child_process');
                        const os = await import('os');
                        const tmpPath = `${os.tmpdir()}/yt-audio-${Date.now()}.mp3`;

                        // Clean YouTube URL (remove &t=, &list= etc)
                        const cleanUrl = youtubeUrl.split('&')[0].split('#')[0];

                        // Download audio only
                        execSync(
                            `yt-dlp -x --audio-format mp3 --audio-quality 9 -o "${tmpPath}" "${cleanUrl}"`,
                            {
                                timeout: 120000,
                                stdio: 'pipe'
                            }
                        );

                        // Send to Groq Whisper via curl (native fetch doesn't support form-data streams)
                        const whisperResult = execSync(
                            `curl -s -X POST 'https://api.groq.com/openai/v1/audio/transcriptions' ` +
                                `-H 'Authorization: Bearer ${groqKey}' ` +
                                `-F 'file=@${tmpPath}' ` +
                                `-F 'model=whisper-large-v3' ` +
                                `-F 'response_format=verbose_json' ` +
                                `-F 'timestamp_granularities[]=segment'`,
                            {
                                timeout: 180000,
                                encoding: 'utf-8'
                            }
                        );

                        const whisperResp = {
                            ok: true,
                            json: async () => JSON.parse(whisperResult)
                        };

                        // Cleanup
                        try {
                            const fsClean = await import('fs');
                            fsClean.unlinkSync(tmpPath);
                        } catch (_) {
                            // Best effort cleanup
                        }

                        if (whisperResp.ok) {
                            const whisperData = await whisperResp.json();
                            if (whisperData.segments) {
                                transcript = whisperData.segments.map(
                                    (s: any) => ({
                                        text: s.text,
                                        offset: Math.floor(s.start),
                                        duration: Math.floor(s.end - s.start)
                                    })
                                );
                                console.log(
                                    'Whisper transcribed:',
                                    transcript.length,
                                    'segments'
                                );
                            }
                        }
                    } catch (whisperErr) {
                        console.log(
                            'Whisper failed:',
                            (whisperErr as Error).message
                        );
                    }
                }

                // If still no transcript after Whisper
                if (transcript.length === 0) {
                    return res.status(400).json({
                        error: 'Không thể lấy nội dung từ video. Vui lòng thử video khác hoặc video có phụ đề.'
                    });
                }
            }

            // 2. Format transcript with timestamps
            const transcriptText = transcript
                .map(
                    (t) =>
                        `[${Math.floor(t.offset / 60)}:${String(Math.floor(t.offset % 60)).padStart(2, '0')}] ${t.text}`
                )
                .join('\n')
                .substring(0, 30000);

            const videoDuration =
                transcript.length > 0
                    ? Math.ceil(
                          (transcript[transcript.length - 1].offset +
                              transcript[transcript.length - 1].duration) /
                              1000
                      )
                    : 300;

            // 3. Call Gemini
            const num = Math.min(parseInt(numQuestions) || 8, 20);
            const prompt = `Bạn là giáo viên đại học Việt Nam. Từ transcript video sau, hãy tạo ${num} câu hỏi tương tác đa dạng tại các mốc thời gian phù hợp.

---
${transcriptText}
---

Yêu cầu:
- Câu hỏi bằng tiếng Việt
${questionType && questionType !== 'mixed' ? `- Tất cả câu hỏi phải là loại: ${questionType === 'MultiChoice' ? 'MultiChoice (4 đáp án, 1 đúng)' : questionType === 'TrueFalse' ? 'TrueFalse (Đúng/Sai)' : 'Blanks — QUAN TRỌNG: dùng *đáp án* (bọc trong dấu sao), KHÔNG dùng gạch dưới. VD: "Hội nghị *Dartmouth* năm *1956*"'}` : '- Đa dạng loại: MultiChoice (4 đáp án, 1 đúng), TrueFalse (Đúng/Sai), Blanks — QUAN TRỌNG: dùng *đáp án* (bọc trong dấu sao), VD: "Tỷ lệ thành công là *90*%"'}
- Mỗi câu có timestamp (giây) dựa trên nội dung transcript tại thời điểm đó
- Timestamp phải nằm trong khoảng 0-${videoDuration}
- Câu hỏi cách nhau ít nhất 20 giây
${manualText?.trim() ? `\nGhi chú từ giảng viên: ${manualText.trim()}` : ''}

Trả về JSON array:
[
  {
    "timestamp": 45,
    "type": "MultiChoice",
    "title": "tiêu đề ngắn",
    "questionText": "nội dung câu hỏi",
    "answers": [{"text": "đáp án", "correct": true/false}],
    "explanation": "giải thích"
  },
  {
    "timestamp": 90,
    "type": "Blanks",
    "title": "tiêu đề ngắn",
    "questionText": "Bác sĩ An có tỷ lệ thành công là *90*% trên tổng *1000* ca.",
    "answers": [],
    "explanation": "giải thích"
  }
]

QUAN TRỌNG: Với Blanks, PHẢI dùng *đáp án* (bọc sao), KHÔNG dùng ______ hay chỗ trống.
CHỈ trả về JSON array.`;

            const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${geminiKey}`;
            const geminiResp = await fetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: {
                        temperature: 0.7,
                        maxOutputTokens: 8192
                    }
                })
            });

            if (!geminiResp.ok) {
                return res.status(500).json({
                    error: 'Gemini API lỗi'
                });
            }

            const geminiData = await geminiResp.json();
            const rawText =
                geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '';
            const jsonMatch = rawText.match(/\[[\s\S]*\]/);
            if (!jsonMatch) {
                return res.status(500).json({
                    error: 'AI không trả về JSON hợp lệ'
                });
            }

            const questions = JSON.parse(jsonMatch[0])
                .filter(
                    (q: any) =>
                        q.timestamp !== undefined && q.title && q.questionText
                )
                .map((q: any) => {
                    // Fix Blanks: if AI used ______ instead of *answer*, log warning
                    if (
                        q.type === 'Blanks' &&
                        q.questionText.includes('______') &&
                        !q.questionText.includes('*')
                    ) {
                        console.warn(
                            'AI generated Blanks with ______ instead of *answer* format:',
                            q.questionText.substring(0, 80)
                        );
                    }
                    return q;
                });

            return res.json({
                questions,
                videoDuration,
                transcriptLength: transcript.length
            });
        } catch (err: any) {
            return res.status(500).json({ error: err.message });
        }
    });

    /**
     * POST /api/quiz-bank/banks/:bankId/ai-video-import
     * Build H5P InteractiveVideo from AI questions and save to bank.
     */
    router.post(
        '/banks/:bankId/ai-video-import',
        async (req: any, res: any) => {
            try {
                const ctx = getLtiContext(res);
                if (!ctx) {
                    return res.status(401).json({ error: 'Không có quyền' });
                }
                const bank = await verifyBankOwnership(
                    req.params.bankId,
                    ctx.courseId
                );
                if (!bank) {
                    return res
                        .status(404)
                        .json({ error: 'Không tìm thấy ngân hàng' });
                }

                const { youtubeUrl, videoTitle, questions } = req.body;
                if (!youtubeUrl || !questions?.length) {
                    return res.status(400).json({
                        error: 'Thiếu dữ liệu'
                    });
                }

                // Build H5P InteractiveVideo content
                const interactions = questions.map((q: any) => {
                    let actionLib: string;
                    let actionParams: any;

                    if (q.type === 'TrueFalse') {
                        actionLib = 'H5P.TrueFalse 1.8';
                        const correct = q.answers?.find((a: any) => a.correct);
                        actionParams = {
                            question: `<p>${q.questionText}</p>`,
                            correct:
                                correct?.text === 'Đúng' ? 'true' : 'false',
                            l10n: {
                                trueText: 'Đúng',
                                falseText: 'Sai'
                            },
                            behaviour: {
                                enableRetry: false,
                                enableSolutionsButton: false
                            }
                        };
                    } else if (q.type === 'Blanks') {
                        actionLib = 'H5P.Blanks 1.14';
                        actionParams = {
                            text: '<p>Điền vào chỗ trống:</p>',
                            questions: [q.questionText],
                            behaviour: {
                                enableRetry: false,
                                enableSolutionsButton: false
                            }
                        };
                    } else {
                        // MultiChoice default
                        actionLib = 'H5P.MultiChoice 1.16';
                        // Shuffle answers
                        const shuffled = [...(q.answers || [])].sort(
                            () => Math.random() - 0.5
                        );
                        actionParams = {
                            question: `<p>${q.questionText}</p>`,
                            answers: shuffled.map((a: any) => ({
                                text: `<div>${a.text}</div>`,
                                correct: a.correct,
                                tpiMs: {
                                    chosenFeedback: a.correct
                                        ? '<div>Đúng!</div>'
                                        : '<div>Sai!</div>',
                                    notChosenFeedback: ''
                                }
                            })),
                            overallFeedback: [],
                            behaviour: {
                                enableRetry: false,
                                enableSolutionsButton: false,
                                singlePoint: true,
                                type: 'auto'
                            }
                        };
                    }

                    return {
                        x: 0,
                        y: 0,
                        width: 100,
                        height: 100,
                        duration: {
                            from: q.timestamp,
                            to: q.timestamp + 15
                        },
                        pause: true,
                        displayType: 'poster',
                        buttonOnMobile: true,
                        label: q.title,
                        action: {
                            library: actionLib,
                            params: actionParams,
                            subContentId: crypto.randomUUID
                                ? crypto.randomUUID()
                                : `${Date.now()}-${Math.random().toString(36).substr(2, 8)}`
                        }
                    };
                });

                const contentJson = {
                    interactiveVideo: {
                        video: {
                            files: [
                                {
                                    path: youtubeUrl,
                                    mime: 'video/YouTube',
                                    copyright: {
                                        license: 'U'
                                    }
                                }
                            ],
                            startScreenOptions: {
                                title: videoTitle || 'Video tương tác',
                                hideStartTitle: false
                            },
                            textTracks: { videoTrack: [] }
                        },
                        assets: { interactions }
                    },
                    override: {
                        showSolutionButton: 'off',
                        retryButton: 'off',
                        preventSkippingMode: 'both',
                        deactivateSound: false
                    }
                };

                const library = 'H5P.InteractiveVideo 1.28';

                // Use H5P ContentManager to create content properly
                const h5pMetadata = {
                    mainLibrary: 'H5P.InteractiveVideo',
                    title: videoTitle || 'Video tương tác',
                    language: 'vi',
                    license: 'U',
                    embedTypes: ['iframe' as 'iframe' | 'div'],
                    preloadedDependencies: [
                        {
                            machineName: 'H5P.InteractiveVideo',
                            majorVersion: 1,
                            minorVersion: 28
                        },
                        {
                            machineName: 'H5P.Video',
                            majorVersion: 1,
                            minorVersion: 6
                        },
                        {
                            machineName: 'H5P.MultiChoice',
                            majorVersion: 1,
                            minorVersion: 16
                        },
                        {
                            machineName: 'H5P.TrueFalse',
                            majorVersion: 1,
                            minorVersion: 8
                        },
                        {
                            machineName: 'H5P.Blanks',
                            majorVersion: 1,
                            minorVersion: 14
                        },
                        {
                            machineName: 'H5P.SingleChoiceSet',
                            majorVersion: 1,
                            minorVersion: 11
                        },
                        {
                            machineName: 'H5P.DragQuestion',
                            majorVersion: 1,
                            minorVersion: 15
                        },
                        {
                            machineName: 'H5P.DragText',
                            majorVersion: 1,
                            minorVersion: 10
                        },
                        {
                            machineName: 'H5P.MarkTheWords',
                            majorVersion: 1,
                            minorVersion: 11
                        },
                        {
                            machineName: 'H5P.Summary',
                            majorVersion: 1,
                            minorVersion: 10
                        },
                        {
                            machineName: 'H5P.DragNBar',
                            majorVersion: 1,
                            minorVersion: 5
                        },
                        {
                            machineName: 'H5P.JoubelUI',
                            majorVersion: 1,
                            minorVersion: 3
                        },
                        {
                            machineName: 'FontAwesome',
                            majorVersion: 4,
                            minorVersion: 5
                        },
                        {
                            machineName: 'jQuery.ui',
                            majorVersion: 1,
                            minorVersion: 10
                        }
                    ]
                };

                const contentUser = {
                    id: ctx.userId,
                    name: ctx.userName || 'LTI User',
                    email: 'lti@example.com',
                    type: 'local' as const
                };

                // Create content via H5P ContentManager
                const contentId =
                    await h5pEditor.saveOrUpdateContentReturnMetaData(
                        undefined,
                        contentJson,
                        h5pMetadata as any,
                        'H5P.InteractiveVideo 1.28',
                        contentUser as any
                    );
                const savedContentId = String(contentId.id);

                // Save to bank
                const bankQuestion = await BankQuestion.create({
                    bankId: bank._id,
                    h5pContentId: savedContentId,
                    contentSnapshot: {
                        params: contentJson,
                        metadata: h5pMetadata,
                        library
                    },
                    questionType: 'InteractiveVideo',
                    title: videoTitle || 'Video tương tác',
                    tags: [],
                    difficulty: 'medium',
                    points: questions.length,
                    contentFiles: [],
                    contentHash: '',
                    sourceDocument: youtubeUrl,
                    createdBy: ctx.userId
                });

                return res.json({
                    ok: true,
                    question: bankQuestion
                });
            } catch (err: any) {
                return res.status(500).json({ error: err.message });
            }
        }
    );

    return router;
}
