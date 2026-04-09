/**
 * TypeScript interfaces for the H5P Question Bank & Quiz system.
 */
import { Document, Types } from 'mongoose';

// ── Supported question types ──

export const SUPPORTED_QUESTION_TYPES = [
    'MultiChoice',
    'TrueFalse',
    'Blanks',
    'DragQuestion',
    'DragText',
    'MarkTheWords',
    'SingleChoiceSet',
    'MultiMediaChoice',
    'InteractiveVideo'
] as const;

export type QuestionType = (typeof SUPPORTED_QUESTION_TYPES)[number];

/**
 * Maps H5P library machineName to our QuestionType enum.
 */
export const LIBRARY_TO_TYPE: Record<string, QuestionType> = {
    'H5P.MultiChoice': 'MultiChoice',
    'H5P.TrueFalse': 'TrueFalse',
    'H5P.Blanks': 'Blanks',
    'H5P.DragQuestion': 'DragQuestion',
    'H5P.DragText': 'DragText',
    'H5P.MarkTheWords': 'MarkTheWords',
    'H5P.SingleChoiceSet': 'SingleChoiceSet',
    'H5P.MultiMediaChoice': 'MultiMediaChoice',
    'H5P.InteractiveVideo': 'InteractiveVideo'
};

export const TYPE_TO_LABEL_VI: Record<QuestionType, string> = {
    MultiChoice: 'Trắc nghiệm',
    TrueFalse: 'Đúng/Sai',
    Blanks: 'Điền vào chỗ trống',
    DragQuestion: 'Kéo thả hình ảnh',
    DragText: 'Kéo thả từ',
    MarkTheWords: 'Đánh dấu từ',
    SingleChoiceSet: 'Chọn 1 đáp án',
    MultiMediaChoice: 'Trắc nghiệm media',
    InteractiveVideo: 'Video tương tác'
};

export type Difficulty = 'easy' | 'medium' | 'hard';
export type QuizStatus = 'draft' | 'published';
export type SessionStatus = 'active' | 'submitted' | 'graded' | 'expired';

// ── Content Snapshot ──

export interface IContentSnapshot {
    params: any;
    metadata: any;
    library: string; // e.g. "H5P.MultiChoice 1.16"
}

// ── Question Bank ──

export interface IQuestionBank {
    courseId: string;
    name: string;
    description: string;
    tags: string[];
    createdBy: string;
    createdAt: Date;
    updatedAt: Date;
}

export interface IQuestionBankDoc extends IQuestionBank, Document {}

// ── Bank Question ──

export interface IBankQuestion {
    bankId: Types.ObjectId;
    h5pContentId: string;
    contentSnapshot: IContentSnapshot;
    questionType: QuestionType;
    title: string;
    tags: string[];
    difficulty: Difficulty;
    points: number;
    contentFiles: string[];
    contentHash: string;
    sourceDocument: string;
    createdBy: string;
    createdAt: Date;
    updatedAt: Date;
}

export interface IBankQuestionDoc extends IBankQuestion, Document {}

// ── Quiz ──

export interface IQuizQuestionGroup {
    bankId: Types.ObjectId;
    pickCount: number;
    pointsPerQuestion: number;
    filterTags: string[];
    filterDifficulty: string[];
    filterTypes: string[];
}

export interface IQuestionSnapshot {
    questionId: Types.ObjectId;
    groupIndex: number;
    params: any;
    metadata: any;
    library: string;
    contentFiles: string[];
    sourceH5pContentId: string;
}

export interface IQuizSettings {
    shuffleQuestions: boolean;
    showProgressBar: boolean;
    showInstantFeedback: boolean;
    passPercentage: number;
    allowedAttempts: number; // -1 = unlimited
}

export interface IQuiz {
    courseId: string;
    name: string;
    description: string;
    questionGroups: IQuizQuestionGroup[];
    settings: IQuizSettings;
    questionSnapshots: IQuestionSnapshot[];
    status: QuizStatus;
    ltiResourceLinkId?: string;
    canvasAssignmentId?: string;
    canvasCourseId?: string;
    createdBy: string;
    createdAt: Date;
    updatedAt: Date;
}

export interface IQuizDoc extends IQuiz, Document {}

// ── Quiz Session ──

export interface IQuizSession {
    quizId: Types.ObjectId;
    userId: string;
    userName?: string;
    courseId: string;
    selectedQuestionIndices: number[];
    composedContentId?: string;
    status: SessionStatus;
    startedAt: Date;
    submittedAt?: Date;
    score?: number;
    maxScore?: number;
    duration?: number;
    agsPublished: boolean;
    expiresAt: Date;
}

export interface IQuizSessionDoc extends IQuizSession, Document {}
