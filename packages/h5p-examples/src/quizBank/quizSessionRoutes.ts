/**
 * Quiz session routes — check session status, submit scores.
 * These routes are mounted under /h5p/quiz/* (whitelisted from ltijs).
 * Authentication is done via userId matching from the session record.
 */
import { Router } from 'express';

import { QuizSession } from './schemas';

export default function quizSessionRoutes(_h5pEditor: any): Router {
    const router = Router();

    /**
     * GET /h5p/quiz/session/:sessionId
     * Get session info. Only returns non-sensitive data.
     */
    router.get('/session/:sessionId', async (req: any, res: any) => {
        try {
            const session = await QuizSession.findById(
                req.params.sessionId
            ).select('quizId status score maxScore startedAt submittedAt');

            if (!session) {
                return res
                    .status(404)
                    .json({ error: 'Không tìm thấy phiên làm bài' });
            }

            return res.json({
                sessionId: session._id,
                quizId: session.quizId,
                status: session.status,
                score: session.score,
                maxScore: session.maxScore,
                startedAt: session.startedAt,
                submittedAt: session.submittedAt
            });
        } catch (err: any) {
            return res.status(500).json({ error: err.message });
        }
    });

    /**
     * GET /h5p/quiz/attempts/:quizId/:userId
     * Get attempt count for a user on a quiz.
     * Used by the H5P player to show attempt info.
     */
    router.get('/attempts/:quizId/:userId', async (req: any, res: any) => {
        try {
            const count = await QuizSession.countDocuments({
                quizId: req.params.quizId,
                userId: req.params.userId,
                status: { $in: ['submitted', 'graded'] }
            });

            return res.json({ attempts: count });
        } catch (err: any) {
            return res.status(500).json({ error: err.message });
        }
    });

    return router;
}
