/**
 * Periodic cleanup of expired quiz sessions and their composed H5P content.
 */
import { QuizSession } from './schemas';

const CLEANUP_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes
const MAX_BATCH_SIZE = 200;

/**
 * Start the periodic cleanup job.
 * Processes all expired sessions in batches until none remain.
 */
export function startQuizCleanup(contentManager: any): NodeJS.Timeout {
    const cleanupUser = {
        id: 'system-cleanup',
        name: 'System',
        email: 'system@h5p.local',
        type: 'local' as const
    };

    async function cleanup(): Promise<void> {
        try {
            let totalCleaned = 0;
            let batch: any[];

            // Process in loop until no more expired sessions
            do {
                batch = await QuizSession.find({
                    status: 'active',
                    expiresAt: { $lt: new Date() }
                }).limit(MAX_BATCH_SIZE);

                for (const session of batch) {
                    if (session.composedContentId) {
                        try {
                            await contentManager.deleteContent(
                                session.composedContentId,
                                cleanupUser as any
                            );
                        } catch (_e) {
                            // Content may already be deleted
                        }
                    }
                    session.status = 'expired';
                    await session.save();
                }

                totalCleaned += batch.length;
            } while (batch.length === MAX_BATCH_SIZE);

            if (totalCleaned > 0) {
                console.log(
                    `QuizCleanup: cleaned ${totalCleaned} expired sessions`
                );
            }
        } catch (err) {
            console.error('QuizCleanup error:', err);
        }
    }

    // Run after 30s delay (let server start fully), then on interval
    setTimeout(cleanup, 30000);
    return setInterval(cleanup, CLEANUP_INTERVAL_MS);
}
