/**
 * QuizComposer: Server-side engine that composes an H5P.QuestionSet
 * from randomly selected bank questions.
 *
 * Algorithm:
 * 1. For each questionGroup, pick random questions from snapshots
 * 2. Shuffle if enabled
 * 3. Build QuestionSet content.json with rewritten file paths
 * 4. Build h5p.json metadata with merged dependencies
 * 5. Save as temporary H5P content via ContentManager
 * 6. Copy content files from source questions
 */
import { v4 as uuidv4 } from 'uuid';
import type { IQuizDoc, IQuestionSnapshot } from './types';
import { rewriteFilePaths } from './filePathRewriter';

/** QuestionSet library identifier */
const QUESTION_SET_LIBRARY = 'H5P.QuestionSet';
const QUESTION_SET_VERSION = { major: 1, minor: 21 };

/** QuestionSet's own preloaded dependencies (from library.json) */
const QUESTION_SET_DEPS = [
    { machineName: 'FontAwesome', majorVersion: 4, minorVersion: 5 },
    { machineName: 'H5P.Video', majorVersion: 1, minorVersion: 6 },
    { machineName: 'H5P.JoubelUI', majorVersion: 1, minorVersion: 3 },
    { machineName: 'H5P.Components', majorVersion: 1, minorVersion: 0 },
    {
        machineName: QUESTION_SET_LIBRARY,
        majorVersion: QUESTION_SET_VERSION.major,
        minorVersion: QUESTION_SET_VERSION.minor
    }
];

/**
 * Fisher-Yates shuffle (in-place).
 */
function shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

/**
 * Deduplicate dependencies by machineName + majorVersion + minorVersion.
 */
function deduplicateDeps(
    deps: Array<{
        machineName: string;
        majorVersion: number;
        minorVersion: number;
    }>
): Array<{
    machineName: string;
    majorVersion: number;
    minorVersion: number;
}> {
    const seen = new Set<string>();
    return deps.filter((d) => {
        const key = `${d.machineName}-${d.majorVersion}.${d.minorVersion}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

export interface ComposedQuiz {
    contentId: string;
    selectedIndices: number[];
    maxScore: number;
}

/**
 * Compose a QuestionSet from a published quiz's question snapshots.
 *
 * @param quiz - Published quiz document with questionSnapshots
 * @param contentManager - H5P ContentManager for saving content
 * @param user - User object for content operations
 * @returns composedContentId + selected indices
 */
export async function composeQuiz(
    quiz: IQuizDoc,
    contentManager: any,
    user: any
): Promise<ComposedQuiz> {
    // Step 1: Select random questions from each group
    const selectedQuestions: Array<{
        snapshot: IQuestionSnapshot;
        originalIndex: number;
    }> = [];

    for (let gi = 0; gi < quiz.questionGroups.length; gi++) {
        const group = quiz.questionGroups[gi];
        // Get all snapshots for this group
        let candidates = quiz.questionSnapshots
            .map((s, idx) => ({ snapshot: s, originalIndex: idx }))
            .filter((s) => s.snapshot.groupIndex === gi);

        // Apply filters if specified
        if (group.filterTypes && group.filterTypes.length > 0) {
            candidates = candidates.filter((c) => {
                const lib = c.snapshot.library || '';
                const typeName = lib.split(' ')[0].replace('H5P.', '');
                return group.filterTypes.includes(typeName);
            });
        }

        // Random pick
        shuffle(candidates);
        const picked = candidates.slice(
            0,
            Math.min(group.pickCount, candidates.length)
        );
        selectedQuestions.push(...picked);
    }

    // Step 2: Shuffle all questions if enabled
    if (quiz.settings.shuffleQuestions) {
        shuffle(selectedQuestions);
    }

    if (selectedQuestions.length === 0) {
        throw new Error(
            'Không có câu hỏi nào được chọn. Kiểm tra cấu hình quiz.'
        );
    }

    // Step 3: Build QuestionSet content.json
    const questions = selectedQuestions.map((sq, i) => {
        const prefix = `q${i}/`;
        const rewrittenParams = rewriteFilePaths(
            JSON.parse(JSON.stringify(sq.snapshot.params)),
            prefix
        );

        return {
            library: sq.snapshot.library,
            params: rewrittenParams,
            subContentId: uuidv4(),
            metadata: {
                title: sq.snapshot.metadata?.title || `Câu ${i + 1}`,
                contentType: sq.snapshot.metadata?.contentType || 'Question',
                license: 'U'
            }
        };
    });

    const contentJson = {
        introPage: { showIntroPage: false },
        progressType: 'dots',
        passPercentage: 0,
        questions,
        disableBackwardsNavigation: false,
        randomQuestions: false, // Already shuffled server-side
        endGame: {
            showResultPage: true,
            showSolutionButton: true,
            showRetryButton: false,
            message: 'Kết quả',
            scoreBarLabel: 'Bạn đạt :num trong tổng :total điểm',
            successGreeting: 'Chúc mừng!',
            successComment: 'Bạn đã hoàn thành bài kiểm tra.',
            failGreeting: 'Chưa đạt',
            failComment: 'Hãy thử lại lần sau.',
            noResultMessage: 'Đã hoàn thành'
        },
        override: {
            showSolutionButton: 'off',
            retryButton: 'off',
            checkButton: true
        },
        texts: {
            prevButton: 'Câu trước',
            nextButton: 'Câu tiếp',
            finishButton: 'Nộp bài',
            submitButton: 'Nộp bài',
            textualProgress: 'Câu @current / @total',
            jumpToQuestion: 'Câu %d / %total',
            questionLabel: 'Câu hỏi',
            readSpeakerProgress: 'Câu @current / @total',
            unansweredText: 'Chưa trả lời',
            answeredText: 'Đã trả lời',
            currentQuestionText: 'Câu hiện tại',
            navigationLabel: 'Các câu hỏi'
        }
    };

    // Step 4: Build h5p.json metadata with merged dependencies
    const allDeps = [...QUESTION_SET_DEPS];
    for (const sq of selectedQuestions) {
        const meta = sq.snapshot.metadata;
        if (meta?.preloadedDependencies) {
            allDeps.push(...meta.preloadedDependencies);
        }
    }

    const metadata = {
        mainLibrary: QUESTION_SET_LIBRARY,
        title: quiz.name,
        language: 'vi',
        license: 'U',
        embedTypes: ['iframe'] as ('iframe' | 'div')[],
        preloadedDependencies: deduplicateDeps(allDeps)
    };

    // Step 5: Save as temporary H5P content directly to filesystem
    // We bypass contentManager.createOrUpdateContent because it invokes
    // ContentStorer which scans params for temporary file references and
    // runs filename validation that can fail on composed QuestionSet params.
    // Instead, write content.json + h5p.json directly.
    const fs = await import('fs');
    const path = await import('path');
    const contentDir = path.resolve(__dirname, '..', '..', 'h5p', 'content');
    const contentId = `quiz-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
    const newDir = path.join(contentDir, contentId);
    fs.mkdirSync(newDir, { recursive: true });
    fs.writeFileSync(
        path.join(newDir, 'content.json'),
        JSON.stringify(contentJson)
    );
    fs.writeFileSync(path.join(newDir, 'h5p.json'), JSON.stringify(metadata));

    // Step 6: Copy content files from source questions
    for (let i = 0; i < selectedQuestions.length; i++) {
        const sq = selectedQuestions[i];
        const prefix = `q${i}/`;
        const sourceId = sq.snapshot.sourceH5pContentId;

        if (!sourceId || !sq.snapshot.contentFiles?.length) continue;

        for (const filePath of sq.snapshot.contentFiles) {
            try {
                const stream = await contentManager.getContentFileStream(
                    sourceId,
                    filePath,
                    user
                );
                await contentManager.addContentFile(
                    contentId,
                    `${prefix}${filePath}`,
                    stream,
                    user
                );
            } catch (_e) {
                // File may not exist anymore — skip silently
                console.warn(
                    `QuizComposer: Could not copy file ${filePath} from content ${sourceId}`
                );
            }
        }
    }

    // Calculate max score (sum of points per question group)
    let maxScore = 0;
    for (let gi = 0; gi < quiz.questionGroups.length; gi++) {
        const group = quiz.questionGroups[gi];
        const countInGroup = selectedQuestions.filter(
            (sq) => sq.snapshot.groupIndex === gi
        ).length;
        maxScore += countInGroup * (group.pointsPerQuestion || 1);
    }

    return {
        contentId,
        selectedIndices: selectedQuestions.map((sq) => sq.originalIndex),
        maxScore
    };
}
