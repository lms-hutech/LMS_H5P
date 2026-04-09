/**
 * Express routes for Quiz CRUD + publish.
 * All routes require LTI auth + instructor role.
 */
import { Router } from 'express';
import * as H5P from '@lumieducation/h5p-server';

import { QuestionBank, BankQuestion, Quiz, QuizSession } from './schemas';
import type { IQuestionSnapshot } from './types';

function escapeHtml(str: string): string {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function sanitizeTags(tags: unknown): string[] {
    if (!Array.isArray(tags)) return [];
    return tags
        .filter((t) => typeof t === 'string')
        .map((t: string) => t.trim())
        .filter(Boolean);
}

function getLtiContext(res: any): {
    courseId: string;
    userId: string;
} | null {
    const token = res.locals?.token;
    if (!token) return null;
    const courseId =
        token.platformContext?.context?.id ||
        token.platformContext?.custom?.canvas_course_id ||
        '';
    const userId = token.user || '';
    if (!courseId || !userId) return null;
    return { courseId, userId };
}

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

export default function quizRoutes(h5pEditor: H5P.H5PEditor): Router {
    const router = Router();
    router.use(requireInstructor);

    /**
     * GET /api/quiz/list
     * List quizzes for current course.
     */
    router.get('/list', async (_req: any, res: any) => {
        try {
            const ctx = getLtiContext(res);
            if (!ctx) {
                return res
                    .status(401)
                    .json({ error: 'Không có thông tin khóa học' });
            }

            const quizzes = await Quiz.find({ courseId: ctx.courseId })
                .sort({ updatedAt: -1 })
                .select('-questionSnapshots');

            const result = quizzes.map((q) => ({
                _id: q._id,
                name: q.name,
                description: q.description,
                status: q.status,
                questionGroups: q.questionGroups,
                settings: q.settings,
                snapshotCount: q.questionSnapshots?.length || 0,
                createdAt: q.createdAt,
                updatedAt: q.updatedAt
            }));

            return res.json(result);
        } catch (err: any) {
            return res.status(500).json({ error: err.message });
        }
    });

    /**
     * POST /api/quiz/create
     * Create a new quiz (draft).
     */
    router.post('/create', async (req: any, res: any) => {
        try {
            const ctx = getLtiContext(res);
            if (!ctx) {
                return res
                    .status(401)
                    .json({ error: 'Không có thông tin khóa học' });
            }

            const { name, description, questionGroups, settings } = req.body;
            if (!name || typeof name !== 'string' || !name.trim()) {
                return res
                    .status(400)
                    .json({ error: 'Tên bài kiểm tra không được để trống' });
            }

            if (
                !questionGroups ||
                !Array.isArray(questionGroups) ||
                questionGroups.length === 0
            ) {
                return res
                    .status(400)
                    .json({ error: 'Cần ít nhất 1 nhóm câu hỏi' });
            }

            // Validate each group: bankId must exist and belong to course
            for (const group of questionGroups) {
                if (!group.bankId || !group.pickCount || group.pickCount < 1) {
                    return res.status(400).json({
                        error: 'Mỗi nhóm cần bankId và pickCount > 0'
                    });
                }
                const bank = await QuestionBank.findOne({
                    _id: group.bankId,
                    courseId: ctx.courseId
                });
                if (!bank) {
                    return res.status(400).json({
                        error: `Ngân hàng ${escapeHtml(group.bankId)} không tồn tại trong khóa học`
                    });
                }
            }

            const quiz = await Quiz.create({
                courseId: ctx.courseId,
                name: name.trim(),
                description:
                    typeof description === 'string' ? description.trim() : '',
                questionGroups: questionGroups.map((g: any) => ({
                    bankId: g.bankId,
                    pickCount: parseInt(g.pickCount) || 1,
                    pointsPerQuestion: parseFloat(g.pointsPerQuestion) || 1,
                    filterTags: sanitizeTags(g.filterTags),
                    filterDifficulty: Array.isArray(g.filterDifficulty)
                        ? g.filterDifficulty
                        : [],
                    filterTypes: Array.isArray(g.filterTypes)
                        ? g.filterTypes
                        : []
                })),
                settings: {
                    shuffleQuestions: settings?.shuffleQuestions !== false,
                    showProgressBar: settings?.showProgressBar !== false,
                    showInstantFeedback: settings?.showInstantFeedback === true,
                    passPercentage: parseInt(settings?.passPercentage) || 0,
                    allowedAttempts: parseInt(settings?.allowedAttempts) || -1
                },
                status: 'draft',
                createdBy: ctx.userId
            });

            return res.status(201).json(quiz);
        } catch (err: any) {
            return res.status(500).json({ error: err.message });
        }
    });

    /**
     * PUT /api/quiz/update/:quizId
     * Update quiz config (draft only).
     */
    router.put('/update/:quizId', async (req: any, res: any) => {
        try {
            const ctx = getLtiContext(res);
            if (!ctx) {
                return res
                    .status(401)
                    .json({ error: 'Không có quyền truy cập' });
            }

            const quiz = await Quiz.findOne({
                _id: req.params.quizId,
                courseId: ctx.courseId
            });
            if (!quiz) {
                return res
                    .status(404)
                    .json({ error: 'Không tìm thấy bài kiểm tra' });
            }
            if (quiz.status === 'published') {
                return res.status(400).json({
                    error: 'Không thể sửa bài kiểm tra đã xuất bản. Hãy tạo mới.'
                });
            }

            const updates: any = {};
            if (req.body.name) updates.name = req.body.name.trim();
            if (req.body.description !== undefined)
                updates.description =
                    typeof req.body.description === 'string'
                        ? req.body.description.trim()
                        : '';
            if (
                req.body.questionGroups &&
                Array.isArray(req.body.questionGroups)
            ) {
                // Validate each group's bankId belongs to this course
                for (const group of req.body.questionGroups) {
                    if (!group.bankId) continue;
                    const bank = await QuestionBank.findOne({
                        _id: group.bankId,
                        courseId: ctx.courseId
                    });
                    if (!bank) {
                        return res.status(400).json({
                            error: 'Ngân hàng câu hỏi không thuộc khóa học này'
                        });
                    }
                }
                updates.questionGroups = req.body.questionGroups.map(
                    (g: any) => ({
                        bankId: g.bankId,
                        pickCount: parseInt(g.pickCount) || 1,
                        pointsPerQuestion: parseFloat(g.pointsPerQuestion) || 1,
                        filterTags: sanitizeTags(g.filterTags),
                        filterDifficulty: Array.isArray(g.filterDifficulty)
                            ? g.filterDifficulty
                            : [],
                        filterTypes: Array.isArray(g.filterTypes)
                            ? g.filterTypes
                            : []
                    })
                );
            }
            if (req.body.settings) {
                updates.settings = {
                    shuffleQuestions:
                        req.body.settings.shuffleQuestions !== false,
                    showProgressBar:
                        req.body.settings.showProgressBar !== false,
                    showInstantFeedback:
                        req.body.settings.showInstantFeedback === true,
                    passPercentage:
                        parseInt(req.body.settings.passPercentage) || 0,
                    allowedAttempts:
                        parseInt(req.body.settings.allowedAttempts) || -1
                };
            }

            const updated = await Quiz.findByIdAndUpdate(
                quiz._id,
                { $set: updates },
                { new: true }
            ).select('-questionSnapshots');

            return res.json(updated);
        } catch (err: any) {
            return res.status(500).json({ error: err.message });
        }
    });

    /**
     * POST /api/quiz/publish/:quizId
     * Publish: snapshot all questions from banks, freeze config.
     */
    router.post('/publish/:quizId', async (req: any, res: any) => {
        try {
            const ctx = getLtiContext(res);
            if (!ctx) {
                return res
                    .status(401)
                    .json({ error: 'Không có quyền truy cập' });
            }

            const quiz = await Quiz.findOne({
                _id: req.params.quizId,
                courseId: ctx.courseId
            });
            if (!quiz) {
                return res
                    .status(404)
                    .json({ error: 'Không tìm thấy bài kiểm tra' });
            }
            if (quiz.status === 'published') {
                return res.status(400).json({
                    error: 'Bài kiểm tra đã xuất bản. Không thể xuất bản lại.'
                });
            }

            // Snapshot all questions from each group's bank
            const snapshots: IQuestionSnapshot[] = [];

            for (let gi = 0; gi < quiz.questionGroups.length; gi++) {
                const group = quiz.questionGroups[gi];
                const filter: any = { bankId: group.bankId };

                if (group.filterTags?.length) {
                    filter.tags = { $in: group.filterTags };
                }
                if (group.filterDifficulty?.length) {
                    filter.difficulty = { $in: group.filterDifficulty };
                }
                if (group.filterTypes?.length) {
                    filter.questionType = { $in: group.filterTypes };
                }

                const questions = await BankQuestion.find(filter);

                for (const q of questions) {
                    snapshots.push({
                        questionId: q._id,
                        groupIndex: gi,
                        params: q.contentSnapshot.params,
                        metadata: q.contentSnapshot.metadata,
                        library: q.contentSnapshot.library,
                        contentFiles: q.contentFiles,
                        sourceH5pContentId: q.h5pContentId
                    } as any);
                }
            }

            if (snapshots.length === 0) {
                return res.status(400).json({
                    error: 'Không có câu hỏi nào trong các ngân hàng đã chọn'
                });
            }

            // Check each group has enough questions for pickCount
            for (let gi = 0; gi < quiz.questionGroups.length; gi++) {
                const group = quiz.questionGroups[gi];
                const available = snapshots.filter(
                    (s) => s.groupIndex === gi
                ).length;
                if (available < group.pickCount) {
                    return res.status(400).json({
                        error: `Nhóm ${gi + 1} cần ${group.pickCount} câu nhưng chỉ có ${available} câu khả dụng`
                    });
                }
            }

            // Auto-calculate points: 10 / total questions
            const totalPick = quiz.questionGroups.reduce(
                (s: number, g: any) => s + (g.pickCount || 0),
                0
            );
            if (totalPick > 0) {
                const pointsPerQuestion =
                    Math.round((10 / totalPick) * 100) / 100;
                for (const group of quiz.questionGroups) {
                    (group as any).pointsPerQuestion = pointsPerQuestion;
                }
            }

            quiz.questionSnapshots = snapshots as any;
            quiz.status = 'published';
            await quiz.save();

            // ── Canvas integration on publish ──
            const { canvasModuleId, canvasCourseId } = req.body;
            const canvasUrl = process.env.PLATFORM_URL;
            const canvasToken = process.env.CANVAS_API_TOKEN;
            const h5pPublicUrl = process.env.H5P_PUBLIC_URL || canvasUrl;
            let gradedAssignmentCreated = false;
            let canvasItemCreated = false;
            let practiceCreated = false;

            if (canvasCourseId && canvasUrl && canvasToken) {
                const headers = {
                    Authorization: `Bearer ${canvasToken}`,
                    'Content-Type': 'application/json'
                };

                // 0. Hide Assignments tab (students only see Modules)
                try {
                    await fetch(
                        `${canvasUrl}/api/v1/courses/${canvasCourseId}/tabs/assignments`,
                        {
                            method: 'PUT',
                            headers,
                            body: JSON.stringify({
                                hidden: true
                            })
                        }
                    );
                } catch (_e) {
                    // Best effort
                }

                // 1. Find assignment group matching module name
                let assignmentGroupId: number | null = null;
                if (canvasModuleId) {
                    try {
                        const modResp = await fetch(
                            `${canvasUrl}/api/v1/courses/${canvasCourseId}/modules/${canvasModuleId}`,
                            { headers }
                        );
                        if (modResp.ok) {
                            const mod = await modResp.json();
                            const groupsResp = await fetch(
                                `${canvasUrl}/api/v1/courses/${canvasCourseId}/assignment_groups?per_page=50`,
                                { headers }
                            );
                            if (groupsResp.ok) {
                                const groups = await groupsResp.json();
                                const match = groups.find(
                                    (g: any) => g.name === mod.name
                                );
                                if (match) {
                                    assignmentGroupId = match.id;
                                }
                            }
                        }
                    } catch (_e) {
                        console.log(
                            'Assignment group lookup error:',
                            (_e as Error).message
                        );
                    }
                }

                // 2. Create graded assignment (10 points)
                const launchUrl = `${h5pPublicUrl}/lti/launch?quizId=${quiz._id}`;
                try {
                    const assignResp = await fetch(
                        `${canvasUrl}/api/v1/courses/${canvasCourseId}/assignments`,
                        {
                            method: 'POST',
                            headers,
                            body: JSON.stringify({
                                assignment: {
                                    name: quiz.name,
                                    submission_types: ['external_tool'],
                                    external_tool_tag_attributes: {
                                        url: launchUrl,
                                        new_tab: false
                                    },
                                    points_possible: 10,
                                    grading_type: 'points',
                                    published: true,
                                    ...(assignmentGroupId
                                        ? {
                                              assignment_group_id:
                                                  assignmentGroupId
                                          }
                                        : {})
                                }
                            })
                        }
                    );
                    if (assignResp.ok) {
                        const assignData = await assignResp.json();
                        quiz.canvasAssignmentId = String(assignData.id);
                        (quiz as any).canvasCourseId = String(canvasCourseId);
                        await quiz.save();
                        gradedAssignmentCreated = true;
                        console.log(
                            'Graded assignment created:',
                            assignData.id
                        );

                        // 3. Create module item (type Assignment)
                        if (canvasModuleId) {
                            try {
                                const itemResp = await fetch(
                                    `${canvasUrl}/api/v1/courses/${canvasCourseId}/modules/${canvasModuleId}/items`,
                                    {
                                        method: 'POST',
                                        headers,
                                        body: JSON.stringify({
                                            module_item: {
                                                title: quiz.name,
                                                type: 'Assignment',
                                                content_id: assignData.id
                                            }
                                        })
                                    }
                                );
                                canvasItemCreated = itemResp.ok;
                                if (!itemResp.ok) {
                                    console.log(
                                        'Module item failed:',
                                        itemResp.status
                                    );
                                }
                            } catch (_e) {
                                console.log(
                                    'Module item error:',
                                    (_e as Error).message
                                );
                            }
                        }
                    } else {
                        console.log(
                            'Graded assignment failed:',
                            assignResp.status,
                            await assignResp.text()
                        );
                    }
                } catch (_e) {
                    console.log(
                        'Graded assignment error:',
                        (_e as Error).message
                    );
                }

                // 4. Create practice module item (in Modules, not Assignments)
                if (canvasModuleId) {
                    const firstBankId = quiz.questionGroups[0]?.bankId || '';
                    const practiceUrl = `${h5pPublicUrl}/lti/launch?practice=1&bankId=${firstBankId}`;
                    try {
                        const practiceResp = await fetch(
                            `${canvasUrl}/api/v1/courses/${canvasCourseId}/modules/${canvasModuleId}/items`,
                            {
                                method: 'POST',
                                headers,
                                body: JSON.stringify({
                                    module_item: {
                                        title: `Luyện tập: ${quiz.name}`,
                                        type: 'ExternalTool',
                                        external_url: practiceUrl,
                                        new_tab: false
                                    }
                                })
                            }
                        );
                        practiceCreated = practiceResp.ok;
                    } catch (_e) {
                        console.log(
                            'Practice module item error:',
                            (_e as Error).message
                        );
                    }
                }
            }

            return res.json({
                ok: true,
                snapshotCount: snapshots.length,
                status: 'published',
                gradedAssignmentCreated,
                canvasItemCreated,
                practiceCreated
            });
        } catch (err: any) {
            return res.status(500).json({ error: err.message });
        }
    });

    /**
     * DELETE /api/quiz/delete/:quizId
     * Delete a quiz.
     */
    router.delete('/delete/:quizId', async (req: any, res: any) => {
        try {
            const ctx = getLtiContext(res);
            if (!ctx) {
                return res
                    .status(401)
                    .json({ error: 'Không có quyền truy cập' });
            }

            // Phase 1: Read quiz (don't delete yet)
            const quiz = await Quiz.findOne({
                _id: req.params.quizId,
                courseId: ctx.courseId
            });
            if (!quiz) {
                return res
                    .status(404)
                    .json({ error: 'Không tìm thấy bài kiểm tra' });
            }

            // Phase 2: Cleanup external resources (best-effort)

            // 2a. Delete Canvas assignment
            if (quiz.canvasAssignmentId) {
                const canvasUrl = process.env.PLATFORM_URL;
                const canvasToken = process.env.CANVAS_API_TOKEN;
                const canvasCourseId =
                    (quiz as any).canvasCourseId ||
                    req.query?.canvasCourseId ||
                    '';
                if (canvasUrl && canvasToken && canvasCourseId) {
                    try {
                        await fetch(
                            `${canvasUrl}/api/v1/courses/${canvasCourseId}/assignments/${quiz.canvasAssignmentId}`,
                            {
                                method: 'DELETE',
                                headers: {
                                    Authorization: `Bearer ${canvasToken}`
                                }
                            }
                        );
                        console.log(
                            'Deleted Canvas assignment:',
                            quiz.canvasAssignmentId
                        );
                    } catch (_e) {
                        console.warn(
                            'Failed to delete Canvas assignment:',
                            (_e as Error).message
                        );
                    }
                }
            }

            // 2b. Delete composed H5P content from quiz sessions
            const sessions = await QuizSession.find({
                quizId: quiz._id
            });
            const cleanupUser = {
                id: ctx.userId,
                name: 'quiz-delete',
                email: 'lti@example.com',
                type: 'local' as const
            };
            for (const session of sessions) {
                if (session.composedContentId) {
                    try {
                        await h5pEditor.contentManager.deleteContent(
                            session.composedContentId,
                            cleanupUser as any
                        );
                    } catch (_e) {
                        // Content may already be deleted by quizCleanup
                    }
                }
            }

            // 2c. Delete quiz sessions
            await QuizSession.deleteMany({ quizId: quiz._id });

            // Phase 3: Delete the quiz document
            await Quiz.findOneAndDelete({ _id: quiz._id });

            return res.json({ ok: true });
        } catch (err: any) {
            return res.status(500).json({ error: err.message });
        }
    });

    /**
     * GET /api/quiz/detail/:quizId
     * Get quiz details (without full snapshots).
     */
    router.get('/detail/:quizId', async (req: any, res: any) => {
        try {
            const ctx = getLtiContext(res);
            if (!ctx) {
                return res
                    .status(401)
                    .json({ error: 'Không có quyền truy cập' });
            }

            const quiz = await Quiz.findOne({
                _id: req.params.quizId,
                courseId: ctx.courseId
            }).select('-questionSnapshots');

            if (!quiz) {
                return res
                    .status(404)
                    .json({ error: 'Không tìm thấy bài kiểm tra' });
            }

            return res.json(quiz);
        } catch (err: any) {
            return res.status(500).json({ error: err.message });
        }
    });

    return router;
}
