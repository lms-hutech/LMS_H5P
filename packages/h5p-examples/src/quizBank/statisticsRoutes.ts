/**
 * Statistics API routes for quiz analytics.
 * Provides per-quiz, per-question, and per-student statistics.
 */
import { Router } from 'express';

import { Quiz, QuizSession } from './schemas';

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
            error: 'Chỉ giảng viên mới có quyền xem thống kê'
        });
        return;
    }
    next();
}

export default function statisticsRoutes(): Router {
    const router = Router();
    router.use(requireInstructor);

    /**
     * GET /api/stats/quizzes
     * List published quizzes with basic stats for the current course.
     */
    router.get('/quizzes', async (_req: any, res: any) => {
        try {
            const ctx = getLtiContext(res);
            if (!ctx) {
                return res
                    .status(401)
                    .json({ error: 'Không có thông tin khóa học' });
            }

            const quizzes = await Quiz.find({
                courseId: ctx.courseId,
                status: 'published'
            })
                .sort({ updatedAt: -1 })
                .select('name description questionGroups settings');

            const result = await Promise.all(
                quizzes.map(async (q) => {
                    const sessions = await QuizSession.find({
                        quizId: q._id,
                        status: { $in: ['submitted', 'graded'] }
                    }).select('score maxScore userId');

                    const uniqueStudents = new Set(
                        sessions.map((s) => s.userId)
                    ).size;
                    const totalAttempts = sessions.length;
                    const scores = sessions
                        .filter(
                            (s) => s.score !== undefined && s.score !== null
                        )
                        .map((s) => ({
                            score: s.score as number,
                            max: (s.maxScore as number) || 1
                        }));
                    const avgPercent =
                        scores.length > 0
                            ? Math.round(
                                  (scores.reduce(
                                      (sum, s) => sum + (s.score / s.max) * 100,
                                      0
                                  ) /
                                      scores.length) *
                                      10
                              ) / 10
                            : 0;

                    const totalPick = (q.questionGroups || []).reduce(
                        (s: number, g: any) => s + (g.pickCount || 0),
                        0
                    );

                    return {
                        _id: q._id,
                        name: q.name,
                        totalPick,
                        uniqueStudents,
                        totalAttempts,
                        avgPercent
                    };
                })
            );

            return res.json(result);
        } catch (err: any) {
            return res.status(500).json({ error: err.message });
        }
    });

    /**
     * GET /api/stats/quiz/:quizId
     * Detailed stats for a specific quiz.
     */
    router.get('/quiz/:quizId', async (req: any, res: any) => {
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

            const sessions = await QuizSession.find({
                quizId: quiz._id,
                status: { $in: ['submitted', 'graded'] }
            }).sort({ submittedAt: -1 });

            const scores = sessions
                .filter((s) => s.score !== undefined && s.score !== null)
                .map((s) => ({
                    score: s.score as number,
                    max: (s.maxScore as number) || 1,
                    percent: Math.round(
                        ((s.score as number) / ((s.maxScore as number) || 1)) *
                            100
                    )
                }));

            // Score distribution (0-10%, 10-20%, ..., 90-100%)
            const distribution = Array(10).fill(0);
            for (const s of scores) {
                const bucket = Math.min(Math.floor(s.percent / 10), 9);
                distribution[bucket]++;
            }

            // Per-student best scores
            const studentMap = new Map<
                string,
                {
                    name: string;
                    bestScore: number;
                    bestPercent: number;
                    attempts: number;
                }
            >();
            for (const session of sessions) {
                const uid = session.userId;
                const name = (session as any).userName || '';
                const percent =
                    session.score !== undefined && session.maxScore
                        ? Math.round(
                              ((session.score as number) /
                                  ((session.maxScore as number) || 1)) *
                                  100
                          )
                        : 0;
                const existing = studentMap.get(uid);
                if (!existing) {
                    studentMap.set(uid, {
                        name: name || uid.substring(0, 12) + '...',
                        bestScore: (session.score as number) || 0,
                        bestPercent: percent,
                        attempts: 1
                    });
                } else {
                    existing.attempts++;
                    if (name && !existing.name.includes('@')) {
                        existing.name = name; // prefer real name
                    }
                    if (percent > existing.bestPercent) {
                        existing.bestScore = (session.score as number) || 0;
                        existing.bestPercent = percent;
                    }
                }
            }

            const students = Array.from(studentMap.entries()).map(
                ([userId, data]) => ({
                    userId,
                    ...data
                })
            );

            const uniqueStudents = studentMap.size;
            const totalAttempts = sessions.length;
            const avgPercent =
                scores.length > 0
                    ? Math.round(
                          (scores.reduce((sum, s) => sum + s.percent, 0) /
                              scores.length) *
                              10
                      ) / 10
                    : 0;
            const passCount = scores.filter(
                (s) => s.percent >= (quiz.settings.passPercentage || 0)
            ).length;
            const passRate =
                scores.length > 0
                    ? Math.round((passCount / scores.length) * 100)
                    : 0;
            const highestPercent =
                scores.length > 0
                    ? Math.max(...scores.map((s) => s.percent))
                    : 0;
            const lowestPercent =
                scores.length > 0
                    ? Math.min(...scores.map((s) => s.percent))
                    : 0;

            // Average duration
            const durations = sessions
                .filter((s) => s.duration && s.duration > 0)
                .map((s) => s.duration as number);
            const avgDuration =
                durations.length > 0
                    ? Math.round(
                          durations.reduce((a, b) => a + b, 0) /
                              durations.length
                      )
                    : 0;

            return res.json({
                quiz: {
                    name: quiz.name,
                    totalQuestions: quiz.questionSnapshots.length,
                    totalPick: (quiz.questionGroups || []).reduce(
                        (s: number, g: any) => s + (g.pickCount || 0),
                        0
                    ),
                    passPercentage: quiz.settings.passPercentage || 50,
                    allowedAttempts: quiz.settings.allowedAttempts
                },
                summary: {
                    uniqueStudents,
                    totalAttempts,
                    avgPercent,
                    passRate,
                    highestPercent,
                    lowestPercent,
                    avgDuration
                },
                distribution,
                students
            });
        } catch (err: any) {
            return res.status(500).json({ error: err.message });
        }
    });

    return router;
}
