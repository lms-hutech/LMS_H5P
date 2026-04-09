/**
 * MongoDB schemas for the H5P Question Bank & Quiz system.
 */
import mongoose from 'mongoose';

import {
    SUPPORTED_QUESTION_TYPES,
    type IQuestionBankDoc,
    type IBankQuestionDoc,
    type IQuizDoc,
    type IQuizSessionDoc
} from './types';

// ── QuestionBank ──

const questionBankSchema = new mongoose.Schema<IQuestionBankDoc>(
    {
        courseId: { type: String, required: true, index: true },
        name: { type: String, required: true },
        description: { type: String, default: '' },
        tags: [{ type: String }],
        createdBy: { type: String, required: true }
    },
    { timestamps: true }
);
questionBankSchema.index({ courseId: 1, name: 1 });

// ── BankQuestion ──

const contentSnapshotSchema = new mongoose.Schema(
    {
        params: { type: mongoose.Schema.Types.Mixed, required: true },
        metadata: { type: mongoose.Schema.Types.Mixed, required: true },
        library: { type: String, required: true }
    },
    { _id: false }
);

const bankQuestionSchema = new mongoose.Schema<IBankQuestionDoc>(
    {
        bankId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'QuestionBank',
            required: true,
            index: true
        },
        h5pContentId: { type: String, required: true },
        contentSnapshot: { type: contentSnapshotSchema, required: true },
        questionType: {
            type: String,
            enum: SUPPORTED_QUESTION_TYPES,
            required: true
        },
        title: { type: String, default: '' },
        tags: [{ type: String }],
        difficulty: {
            type: String,
            enum: ['easy', 'medium', 'hard'],
            default: 'medium'
        },
        points: { type: Number, default: 1 },
        contentFiles: [{ type: String }],
        contentHash: { type: String, default: '' },
        sourceDocument: { type: String, default: '' },
        createdBy: { type: String, required: true }
    },
    { timestamps: true }
);
bankQuestionSchema.index({ bankId: 1, questionType: 1 });
bankQuestionSchema.index({ bankId: 1, tags: 1 });
bankQuestionSchema.index({ bankId: 1, contentHash: 1 });

// ── Quiz ──

const quizQuestionGroupSchema = new mongoose.Schema(
    {
        bankId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'QuestionBank',
            required: true
        },
        pickCount: { type: Number, required: true },
        pointsPerQuestion: { type: Number, default: 1 },
        filterTags: [{ type: String }],
        filterDifficulty: [{ type: String }],
        filterTypes: [{ type: String }]
    },
    { _id: false }
);

const questionSnapshotSchema = new mongoose.Schema(
    {
        questionId: { type: mongoose.Schema.Types.ObjectId },
        groupIndex: { type: Number },
        params: { type: mongoose.Schema.Types.Mixed },
        metadata: { type: mongoose.Schema.Types.Mixed },
        library: { type: String },
        contentFiles: [{ type: String }],
        sourceH5pContentId: { type: String }
    },
    { _id: false }
);

const quizSchema = new mongoose.Schema<IQuizDoc>(
    {
        courseId: { type: String, required: true, index: true },
        name: { type: String, required: true },
        description: { type: String, default: '' },
        questionGroups: [quizQuestionGroupSchema],
        settings: {
            shuffleQuestions: { type: Boolean, default: true },
            showProgressBar: { type: Boolean, default: true },
            showInstantFeedback: { type: Boolean, default: false },
            passPercentage: { type: Number, default: 0 },
            allowedAttempts: { type: Number, default: -1 }
        },
        questionSnapshots: [questionSnapshotSchema],
        status: {
            type: String,
            enum: ['draft', 'published'],
            default: 'draft'
        },
        ltiResourceLinkId: { type: String, sparse: true },
        canvasAssignmentId: { type: String, sparse: true },
        canvasCourseId: { type: String, sparse: true },
        createdBy: { type: String, required: true }
    },
    { timestamps: true }
);

// ── QuizSession ──

const quizSessionSchema = new mongoose.Schema<IQuizSessionDoc>(
    {
        quizId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Quiz',
            required: true,
            index: true
        },
        userId: { type: String, required: true, index: true },
        userName: { type: String, default: '' },
        courseId: { type: String, required: true },
        selectedQuestionIndices: [{ type: Number }],
        composedContentId: { type: String },
        status: {
            type: String,
            enum: ['active', 'submitted', 'graded', 'expired'],
            default: 'active'
        },
        startedAt: { type: Date, default: Date.now },
        submittedAt: { type: Date },
        score: { type: Number },
        maxScore: { type: Number },
        duration: { type: Number },
        agsPublished: { type: Boolean, default: false },
        expiresAt: { type: Date }
    },
    { timestamps: true }
);
quizSessionSchema.index({ quizId: 1, userId: 1 });
quizSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// ── GenerationCache ──

const generationCacheSchema = new mongoose.Schema({
    promptHash: {
        type: String,
        required: true,
        unique: true
    },
    questions: {
        type: mongoose.Schema.Types.Mixed,
        required: true
    },
    createdAt: {
        type: Date,
        default: Date.now,
        expires: 86400
    }
});

// ── Models ──

export const QuestionBank =
    mongoose.models.QuestionBank ||
    mongoose.model<IQuestionBankDoc>('QuestionBank', questionBankSchema);

export const BankQuestion =
    mongoose.models.BankQuestion ||
    mongoose.model<IBankQuestionDoc>('BankQuestion', bankQuestionSchema);

export const Quiz =
    mongoose.models.Quiz || mongoose.model<IQuizDoc>('Quiz', quizSchema);

export const QuizSession =
    mongoose.models.QuizSession ||
    mongoose.model<IQuizSessionDoc>('QuizSession', quizSessionSchema);

export const GenerationCache =
    mongoose.models.GenerationCache ||
    mongoose.model('GenerationCache', generationCacheSchema);
