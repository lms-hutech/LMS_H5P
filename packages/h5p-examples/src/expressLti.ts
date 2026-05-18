import 'dotenv/config';

import { dir, DirectoryResult } from 'tmp-promise';
import bodyParser from 'body-parser';
import express from 'express';
import fileUpload from 'express-fileupload';
import i18next from 'i18next';
import i18nextFsBackend from 'i18next-fs-backend';
import i18nextHttpMiddleware from 'i18next-http-middleware';
import path from 'path';

import {
    h5pAjaxExpressRouter,
    libraryAdministrationExpressRouter,
    contentTypeCacheExpressRouter,
    IRequestWithUser
} from '@lumieducation/h5p-express';
import * as H5P from '@lumieducation/h5p-server';

import startPageRenderer from './startPageRenderer';
import expressRoutes from './expressRoutes';
import User from './User';
import createH5PEditor from './createH5PEditor';
import { displayIps, clearTempFiles } from './utils';
import {
    THEME_CSS,
    instructorHeader,
    studentUI,
    studentScript,
    editorHeader
} from './hutechTheme';
import quizBankRoutes from './quizBank/quizBankRoutes';
import quizRoutes from './quizBank/quizRoutes';
import quizSessionRoutes from './quizBank/quizSessionRoutes';
import statisticsRoutes from './quizBank/statisticsRoutes';
import { renderDashboard } from './quizBank/dashboardRenderer';
import { startQuizCleanup } from './quizBank/quizCleanup';
import { resolveCanvasCourseId } from './quizBank/canvasUtils';
import {
    Quiz,
    QuizSession,
    QuestionBank,
    BankQuestion
} from './quizBank/schemas';
import { composeQuiz } from './quizBank/QuizComposer';

import mongoose from 'mongoose';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const lti = require('ltijs').Provider;

let tmpDir: DirectoryResult;

// =====================================================
// MongoDB schemas for attempt tracking + scores
// =====================================================
const attemptSchema = new mongoose.Schema({
    contentId: { type: String, required: true, index: true },
    userId: { type: String, required: true, index: true },
    score: { type: Number, default: 0 },
    maxScore: { type: Number, default: 1 },
    duration: { type: Number, default: 0 },
    scaledScore: { type: Number, default: 0 },
    canvasMaxPoints: { type: Number, default: 0 },
    agsPublished: { type: Boolean, default: false },
    completedAt: { type: Date, default: Date.now }
});
attemptSchema.index({ contentId: 1, userId: 1 });
const Attempt =
    mongoose.models.Attempt || mongoose.model('Attempt', attemptSchema);

// MongoDB-backed LTI token store (survives pm2 restarts)
const ltiTokenSchema = new mongoose.Schema({
    key: { type: String, required: true, unique: true },
    token: { type: mongoose.Schema.Types.Mixed, required: true },
    updatedAt: { type: Date, default: Date.now }
});
ltiTokenSchema.index({ updatedAt: 1 }, { expireAfterSeconds: 86400 }); // TTL 24h
const LtiTokenStore =
    mongoose.models.LtiTokenStore ||
    mongoose.model('LtiTokenStore', ltiTokenSchema);

const ltiTokenStore = {
    async set(key: string, token: any): Promise<void> {
        await LtiTokenStore.updateOne(
            { key },
            { key, token, updatedAt: new Date() },
            { upsert: true }
        );
    },
    async get(key: string): Promise<any | null> {
        const doc = await LtiTokenStore.findOne({ key });
        return doc?.token || null;
    },
    async entries(): Promise<[string, any][]> {
        const docs = await LtiTokenStore.find({});
        return docs.map((d: any) => [d.key, d.token] as [string, any]);
    },
    async findByPrefix(prefix: string): Promise<[string, any][]> {
        const docs = await LtiTokenStore.find({
            key: { $regex: `^${prefix}` }
        });
        return docs.map((d: any) => [d.key, d.token] as [string, any]);
    },
    async findByPattern(pattern: string): Promise<[string, any][]> {
        const docs = await LtiTokenStore.find({
            key: { $regex: pattern }
        });
        return docs.map((d: any) => [d.key, d.token] as [string, any]);
    }
};

const isProduction = process.env.NODE_ENV === 'production';

/**
 * Validates that a required environment variable is set in production.
 * Returns the value or a fallback in development mode.
 */
function requireEnv(name: string, devDefault: string = ''): string {
    const val = process.env[name];
    if (!val && isProduction) {
        throw new Error(
            `Environment variable ${name} is required in production mode.`
        );
    }
    return val || devDefault;
}

/**
 * Validates a content ID to prevent injection attacks.
 * H5P content IDs are numeric strings (filesystem) or MongoDB ObjectIds.
 */
function validateContentId(id: unknown): string | null {
    if (typeof id !== 'string') return null;
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(id)) return null;
    return id;
}

/**
 * Generates an HTML error page with Vietnamese text.
 */
function errorPageHtml(title: string, message: string): string {
    return `<!DOCTYPE html>
    <html><head><meta charset="utf-8"><title>${title}</title>
    <style>
        body { font-family: Arial, sans-serif; display: flex; justify-content: center;
               align-items: center; height: 100vh; margin: 0; background: #f5f5f5; }
        .error-card { background: white; padding: 40px; border-radius: 8px;
                      box-shadow: 0 2px 8px rgba(0,0,0,0.1); text-align: center; max-width: 500px; }
        h2 { color: #d32f2f; }
        .back-btn { display: inline-block; margin-top: 20px; padding: 10px 24px;
                    background: #1a73e8; color: white; border-radius: 4px; text-decoration: none; }
    </style></head><body>
    <div class="error-card">
        <h2>${title}</h2>
        <p>${message}</p>
        <a class="back-btn" href="javascript:history.back()">Quay l\u1ea1i</a>
    </div>
    </body></html>`;
}

const start = async (): Promise<void> => {
    const useTempUploads = process.env.TEMP_UPLOADS != 'false';
    if (useTempUploads) {
        tmpDir = await dir({ keep: false, unsafeCleanup: true });
    }

    // i18next setup
    const translationFunction = await i18next
        .use(i18nextFsBackend)
        .use(i18nextHttpMiddleware.LanguageDetector)
        .init({
            backend: {
                loadPath: path.join(
                    __dirname,
                    '../../../node_modules/@lumieducation/h5p-server/build/assets/translations/{{ns}}/{{lng}}.json'
                )
            },
            debug: process.env.DEBUG && process.env.DEBUG.includes('i18n'),
            defaultNS: 'server',
            fallbackLng: 'en',
            ns: [
                'client',
                'copyright-semantics',
                'hub',
                'library-metadata',
                'metadata-semantics',
                'mongo-s3-content-storage',
                's3-temporary-storage',
                'server',
                'storage-file-implementations'
            ],
            preload: ['en', 'de', 'vi']
        });

    // H5P Config
    const config = await new H5P.H5PConfig(
        new H5P.fsImplementations.JsonStorage(
            path.join(__dirname, '../config.json')
        )
    ).load();

    // H5P Editor
    const h5pEditor: H5P.H5PEditor = await createH5PEditor(
        config,
        path.join(__dirname, '../h5p/libraries'),
        path.join(__dirname, '../h5p/content'),
        path.join(__dirname, '../h5p/temporary-storage'),
        path.join(__dirname, '../h5p/user-data'),
        (key, language) => translationFunction(key, { lng: language })
    );

    // H5P Player
    const h5pPlayer = new H5P.H5PPlayer(
        h5pEditor.libraryStorage,
        h5pEditor.contentStorage,
        config,
        undefined,
        undefined,
        (key, language) => translationFunction(key, { lng: language }),
        undefined,
        h5pEditor.contentUserDataStorage
    );

    // =====================================================
    // LTI 1.3 Setup with ltijs
    // =====================================================
    const MONGODB_URI =
        process.env.MONGODB_URI || 'mongodb://localhost:27017/h5p-lti';

    // Connect Mongoose for attempt tracking (separate from ltijs's MongoDB connection)
    mongoose
        .connect(MONGODB_URI)
        .then(() => {
            console.log('Mongoose connected for attempt tracking');
        })
        .catch((err: any) => {
            console.error('Mongoose connection error:', err.message);
        });

    const H5P_PUBLIC_URL = requireEnv(
        'H5P_PUBLIC_URL',
        'http://localhost:8080'
    );
    const LTI_KEY = requireEnv('LTI_KEY', 'h5p-lti-dev-key');

    if (!isProduction && LTI_KEY === 'h5p-lti-dev-key') {
        console.warn(
            'WARNING: Using default LTI_KEY. Set a strong secret in production.'
        );
    }

    // Setup ltijs
    lti.setup(
        LTI_KEY,
        {
            url: MONGODB_URI
        },
        {
            appRoute: '/lti/launch',
            loginRoute: '/lti/login',
            keysetRoute: '/lti/keys',
            cookies: {
                secure: true,
                sameSite: 'None'
            },
            // devMode: true disables state validation (requires third-party cookies
            // which are blocked in cross-site iframes by modern browsers).
            // For production, implement ltijs serverless platform storage instead.
            devMode: true
        }
    );

    if (!isProduction) {
        console.warn(
            'WARNING: LTI running in development mode. Set NODE_ENV=production for production use.'
        );
    }

    // =====================================================
    // Whitelist all H5P routes so they bypass LTI auth
    // =====================================================
    lti.whitelist(
        /^\/h5p\/.*/,
        /^\/h5p-icons\/.*/,
        /^\/h5p-screenshots\/.*/,
        /^\/client\/.*/,
        /^\/favicon\.ico$/,
        /^\/hutech_logo\.png$/,
        { route: '/', method: 'GET' },
        /^\/lti\/login$/
    );

    // When Canvas sends OIDC login params to /lti/launch instead of /lti/login,
    // redirect them to the correct login route via 307 (preserves POST method+body)
    lti.onInvalidToken(async (req: any, res: any, _next: any) => {
        const params = { ...req.query, ...req.body };
        if (params.iss && params.login_hint) {
            console.log(
                'Redirecting OIDC login from',
                req.path,
                'to /lti/login'
            );
            const qs = new URLSearchParams(params).toString();
            return res.redirect(307, `/lti/login?${qs}`);
        }
        console.log('Invalid Token at:', req.path, req.method);
        return res
            .status(401)
            .send(
                errorPageHtml(
                    'Phi\u00ean l\u00e0m vi\u1ec7c kh\u00f4ng h\u1ee3p l\u1ec7',
                    'Vui l\u00f2ng quay l\u1ea1i v\u00e0 th\u1eed l\u1ea1i t\u1eeb h\u1ec7 th\u1ed1ng LMS.'
                )
            );
    });

    lti.onSessionTimeout(async (req: any, res: any, _next: any) => {
        console.log('Session Timeout at:', req.path);
        return res
            .status(401)
            .send(
                errorPageHtml(
                    'H\u1ebft phi\u00ean l\u00e0m vi\u1ec7c',
                    'Phi\u00ean l\u00e0m vi\u1ec7c \u0111\u00e3 h\u1ebft h\u1ea1n. Vui l\u00f2ng quay l\u1ea1i LMS v\u00e0 truy c\u1eadp l\u1ea1i.'
                )
            );
    });

    // =====================================================
    // LTI Launch callback — render H5P editor/player
    // =====================================================
    lti.onConnect(async (token: any, req: any, res: any) => {
        console.log(
            'onConnect called - URL:',
            req.originalUrl,
            'Method:',
            req.method
        );
        const user = {
            id: token.user || '1',
            name: token.userInfo?.name || 'LTI User',
            email: token.userInfo?.email || 'lti@example.com',
            type: 'local' as const
        };

        const rawContentId =
            req.query?.contentId || token.platformContext?.custom?.content_id;
        const contentId = validateContentId(rawContentId);

        if (rawContentId && !contentId) {
            return res
                .status(400)
                .send(
                    errorPageHtml(
                        'Y\u00eau c\u1ea7u kh\u00f4ng h\u1ee3p l\u1ec7',
                        'M\u00e3 n\u1ed9i dung kh\u00f4ng h\u1ee3p l\u1ec7.'
                    )
                );
        }

        // Determine role from LTI context
        const roles = token.platformContext?.roles || [];
        const isInstructor = roles.some(
            (r: string) =>
                r.includes('Instructor') ||
                r.includes('Administrator') ||
                r.includes('ContentDeveloper') ||
                r.includes('TeachingAssistant')
        );
        console.log(
            'LTI roles:',
            JSON.stringify(roles),
            'isInstructor:',
            isInstructor
        );

        // ── course_navigation placement: Quiz Bank Dashboard ──
        const placement =
            req.query?.placement ||
            token.platformContext?.custom?.placement ||
            token.platformContext?.messageType;
        if (placement === 'course_navigation' || req.query?.dashboard === '1') {
            if (!isInstructor) {
                return res
                    .status(403)
                    .send(
                        errorPageHtml(
                            'Không có quyền',
                            'Chỉ giảng viên mới có thể truy cập quản lý ngân hàng câu hỏi.'
                        )
                    );
            }
            const courseId =
                token.platformContext?.context?.id ||
                token.platformContext?.custom?.canvas_course_id ||
                'unknown';
            const courseName =
                token.platformContext?.context?.title || 'Khóa học';
            const canvasCourseId = await resolveCanvasCourseId(token);
            // Pass ltik token so dashboard JS can authenticate API calls
            const ltik = req.query?.ltik || res.locals?.ltik || '';
            return res.send(
                renderDashboard(
                    courseId,
                    courseName,
                    h5pEditor.config.baseUrl,
                    ltik,
                    canvasCourseId
                )
            );
        }

        // ── Practice mode: random H5P questions from bank, no grading ──
        const practiceMode = req.query?.practice === '1';
        const practiceBankId = req.query?.bankId;
        if (practiceMode && practiceBankId) {
            try {
                const bank = await QuestionBank.findById(practiceBankId);
                const bankName = bank?.name || 'Luyện tập';
                const allQuestions = await BankQuestion.find({
                    bankId: practiceBankId
                });

                if (allQuestions.length === 0) {
                    return res.send(
                        errorPageHtml(
                            'Chưa có câu hỏi',
                            'Ngân hàng câu hỏi này chưa có câu hỏi nào.'
                        )
                    );
                }

                // Build a temporary quiz object for composeQuiz
                const pickCount = Math.min(5, allQuestions.length);
                const practiceQuiz = {
                    name: `Luyện tập: ${bankName}`,
                    questionGroups: [
                        {
                            bankId: practiceBankId,
                            pickCount,
                            pointsPerQuestion: 1,
                            filterTags: [],
                            filterDifficulty: [],
                            filterTypes: []
                        }
                    ],
                    settings: {
                        shuffleQuestions: true,
                        showProgressBar: true,
                        passPercentage: 0,
                        allowedAttempts: -1
                    },
                    questionSnapshots: allQuestions.map(
                        (q: any, idx: number) => ({
                            questionId: q._id,
                            groupIndex: 0,
                            params: q.contentSnapshot.params,
                            metadata: q.contentSnapshot.metadata,
                            library: q.contentSnapshot.library,
                            contentFiles: q.contentFiles || [],
                            sourceH5pContentId: q.h5pContentId
                        })
                    )
                };

                // Compose H5P QuestionSet
                const composed = await composeQuiz(
                    practiceQuiz as any,
                    h5pEditor.contentManager,
                    user
                );

                // Render via H5P Player
                const h5pPage = await h5pPlayer.render(
                    composed.contentId,
                    user as any,
                    'vi',
                    {
                        showCopyButton: false,
                        showDownloadButton: false,
                        showFrame: false,
                        showH5PIcon: false,
                        showLicenseButton: false
                    }
                );

                let page = h5pPage as string;
                page = page.replace('</head>', THEME_CSS + '</head>');
                // Remove download/action buttons
                page = page.replace(
                    /<a[^>]*download[^>]*>[^<]*<\/[^>]*>/gi,
                    ''
                );
                page = page.replace(
                    /<div[^>]*class="h5p-actions"[^>]*>[\s\S]*?<\/div>/gi,
                    ''
                );
                // Add practice banner + reload button
                page = page.replace(
                    '</body>',
                    `<div style="text-align:center;padding:16px;background:#f5f5f5;border-top:1px solid #e0e0e0;">
                        <p style="margin:0 0 8px;font-size:13px;color:#666;">Luyện tập: ${bankName} · ${pickCount} câu ngẫu nhiên · Không tính điểm</p>
                        <a href="javascript:location.reload()" style="display:inline-block;padding:8px 20px;background:#0770A3;color:white;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px;">🔄 Làm lại (câu mới)</a>
                    </div></body>`
                );
                // Block finishedData from sending grades
                page = page.replace(
                    '</head>',
                    `<script>
                    window._practiceMode = true;
                    </script></head>`
                );

                return res.send(page);
            } catch (err: any) {
                console.log('Practice mode error:', err.message);
                return res
                    .status(500)
                    .send(errorPageHtml('Lỗi luyện tập', err.message));
            }
        }

        // ── Quiz launch: student opens a quiz-linked assignment ──
        const quizId =
            req.query?.quizId || token.platformContext?.custom?.quiz_id;
        if (quizId) {
            try {
                const quiz = await Quiz.findById(quizId);
                if (!quiz || quiz.status !== 'published') {
                    return res
                        .status(404)
                        .send(
                            errorPageHtml(
                                'Bài kiểm tra không tồn tại',
                                'Bài kiểm tra chưa được xuất bản hoặc đã bị xóa.'
                            )
                        );
                }

                // Escape quiz name/desc for safe HTML rendering
                const safeQuizName = (quiz.name || '')
                    .replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;')
                    .replace(/"/g, '&quot;');
                const safeQuizDesc = (quiz.description || '')
                    .replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;')
                    .replace(/"/g, '&quot;');

                // For instructors: show quiz info
                if (isInstructor && !req.query?.takeQuiz) {
                    const totalQuestions = quiz.questionSnapshots.length;
                    const totalPick = quiz.questionGroups.reduce(
                        (s: number, g: any) => s + (g.pickCount || 0),
                        0
                    );
                    return res.send(`<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${safeQuizName}</title>
${THEME_CSS}
</head><body style="margin:0;padding:24px;font-family:var(--h-font);">
<div class="card" style="max-width:600px;margin:0 auto;padding:24px;background:white;border-radius:8px;box-shadow:var(--h-shadow);">
    <h2 style="margin:0 0 8px;">${safeQuizName}</h2>
    <p style="color:var(--h-text-sec);margin:0 0 16px;">${safeQuizDesc}</p>
    <div style="display:flex;gap:16px;margin-bottom:16px;">
        <div style="padding:12px;background:var(--h-surface-alt);border-radius:6px;flex:1;text-align:center;">
            <div style="font-size:24px;font-weight:700;color:var(--h-primary);">${totalPick}</div>
            <div style="font-size:12px;color:var(--h-text-sec);">câu/lượt</div>
        </div>
        <div style="padding:12px;background:var(--h-surface-alt);border-radius:6px;flex:1;text-align:center;">
            <div style="font-size:24px;font-weight:700;color:var(--h-primary);">${totalQuestions}</div>
            <div style="font-size:12px;color:var(--h-text-sec);">tổng câu hỏi</div>
        </div>
        <div style="padding:12px;background:var(--h-surface-alt);border-radius:6px;flex:1;text-align:center;">
            <div style="font-size:24px;font-weight:700;color:var(--h-primary);">${quiz.settings.allowedAttempts === -1 ? '∞' : quiz.settings.allowedAttempts}</div>
            <div style="font-size:12px;color:var(--h-text-sec);">lượt làm</div>
        </div>
    </div>
    <p style="font-size:13px;color:var(--h-text-sec);margin-bottom:16px;">Mỗi sinh viên nhận bộ câu hỏi ngẫu nhiên khác nhau.</p>
    <div style="display:flex;gap:8px;margin-bottom:8px;">
        <a href="?quizId=${quizId}&takeQuiz=1&ltik=${encodeURIComponent(req.query?.ltik || res.locals?.ltik || '')}" style="${quiz.questionSnapshots?.some((s: any) => s.library?.includes('InteractiveVideo')) ? 'flex:1;' : 'width:100%;'}text-align:center;padding:12px;background:var(--h-primary);color:white;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px;">▶ Làm thử</a>
        ${quiz.questionSnapshots?.some((s: any) => s.library?.includes('InteractiveVideo')) ? `<button id="btn-edit-content" style="flex:1;padding:12px;background:white;color:var(--h-primary);border:1px solid var(--h-primary);border-radius:6px;font-weight:600;font-size:14px;cursor:pointer;">✏️ Chỉnh sửa nội dung</button>` : ''}
    </div>
    <p style="font-size:11px;color:var(--h-text-sec);text-align:center;">(Dành cho giảng viên — điểm không được tính)</p>
    ${
        quiz.questionSnapshots?.some((s: any) =>
            s.library?.includes('InteractiveVideo')
        )
            ? `
    <div id="edit-overlay" style="display:none;position:fixed;inset:0;z-index:9999;background:white;">
        <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 16px;background:#f5f5f5;border-bottom:1px solid #e0e0e0;">
            <strong style="font-size:14px;">✏️ Chỉnh sửa nội dung</strong>
            <button id="btn-close-edit" style="padding:6px 16px;background:#f44336;color:white;border:none;border-radius:4px;cursor:pointer;font-weight:600;">✕ Đóng</button>
        </div>
        <iframe id="edit-frame" style="width:100%;height:calc(100vh - 44px);border:none;" src=""></iframe>
    </div>
    <script>
    document.getElementById('btn-edit-content').addEventListener('click', function() {
        document.getElementById('edit-frame').src = '/h5p/edit/${quiz.questionSnapshots?.[0]?.sourceH5pContentId || ''}';
        document.getElementById('edit-overlay').style.display = 'block';
    });
    document.getElementById('btn-close-edit').addEventListener('click', function() {
        document.getElementById('edit-overlay').style.display = 'none';
        document.getElementById('edit-frame').src = '';
    });
    </script>`
            : ''
    }
</div>
</body></html>`);
                }

                // For students: compose and render quiz directly (no self-fetch)
                const tokenUserId = token.user || 'unknown';
                await ltiTokenStore.set(`${tokenUserId}_quiz_${quizId}`, token);

                // Check attempt limit (atomic: use findOneAndUpdate to prevent race condition)
                if (quiz.settings.allowedAttempts > 0) {
                    const attemptCount = await QuizSession.countDocuments({
                        quizId: quiz._id,
                        userId: tokenUserId,
                        status: { $in: ['submitted', 'graded'] }
                    });
                    if (attemptCount >= quiz.settings.allowedAttempts) {
                        return res.send(
                            errorPageHtml(
                                'Đã hết lượt làm bài',
                                `Bạn đã sử dụng ${attemptCount}/${quiz.settings.allowedAttempts} lượt.`
                            )
                        );
                    }
                }

                // Check for existing active session (resume)
                let composedId: string;
                const existingSession = await QuizSession.findOne({
                    quizId: quiz._id,
                    userId: tokenUserId,
                    status: 'active'
                });

                if (existingSession?.composedContentId) {
                    composedId = existingSession.composedContentId;
                } else {
                    // Compose new QuestionSet
                    const composed = await composeQuiz(
                        quiz,
                        h5pEditor.contentManager,
                        user
                    );
                    composedId = composed.contentId;

                    // Create session record
                    await QuizSession.create({
                        quizId: quiz._id,
                        userId: tokenUserId,
                        userName: token.userInfo?.name || '',
                        courseId: token.platformContext?.context?.id || '',
                        selectedQuestionIndices: composed.selectedIndices,
                        composedContentId: composedId,
                        status: 'active',
                        maxScore: composed.maxScore,
                        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
                    });
                }

                // Render the composed QuestionSet via H5P player
                const h5pPage = await h5pPlayer.render(
                    composedId,
                    user as any,
                    'vi',
                    {
                        showCopyButton: false,
                        showDownloadButton: false,
                        showFrame: false,
                        showH5PIcon: false,
                        showLicenseButton: false
                    }
                );

                let page = h5pPage as string;
                page = page.replace('</head>', THEME_CSS + '</head>');
                page = page.replace(
                    /<a[^>]*download[^>]*>[^<]*<\/[^>]*>/gi,
                    ''
                );
                page = page.replace(
                    /<div[^>]*class="h5p-actions"[^>]*>[\s\S]*?<\/div>/gi,
                    ''
                );

                return res.send(page);
            } catch (quizError: any) {
                console.error('Quiz launch error:', quizError);
                return res
                    .status(500)
                    .send(
                        errorPageHtml(
                            'Lỗi tải bài kiểm tra',
                            quizError.message || 'Vui lòng thử lại.'
                        )
                    );
            }
        }

        try {
            if (contentId) {
                const h5pPage = await h5pPlayer.render(
                    contentId,
                    user as any,
                    'vi',
                    {
                        showCopyButton: false,
                        showDownloadButton: false,
                        showFrame: false,
                        showH5PIcon: false,
                        showLicenseButton: false
                    }
                );

                // h5pPage is a full HTML page — inject toolbar directly (no wrapping)
                let page = h5pPage as string;

                // Inject HUTECH theme CSS + resize script
                page = page.replace(
                    '</head>',
                    THEME_CSS +
                        `
                <style>
                body{margin:0!important;padding:16px!important;background:#f5f5f5!important}
                .h5p-content{width:100%!important;max-width:900px!important;height:auto!important;margin:0 auto!important}
                </style>
                <script>
                // Inject CSS into H5P iframe to hide controls for students
                document.addEventListener('DOMContentLoaded', function() {
                    setTimeout(function() {
                        var iframes = document.querySelectorAll('.h5p-iframe');
                        iframes.forEach(function(iframe) {
                            try {
                                var doc = iframe.contentDocument || iframe.contentWindow.document;
                                var style = doc.createElement('style');
                                style.textContent = '.h5p-control.h5p-slider,.h5p-control.h5p-quality,.h5p-control.h5p-playbackRate,.h5p-control.h5p-rewind10{display:none!important}.h5p-progress-slider{pointer-events:none!important}.h5p-seekbar .h5p-interaction-button{pointer-events:auto!important}';
                                doc.head.appendChild(style);
                            } catch(e) {}
                        });
                    }, 3000);
                });
                </script>
                <sc` +
                        `ript>
                function resizeFrame(){var h=Math.max(document.body.scrollHeight,600);try{window.parent.postMessage(JSON.stringify({subject:'lti.frameResize',height:h}),'*')}catch(e){}}
                resizeFrame();window.addEventListener('load',resizeFrame);setInterval(resizeFrame,2000);
                </sc` +
                        `ript></head>`
                );

                // Remove download/reuse links and actions bar from player
                page = page.replace(
                    /<a[^>]*download[^>]*>[^<]*<\/[^>]*>/gi,
                    ''
                );
                page = page.replace(/Download/g, '');
                page = page.replace(
                    /<div[^>]*class="h5p-actions"[^>]*>[\s\S]*?<\/div>/gi,
                    ''
                );

                // For students: enforce Canvas attempt limit (server-side via MongoDB)
                // Store LTI token for AGS grade publishing (used by finishedData hook)
                const tokenUserId = token.user || 'unknown';
                await ltiTokenStore.set(`${tokenUserId}_${contentId}`, token);

                if (!isInstructor) {
                    const customParams = token.platformContext?.custom || {};
                    console.log(
                        'LTI custom params:',
                        JSON.stringify(customParams)
                    );
                    const allowedAttempts = parseInt(
                        customParams.allowed_attempts || '-1'
                    );
                    const userId = token.user || 'unknown';
                    console.log(
                        `Student view: userId=${userId}, contentId=${contentId}, allowedAttempts=${allowedAttempts}`
                    );

                    // Get current attempt count from MongoDB
                    let currentAttempts = 0;
                    try {
                        currentAttempts = await Attempt.countDocuments({
                            contentId,
                            userId
                        });
                    } catch (_e) {
                        /* ignore */
                    }

                    const exhausted =
                        allowedAttempts > 0 &&
                        currentAttempts >= allowedAttempts;

                    // Inject HUTECH branded student UI
                    const uiHtml = studentUI(
                        contentId,
                        userId,
                        currentAttempts,
                        allowedAttempts,
                        exhausted,
                        res.locals.ltik || ''
                    );
                    page = page.replace('<body>', '<body>' + uiHtml);

                    // Inject student scoring script
                    const sScript = studentScript(
                        contentId,
                        userId,
                        currentAttempts,
                        allowedAttempts,
                        exhausted
                    );
                    page = page.replace('</body>', sScript + '</body>');

                    // OLD attemptScript replaced by hutechTheme — keep this marker
                    const _legacyRemoved =
                        `
                        <sc` +
                        `ript>
                        (function() {
                            var maxAttempts = ${allowedAttempts};
                            var currentAttempts = ${currentAttempts};
                            var exhausted = ${exhausted};
                            var submitting = false;

                            function hideRetry() {
                                setInterval(function() {
                                    document.querySelectorAll('.h5p-question-try-again, [class*="retry"], [class*="Retry"]').forEach(function(btn) {
                                        btn.style.display = 'none';
                                    });
                                }, 500);
                            }

                            function disableAll() {
                                hideRetry();
                                // Hide ALL action buttons and disable inputs
                                setInterval(function() {
                                    document.querySelectorAll('.h5p-question-check-answer, .h5p-question-show-solution, [class*="check-answer"], .h5p-joubelui-button, .h5p-question-buttons button, #h5p-content button').forEach(function(btn) {
                                        btn.style.display = 'none';
                                    });
                                    document.querySelectorAll('.h5p-content input, .h5p-content textarea, .h5p-content select').forEach(function(el) {
                                        el.setAttribute('disabled', 'disabled');
                                    });
                                }, 500);
                                // Show exhausted message
                                var msg = document.createElement('div');
                                msg.style.cssText = 'padding:12px 16px;background:#fff3cd;border:1px solid #ffc107;border-radius:4px;margin:8px 16px;font-family:Arial,sans-serif;font-size:14px;color:#856404;text-align:center;';
                                msg.innerHTML = 'Bạn đã hết lượt làm bài. Liên hệ giảng viên nếu cần thêm lượt.';
                                var content = document.querySelector('.h5p-content');
                                if (content) content.parentNode.insertBefore(msg, content);
                            }

                            // If already exhausted on page load
                            if (exhausted) {
                                disableAll();
                            }

                            // H5P native scoring: H5P.setFinished() POSTs to /h5p/finishedData
                            // Our server middleware hooks that endpoint to save attempt + publish AGS grade.
                            // Client just needs to update UI after H5P finishes scoring.

                            // Intercept XHR to finishedData to update attempt counter
                            var origXhrOpen = XMLHttpRequest.prototype.open;
                            var origXhrSend = XMLHttpRequest.prototype.send;
                            XMLHttpRequest.prototype.open = function(method, url) {
                                this._url = url; this._method = method;
                                return origXhrOpen.apply(this, arguments);
                            };
                            XMLHttpRequest.prototype.send = function(body) {
                                if (this._method === 'POST' && this._url && this._url.indexOf('finishedData') !== -1) {
                                    if (submitting) return origXhrSend.apply(this, arguments);
                                    submitting = true;

                                    // Parse score from request body for immediate display
                                    try {
                                        var params = new URLSearchParams(body);
                                        var reqScore = parseFloat(params.get('score')) || 0;
                                        var reqMaxScore = parseFloat(params.get('maxScore')) || 1;
                                        if (window.showScoreResult) window.showScoreResult(reqScore, reqMaxScore);
                                    } catch(e) {}

                                    this.addEventListener('load', function() {
                                        fetch('/h5p/attempts/${contentId}/${userId}')
                                            .then(function(r) { return r.json(); })
                                            .then(function(data) {
                                                currentAttempts = data.attempts || (currentAttempts + 1);
                                                // Update panel
                                                var panel = document.getElementById('attempt-counter');
                                                if (panel) {
                                                    var infoSpan = panel.querySelector('.score-info');
                                                    if (infoSpan && maxAttempts > 0) {
                                                        infoSpan.innerHTML = '<span>Số lần làm bài: <strong>' + currentAttempts + '/' + maxAttempts + '</strong></span>';
                                                    }
                                                }
                                                if (maxAttempts > 0 && currentAttempts >= maxAttempts) {
                                                    disableAll();
                                                } else {
                                                    submitting = false;
                                                }
                                            }).catch(function() { submitting = false; });
                                    });
                                }
                                return origXhrSend.apply(this, arguments);
                            };

                            // Reset submitting flag when user clicks retry button
                            document.addEventListener('click', function(e) {
                                if (e.target && (e.target.className || '').indexOf('retry') !== -1) {
                                    submitting = false;
                                }
                            }, true);

                            // === Score Panel + History Modal ===
                            // Inject styles
                            var style = document.createElement('style');
                            style.textContent = [
                                '.h5p-score-panel { padding:12px 16px; background:#e8f4f8; border-bottom:1px solid #b8d4e3; font-family:Arial,sans-serif; font-size:14px; color:#1a73e8; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; }',
                                '.h5p-score-panel .score-info { display:flex; gap:16px; align-items:center; flex-wrap:wrap; }',
                                '.h5p-score-result { display:none; padding:12px 16px; background:#f0f9f0; border-bottom:1px solid #a8d5a8; font-family:Arial,sans-serif; }',
                                '.h5p-score-result.active { display:block; }',
                                '.h5p-score-result .score-big { font-size:24px; font-weight:bold; color:#2e7d32; }',
                                '.h5p-score-result .score-pct { font-size:16px; color:#666; margin-left:8px; }',
                                '.h5p-history-btn { background:#1a73e8; color:white; border:none; padding:6px 14px; border-radius:4px; cursor:pointer; font-size:13px; }',
                                '.h5p-history-btn:hover { background:#1557b0; }',
                                '.h5p-modal-overlay { display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.5); z-index:99999; justify-content:center; align-items:center; }',
                                '.h5p-modal-overlay.active { display:flex; }',
                                '.h5p-modal { background:white; border-radius:8px; padding:24px; max-width:500px; width:90%; max-height:80vh; overflow-y:auto; box-shadow:0 4px 20px rgba(0,0,0,0.3); }',
                                '.h5p-modal h3 { margin:0 0 16px; color:#333; font-size:18px; display:flex; justify-content:space-between; align-items:center; }',
                                '.h5p-modal .close-btn { background:none; border:none; font-size:24px; cursor:pointer; color:#999; }',
                                '.h5p-modal table { width:100%; border-collapse:collapse; font-size:14px; }',
                                '.h5p-modal th { background:#f5f5f5; padding:8px 12px; text-align:left; border-bottom:2px solid #ddd; font-weight:600; }',
                                '.h5p-modal td { padding:8px 12px; border-bottom:1px solid #eee; }',
                                '.h5p-modal tr:hover { background:#f9f9f9; }',
                                '.h5p-modal .score-good { color:#2e7d32; font-weight:bold; }',
                                '.h5p-modal .score-bad { color:#c62828; }',
                                '.h5p-modal .summary { margin-top:12px; padding:10px; background:#e3f2fd; border-radius:4px; font-size:14px; color:#1565c0; }'
                            ].join('\\n');
                            document.head.appendChild(style);

                            // Score panel (top bar)
                            var panel = document.createElement('div');
                            panel.className = 'h5p-score-panel';
                            panel.id = 'attempt-counter';
                            var panelHTML = '<div class="score-info">';
                            if (maxAttempts > 0) {
                                panelHTML += '<span>Số lần làm bài: <strong>' + currentAttempts + '/' + maxAttempts + '</strong></span>';
                            }
                            panelHTML += '</div>';
                            panelHTML += '<button class="h5p-history-btn" onclick="document.getElementById(&quot;h5p-history-modal&quot;).className=&quot;h5p-modal-overlay active&quot;; loadHistory();">Xem lịch sử</button>';
                            panel.innerHTML = panelHTML;
                            document.body.insertBefore(panel, document.body.firstChild);

                            // Score result panel (shown after completing)
                            var scoreResult = document.createElement('div');
                            scoreResult.className = 'h5p-score-result';
                            scoreResult.id = 'h5p-score-result';
                            panel.after(scoreResult);

                            // History modal
                            var modal = document.createElement('div');
                            modal.className = 'h5p-modal-overlay';
                            modal.id = 'h5p-history-modal';
                            modal.onclick = function(e) { if (e.target === modal) modal.className = 'h5p-modal-overlay'; };
                            modal.innerHTML = '<div class="h5p-modal"><h3>Lịch sử làm bài <button class="close-btn" onclick="document.getElementById(&quot;h5p-history-modal&quot;).className=&quot;h5p-modal-overlay&quot;">×</button></h3><div id="h5p-history-content">Đang tải...</div></div>';
                            document.body.appendChild(modal);

                            // Load history function
                            window.loadHistory = function() {
                                fetch('/h5p/attempts/${contentId}/${userId}')
                                    .then(function(r) { return r.json(); })
                                    .then(function(data) {
                                        var html = '';
                                        if (data.history && data.history.length > 0) {
                                            html += '<table><thead><tr><th>Lần</th><th>Điểm</th><th>Phần trăm</th><th>Thời gian</th><th>Ngày</th></tr></thead><tbody>';
                                            data.history.forEach(function(h) {
                                                var pctClass = h.percentage >= 50 ? 'score-good' : 'score-bad';
                                                var mins = Math.floor(h.duration / 60);
                                                var secs = h.duration % 60;
                                                var timeStr = mins > 0 ? mins + ' phút ' + secs + 's' : secs + ' giây';
                                                var dateStr = new Date(h.completedAt).toLocaleString('vi-VN', {day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
                                                html += '<tr><td>' + h.attempt + '</td><td class="' + pctClass + '">' + h.score + '/' + h.maxScore + '</td><td class="' + pctClass + '">' + h.percentage + '%</td><td>' + timeStr + '</td><td>' + dateStr + '</td></tr>';
                                            });
                                            html += '</tbody></table>';
                                            var best = data.history.reduce(function(a, b) { return a.percentage > b.percentage ? a : b; });
                                            html += '<div class="summary">Điểm cao nhất: <strong>' + best.score + '/' + best.maxScore + ' (' + best.percentage + '%)</strong></div>';
                                        } else {
                                            html = '<p style="color:#666">Chưa có lần làm bài nào.</p>';
                                        }
                                        document.getElementById('h5p-history-content').innerHTML = html;
                                    });
                            };

                            // Show score result after finishedData completes
                            window.showScoreResult = function(score, maxScore) {
                                var pct = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;
                                var color = pct >= 50 ? '#2e7d32' : '#c62828';
                                var el = document.getElementById('h5p-score-result');
                                el.innerHTML = '<span class="score-big" style="color:' + color + '">' + score + '/' + maxScore + '</span><span class="score-pct">(' + pct + '%)</span>';
                                el.className = 'h5p-score-result active';
                            };
                        })();
                        </sc` +
                        `ript>`;
                    // Legacy attemptScript removed — studentUI/studentScript handles this now
                    // page.replace removed intentionally
                }

                if (isInstructor) {
                    page = page.replace(
                        '<body>',
                        '<body>' + instructorHeader(contentId, contentId)
                    );
                }

                return res.send(page);
            } else {
                // No contentId — render editor for creating new content
                let page = await h5pEditor.render(undefined, 'vi', user as any);
                // Fix cross-origin parent access in Canvas iframe
                page = page.replace(
                    'window.H5PIntegration = parent.H5PIntegration ||',
                    'window.H5PIntegration = (function() { try { return parent.H5PIntegration; } catch(e) { return null; } })() ||'
                );
                // Shim H5PEditor before vi.js
                page = page.replace(
                    '<head>',
                    '<head><script>window.H5PEditor=window.H5PEditor||{};H5PEditor.language=H5PEditor.language||{};H5PEditor.language.core=H5PEditor.language.core||{};</script>'
                );
                // Fix form submit URL (default = current page, which is /lti/launch)
                page = page.replace(
                    "type: 'POST'",
                    "type: 'POST',\n                          url: '/h5p/new'"
                );
                // After save: redirect to player view with new contentId
                const ltik = res.locals.ltik || '';
                page = page.replace(
                    /window\.location\.href\s*=\s*['"][^'"]*\/play\/['"].*?parsedResult\.contentId;/s,
                    `window.location.href = '/lti/launch?contentId=' + parsedResult.contentId + '&ltik=${ltik}';`
                );
                // Cache bust + Vietnamese label
                page = page.replace(
                    /h5peditor\.js\?version=([^"']+)/g,
                    'h5peditor.js?version=$1.fix3'
                );
                page = page.replace(
                    /h5peditor-([^.]+)\.js\?version=([^"']+)/g,
                    'h5peditor-$1.js?version=$2.fix3'
                );
                page = page.replace('value="Create"', 'value="L\u01b0u"');
                return res.send(page);
            }
        } catch (error: any) {
            const statusCode = error.httpStatusCode || 500;
            const isNotFound =
                statusCode === 404 || error.message?.includes('not-found');
            return res
                .status(statusCode)
                .send(
                    errorPageHtml(
                        isNotFound
                            ? 'N\u1ed9i dung kh\u00f4ng t\u1ed3n t\u1ea1i'
                            : '\u0110\u00e3 x\u1ea3y ra l\u1ed7i',
                        isNotFound
                            ? 'N\u1ed9i dung b\u1ea1n y\u00eau c\u1ea7u kh\u00f4ng t\u1ed3n t\u1ea1i ho\u1eb7c \u0111\u00e3 b\u1ecb x\u00f3a.'
                            : 'Kh\u00f4ng th\u1ec3 t\u1ea3i n\u1ed9i dung. Vui l\u00f2ng th\u1eed l\u1ea1i sau.'
                    )
                );
        }
    });

    // Deep linking callback — render H5P editor inline
    lti.onDeepLinking(async (token: any, req: any, res: any) => {
        const user = {
            id: token.user || '1',
            name: token.userInfo?.name || 'LTI User',
            email: token.userInfo?.email || 'lti@example.com',
            type: 'local' as const
        };

        console.log('=== onDeepLinking called ===');

        try {
            // Render H5P editor (create new content) — returns full HTML page
            let editorPage = await h5pEditor.render(
                undefined,
                'vi',
                user as any
            );

            // Fix cross-origin iframe issue: parent.H5PIntegration throws
            // SecurityError when editor is loaded in Canvas iframe (different origin).
            // Replace unsafe parent access with try-catch fallback.
            editorPage = editorPage.replace(
                'window.H5PIntegration = parent.H5PIntegration ||',
                'window.H5PIntegration = (function() { try { return parent.H5PIntegration; } catch(e) { return null; } })() ||'
            );

            // Inject HUTECH theme CSS
            editorPage = editorPage.replace('</head>', THEME_CSS + '</head>');
            // Inject HUTECH editor header after <body>
            editorPage = editorPage.replace(
                '<body>',
                '<body>' + editorHeader()
            );

            // Shim H5PEditor + maximize editor in Canvas iframe
            editorPage = editorPage.replace(
                '<head>',
                `<head>
                <script>window.H5PEditor=window.H5PEditor||{};H5PEditor.language=H5PEditor.language||{};H5PEditor.language.core=H5PEditor.language.core||{};</script>
                <style>
                    html, body { margin: 0; padding: 0; height: 100%; min-height: 100vh; overflow: auto; }
                    .h5p-hub-client { min-height: 75vh !important; width: 100% !important; max-width: none !important; }
                    .h5p-hub-client .hub-content-type-list { max-height: 70vh !important; overflow-y: auto !important; }
                    .h5p-create { min-height: 90vh; width: 100% !important; }
                    .h5p-editor { min-height: 80vh; width: 100% !important; }
                    #h5p-content-form { padding: 0; width: 100% !important; }
                </style>
                <script>
                // Resize iframe within Canvas dialog
                function resizeEditorFrame() {
                    var h = Math.max(document.body.scrollHeight, 600);
                    try {
                        window.parent.postMessage(JSON.stringify({ subject: 'lti.frameResize', height: h }), '*');
                    } catch(e) {}
                }
                window.addEventListener('load', resizeEditorFrame);
                setInterval(resizeEditorFrame, 2000);
                </script>`
            );

            // Fix form submit URL: default renderer's $.ajax() has no URL,
            // which defaults to window.location.href (= /lti/launch in DL context).
            // Must explicitly post to /h5p/new for content creation.
            editorPage = editorPage.replace(
                "type: 'POST'",
                "type: 'POST',\n                          url: '/h5p/new'"
            );

            // Fix redirect after save: default renderer redirects to /h5p/play/:id
            // In Deep Linking context, we need to submit the DL response form instead.
            editorPage = editorPage.replace(
                /window\.location\.href\s*=\s*['"][^'"]*\/play\/['"].*?parsedResult\.contentId;/s,
                `document.getElementById('dl-contentId').value = parsedResult.contentId;
                              document.getElementById('savingOverlay').className = 'dl-saving-overlay active';
                              document.getElementById('dl-form').submit();`
            );

            // Vietnamese button label
            editorPage = editorPage.replace('value="Create"', 'value="Lưu"');

            // Cache bust editor scripts to force browser reload patched version
            editorPage = editorPage.replace(
                /h5peditor\.js\?version=([^"']+)/g,
                'h5peditor.js?version=$1.fix2'
            );
            editorPage = editorPage.replace(
                /h5peditor-([^.]+)\.js\?version=([^"']+)/g,
                'h5peditor-$1.js?version=$2.fix2'
            );

            // ── Deep Linking: Question Bank tab ──
            const dlCourseId =
                token.platformContext?.context?.id ||
                token.platformContext?.custom?.canvas_course_id ||
                '';
            let bankOptionsHtml = '';
            try {
                const banks = await QuestionBank.find({
                    courseId: dlCourseId
                }).select('name');
                const bankCounts = await BankQuestion.aggregate([
                    {
                        $match: {
                            bankId: {
                                $in: banks.map((b: any) => b._id)
                            }
                        }
                    },
                    {
                        $group: {
                            _id: '$bankId',
                            count: { $sum: 1 }
                        }
                    }
                ]);
                const countMap: Record<string, number> = {};
                for (const c of bankCounts) {
                    countMap[String(c._id)] = c.count;
                }
                if (banks.length > 0) {
                    bankOptionsHtml = banks
                        .map(
                            (b: any) =>
                                `<option value="${b._id}">${(b.name || '').replace(/</g, '&lt;')} (${countMap[String(b._id)] || 0} câu)</option>`
                        )
                        .join('');
                }
            } catch (_e) {
                /* ignore */
            }

            const quizTabHtml = bankOptionsHtml
                ? `
                <div id="dl-quiz-tab" style="display:none;padding:20px;font-family:'Segoe UI',Roboto,sans-serif;">
                    <h3 style="margin:0 0 16px;font-size:16px;">Tạo bài tập từ ngân hàng câu hỏi</h3>
                    <div style="margin-bottom:12px;">
                        <label style="font-size:13px;font-weight:600;display:block;margin-bottom:4px;">Tên bài tập *</label>
                        <input type="text" id="dl-assign-name" placeholder="VD: Kiểm tra Chương 1" style="width:100%;padding:8px 12px;border:1px solid #dadce0;border-radius:6px;font-size:14px;box-sizing:border-box;">
                    </div>
                    <div id="dl-groups">
                        <div class="dl-group" style="border:1px solid #dadce0;border-radius:8px;padding:12px;margin-bottom:8px;">
                            <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px;flex-wrap:wrap;">
                                <select class="dl-bank-select" onchange="updateDlCount(this.closest('.dl-group'))" style="flex:2;min-width:150px;padding:6px 8px;border:1px solid #dadce0;border-radius:4px;">
                                    ${bankOptionsHtml}
                                </select>
                                <select class="dl-mode-select" style="padding:6px 8px;border:1px solid #dadce0;border-radius:4px;" onchange="this.closest('.dl-group').querySelector('.dl-pick-row').style.display=this.value==='random'?'flex':'none';updateDlCount(this.closest('.dl-group'))">
                                    <option value="random">Random</option>
                                    <option value="all">Tất cả câu</option>
                                </select>
                            </div>
                            <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px;flex-wrap:wrap;">
                                <select class="dl-type-filter" onchange="updateDlCount(this.closest('.dl-group'))" style="flex:1;padding:6px 8px;border:1px solid #dadce0;border-radius:4px;font-size:12px;">
                                    <option value="">Tất cả loại</option>
                                    <option value="MultiChoice">Trắc nghiệm</option>
                                    <option value="TrueFalse">Đúng/Sai</option>
                                    <option value="Blanks">Điền chỗ trống</option>
                                    <option value="DragQuestion">Kéo thả hình ảnh</option>
                                    <option value="DragText">Kéo thả từ</option>
                                    <option value="MarkTheWords">Đánh dấu từ</option>
                                </select>
                                <select class="dl-diff-filter" onchange="updateDlCount(this.closest('.dl-group'))" style="flex:1;padding:6px 8px;border:1px solid #dadce0;border-radius:4px;font-size:12px;">
                                    <option value="">Tất cả độ khó</option>
                                    <option value="easy">Dễ</option>
                                    <option value="medium">Trung bình</option>
                                    <option value="hard">Khó</option>
                                </select>
                            </div>
                            <div class="dl-pick-row" style="display:flex;gap:8px;align-items:center;">
                                <label style="font-size:12px;">Số câu:</label>
                                <input type="number" class="dl-pick-count" value="5" min="1" max="50" style="width:60px;padding:4px 8px;border:1px solid #dadce0;border-radius:4px;">
                            </div>
                            <div style="margin-top:4px;">
                                <span class="dl-available-count" style="font-size:12px;color:#5f6368;"></span>
                            </div>
                        </div>
                    </div>
                    <button onclick="addDlGroup()" style="padding:6px 12px;font-size:12px;border:1px solid #dadce0;border-radius:4px;background:white;cursor:pointer;margin-bottom:16px;">+ Thêm ngân hàng</button>
                    <div style="display:flex;flex-wrap:wrap;gap:16px;margin-bottom:12px;">
                        <label style="font-size:13px;display:flex;align-items:center;gap:4px;"><input type="checkbox" id="dl-shuffle" checked> Xáo trộn</label>
                        <label style="font-size:13px;display:flex;align-items:center;gap:4px;"><input type="checkbox" id="dl-progress" checked> Tiến trình</label>
                        <input type="hidden" id="dl-pass" value="0">
                        <span style="font-size:13px;">Lượt: <input type="number" id="dl-attempts" value="-1" style="width:50px;padding:2px 4px;border:1px solid #dadce0;border-radius:4px;"></span>
                    </div>
                    <button onclick="createAssignmentFromBank()" style="width:100%;padding:12px;font-size:15px;font-weight:600;background:#0770A3;color:white;border:none;border-radius:6px;cursor:pointer;">Tạo bài tập</button>
                </div>
            `
                : '';

            const dlTabSwitcher = bankOptionsHtml
                ? `
                <div style="display:flex;gap:0;border-bottom:2px solid #dadce0;margin-bottom:0;font-family:'Segoe UI',Roboto,sans-serif;">
                    <button id="dl-tab-content" onclick="showDlTab('content')" style="padding:12px 24px;font-size:14px;font-weight:600;border:none;background:none;cursor:pointer;border-bottom:3px solid #1a73e8;color:#1a73e8;">Tạo nội dung H5P</button>
                    <button id="dl-tab-quiz" onclick="showDlTab('quiz')" style="padding:12px 24px;font-size:14px;font-weight:600;border:none;background:none;cursor:pointer;border-bottom:3px solid transparent;color:#5f6368;">Ngân hàng bài tập H5P</button>
                </div>
                <sc` +
                  `ript>
                var LTIK_DL = '${res.locals?.ltik || ''}';
                var CANVAS_COURSE_ID_DL = '${token.platformContext?.custom?.canvas_course_id || ''}';
                var DL_BANK_OPTIONS = '${bankOptionsHtml.replace(/'/g, "\\'")}';

                function showDlTab(tab) {
                    var contentTab = document.getElementById('dl-content-tab');
                    var quizTab = document.getElementById('dl-quiz-tab');
                    var btnContent = document.getElementById('dl-tab-content');
                    var btnQuiz = document.getElementById('dl-tab-quiz');
                    if (tab === 'content') {
                        if (contentTab) contentTab.style.display = '';
                        if (quizTab) quizTab.style.display = 'none';
                        btnContent.style.borderBottomColor = '#1a73e8'; btnContent.style.color = '#1a73e8';
                        btnQuiz.style.borderBottomColor = 'transparent'; btnQuiz.style.color = '#5f6368';
                    } else {
                        if (contentTab) contentTab.style.display = 'none';
                        if (quizTab) quizTab.style.display = 'block';
                        btnQuiz.style.borderBottomColor = '#1a73e8'; btnQuiz.style.color = '#1a73e8';
                        btnContent.style.borderBottomColor = 'transparent'; btnContent.style.color = '#5f6368';
                        // Auto-update counts when switching to bank tab
                        document.querySelectorAll('.dl-group').forEach(function(g) { updateDlCount(g); });
                    }
                }

                async function updateDlCount(groupEl) {
                    var bankId = groupEl.querySelector('.dl-bank-select').value;
                    var type = groupEl.querySelector('.dl-type-filter')?.value || '';
                    var diff = groupEl.querySelector('.dl-diff-filter')?.value || '';
                    var label = groupEl.querySelector('.dl-available-count');
                    if (!label) return;
                    label.textContent = '...';
                    try {
                        var url = '/api/quiz-bank/banks/' + bankId + '/count?ltik=' + encodeURIComponent(LTIK_DL);
                        if (type) url += '&type=' + type;
                        if (diff) url += '&difficulty=' + diff;
                        var resp = await fetch(url);
                        var data = await resp.json();
                        var count = data.count || 0;
                        var mode = groupEl.querySelector('.dl-mode-select')?.value || 'random';
                        if (mode === 'all') {
                            label.textContent = count + ' câu khả dụng';
                            label.style.color = '#5f6368';
                            label.style.fontWeight = '';
                        } else {
                            label.textContent = count + ' câu khả dụng';
                            label.style.color = '#5f6368';
                            label.style.fontWeight = '';
                        }
                        // Update max
                        var pickInput = groupEl.querySelector('.dl-pick-count');
                        if (pickInput) pickInput.max = count || 50;
                    } catch(e) { label.textContent = ''; }
                }

                function addDlGroup() {
                    var html = '<div class="dl-group" style="border:1px solid #dadce0;border-radius:8px;padding:12px;margin-bottom:8px;">' +
                        '<div style="display:flex;gap:8px;align-items:center;margin-bottom:8px;flex-wrap:wrap;">' +
                            '<select class="dl-bank-select" style="flex:2;min-width:150px;padding:6px 8px;border:1px solid #dadce0;border-radius:4px;">' + DL_BANK_OPTIONS + '</select>' +
                            '<select class="dl-mode-select" style="padding:6px 8px;border:1px solid #dadce0;border-radius:4px;" onchange="this.closest(\\'.dl-group\\').querySelector(\\'.dl-pick-row\\').style.display=this.value===\\'random\\'?\\'flex\\':\\'none\\'">' +
                                '<option value="random">Random</option><option value="all">Tất cả câu</option>' +
                            '</select>' +
                            '<button onclick="this.closest(\\'.dl-group\\').remove()" style="padding:4px 8px;border:1px solid #dadce0;border-radius:4px;background:white;cursor:pointer;">✕</button>' +
                        '</div>' +
                        '<div style="display:flex;gap:8px;align-items:center;margin-bottom:8px;flex-wrap:wrap;">' +
                            '<select class="dl-type-filter" style="flex:1;padding:6px 8px;border:1px solid #dadce0;border-radius:4px;font-size:12px;">' +
                                '<option value="">Tất cả loại</option><option value="MultiChoice">Trắc nghiệm</option><option value="TrueFalse">Đúng/Sai</option><option value="Blanks">Điền chỗ trống</option><option value="DragQuestion">Kéo thả hình ảnh</option><option value="DragText">Kéo thả từ</option><option value="MarkTheWords">Đánh dấu từ</option>' +
                            '</select>' +
                            '<select class="dl-diff-filter" style="flex:1;padding:6px 8px;border:1px solid #dadce0;border-radius:4px;font-size:12px;">' +
                                '<option value="">Tất cả độ khó</option><option value="easy">Dễ</option><option value="medium">Trung bình</option><option value="hard">Khó</option>' +
                            '</select>' +
                        '</div>' +
                        '<div class="dl-pick-row" style="display:flex;gap:8px;align-items:center;">' +
                            '<label style="font-size:12px;">Số câu:</label>' +
                            '<input type="number" class="dl-pick-count" value="3" min="1" max="50" style="width:60px;padding:4px 8px;border:1px solid #dadce0;border-radius:4px;">' +
                        '</div>' +
                    '</div>';
                    document.getElementById('dl-groups').insertAdjacentHTML('beforeend', html);
                }

                async function createAssignmentFromBank() {
                    var name = document.getElementById('dl-assign-name').value.trim();
                    if (!name) { alert('Vui lòng nhập tên bài tập'); return; }

                    var groups = [];
                    document.querySelectorAll('.dl-group').forEach(function(el) {
                        var bankId = el.querySelector('.dl-bank-select').value;
                        var mode = el.querySelector('.dl-mode-select').value;
                        var pickCount = mode === 'random' ? parseInt(el.querySelector('.dl-pick-count').value) || 5 : 999;
                        var typeFilter = el.querySelector('.dl-type-filter')?.value || '';
                        var diffFilter = el.querySelector('.dl-diff-filter')?.value || '';
                        var group = { bankId: bankId, pickCount: pickCount, pointsPerQuestion: 1, filterTypes: [], filterDifficulty: [] };
                        if (typeFilter) group.filterTypes = [typeFilter];
                        if (diffFilter) group.filterDifficulty = [diffFilter];
                        if (bankId) groups.push(group);
                    });
                    if (groups.length === 0) { alert('Vui lòng thêm ít nhất 1 ngân hàng'); return; }

                    var settings = {
                        shuffleQuestions: document.getElementById('dl-shuffle').checked,
                        showProgressBar: document.getElementById('dl-progress').checked,
                        passPercentage: 0,
                        allowedAttempts: parseInt(document.getElementById('dl-attempts').value) || -1
                    };

                    try {
                        // Create quiz
                        var resp = await fetch('/api/quiz/create?ltik=' + encodeURIComponent(LTIK_DL), {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ name: name, description: '', questionGroups: groups, settings: settings })
                        });
                        if (!resp.ok) throw new Error('Lỗi tạo bài tập');
                        var quiz = await resp.json();

                        // Publish
                        var pubResp = await fetch('/api/quiz/publish/' + quiz._id + '?ltik=' + encodeURIComponent(LTIK_DL), {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ canvasCourseId: CANVAS_COURSE_ID_DL })
                        });
                        if (!pubResp.ok) throw new Error('Lỗi xuất bản');

                        // Deep link response
                        document.getElementById('dl-contentId').value = 'quiz_' + quiz._id;
                        document.getElementById('savingOverlay').className = 'dl-saving-overlay active';
                        document.getElementById('dl-form').submit();
                    } catch (err) {
                        alert('Lỗi: ' + err.message);
                    }
                }
                </sc` +
                  `ript>
            `
                : '';

            // Wrap editor content in a div so we can toggle it
            if (bankOptionsHtml) {
                editorPage = editorPage.replace(
                    '<body>',
                    '<body>' + dlTabSwitcher + '<div id="dl-content-tab">'
                );
                editorPage = editorPage.replace(
                    '</body>',
                    '</div>' + quizTabHtml + '</body>'
                );
            }

            // Inject Deep Linking form + saving overlay before </body>
            const dlInjection =
                `
                <style>
                    .dl-saving-overlay {
                        display: none; position: fixed; top: 0; left: 0;
                        width: 100%; height: 100%; background: rgba(255,255,255,0.9);
                        z-index: 99999; justify-content: center; align-items: center;
                        flex-direction: column; font-family: Arial, sans-serif;
                    }
                    .dl-saving-overlay.active { display: flex; }
                    .dl-spinner { width: 40px; height: 40px; border: 4px solid #e0e0e0;
                        border-top-color: #1a73e8; border-radius: 50%;
                        animation: spin 0.8s linear infinite; margin-bottom: 16px; }
                    @keyframes spin { to { transform: rotate(360deg); } }
                </style>
                <div class="dl-saving-overlay" id="savingOverlay">
                    <div class="dl-spinner"></div>
                    <p>Đang lưu và liên kết nội dung...</p>
                </div>
                <form id="dl-form" method="POST" action="/lti/deeplink/respond" style="display:none">
                    <input type="hidden" name="contentId" id="dl-contentId" />
                    <input type="hidden" name="ltik" value="${res.locals.ltik}" />
                </form>
                <` +
                `script>
                (function() {
                    var origOpen = XMLHttpRequest.prototype.open;
                    var origSend = XMLHttpRequest.prototype.send;
                    XMLHttpRequest.prototype.open = function(method, url) {
                        this._h5pUrl = url;
                        this._h5pMethod = method;
                        return origOpen.apply(this, arguments);
                    };
                    XMLHttpRequest.prototype.send = function() {
                        if (this._h5pMethod === 'POST' &&
                            (this._h5pUrl === '/h5p/new' || (this._h5pUrl && this._h5pUrl.indexOf('/h5p/edit') === 0))) {
                            this.addEventListener('load', function() {
                                if (this.status >= 200 && this.status < 300) {
                                    try {
                                        var resp = JSON.parse(this.responseText);
                                        if (resp.contentId) {
                                            document.getElementById('savingOverlay').className = 'dl-saving-overlay active';
                                            document.getElementById('dl-contentId').value = resp.contentId;
                                            document.getElementById('dl-form').submit();
                                        }
                                    } catch(e) {}
                                }
                            });
                        }
                        return origSend.apply(this, arguments);
                    };
                })();
                </` +
                `script>`;

            // Inject before closing </body> tag of the editor page
            const html = editorPage.replace('</body>', dlInjection + '</body>');

            return res.send(html);
        } catch (error: any) {
            return res
                .status(500)
                .send(
                    errorPageHtml(
                        'Lỗi tải trình soạn thảo',
                        'Không thể tải H5P editor. Vui lòng thử lại.'
                    )
                );
        }
    });

    // =====================================================
    // Mount H5P routes on the ltijs Express app
    // =====================================================
    const ltiApp = lti.app;

    // COEP/CORP headers are stripped by nginx proxy_hide_header

    ltiApp.use(bodyParser.json({ limit: '500mb' }));
    ltiApp.use(bodyParser.urlencoded({ extended: true }));

    // File uploads
    ltiApp.use(
        fileUpload({
            limits: { fileSize: h5pEditor.config.maxTotalSize },
            useTempFiles: useTempUploads,
            tempFileDir: useTempUploads ? tmpDir?.path : undefined
        })
    );

    // Cleanup temp files
    if (useTempUploads) {
        ltiApp.use(
            (req: express.Request & { files: any }, res: any, next: any) => {
                res.on('finish', async () => clearTempFiles(req));
                next();
            }
        );
    }

    // Disable caching for h5peditor*.js (patched for cross-origin)
    ltiApp.use('/h5p/editor/scripts', (req: any, res: any, next: any) => {
        if (req.path.includes('h5peditor')) {
            res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
            res.set('Pragma', 'no-cache');
            res.set('Expires', '0');
        }
        next();
    });

    // Inject user object for H5P routes
    ltiApp.use((req: IRequestWithUser, res: any, next: any) => {
        // If we have an LTI token, use that user info; otherwise use default
        if (res.locals && res.locals.token) {
            req.user = {
                id: res.locals.token.user || '1',
                name: res.locals.token.userInfo?.name || 'LTI User',
                email: res.locals.token.userInfo?.email || 'lti@example.com',
                type: 'local'
            } as any;
        } else {
            req.user = new User();
        }
        next();
    });

    // i18next middleware
    ltiApp.use(i18nextHttpMiddleware.handle(i18next));

    // CORS — restrict to Canvas platform origin
    const PLATFORM_URL = requireEnv(
        'PLATFORM_URL',
        'https://canvas.example.com'
    );
    const allowedOrigins = [PLATFORM_URL];
    ltiApp.use((req: any, res: any, next: any) => {
        const origin = req.headers.origin;
        if (origin && allowedOrigins.includes(origin)) {
            res.header('Access-Control-Allow-Origin', origin);
        }
        res.header(
            'Access-Control-Allow-Methods',
            'GET, POST, PUT, DELETE, OPTIONS'
        );
        res.header(
            'Access-Control-Allow-Headers',
            'Content-Type, Authorization'
        );
        if (req.method === 'OPTIONS') {
            return res.sendStatus(200);
        }
        next();
    });

    // =====================================================
    // Quiz Bank API routes (requires LTI auth via ltijs)
    // =====================================================
    ltiApp.use('/api/quiz-bank', quizBankRoutes(h5pEditor, h5pPlayer));
    ltiApp.use('/api/quiz', quizRoutes(h5pEditor));
    ltiApp.use('/api/stats', statisticsRoutes());

    // Quiz session routes (whitelisted under /h5p/)
    ltiApp.use('/h5p/quiz', quizSessionRoutes(h5pEditor));

    // =====================================================
    // Score submission + attempt tracking endpoint
    // =====================================================
    // Score endpoint under /h5p/* so it's whitelisted (accessible from iframe AJAX)
    ltiApp.post('/h5p/submit-score', async (req: any, res: any) => {
        try {
            const {
                contentId: cId,
                score,
                maxScore,
                userId: bodyUserId
            } = req.body;
            if (!cId || score === undefined || !bodyUserId) {
                return res
                    .status(400)
                    .json({ error: 'Missing contentId, score, or userId' });
            }

            const userId = bodyUserId;

            // Save attempt to MongoDB
            await Attempt.create({
                contentId: cId,
                userId,
                score: parseFloat(score) || 0,
                maxScore: parseFloat(maxScore) || 1,
                completedAt: new Date()
            });

            const attemptCount = await Attempt.countDocuments({
                contentId: cId,
                userId
            });

            console.log(
                `Score saved: user=${userId} content=${cId} score=${score}/${maxScore} attempts=${attemptCount}`
            );

            return res.json({
                success: true,
                attempts: attemptCount
            });
        } catch (err: any) {
            console.error('Score submission error:', err.message);
            return res.status(500).json({ error: 'Internal error' });
        }
    });

    // Get attempt count for a student (used by player)
    // Attempts API: returns count + full history
    ltiApp.get(
        '/h5p/attempts/:contentId/:userId',
        async (req: any, res: any) => {
            const { contentId: cId, userId: uId } = req.params;
            const attempts = await (Attempt as any)
                .find({ contentId: cId, userId: uId })
                .sort({ completedAt: 1 })
                .select(
                    'score maxScore duration scaledScore canvasMaxPoints completedAt agsPublished'
                )
                .lean();
            return res.json({
                attempts: attempts.length,
                history: attempts.map((a: any, i: number) => ({
                    attempt: i + 1,
                    score: a.score,
                    maxScore: a.maxScore,
                    percentage:
                        a.maxScore > 0
                            ? Math.round((a.score / a.maxScore) * 100)
                            : 0,
                    duration: a.duration || 0,
                    completedAt: a.completedAt
                }))
            });
        }
    );

    // =====================================================
    // Hook H5P finishedData: save attempt + publish grade to Canvas AGS
    // This runs BEFORE H5P's own finishedData handler
    // =====================================================
    ltiApp.post('/h5p/finishedData', async (req: any, res: any, next: any) => {
        try {
            const {
                contentId: cId,
                score,
                maxScore,
                opened,
                finished,
                time
            } = req.body;

            // Skip grade tracking for practice mode
            const session = await QuizSession.findOne({
                composedContentId: cId
            });
            if (!session && cId?.startsWith('quiz-')) {
                console.log(
                    'Practice mode finishedData — skipping grade tracking'
                );
                return next();
            }

            // Find the STUDENT token for this content from token store
            // (req.user.id = "1" for whitelisted routes like /h5p/finishedData)
            // Prefer student (Learner) token over instructor token
            let userId = req.user?.id || 'unknown';
            let storedTokenForUser: any = null;
            const candidates: any[] = [];
            // For quiz composed content (quiz-{ts}-{rand}), find token by quizId
            if (cId.startsWith('quiz-')) {
                const session = await QuizSession.findOne({
                    composedContentId: cId
                });
                if (session) {
                    const qId = String(session.quizId);
                    const tokensByQuiz = await ltiTokenStore.findByPattern(
                        `_quiz_${qId}$`
                    );
                    for (const [, tok] of tokensByQuiz) {
                        candidates.push(tok);
                    }
                }
            }
            // Also check exact contentId match
            const allTokens = await ltiTokenStore.entries();
            for (const [key, tok] of allTokens) {
                if (key.endsWith(`_${cId}`)) {
                    candidates.push(tok);
                }
            }
            // Prefer student token (Learner role, not Instructor)
            const studentToken = candidates.find((t: any) => {
                const roles = t.platformContext?.roles || [];
                return roles.some((r: string) => r.includes('Learner'));
            });
            storedTokenForUser =
                studentToken || candidates[candidates.length - 1] || null;
            if (storedTokenForUser) {
                userId = storedTokenForUser.user || userId;
            }

            if (cId && score !== undefined && maxScore !== undefined) {
                const rawScore = parseFloat(score) || 0;
                const rawMax = parseFloat(maxScore) || 1;
                const duration = parseInt(time) || 0;
                const percentage =
                    rawMax > 0 ? Math.round((rawScore / rawMax) * 100) : 0;

                // Canvas assignment always has 10 points (set during publish)
                const canvasMaxPoints = 10;

                const scaledScore =
                    rawMax > 0
                        ? Math.round(
                              (rawScore / rawMax) * canvasMaxPoints * 100
                          ) / 100
                        : 0;

                // 1. Save attempt to MongoDB
                const attempt = await Attempt.create({
                    contentId: cId,
                    userId,
                    score: rawScore,
                    maxScore: rawMax,
                    duration,
                    scaledScore,
                    canvasMaxPoints,
                    agsPublished: false,
                    completedAt: new Date()
                });

                const attemptCount = await Attempt.countDocuments({
                    contentId: cId,
                    userId
                });
                console.log(
                    `finishedData: user=${userId} content=${cId} score=${rawScore}/${rawMax} (${percentage}%) duration=${duration}s attempts=${attemptCount}`
                );

                // 1b. Check if this is a composed quiz content → update QuizSession
                const quizSession = await QuizSession.findOne({
                    composedContentId: cId,
                    status: 'active'
                });
                if (quizSession) {
                    quizSession.status = 'submitted';
                    quizSession.score = rawScore;
                    quizSession.maxScore = rawMax;
                    quizSession.duration = duration;
                    quizSession.submittedAt = new Date();
                    await quizSession.save();
                    console.log(
                        `QuizSession ${quizSession._id} submitted: ${rawScore}/${rawMax}`
                    );

                    // Find quiz-specific LTI token for AGS
                    // Use quizSession.userId (LTI user ID) instead of req.user.id ("1")
                    if (!storedTokenForUser) {
                        const sessionUserId = quizSession.userId || userId;
                        const quizId = String(quizSession.quizId);
                        // Try exact key: {ltiUserId}_quiz_{quizId}
                        const exactToken = await ltiTokenStore.get(
                            `${sessionUserId}_quiz_${quizId}`
                        );
                        if (exactToken) {
                            storedTokenForUser = exactToken;
                            userId = sessionUserId;
                            console.log(
                                `Found token by exact key: ${sessionUserId}_quiz_${quizId}`
                            );
                        } else {
                            // Fallback: search by prefix
                            const quizTokens =
                                await ltiTokenStore.findByPattern(
                                    `_quiz_${quizId}$`
                                );
                            for (const [, tok] of quizTokens) {
                                storedTokenForUser = tok;
                                userId = tok.user || sessionUserId;
                                break;
                            }
                        }
                    }
                }

                // 2. Publish grade to Canvas via LTI AGS
                if (storedTokenForUser) {
                    try {
                        // Get Canvas assignment max points from lineitem
                        let lineitemMax = 10; // default
                        try {
                            const lineitemUrl =
                                storedTokenForUser.platformContext?.endpoint
                                    ?.lineitem;
                            if (lineitemUrl) {
                                const lineitem = await lti.Grade.getLineItems(
                                    storedTokenForUser,
                                    { resourceLinkId: false }
                                );
                                if (lineitem && lineitem.length > 0) {
                                    lineitemMax =
                                        lineitem[0].scoreMaximum || 10;
                                }
                            }
                        } catch (_e) {
                            /* use default */
                        }

                        // Scale: (h5pScore/h5pMax) * canvasMax
                        // Example: 1/1 * 10 = 10, or 3/5 * 10 = 6
                        const pct = rawMax > 0 ? rawScore / rawMax : 0;
                        const canvasScore =
                            Math.round(pct * lineitemMax * 100) / 100;

                        const scoreData = {
                            scoreGiven: canvasScore,
                            scoreMaximum: lineitemMax,
                            activityProgress: 'Completed',
                            gradingProgress: 'FullyGraded',
                            userId: storedTokenForUser.user,
                            timestamp: new Date().toISOString()
                        };
                        await lti.Grade.scorePublish(
                            storedTokenForUser,
                            scoreData
                        );
                        await Attempt.updateOne(
                            { _id: attempt._id },
                            { agsPublished: true }
                        );
                        // Also mark quiz session if applicable
                        if (quizSession) {
                            quizSession.agsPublished = true;
                            await quizSession.save();
                        }
                        console.log(
                            `AGS grade published: user=${userId} canvasScore=${canvasScore}/${lineitemMax} (raw=${rawScore}/${rawMax} = ${Math.round(pct * 100)}%)`
                        );
                    } catch (agsErr: any) {
                        console.error(
                            'AGS grade publish failed:',
                            agsErr.message
                        );
                    }
                }
            }
        } catch (err: any) {
            console.error('finishedData hook error:', err.message);
        }
        next();
    });

    // Load Vietnamese hub translations for content type names
    let hubViTranslations: Record<string, any> = {};
    try {
        const hubViPath = path.join(
            __dirname,
            '../../../node_modules/@lumieducation/h5p-server/build/assets/translations/hub/vi.json'
        );
        const altPath = path.join(
            __dirname,
            '../../../packages/h5p-server/build/assets/translations/hub/vi.json'
        );
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const fs = require('fs');
        const viPath = fs.existsSync(hubViPath) ? hubViPath : altPath;
        hubViTranslations = JSON.parse(fs.readFileSync(viPath, 'utf-8'));
        console.log(
            `Loaded ${Object.keys(hubViTranslations).length} hub Vietnamese translations`
        );
    } catch (_e) {
        console.warn('Could not load hub/vi.json translations');
    }

    // Rewrite H5P Hub: icons to local, titles/descriptions to Vietnamese
    ltiApp.use(
        `${h5pEditor.config.baseUrl}/ajax`,
        (req: any, res: any, next: any) => {
            if (req.query?.action === 'content-type-cache') {
                const originalJson = res.json.bind(res);
                res.json = (body: any) => {
                    try {
                        const libs = body?.libraries || body;
                        if (Array.isArray(libs)) {
                            for (const lib of libs) {
                                // Rewrite icons to local
                                if (lib.icon && lib.machineName) {
                                    lib.icon = `/h5p-icons/${lib.machineName}.svg`;
                                }
                                // Rewrite screenshots to local
                                if (
                                    Array.isArray(lib.screenshots) &&
                                    lib.machineName
                                ) {
                                    lib.screenshots = lib.screenshots.map(
                                        (s: any, i: number) => ({
                                            ...s,
                                            url: `/h5p-screenshots/${lib.machineName}_${i}.png`
                                        })
                                    );
                                }
                                // Translate title + summary + description to Vietnamese
                                const key = lib.machineName?.replace(
                                    /\./g,
                                    '_'
                                );
                                const viData = hubViTranslations[key];
                                if (viData) {
                                    if (viData.title) lib.title = viData.title;
                                    if (viData.summary)
                                        lib.summary = viData.summary;
                                    if (viData.description)
                                        lib.description = viData.description;
                                }
                            }
                        }
                    } catch (_e) {
                        // pass through on error
                    }
                    return originalJson(body);
                };
            }
            next();
        }
    );

    // Fix: H5P editor sends form-encoded POST for libraries
    // but h5p-server expects JSON array of strings
    ltiApp.post(
        `${h5pEditor.config.baseUrl}/ajax`,
        (req: any, _res: any, next: any) => {
            if (req.query?.action === 'files') {
                console.log(
                    'POST files:',
                    'hasField=',
                    'field' in (req.body || {}),
                    'hasFile=',
                    !!req.files?.file,
                    'body keys=',
                    Object.keys(req.body || {}).join(',')
                );
            }
            if (req.query?.action === 'libraries' && req.body) {
                // H5P editor sends libraries as "libraries[]" key
                const raw = req.body['libraries[]'] || req.body.libraries;
                if (raw && !Array.isArray(raw)) {
                    if (typeof raw === 'string') {
                        // Single library: "H5P.Summary 1.10"
                        req.body.libraries = [raw];
                    } else if (typeof raw === 'object') {
                        // Object format: {0: {machineName, ...}, ...}
                        const libs: string[] = [];
                        for (const key of Object.keys(raw)) {
                            const lib = raw[key];
                            if (typeof lib === 'string') {
                                libs.push(lib);
                            } else if (lib?.machineName) {
                                libs.push(
                                    `${lib.machineName} ${lib.majorVersion}.${lib.minorVersion}`
                                );
                            }
                        }
                        req.body.libraries = libs;
                    }
                } else if (Array.isArray(raw)) {
                    req.body.libraries = raw;
                }
                delete req.body['libraries[]'];
            }
            next();
        }
    );

    // H5P Ajax routes
    ltiApp.use(
        h5pEditor.config.baseUrl,
        h5pAjaxExpressRouter(
            h5pEditor,
            path.resolve(path.join(__dirname, '../h5p/core')),
            path.resolve(path.join(__dirname, '../h5p/editor')),
            undefined,
            'auto'
        )
    );

    // H5P page routes (create, edit, play, delete)
    // Ensure req.user is set even for whitelisted routes (bypass ltijs middleware)
    ltiApp.use(
        h5pEditor.config.baseUrl,
        (req: any, res: any, next: any) => {
            if (!req.user) {
                if (res.locals && res.locals.token) {
                    req.user = {
                        id: res.locals.token.user || '1',
                        name: res.locals.token.userInfo?.name || 'LTI User',
                        email:
                            res.locals.token.userInfo?.email ||
                            'lti@example.com',
                        type: 'local'
                    };
                } else {
                    req.user = new User();
                }
            }
            next();
        },
        expressRoutes(h5pEditor, h5pPlayer, 'vi')
    );

    // Library administration
    ltiApp.use(
        `${h5pEditor.config.baseUrl}/libraries`,
        libraryAdministrationExpressRouter(h5pEditor)
    );

    // Content type cache
    ltiApp.use(
        `${h5pEditor.config.baseUrl}/content-type-cache`,
        contentTypeCacheExpressRouter(h5pEditor.contentTypeCache)
    );

    // Deep linking response handler
    ltiApp.post('/lti/deeplink/respond', async (req: any, res: any) => {
        try {
            const rawContentId = req.body.contentId;

            // Check if this is a quiz link (quiz_<quizId>)
            if (rawContentId && rawContentId.startsWith('quiz_')) {
                const quizId = rawContentId.replace('quiz_', '');
                const quiz = await Quiz.findById(quizId);
                const quizTitle = quiz?.name || `Quiz #${quizId}`;

                const items = [
                    {
                        type: 'ltiResourceLink',
                        title: quizTitle,
                        url: `${H5P_PUBLIC_URL}/lti/launch?quizId=${quizId}`,
                        custom: {
                            quiz_id: quizId
                        },
                        lineItem: {
                            scoreMaximum: 10,
                            label: quizTitle,
                            resourceId: `quiz_${quizId}`
                        }
                    }
                ];
                const form = await lti.DeepLinking.createDeepLinkingForm(
                    res.locals.token,
                    items,
                    { message: 'Bài kiểm tra H5P đã được liên kết thành công!' }
                );
                return res.send(form);
            }

            // Regular H5P content
            const contentId = validateContentId(rawContentId);
            if (!contentId) {
                return res
                    .status(400)
                    .send(
                        errorPageHtml(
                            'Yêu cầu không hợp lệ',
                            'Mã nội dung không hợp lệ.'
                        )
                    );
            }
            let contentTitle = `H5P #${contentId}`;
            try {
                const dlUser = {
                    id: res.locals.token?.user || '1',
                    name: 'LTI User',
                    email: 'lti@example.com',
                    type: 'local' as const
                };
                const meta = await h5pEditor.contentManager.getContentMetadata(
                    contentId,
                    dlUser as any
                );
                if (meta.title) {
                    contentTitle = meta.title;
                }
            } catch (_e) {
                // Use default title
            }

            const items = [
                {
                    type: 'ltiResourceLink',
                    title: contentTitle,
                    url: `${H5P_PUBLIC_URL}/lti/launch?contentId=${contentId}`,
                    custom: {
                        content_id: contentId
                    }
                }
            ];
            const form = await lti.DeepLinking.createDeepLinkingForm(
                res.locals.token,
                items,
                { message: 'Nội dung H5P đã được liên kết thành công!' }
            );
            return res.send(form);
        } catch (error: any) {
            return res
                .status(500)
                .send(
                    errorPageHtml(
                        'L\u1ed7i li\u00ean k\u1ebft n\u1ed9i dung',
                        'Kh\u00f4ng th\u1ec3 li\u00ean k\u1ebft n\u1ed9i dung. Vui l\u00f2ng th\u1eed l\u1ea1i.'
                    )
                );
        }
    });

    // Start page
    ltiApp.get('/', startPageRenderer(h5pEditor));

    // Static files
    ltiApp.use('/client', express.static(path.join(__dirname, 'client')));
    ltiApp.use('/', express.static(path.join(__dirname, '../public')));

    // Cleanup on shutdown
    if (useTempUploads) {
        [
            'beforeExit',
            'uncaughtException',
            'unhandledRejection',
            'SIGQUIT',
            'SIGABRT',
            'SIGSEGV',
            'SIGTERM'
        ].forEach((evt) =>
            process.on(evt, async () => {
                await tmpDir?.cleanup();
                tmpDir = null;
            })
        );
    }

    const port = process.env.PORT || '8080';

    // =====================================================
    // Deploy ltijs (starts server + connects to MongoDB)
    // =====================================================
    await lti.deploy({ port: parseInt(port) });

    // Start quiz session cleanup job
    startQuizCleanup(h5pEditor.contentManager);

    // Register Canvas platform
    // Always register (using a placeholder clientId if the real one is not set yet)
    // so that ltijs generates the RSA key pair and the JWKS endpoint returns valid keys.
    // Canvas requires a non-empty JWKS when creating a Developer Key.
    const LTI_CLIENT_ID = process.env.LTI_CLIENT_ID;
    const CANVAS_ISSUER = process.env.CANVAS_ISSUER || PLATFORM_URL;

    await lti.registerPlatform({
        url: CANVAS_ISSUER,
        name: 'Canvas',
        clientId: LTI_CLIENT_ID || 'pending-registration',
        authenticationEndpoint: `${PLATFORM_URL}/api/lti/authorize_redirect`,
        accesstokenEndpoint: `${PLATFORM_URL}/login/oauth2/token`,
        authConfig: {
            method: 'JWK_SET',
            key: `${PLATFORM_URL}/api/lti/security/jwks`
        }
    });

    if (LTI_CLIENT_ID) {
        console.log('Canvas platform registered:');
        console.log('  Issuer:    %s', CANVAS_ISSUER);
        console.log('  Instance:  %s', PLATFORM_URL);
        console.log('  Client ID: %s', LTI_CLIENT_ID);
    } else {
        console.log('Canvas platform registered with placeholder clientId.');
        console.log(
            'LTI_CLIENT_ID not set. Set it after creating a Developer Key in Canvas Admin.'
        );
    }

    console.log('LTI Endpoints:');
    console.log('  Login URL:  %s/lti/login', H5P_PUBLIC_URL);
    console.log('  Launch URL: %s/lti/launch', H5P_PUBLIC_URL);
    console.log('  Keyset URL: %s/lti/keys', H5P_PUBLIC_URL);
    console.log('H5P Demo: %s/', H5P_PUBLIC_URL);

    displayIps(port);
};

start();
