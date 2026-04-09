/**
 * Server-rendered HTML dashboard for H5P Quiz Bank management.
 * Renders inside Canvas LTI iframe (course_navigation placement).
 */
import { THEME_CSS } from '../hutechTheme';
import { TYPE_TO_LABEL_VI } from './types';

const HUTECH_LOGO = `<img src="/hutech_logo.png" alt="HUTECH" style="height:56px;width:auto;object-fit:contain;">`;

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

const DIFFICULTY_LABELS: Record<string, string> = {
    easy: 'Dễ',
    medium: 'Trung bình',
    hard: 'Khó'
};

const DIFFICULTY_COLORS: Record<string, string> = {
    easy: '#2e7d32',
    medium: '#f57c00',
    hard: '#c62828'
};

/**
 * Renders the full dashboard page with 3 tabs.
 */
export function renderDashboard(
    courseId: string,
    courseName: string,
    h5pBaseUrl: string,
    ltik: string = '',
    canvasCourseId: string = ''
): string {
    return `<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>H5P Quizzes — ${escapeHtml(courseName)}</title>
${THEME_CSS}
<style>
/* Dashboard-specific styles */
* { box-sizing: border-box; }
body { margin: 0; background: var(--h-surface-alt); font-family: var(--h-font); }

.dashboard-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 16px 24px; background: white;
    border-bottom: 2px solid var(--h-border);
}
.dashboard-header .brand { display: flex; align-items: center; gap: 16px; }
.dashboard-header .title { font-size: 18px; font-weight: 600; color: var(--h-text); }
.dashboard-header .course-name { font-size: 14px; color: var(--h-text-sec); }

/* Tabs */
.tab-bar {
    display: flex; gap: 0; background: white;
    border-bottom: 1px solid var(--h-border);
    padding: 0 24px;
}
.tab-btn {
    padding: 14px 24px; font-size: 14px; font-weight: 600;
    color: var(--h-text-sec); background: none; border: none;
    cursor: pointer; border-bottom: 3px solid transparent;
    transition: all 0.2s; font-family: var(--h-font);
}
.tab-btn:hover { color: var(--h-primary); }
.tab-btn.active {
    color: var(--h-primary); border-bottom-color: var(--h-primary);
}
.tab-content { display: none; padding: 24px; }
.tab-content.active { display: block; }

/* Cards */
.card {
    background: white; border-radius: var(--h-radius);
    box-shadow: var(--h-shadow); padding: 20px; margin-bottom: 16px;
}
.card-header {
    display: flex; align-items: center; justify-content: space-between;
    margin-bottom: 16px;
}
.card-title { font-size: 16px; font-weight: 600; color: var(--h-text); }

/* Bank list */
.bank-item {
    display: flex; align-items: center; justify-content: space-between;
    padding: 14px 16px; border: 1px solid var(--h-border);
    border-radius: 6px; margin-bottom: 8px; background: white;
    transition: all 0.2s; cursor: pointer;
}
.bank-item:hover { border-color: var(--h-primary); box-shadow: 0 2px 8px rgba(26,115,232,0.1); }
.bank-item.active { border-color: var(--h-primary); background: #e8f0fe; }
.bank-item .info { display: flex; align-items: center; gap: 12px; }
.bank-item .icon { font-size: 20px; }
.bank-item .name { font-weight: 600; font-size: 14px; }
.bank-item .count { font-size: 13px; color: var(--h-text-sec); }
.bank-item .actions { display: flex; gap: 6px; }

/* Question list */
.question-table { width: 100%; border-collapse: collapse; }
.question-table th {
    text-align: left; padding: 10px 12px; font-size: 13px;
    color: var(--h-text-sec); border-bottom: 2px solid var(--h-border);
    font-weight: 600;
}
.question-table td {
    padding: 10px 12px; font-size: 14px;
    border-bottom: 1px solid var(--h-border);
}
.question-table tr:hover { background: var(--h-surface-alt); }

/* Badge */
.type-badge {
    display: inline-block; padding: 3px 10px; border-radius: 12px;
    font-size: 12px; font-weight: 600; background: #e8f0fe; color: var(--h-primary);
}
.diff-badge {
    display: inline-block; padding: 3px 10px; border-radius: 12px;
    font-size: 12px; font-weight: 600; color: white;
}

/* Inline edit controls */
.inline-edit-select {
    padding: 4px 8px; border: 1px solid var(--h-border); border-radius: 4px;
    font-size: 12px; background: white; cursor: pointer; font-family: var(--h-font);
}
.inline-edit-select:focus { border-color: var(--h-primary); outline: none; }
.inline-edit-number {
    padding: 4px 8px; border: 1px solid var(--h-border); border-radius: 4px;
    font-size: 13px; width: 60px; text-align: center; font-family: var(--h-font);
}
.inline-edit-number:focus { border-color: var(--h-primary); outline: none; }

/* Action buttons */
.icon-btn {
    padding: 6px 8px; border: none; background: none; cursor: pointer;
    border-radius: 4px; font-size: 16px; color: var(--h-text-sec);
    transition: all 0.15s;
}
.icon-btn:hover { background: var(--h-surface-alt); color: var(--h-text); }
.icon-btn.danger:hover { background: #ffebee; color: var(--h-danger); }

/* Forms */
.form-group { margin-bottom: 16px; }
.form-label { display: block; font-size: 13px; font-weight: 600; margin-bottom: 6px; color: var(--h-text-sec); }
.form-input, .form-select {
    width: 100%; padding: 10px 12px; border: 1px solid var(--h-border);
    border-radius: 6px; font-size: 14px; font-family: var(--h-font);
    transition: border-color 0.2s;
}
.form-input:focus, .form-select:focus { outline: none; border-color: var(--h-primary); }

/* Modal */
.modal-overlay {
    display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.5);
    z-index: 1000; justify-content: center; align-items: center;
}
.modal-overlay.active { display: flex; }
.modal {
    background: white; border-radius: 12px; width: 500px; max-width: 90vw;
    max-height: 80vh; overflow-y: auto; box-shadow: var(--h-shadow-lg);
}
.modal-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 16px 20px; border-bottom: 1px solid var(--h-border);
}
.modal-header h3 { margin: 0; font-size: 16px; }
.modal-body { padding: 20px; }
.modal-footer {
    display: flex; justify-content: flex-end; gap: 8px;
    padding: 12px 20px; border-top: 1px solid var(--h-border);
}

/* Empty state */
.empty-state {
    text-align: center; padding: 48px 24px; color: var(--h-text-sec);
}
.empty-state .icon { font-size: 48px; margin-bottom: 12px; opacity: 0.5; }
.empty-state p { font-size: 14px; margin: 0; }

/* Filters */
.filter-bar {
    display: flex; align-items: center; gap: 12px;
    padding: 12px 0; flex-wrap: wrap;
}
.filter-bar select {
    padding: 6px 12px; border: 1px solid var(--h-border);
    border-radius: 6px; font-size: 13px; background: white;
}

/* Loading */
.spinner {
    display: inline-block; width: 20px; height: 20px;
    border: 2px solid var(--h-border); border-top-color: var(--h-primary);
    border-radius: 50%; animation: spin 0.6s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

/* Iframe for H5P editor */
.h5p-editor-frame {
    width: 100%; border: none; min-height: 500px;
    border-radius: 0 0 8px 8px;
}

/* Responsive */
@media (max-width: 768px) {
    .dashboard-header { padding: 12px 16px; }
    .tab-content { padding: 16px; }
    .tab-btn { padding: 12px 16px; font-size: 13px; }
}
</style>
</head>
<body>

<!-- Header -->
<div class="dashboard-header">
    <div class="brand">
        ${HUTECH_LOGO}
        <div>
            <div class="title">H5P Quizzes</div>
            <div class="course-name">${escapeHtml(courseName)}</div>
        </div>
    </div>
</div>

<!-- Tab bar -->
<div class="tab-bar">
    <button class="tab-btn active" data-tab="bank">📚 Ngân hàng câu hỏi</button>
    <button class="tab-btn" data-tab="stats">📊 Thống kê</button>
</div>

<!-- Tab 1: Question Bank -->
<div id="tab-bank" class="tab-content active">
    <div style="display:flex;gap:24px;min-height:calc(100vh - 150px);">
        <!-- Left: Bank list -->
        <div style="width:320px;flex-shrink:0;">
            <div class="card">
                <div class="card-header">
                    <span class="card-title">Ngân hàng</span>
                </div>
                <div id="bank-list">
                    <div class="empty-state"><div class="spinner"></div><p>Đang tải...</p></div>
                </div>
            </div>
        </div>

        <!-- Right: Questions in selected bank -->
        <div style="flex:1;min-width:0;">
            <div class="card" id="questions-panel" style="display:none;">
                <div class="card-header">
                    <span class="card-title" id="questions-panel-title">Câu hỏi</span>
                    <div style="display:flex;gap:8px;">
                        <button class="h-btn h-btn-primary h-btn-sm" id="btn-create-question">+ Tạo câu hỏi</button>
                        <button class="h-btn h-btn-sm" id="btn-ai-generate" style="background:#0770A3;color:white;border-color:#0770A3;">AI Tạo câu hỏi</button>
                        <button class="h-btn h-btn-sm" id="btn-ai-video" style="background:#e65100;color:white;border-color:#e65100;">🎬 AI Video</button>
                    </div>
                </div>

                <!-- Filters -->
                <div style="display:flex;align-items:center;gap:10px;padding:0 0 16px;flex-wrap:wrap;">
                    <select id="filter-type" style="padding:8px 12px;border:1px solid var(--h-border);border-radius:6px;font-size:13px;">
                        <option value="">Tất cả loại</option>
                        ${Object.entries(TYPE_TO_LABEL_VI)
                            .map(
                                ([k, v]) => `<option value="${k}">${v}</option>`
                            )
                            .join('')}
                    </select>
                    <select id="filter-difficulty" style="padding:8px 12px;border:1px solid var(--h-border);border-radius:6px;font-size:13px;">
                        <option value="">Tất cả độ khó</option>
                        <option value="easy">Dễ</option>
                        <option value="medium">Trung bình</option>
                        <option value="hard">Khó</option>
                    </select>
                </div>

                <div id="questions-list">
                    <div class="empty-state">
                        <div class="icon">📋</div>
                        <p>Chọn một ngân hàng bên trái</p>
                    </div>
                </div>
            </div>

            <div id="questions-empty" class="card">
                <div class="empty-state">
                    <div class="icon">👈</div>
                    <p>Chọn một ngân hàng bên trái để xem câu hỏi</p>
                </div>
            </div>
        </div>
    </div>
</div>

<!-- Publish modal: choose Canvas module -->
<div class="modal-overlay" id="publish-modal">
    <div class="modal" style="width:420px;max-width:90vw;">
        <div class="modal-header">
            <h3>Xuất bản bài kiểm tra</h3>
            <button class="icon-btn" id="btn-close-publish">&times;</button>
        </div>
        <div class="modal-body">
            <div class="form-group">
                <label class="form-label">Thêm bài kiểm tra vào học phần:</label>
                <select class="form-select" id="publish-module">
                    <option value="">Đang tải...</option>
                </select>
            </div>
            <p style="font-size:12px;color:var(--h-text-sec);margin:8px 0 0;">Bài kiểm tra sẽ được thêm vào học phần đã chọn trên Canvas (trong phần Modules, không phải Assignments). Sau khi xuất bản không thể chỉnh sửa.</p>
        </div>
        <div class="modal-footer" style="display:flex;gap:8px;justify-content:flex-end;padding:12px 20px;">
            <button class="h-btn h-btn-sm" id="btn-cancel-publish">Hủy</button>
            <button class="h-btn h-btn-sm" id="btn-confirm-publish" style="background:var(--h-success);color:white;border-color:var(--h-success);">Xuất bản</button>
        </div>
    </div>
</div>

<!-- Tab 3: Statistics (Phase 3) -->
<div id="tab-stats" class="tab-content">
    <div class="card">
        <div class="card-header">
            <span class="card-title">Thống kê bài kiểm tra</span>
            <select id="stats-quiz-select" class="form-select" style="width:auto;min-width:250px;" onchange="loadQuizStats()">
                <option value="">Chọn bài kiểm tra...</option>
            </select>
        </div>

        <!-- Summary cards -->
        <div id="stats-summary" style="display:none;">
            <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:20px;">
                <div style="flex:1;min-width:120px;padding:16px;background:var(--h-surface-alt);border-radius:8px;text-align:center;">
                    <div style="font-size:28px;font-weight:700;color:var(--h-primary);" id="stat-students">0</div>
                    <div style="font-size:12px;color:var(--h-text-sec);">Sinh viên</div>
                </div>
                <div style="flex:1;min-width:120px;padding:16px;background:var(--h-surface-alt);border-radius:8px;text-align:center;">
                    <div style="font-size:28px;font-weight:700;color:var(--h-primary);" id="stat-attempts">0</div>
                    <div style="font-size:12px;color:var(--h-text-sec);">Lượt làm bài</div>
                </div>
                <div style="flex:1;min-width:120px;padding:16px;background:var(--h-surface-alt);border-radius:8px;text-align:center;">
                    <div style="font-size:28px;font-weight:700;color:var(--h-accent);" id="stat-avg">0%</div>
                    <div style="font-size:12px;color:var(--h-text-sec);">Điểm trung bình</div>
                </div>
                <div style="flex:1;min-width:120px;padding:16px;background:var(--h-success-bg);border-radius:8px;text-align:center;">
                    <div style="font-size:28px;font-weight:700;color:var(--h-success);" id="stat-pass">0%</div>
                    <div style="font-size:12px;color:var(--h-text-sec);">Tỷ lệ đạt</div>
                </div>
                <div style="flex:1;min-width:120px;padding:16px;background:var(--h-surface-alt);border-radius:8px;text-align:center;">
                    <div style="font-size:28px;font-weight:700;color:var(--h-success);" id="stat-high">0%</div>
                    <div style="font-size:12px;color:var(--h-text-sec);">Cao nhất</div>
                </div>
                <div style="flex:1;min-width:120px;padding:16px;background:var(--h-surface-alt);border-radius:8px;text-align:center;">
                    <div style="font-size:28px;font-weight:700;color:var(--h-danger);" id="stat-low">0%</div>
                    <div style="font-size:12px;color:var(--h-text-sec);">Thấp nhất</div>
                </div>
            </div>

            <!-- Score distribution chart -->
            <h4 style="font-size:14px;margin:0 0 12px;">Phân bố điểm</h4>
            <div id="stats-chart" style="margin-bottom:24px;"></div>

            <!-- Student table -->
            <h4 style="font-size:14px;margin:0 0 12px;">Kết quả theo sinh viên</h4>
            <div id="stats-students-table"></div>
        </div>

        <!-- Empty state -->
        <div id="stats-empty">
            <div class="empty-state">
                <div class="icon">📊</div>
                <p>Chọn bài kiểm tra để xem thống kê</p>
            </div>
        </div>
    </div>
</div>

<!-- Modal: Create/Edit Bank -->
<div class="modal-overlay" id="bank-modal">
    <div class="modal">
        <div class="modal-header">
            <h3 id="bank-modal-title">Tạo ngân hàng câu hỏi</h3>
            <button class="icon-btn" data-dismiss="modal">&times;</button>
        </div>
        <div class="modal-body">
            <input type="hidden" id="bank-edit-id">
            <div class="form-group">
                <label class="form-label">Tên ngân hàng *</label>
                <input type="text" class="form-input" id="bank-name" placeholder="VD: Chương 1 - Nhập môn">
            </div>
            <div class="form-group">
                <label class="form-label">Mô tả</label>
                <input type="text" class="form-input" id="bank-desc" placeholder="Mô tả ngắn (không bắt buộc)">
            </div>
        </div>
        <div class="modal-footer">
            <button class="h-btn h-btn-primary h-btn-sm" data-dismiss="modal">Hủy</button>
            <button class="h-btn h-btn-accent h-btn-sm" id="btn-save-bank">Lưu</button>
        </div>
    </div>
</div>

<!-- Modal: Create Question (opens H5P editor in iframe) -->
<div class="modal-overlay" id="question-modal">
    <div class="modal" style="width:900px;max-width:95vw;max-height:90vh;">
        <div class="modal-header">
            <h3>Tạo câu hỏi mới</h3>
            <button class="icon-btn" id="btn-close-question-modal">&times;</button>
        </div>
        <div class="modal-body" style="padding:0;">
            <div id="question-type-select" style="padding:20px;">
                <div style="margin-bottom:16px;">
                    <label style="font-size:13px;color:var(--h-text-sec);display:block;margin-bottom:6px;">Độ khó:</label>
                    <select id="new-question-difficulty" class="form-select" style="width:200px;">
                        <option value="easy">Dễ</option>
                        <option value="medium" selected>Trung bình</option>
                        <option value="hard">Khó</option>
                    </select>
                </div>
                <p style="font-size:14px;color:var(--h-text-sec);margin:0 0 12px;">Chọn loại câu hỏi:</p>
                <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px;">
                    ${Object.entries(TYPE_TO_LABEL_VI)
                        .map(
                            ([k, v]) => `
                    <button class="bank-item" data-question-type="${k}" style="cursor:pointer;justify-content:flex-start;">
                        <div class="info">
                            <span class="type-badge">${v}</span>
                        </div>
                    </button>`
                        )
                        .join('')}
                </div>
            </div>
            <iframe id="question-editor-frame" class="h5p-editor-frame" style="display:none;"></iframe>
        </div>
    </div>
</div>

<!-- AI Video modal -->
<div class="modal-overlay" id="video-modal">
    <div class="modal" style="width:650px;max-width:95vw;max-height:90vh;overflow-y:auto;">
        <div class="modal-header">
            <h3>🎬 AI Video tương tác</h3>
            <button class="icon-btn" id="btn-close-video">&times;</button>
        </div>
        <div class="modal-body" id="video-input-section">
            <div class="form-group">
                <label class="form-label">YouTube URL *</label>
                <input type="text" class="form-input" id="video-url" placeholder="https://www.youtube.com/watch?v=...">
            </div>
            <div style="display:flex;gap:8px;margin-bottom:4px;">
                <div style="flex:0 0 60px;font-size:11px;color:var(--h-text-sec);font-weight:600;">Số câu</div>
                <div style="flex:1;font-size:11px;color:var(--h-text-sec);font-weight:600;">Loại</div>
                <div style="flex:0 0 28px;"></div>
            </div>
            <div id="video-gen-groups">
                <div class="video-gen-row" style="display:flex;gap:8px;align-items:center;margin-bottom:6px;">
                    <input type="number" class="form-input video-num" value="8" min="1" max="20" style="flex:0 0 60px;">
                    <select class="form-select video-type" style="flex:1;">
                        <option value="mixed">Đa dạng (tự động)</option>
                        <option value="MultiChoice">Trắc nghiệm</option>
                        <option value="TrueFalse">Đúng/Sai</option>
                        <option value="Blanks">Điền chỗ trống</option>
                    </select>
                    <div style="flex:0 0 28px;"></div>
                </div>
            </div>
            <button type="button" class="h-btn h-btn-sm" id="btn-video-add-row" style="font-size:12px;margin-bottom:12px;">+ Thêm dạng</button>
            <div class="form-group">
                <label class="form-label">Ghi chú cho AI (tùy chọn)</label>
                <textarea class="form-input" id="video-text" rows="2" placeholder="VD: Tập trung vào phần Machine Learning, bỏ phần giới thiệu..." style="font-size:13px;"></textarea>
            </div>
            <button class="h-btn h-btn-sm" id="btn-video-generate" style="width:100%;padding:12px;font-size:14px;font-weight:600;background:#e65100;color:white;border-color:#e65100;border-radius:6px;">Tạo câu hỏi từ video</button>
        </div>
        <div id="video-loading" style="display:none;text-align:center;padding:32px;">
            <div class="spinner" style="width:32px;height:32px;border-width:3px;"></div>
            <p style="margin-top:12px;color:var(--h-text-sec);">Đang phân tích video... (30-60 giây)</p>
        </div>
        <div id="video-preview" style="display:none;">
            <div style="padding:0 20px;">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
                    <strong>Câu hỏi trong video (<span id="video-count">0</span> câu)</strong>
                </div>
                <div id="video-results"></div>
            </div>
            <div class="modal-footer">
                <button class="h-btn h-btn-primary h-btn-sm" id="btn-video-back">Quay lại</button>
                <button class="h-btn h-btn-sm" id="btn-video-import" style="background:#e65100;color:white;border-color:#e65100;">Lưu vào ngân hàng</button>
            </div>
        </div>
    </div>
</div>

<!-- AI Generate modal -->
<div class="modal-overlay" id="ai-modal">
    <div class="modal" style="width:700px;max-width:95vw;max-height:90vh;overflow-y:auto;">
        <div class="modal-header">
            <h3>AI Tạo câu hỏi từ tài liệu</h3>
            <button class="icon-btn" id="btn-close-ai" data-dismiss="modal">&times;</button>
        </div>
        <div class="modal-body" id="ai-input-section">
            <div class="form-group">
                <label class="form-label">Bài học trong "<span id="ai-module-name"></span>"</label>
                <div id="ai-pages-list" style="max-height:180px;overflow-y:auto;border:1px solid var(--h-border);border-radius:6px;padding:8px;font-size:13px;">
                    Đang tải...
                </div>
                <div style="margin-top:4px;display:flex;gap:8px;">
                    <button type="button" class="h-btn h-btn-sm" id="btn-ai-select-all-pages" style="font-size:12px;">Chọn tất cả</button>
                    <button type="button" class="h-btn h-btn-sm" id="btn-ai-load-selected" style="font-size:12px;background:var(--h-primary);color:white;border-color:var(--h-primary);">Tải nội dung đã chọn</button>
                </div>
            </div>
            <div style="margin:8px 0;">
                <button type="button" class="h-btn h-btn-sm" id="ai-text-toggle" style="font-size:12px;">✏️ Chỉnh sửa nội dung bài giảng</button>
            </div>
            <textarea id="ai-text" style="display:none;"></textarea>
            <div class="form-group">
                <label class="form-label">Ghi chú thêm (tùy chọn)</label>
                <textarea class="form-input" id="ai-notes" rows="2" placeholder="VD: Tập trung vào chương 3, bỏ phần lý thuyết..."></textarea>
            </div>
            <div class="form-group">
                <label class="form-label">Upload PDF (tùy chọn)</label>
                <input type="file" id="ai-pdf" accept=".pdf" class="form-input">
            </div>
            <div style="display:flex;gap:8px;margin-bottom:4px;">
                <div style="flex:0 0 60px;font-size:11px;color:var(--h-text-sec);font-weight:600;">Số câu</div>
                <div style="flex:1;font-size:11px;color:var(--h-text-sec);font-weight:600;">Loại</div>
                <div style="flex:1;font-size:11px;color:var(--h-text-sec);font-weight:600;">Độ khó</div>
                <div style="flex:0 0 28px;"></div>
            </div>
            <div id="ai-gen-groups">
                <div class="ai-gen-row" style="display:flex;gap:8px;align-items:center;margin-bottom:6px;">
                    <input type="number" class="form-input ai-num" value="5" min="1" max="20" style="flex:0 0 60px;">
                    <select class="form-select ai-type" style="flex:1;">
                        <option value="MultiChoice">Trắc nghiệm</option>
                        <option value="TrueFalse">Đúng/Sai</option>
                        <option value="Blanks">Điền chỗ trống</option>
                    </select>
                    <select class="form-select ai-diff" style="flex:1;">
                        <option value="easy">Dễ</option>
                        <option value="medium" selected>Trung bình</option>
                        <option value="hard">Khó</option>
                    </select>
                    <div style="flex:0 0 28px;"></div>
                </div>
            </div>
            <button type="button" class="h-btn h-btn-sm" id="btn-ai-add-row" style="font-size:12px;margin-bottom:12px;">+ Thêm dạng</button>
            <div style="display:flex;gap:10px;align-items:stretch;">
                <button class="h-btn h-btn-sm" id="btn-ai-run" style="flex:1;padding:12px;font-size:14px;font-weight:600;background:#0770A3;color:white;border-color:#0770A3;border-radius:6px;">Tạo câu hỏi bằng AI</button>
                <button class="h-btn h-btn-sm" id="btn-ai-run-fresh" style="padding:12px 16px;font-size:13px;background:white;color:#0770A3;border:1px solid #0770A3;border-radius:6px;" title="Tạo lại câu hỏi mới">🔄 Tạo lại</button>
            </div>
        </div>
        <div id="ai-loading" style="display:none;text-align:center;padding:32px;">
            <div class="spinner" style="width:32px;height:32px;border-width:3px;"></div>
            <p style="margin-top:12px;color:var(--h-text-sec);">Đang tạo câu hỏi... (10-30 giây)</p>
        </div>
        <div id="ai-preview" style="display:none;">
            <div style="padding:0 20px;">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
                    <strong>Kết quả AI (<span id="ai-count">0</span> câu)</strong>
                    <label style="font-size:13px;cursor:pointer;"><input type="checkbox" id="ai-select-all" checked> Chọn tất cả</label>
                </div>
                <div id="ai-results"></div>
            </div>
            <div class="modal-footer">
                <button class="h-btn h-btn-primary h-btn-sm" id="btn-ai-back">Quay lại</button>
                <button class="h-btn h-btn-accent h-btn-sm" id="btn-ai-import" style="background:#8B5CF6;border-color:#8B5CF6;">Thêm vào ngân hàng</button>
            </div>
        </div>
    </div>
</div>

<!-- Full-page text editor -->
<div id="ai-text-page" style="display:none;position:fixed;inset:0;z-index:2000;background:white;flex-direction:column;">
    <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 20px;border-bottom:1px solid var(--h-border);background:#f8f9fa;">
        <div style="display:flex;align-items:center;gap:10px;">
            <button type="button" class="h-btn h-btn-sm" id="ai-text-page-back" style="font-size:13px;">← Quay lại</button>
            <strong style="font-size:15px;">Nội dung bài giảng</strong>
        </div>
        <button type="button" class="h-btn h-btn-sm" id="ai-text-page-save" style="font-size:13px;background:var(--h-primary);color:white;border-color:var(--h-primary);">✓ Lưu & quay lại</button>
    </div>
    <textarea id="ai-text-page-editor" style="flex:1;width:100%;border:none;outline:none;padding:20px 24px;font-size:14px;line-height:1.8;white-space:pre-wrap;resize:none;font-family:inherit;" placeholder="Dán hoặc chỉnh sửa nội dung bài giảng tại đây..."></textarea>
</div>

<!-- Preview modal -->
<div class="modal-overlay" id="preview-modal">
    <div class="modal" style="width:800px;max-width:95vw;max-height:90vh;">
        <div class="modal-header">
            <h3 id="preview-title">Xem trước</h3>
            <button class="icon-btn" id="btn-close-preview" data-dismiss="modal">&times;</button>
        </div>
        <div class="modal-body" style="padding:0;">
            <iframe id="preview-frame" class="h5p-editor-frame" style="min-height:400px;"></iframe>
        </div>
    </div>
</div>

<script>
const API_BASE = '/api/quiz-bank';
const H5P_BASE = ${JSON.stringify(h5pBaseUrl)};
const COURSE_ID = ${JSON.stringify(courseId)};
const COURSE_NAME = ${JSON.stringify(courseName)};
const CANVAS_COURSE_ID = ${JSON.stringify(canvasCourseId)};
const LTIK = ${JSON.stringify(ltik)};
const TYPE_LABELS = ${JSON.stringify(TYPE_TO_LABEL_VI)};
const DIFF_LABELS = ${JSON.stringify(DIFFICULTY_LABELS)};
const DIFF_COLORS = ${JSON.stringify(DIFFICULTY_COLORS)};

// HTML escaping for safe rendering of user content
function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

let currentBankId = null;
let currentBankName = '';
let banks = [];


// ── Tab switching ──
function switchTab(name, btn) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
    document.getElementById('tab-' + name).classList.add('active');
    btn.classList.add('active');
}

// ── API helpers ──
async function api(method, path, body) {
    const sep = path.includes('?') ? '&' : '?';
    const url = API_BASE + path + (LTIK ? sep + 'ltik=' + encodeURIComponent(LTIK) : '');
    const opts = { method, headers: { 'Content-Type': 'application/json' } };
    if (body) opts.body = JSON.stringify(body);
    const resp = await fetch(url, opts);
    if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: 'Lỗi server' }));
        throw new Error(err.error || 'Lỗi ' + resp.status);
    }
    return resp.json();
}

// ── Load banks ──
async function loadBanks() {
    try {
        banks = await api('GET', '/banks');

        // Auto-sync: fetch Canvas modules → create banks for new modules (only once per session)
        if (CANVAS_COURSE_ID && !window._banksSynced) {
            window._banksSynced = true;
            try {
                var modulesData = await api('GET', '/canvas-modules?courseId=' + CANVAS_COURSE_ID);
                var modules = modulesData.modules || [];
                if (modules.length > 0) {
                    var existingNames = {};
                    banks.forEach(function(b) { existingNames[b.name] = true; });
                    var created = false;
                    for (var i = 0; i < modules.length; i++) {
                        if (!existingNames[modules[i].name]) {
                            await api('POST', '/banks', { name: modules[i].name, description: '' });
                            existingNames[modules[i].name] = true;
                            created = true;
                        }
                    }
                    if (created) {
                        banks = await api('GET', '/banks');
                    }
                }
            } catch (_e) { /* Canvas API not available, skip */ }
        }

        renderBankList();
        if (banks.length > 0 && !currentBankId) {
            selectBank(banks[0]._id, banks[0].name);
        }
    } catch (err) {
        document.getElementById('bank-list').innerHTML =
            '<div class="empty-state"><p style="color:var(--h-danger);">' + err.message + '</p></div>';
    }
}

function renderBankList() {
    const container = document.getElementById('bank-list');
    if (banks.length === 0) {
        container.innerHTML = '<div class="empty-state"><div class="icon">📁</div><p>Chưa có ngân hàng nào</p></div>';
        return;
    }
    container.innerHTML = banks.map(b => \`
        <div class="bank-item \${b._id === currentBankId ? 'active' : ''}" data-id="\${b._id}" data-name="\${esc(b.name)}">
            <div class="info">
                <span class="icon">📁</span>
                <div>
                    <div class="name">\${esc(b.name)}</div>
                    <div class="count">\${b.questionCount} câu hỏi</div>
                </div>
            </div>
        </div>
    \`).join('');
    // Attach event listeners (more robust than inline onclick in iframe sandbox)
    container.querySelectorAll('.bank-item').forEach(function(el) {
        el.addEventListener('click', function(e) {
            if (e.target.closest('.actions')) return;
            selectBank(el.dataset.id, el.dataset.name);
        });
    });
    container.querySelectorAll('.actions button').forEach(function(btn) {
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            var id = btn.dataset.id;
            if (btn.dataset.action === 'edit') editBank(id);
            else if (btn.dataset.action === 'delete') deleteBank(id);
        });
    });
}

function selectBank(bankId, bankName) {
    currentBankId = bankId;
    currentBankName = bankName;
    document.getElementById('questions-panel').style.display = 'block';
    document.getElementById('questions-empty').style.display = 'none';
    document.getElementById('questions-panel-title').textContent = bankName;
    renderBankList(); // Update active state
    loadQuestions();
}

// ── Bank CRUD ──
function showCreateBankModal() {
    document.getElementById('bank-modal-title').textContent = 'Tạo ngân hàng câu hỏi';
    document.getElementById('bank-edit-id').value = '';
    document.getElementById('bank-name').value = '';
    document.getElementById('bank-desc').value = '';
    document.getElementById('bank-modal').classList.add('active');
    document.getElementById('bank-name').focus();
}

function closeBankModal() {
    document.getElementById('bank-modal').classList.remove('active');
}

function editBank(bankId) {
    const bank = banks.find(b => b._id === bankId);
    if (!bank) return;
    document.getElementById('bank-modal-title').textContent = 'Sửa ngân hàng';
    document.getElementById('bank-edit-id').value = bankId;
    document.getElementById('bank-name').value = bank.name;
    document.getElementById('bank-desc').value = bank.description || '';
    document.getElementById('bank-modal').classList.add('active');
    document.getElementById('bank-name').focus();
}

async function saveBank() {
    const editId = document.getElementById('bank-edit-id').value;
    const name = document.getElementById('bank-name').value.trim();
    const description = document.getElementById('bank-desc').value.trim();
    if (!name) { alert('Tên ngân hàng không được để trống'); return; }

    try {
        if (editId) {
            await api('PUT', '/banks/' + editId, { name, description });
            closeBankModal();
            await loadBanks();
        } else {
            var newBank = await api('POST', '/banks', { name, description });
            closeBankModal();
            await loadBanks();
            if (newBank && newBank._id) {
                selectBank(newBank._id, name);
            }
        }
    } catch (err) {
        alert('Lỗi: ' + err.message);
    }
}

async function deleteBank(bankId) {
    const bank = banks.find(b => b._id === bankId);
    if (!confirm('Xóa ngân hàng "' + (bank?.name || '') + '" và tất cả câu hỏi trong đó?')) return;
    try {
        await api('DELETE', '/banks/' + bankId);
        if (currentBankId === bankId) {
            currentBankId = null;
            document.getElementById('questions-panel').style.display = 'none';
            document.getElementById('questions-empty').style.display = 'block';
        }
        await loadBanks();
    } catch (err) {
        alert('Lỗi: ' + err.message);
    }
}

// ── Questions ──
async function loadQuestions() {
    if (!currentBankId) return;
    const type = document.getElementById('filter-type').value;
    const diff = document.getElementById('filter-difficulty').value;
    let qs = '?';
    if (type) qs += 'type=' + type + '&';
    if (diff) qs += 'difficulty=' + diff + '&';

    const container = document.getElementById('questions-list');
    container.innerHTML = '<div style="text-align:center;padding:24px;"><div class="spinner"></div></div>';

    try {
        const data = await api('GET', '/banks/' + currentBankId + '/questions' + qs);
        existingTitles = (data.questions || []).map(function(q) { return q.title; });
        currentQuestions = data.questions || [];
        renderQuestionList(data.questions, data.total);
    } catch (err) {
        container.innerHTML = '<div class="empty-state"><p style="color:var(--h-danger);">' + err.message + '</p></div>';
    }
}

function renderQuestionList(questions, total) {
    const container = document.getElementById('questions-list');
    if (questions.length === 0) {
        container.innerHTML = '<div class="empty-state"><div class="icon">📝</div><p>Chưa có câu hỏi nào trong ngân hàng này</p></div>';
        return;
    }
    container.innerHTML = \`
        <table class="question-table">
            <thead><tr>
                <th style="width:40px">#</th>
                <th>Tiêu đề</th>
                <th style="width:130px">Loại</th>
                <th style="width:100px">Độ khó</th>
                <th style="width:140px">Nguồn</th>
                <th style="width:120px">Thao tác</th>
            </tr></thead>
            <tbody>
                \${questions.map((q, i) => \`<tr>
                    <td>\${i + 1}</td>
                    <td>\${esc(q.title)}</td>
                    <td><span class="type-badge">\${TYPE_LABELS[q.questionType] || esc(q.questionType)}</span></td>
                    <td>
                        <select class="inline-edit-select" data-inline-id="\${q._id}" data-inline-field="difficulty">
                            <option value="easy" \${q.difficulty==='easy'?'selected':''}>Dễ</option>
                            <option value="medium" \${q.difficulty==='medium'?'selected':''}>TB</option>
                            <option value="hard" \${q.difficulty==='hard'?'selected':''}>Khó</option>
                        </select>
                    </td>
                    <td style="font-size:12px;color:var(--h-text-sec);">\${q.sourceDocument ? '📄 ' + esc(q.sourceDocument.replace(/^\\[Nguồn:\\s*/, '').replace(/]$/, '')) : '<span style="color:#ccc;">—</span>'}</td>
                    <td style="white-space:nowrap;">
                        <button class="h-btn h-btn-sm" data-action="preview" data-id="\${q._id}" data-title="\${esc(q.title)}" style="padding:4px 10px;font-size:12px;background:#e3f2fd;color:#1565c0;border-color:#bbdefb;margin:1px;">Xem</button>
                        <button class="h-btn h-btn-sm" data-action="edit-question" data-id="\${q._id}" data-content-id="\${esc(q.h5pContentId)}" style="padding:4px 10px;font-size:12px;background:#fff3e0;color:#e65100;border-color:#ffe0b2;margin:1px;">Sửa</button>
                        <button class="h-btn h-btn-sm" data-action="delete-question" data-id="\${q._id}" style="padding:4px 10px;font-size:12px;background:#fce4ec;color:#c62828;border-color:#f8bbd0;margin:1px;">Xóa</button>
                    </td>
                </tr>\`).join('')}
            </tbody>
        </table>
        <div style="padding:12px 0;font-size:13px;color:var(--h-text-sec);">Tổng: \${total} câu hỏi</div>
    \`;
}

// ── Question CRUD ──
function showCreateQuestionModal() {
    if (!currentBankId) { alert('Vui lòng chọn ngân hàng trước'); return; }
    // Always show modal with difficulty + type selection
    document.getElementById('question-type-select').style.display = 'block';
    document.getElementById('question-editor-frame').style.display = 'none';
    document.getElementById('question-modal').classList.add('active');
}

function closeQuestionModal() {
    document.getElementById('question-modal').classList.remove('active');
    document.getElementById('question-editor-frame').src = '';
}

function createQuestion(type) {
    // Map our type to H5P library machine name
    const typeToLib = {
        'MultiChoice': 'H5P.MultiChoice',
        'TrueFalse': 'H5P.TrueFalse',
        'Blanks': 'H5P.Blanks',
        'DragQuestion': 'H5P.DragQuestion',
        'DragText': 'H5P.DragText',
        'MarkTheWords': 'H5P.MarkTheWords',
        'SingleChoiceSet': 'H5P.SingleChoiceSet',
        'MultiMediaChoice': 'H5P.MultiMediaChoice'
    };
    // Open H5P editor for new content of this type
    const difficulty = document.getElementById('new-question-difficulty')?.value || 'medium';
    const editorUrl = H5P_BASE + '/new?library=' + encodeURIComponent(typeToLib[type] || type) + '&quizBank=1&bankId=' + currentBankId + '&difficulty=' + difficulty;

    // Video types need new tab (YouTube blocked in nested iframes)
    const videoTypes = ['H5P.InteractiveVideo', 'H5P.Video'];
    if (videoTypes.includes(typeToLib[type])) {
        window.open(editorUrl, '_blank');
        return;
    }

    document.getElementById('question-type-select').style.display = 'none';
    const frame = document.getElementById('question-editor-frame');
    frame.style.display = 'block';
    frame.src = editorUrl;
    document.getElementById('question-modal').classList.add('active');
}

// Listen for message from H5P editor when content is saved
window.addEventListener('message', function(e) {
    if (e.origin !== window.location.origin) return;
    if (e.data && e.data.type === 'h5p-content-saved' && e.data.contentId) {
        // Auto-save with difficulty/points from dropdowns — no modal needed
        saveQuestionToBank(e.data.contentId);
    }
});

async function saveQuestionToBank(contentId) {
    if (!contentId || !currentBankId) return;
    var diffSelect = document.getElementById('new-question-difficulty');
    var difficulty = (diffSelect && diffSelect.value) || 'medium';
    try {
        await api('POST', '/banks/' + currentBankId + '/questions', {
            h5pContentId: contentId,
            difficulty: difficulty,
            points: 1,
            tags: []
        });
        closeQuestionModal();
        loadQuestions();
    } catch (err) {
        alert('Lỗi lưu câu hỏi: ' + err.message);
    }
}

async function deleteQuestion(questionId) {
    if (!confirm('Xóa câu hỏi này khỏi ngân hàng?')) return;
    try {
        await api('DELETE', '/banks/' + currentBankId + '/questions/' + questionId);
        loadQuestions();
    } catch (err) {
        alert('Lỗi: ' + err.message);
    }
}

function editQuestion(questionId, h5pContentId) {
    if (!h5pContentId) { alert('Không thể chỉnh sửa câu hỏi này'); return; }
    var editorUrl = H5P_BASE + '/edit/' + encodeURIComponent(h5pContentId);
    if (LTIK) editorUrl += '?ltik=' + encodeURIComponent(LTIK);
    editorUrl += (LTIK ? '&' : '?') + 'quizBank=1&bankId=' + currentBankId + '&questionId=' + questionId;
    document.getElementById('question-type-select').style.display = 'none';
    var frame = document.getElementById('question-editor-frame');
    frame.style.display = 'block';
    frame.src = editorUrl;
    document.getElementById('question-modal').classList.add('active');
}

async function updateQuestion(questionId, field, value) {
    var body = {};
    body[field] = field === 'points' ? parseFloat(value) : value;
    try {
        await api('PATCH', '/banks/' + currentBankId + '/questions/' + questionId, body);
    } catch (err) {
        alert('Lỗi cập nhật: ' + err.message);
        loadQuestions(); // Reload to revert
    }
}

// ── Preview ──
function previewQuestion(questionId, title) {
    document.getElementById('preview-title').textContent = 'Xem trước: ' + title;
    var previewUrl = API_BASE + '/banks/' + currentBankId + '/questions/' + questionId + '/preview';
    if (LTIK) previewUrl += '?ltik=' + encodeURIComponent(LTIK);
    document.getElementById('preview-frame').src = previewUrl;
    document.getElementById('preview-modal').classList.add('active');
}

function closePreviewModal() {
    document.getElementById('preview-modal').classList.remove('active');
    document.getElementById('preview-frame').src = '';
}

// ══════════════════════════════════════
// Tab 2: Quiz Management
// ══════════════════════════════════════
const QUIZ_API = '/api/quiz';
let quizzes = [];
let editingQuizId = null;

async function quizApi(method, path, body) {
    const sep = path.includes('?') ? '&' : '?';
    const url = QUIZ_API + path + (LTIK ? sep + 'ltik=' + encodeURIComponent(LTIK) : '');
    const opts = { method, headers: { 'Content-Type': 'application/json' } };
    if (body) opts.body = JSON.stringify(body);
    const resp = await fetch(url, opts);
    if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: 'Lỗi server' }));
        throw new Error(err.error || 'Lỗi ' + resp.status);
    }
    return resp.json();
}

async function loadQuizzes() {
    try {
        quizzes = await quizApi('GET', '/list');
        renderQuizList();
    } catch (err) {
        document.getElementById('quiz-list').innerHTML =
            '<div class="empty-state"><p style="color:var(--h-danger);">' + esc(err.message) + '</p></div>';
    }
}

function renderQuizList() {
    const container = document.getElementById('quiz-list');
    if (quizzes.length === 0) {
        container.innerHTML = '<div class="empty-state"><div class="icon">📝</div><p>Chưa có bài kiểm tra nào</p></div>';
        return;
    }
    container.innerHTML = quizzes.map(q => {
        const statusLabel = q.status === 'published' ? '✅ Đã xuất bản' : '📄 Nháp';
        const totalPick = (q.questionGroups || []).reduce((s, g) => s + (g.pickCount || 0), 0);
        return \`
        <div class="bank-item quiz-item \${q._id === editingQuizId ? 'active' : ''}" data-id="\${q._id}">
            <div class="info">
                <span class="icon">📝</span>
                <div>
                    <div class="name">\${esc(q.name)}</div>
                    <div class="count">\${statusLabel} · \${totalPick} câu/lượt · \${q.snapshotCount || 0} snapshot</div>
                </div>
            </div>
            <div class="actions">
                \${q.status === 'draft' ? '<button class="icon-btn" data-action="publish-quiz" data-id="' + q._id + '" title="Xuất bản">🚀</button>' : ''}
                <button class="icon-btn danger" data-action="delete-quiz" data-id="\${q._id}" title="Xóa">🗑️</button>
            </div>
        </div>\`;
    }).join('');
}

function showQuizBuilder() {
    editingQuizId = null;
    document.getElementById('quiz-builder-title').textContent = 'Tạo bài kiểm tra';
    document.getElementById('quiz-name').value = '';
    document.getElementById('quiz-desc').value = '';
    document.getElementById('quiz-groups').innerHTML = '';
    document.getElementById('quiz-shuffle').checked = true;
    document.getElementById('quiz-progress').checked = true;
    document.getElementById('quiz-pass') && (document.getElementById('quiz-pass').value = '0');
    document.getElementById('quiz-attempts').value = '-1';
    addQuizGroup(); // Add one default group
    document.getElementById('quiz-builder').style.display = 'block';
    document.getElementById('quiz-empty').style.display = 'none';
}

function hideQuizBuilder() {
    document.getElementById('quiz-builder').style.display = 'none';
    document.getElementById('quiz-empty').style.display = 'block';
    editingQuizId = null;
}

async function selectQuiz(quizId) {
    // Load quiz detail and show in builder (edit mode)
    try {
        var quiz = quizzes.find(function(q) { return q._id === quizId; });
        if (!quiz) return;
        editingQuizId = quizId;
        document.getElementById('quiz-builder-title').textContent = quiz.name + (quiz.status === 'published' ? ' (Đã xuất bản)' : ' (Nháp)');
        document.getElementById('quiz-name').value = quiz.name || '';
        document.getElementById('quiz-desc').value = quiz.description || '';
        document.getElementById('quiz-shuffle').checked = quiz.settings?.shuffleQuestions !== false;
        document.getElementById('quiz-progress').checked = quiz.settings?.showProgressBar !== false;
        document.getElementById('quiz-pass') && (document.getElementById('quiz-pass').value = '0');
        document.getElementById('quiz-attempts').value = (quiz.settings?.allowedAttempts || -1).toString();
        // Rebuild question groups
        document.getElementById('quiz-groups').innerHTML = '';
        groupCounter = 0;
        (quiz.questionGroups || []).forEach(function(g) {
            addQuizGroup();
            var gid = groupCounter - 1;
            var bankSelect = document.getElementById('qg-bank-' + gid);
            if (bankSelect) bankSelect.value = g.bankId || '';
            var pickInput = document.getElementById('qg-pick-' + gid);
            if (pickInput) pickInput.value = (g.pickCount || 5).toString();
        });
        if ((quiz.questionGroups || []).length === 0) addQuizGroup();

        // Calculate and show total points info
        var totalPick = (quiz.questionGroups || []).reduce(function(s, g) { return s + (g.pickCount || 0); }, 0);
        var pointsInfo = document.getElementById('quiz-points-info');
        if (pointsInfo && totalPick > 0) {
            pointsInfo.textContent = 'Tổng: ' + totalPick + ' câu · 10 điểm (' + (10 / totalPick).toFixed(2).replace(/[.]?0+$/, '') + 'đ/câu)';
            pointsInfo.style.display = 'block';
        }

        // Read-only mode for published quizzes
        var isPublished = quiz.status === 'published';
        document.querySelectorAll('#quiz-builder input, #quiz-builder select, #quiz-builder textarea').forEach(function(el) {
            el.disabled = isPublished;
        });
        document.querySelectorAll('#quiz-builder .quiz-edit-only').forEach(function(el) {
            el.style.display = isPublished ? 'none' : '';
        });
        document.getElementById('btn-save-quiz').style.display = isPublished ? 'none' : '';
        document.getElementById('btn-publish-quiz').style.display = isPublished ? 'none' : '';
        document.getElementById('btn-add-quiz-group').style.display = isPublished ? 'none' : '';

        document.getElementById('quiz-builder').style.display = 'block';
        document.getElementById('quiz-empty').style.display = 'none';
        // Highlight selected quiz
        renderQuizList();
    } catch (err) {
        alert('Lỗi: ' + err.message);
    }
}

let groupCounter = 0;
function addQuizGroup() {
    const gid = groupCounter++;
    const bankOptions = banks.map(b => '<option value="' + b._id + '">' + esc(b.name) + ' (' + b.questionCount + ' câu)</option>').join('');
    const html = \`
    <div class="card" id="qg-\${gid}" style="padding:12px;margin-bottom:8px;border:1px solid var(--h-border);">
        <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;">
            <div class="form-group" style="flex:2;margin:0;">
                <label class="form-label">Ngân hàng</label>
                <select class="form-select" id="qg-bank-\${gid}">\${bankOptions}</select>
            </div>
            <div class="form-group" style="flex:1;margin:0;">
                <label class="form-label">Số câu chọn</label>
                <input type="number" class="form-input" id="qg-pick-\${gid}" value="5" min="1">
            </div>
            <button class="icon-btn danger quiz-edit-only" data-action="remove-group" data-gid="\${gid}" title="Xóa nhóm" style="margin-top:18px;">🗑️</button>
        </div>
    </div>\`;
    document.getElementById('quiz-groups').insertAdjacentHTML('beforeend', html);
}

function removeQuizGroup(gid) {
    const el = document.getElementById('qg-' + gid);
    if (el) el.remove();
}

function collectQuizData() {
    const name = document.getElementById('quiz-name').value.trim();
    if (!name) { alert('Tên bài kiểm tra không được để trống'); return null; }

    const groupEls = document.getElementById('quiz-groups').children;
    const questionGroups = [];
    for (const el of groupEls) {
        const gid = el.id.replace('qg-', '');
        const bankId = document.getElementById('qg-bank-' + gid)?.value;
        const pickCount = parseInt(document.getElementById('qg-pick-' + gid)?.value) || 5;
        if (bankId) questionGroups.push({ bankId, pickCount, pointsPerQuestion: 1 });
    }
    if (questionGroups.length === 0) { alert('Cần ít nhất 1 nhóm câu hỏi'); return null; }

    return {
        name,
        description: document.getElementById('quiz-desc').value.trim(),
        questionGroups,
        settings: {
            shuffleQuestions: document.getElementById('quiz-shuffle').checked,
            showProgressBar: document.getElementById('quiz-progress').checked,
            passPercentage: 0,
            allowedAttempts: parseInt(document.getElementById('quiz-attempts').value) || -1
        }
    };
}

async function saveQuiz() {
    const data = collectQuizData();
    if (!data) return;
    try {
        if (editingQuizId) {
            await quizApi('PUT', '/update/' + editingQuizId, data);
        } else {
            await quizApi('POST', '/create', data);
        }
        hideQuizBuilder();
        await loadQuizzes();
    } catch (err) {
        alert('Lỗi: ' + err.message);
    }
}

var pendingPublishQuizId = null;

async function showPublishModal(quizId) {
    pendingPublishQuizId = quizId;
    // Load Canvas modules
    var moduleSelect = document.getElementById('publish-module');
    moduleSelect.innerHTML = '<option value="">Đang tải...</option>';
    document.getElementById('publish-modal').classList.add('active');
    try {
        var data = await api('GET', '/canvas-modules' + (CANVAS_COURSE_ID ? '?courseId=' + CANVAS_COURSE_ID : ''));
        var modules = (data.modules || []).filter(function(m) { return m.name; });
        if (modules.length === 0) {
            moduleSelect.innerHTML = '<option value="">Không tìm thấy học phần</option>';
        } else {
            moduleSelect.innerHTML = modules.map(function(m) {
                return '<option value="' + m.id + '">' + esc(m.name) + '</option>';
            }).join('');
        }
    } catch (err) {
        moduleSelect.innerHTML = '<option value="">Lỗi tải học phần</option>';
    }
}

async function saveAndPublishQuiz() {
    const data = collectQuizData();
    if (!data) return;
    try {
        let quizId = editingQuizId;
        if (quizId) {
            await quizApi('PUT', '/update/' + quizId, data);
        } else {
            const created = await quizApi('POST', '/create', data);
            quizId = created._id;
            editingQuizId = quizId;
        }
        showPublishModal(quizId);
    } catch (err) {
        alert('Lỗi: ' + err.message);
    }
}

async function confirmPublish() {
    var moduleId = document.getElementById('publish-module').value;
    if (!moduleId) { alert('Vui lòng chọn học phần'); return; }
    if (!pendingPublishQuizId) return;
    try {
        var result = await quizApi('POST', '/publish/' + pendingPublishQuizId, {
            canvasModuleId: moduleId,
            canvasCourseId: CANVAS_COURSE_ID
        });
        alert('Đã xuất bản! ' + result.snapshotCount + ' câu hỏi đã được snapshot.');
        document.getElementById('publish-modal').classList.remove('active');
        hideQuizBuilder();
        await loadQuizzes();
    } catch (err) {
        alert('Lỗi: ' + err.message);
    }
}

async function publishQuiz(quizId) {
    showPublishModal(quizId);
}

async function deleteQuiz(quizId) {
    if (!confirm('Xóa bài kiểm tra này?')) return;
    try {
        await quizApi('DELETE', '/delete/' + quizId);
        await loadQuizzes();
    } catch (err) {
        alert('Lỗi: ' + err.message);
    }
}

// ── Init ──
let banksLoaded = false;
let quizzesLoaded = false;

async function ensureBanksLoaded() {
    if (!banksLoaded) {
        await loadBanks();
        banksLoaded = true;
    }
}

ensureBanksLoaded();

// ══════════════════════════════════════
// Tab 3: Statistics
// ══════════════════════════════════════
const STATS_API = '/api/stats';
let statsLoaded = false;

async function statsApi(method, path) {
    const sep = path.includes('?') ? '&' : '?';
    const url = STATS_API + path + (LTIK ? sep + 'ltik=' + encodeURIComponent(LTIK) : '');
    const resp = await fetch(url, { method, headers: { 'Content-Type': 'application/json' } });
    if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: 'Lỗi server' }));
        throw new Error(err.error || 'Lỗi ' + resp.status);
    }
    return resp.json();
}

async function loadStatsQuizList() {
    try {
        const data = await statsApi('GET', '/quizzes');
        const sel = document.getElementById('stats-quiz-select');
        sel.innerHTML = '<option value="">Chọn bài kiểm tra...</option>';
        data.forEach(q => {
            sel.innerHTML += '<option value="' + q._id + '">' + esc(q.name) + ' (' + q.totalAttempts + ' lượt, ' + q.avgPercent + '% TB)</option>';
        });
        statsLoaded = true;
    } catch (err) {
        console.error('Stats load error:', err);
    }
}

async function loadQuizStats() {
    const quizId = document.getElementById('stats-quiz-select').value;
    if (!quizId) {
        document.getElementById('stats-summary').style.display = 'none';
        document.getElementById('stats-empty').style.display = 'block';
        return;
    }

    try {
        const data = await statsApi('GET', '/quiz/' + quizId);
        const s = data.summary;

        // Update summary cards
        document.getElementById('stat-students').textContent = s.uniqueStudents;
        document.getElementById('stat-attempts').textContent = s.totalAttempts;
        document.getElementById('stat-avg').textContent = s.avgPercent + '%';
        document.getElementById('stat-pass').textContent = s.passRate + '%';
        document.getElementById('stat-high').textContent = s.highestPercent + '%';
        document.getElementById('stat-low').textContent = s.lowestPercent + '%';

        // Render distribution chart (CSS bar chart)
        const dist = data.distribution || [];
        const maxVal = Math.max(...dist, 1);
        const labels = ['0-9%','10-19%','20-29%','30-39%','40-49%','50-59%','60-69%','70-79%','80-89%','90-100%'];
        const passIdx = Math.floor((data.quiz.passPercentage || 0) / 10);
        let chartHtml = '<div style="display:flex;align-items:flex-end;gap:4px;height:120px;padding:0 4px;">';
        dist.forEach((count, i) => {
            const h = maxVal > 0 ? Math.max((count / maxVal) * 100, count > 0 ? 8 : 2) : 2;
            const color = i >= passIdx ? 'var(--h-success)' : 'var(--h-danger)';
            chartHtml += '<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%;">';
            chartHtml += '<div style="font-size:10px;color:var(--h-text-sec);margin-bottom:2px;">' + (count || '') + '</div>';
            chartHtml += '<div style="width:100%;height:' + h + '%;background:' + color + ';border-radius:3px 3px 0 0;min-height:2px;"></div>';
            chartHtml += '<div style="font-size:9px;color:var(--h-text-sec);margin-top:4px;white-space:nowrap;">' + labels[i] + '</div>';
            chartHtml += '</div>';
        });
        chartHtml += '</div>';
        document.getElementById('stats-chart').innerHTML = chartHtml;

        // Render student table
        const students = data.students || [];
        if (students.length === 0) {
            document.getElementById('stats-students-table').innerHTML = '<p style="color:var(--h-text-sec);font-size:13px;">Chưa có sinh viên nào làm bài.</p>';
        } else {
            let tableHtml = '<table class="question-table"><thead><tr><th>#</th><th>Sinh viên</th><th>Điểm cao nhất</th><th>Tỷ lệ</th><th>Số lượt</th></tr></thead><tbody>';
            students.sort((a, b) => b.bestPercent - a.bestPercent).forEach((st, i) => {
                const pColor = st.bestPercent >= (data.quiz.passPercentage || 0) ? 'var(--h-success)' : 'var(--h-danger)';
                const displayName = st.name || (st.userId ? st.userId.substring(0,12) + '...' : 'N/A');
                tableHtml += '<tr><td>' + (i+1) + '</td><td>' + esc(displayName) + '</td><td>' + st.bestScore + '</td><td style="color:' + pColor + ';font-weight:600;">' + st.bestPercent + '%</td><td>' + st.attempts + '</td></tr>';
            });
            tableHtml += '</tbody></table>';
            document.getElementById('stats-students-table').innerHTML = tableHtml;
        }

        document.getElementById('stats-summary').style.display = 'block';
        document.getElementById('stats-empty').style.display = 'none';
    } catch (err) {
        alert('Lỗi tải thống kê: ' + err.message);
    }
}

// ── Init + Tab switching ──
const origSwitchTab = switchTab;
switchTab = async function(name, btn) {
    origSwitchTab(name, btn);
    if (name === 'stats' && !statsLoaded) {
        await loadStatsQuizList();
    }
};

// ── Bind all events via addEventListener (inline onclick may be blocked by CSP/sandbox) ──
document.addEventListener('DOMContentLoaded', function() {
    // Tab buttons
    document.querySelectorAll('.tab-btn').forEach(function(btn) {
        btn.addEventListener('click', function() { switchTab(btn.dataset.tab, btn); });
    });
    // Bank: "+ Tạo mới" button
    var createBankBtn = document.getElementById('btn-create-bank');
    if (createBankBtn) createBankBtn.addEventListener('click', showCreateBankModal);
    // Questions: "+ Tạo câu hỏi" button
    var createQBtn = document.getElementById('btn-create-question');
    if (createQBtn) createQBtn.addEventListener('click', showCreateQuestionModal);
    // Quiz: "+ Tạo mới" button
    var createQuizBtn = document.getElementById('btn-create-quiz');
    if (createQuizBtn) createQuizBtn.addEventListener('click', showQuizBuilder);
    // Filter dropdowns
    var filterType = document.getElementById('filter-type');
    if (filterType) filterType.addEventListener('change', loadQuestions);
    var filterDiff = document.getElementById('filter-difficulty');
    if (filterDiff) filterDiff.addEventListener('change', loadQuestions);
    // Modal close buttons
    document.querySelectorAll('[data-dismiss="modal"]').forEach(function(btn) {
        btn.addEventListener('click', function() {
            var modal = btn.closest('.modal-overlay');
            if (modal) modal.classList.remove('active');
        });
    });
    // Bank modal save
    var saveBankBtn = document.getElementById('btn-save-bank');
    if (saveBankBtn) saveBankBtn.addEventListener('click', saveBank);
    // Question modal close
    var closeQModalBtn = document.getElementById('btn-close-question-modal');
    if (closeQModalBtn) closeQModalBtn.addEventListener('click', closeQuestionModal);
    // Question type buttons in modal
    document.querySelectorAll('[data-question-type]').forEach(function(btn) {
        btn.addEventListener('click', function() { createQuestion(btn.dataset.questionType); });
    });
    // Preview modal
    var closePreviewBtn = document.getElementById('btn-close-preview');
    if (closePreviewBtn) closePreviewBtn.addEventListener('click', closePreviewModal);
    // Quiz builder buttons
    var addGroupBtn = document.getElementById('btn-add-quiz-group');
    if (addGroupBtn) addGroupBtn.addEventListener('click', addQuizGroup);
    var cancelQuizBtn = document.getElementById('btn-cancel-quiz');
    if (cancelQuizBtn) cancelQuizBtn.addEventListener('click', hideQuizBuilder);
    var saveQuizBtn = document.getElementById('btn-save-quiz');
    if (saveQuizBtn) saveQuizBtn.addEventListener('click', saveQuiz);
    var publishQuizBtn = document.getElementById('btn-publish-quiz');
    if (publishQuizBtn) publishQuizBtn.addEventListener('click', saveAndPublishQuiz);
    var hideQuizBtn = document.getElementById('btn-hide-quiz-builder');
    if (hideQuizBtn) hideQuizBtn.addEventListener('click', hideQuizBuilder);

    // Event delegation for dynamic content (questions, quizzes, quiz groups)
    document.addEventListener('click', function(e) {
        var btn = e.target.closest('[data-action]');
        if (!btn) return;
        var action = btn.dataset.action;
        var id = btn.dataset.id;
        if (action === 'preview') previewQuestion(id, btn.dataset.title);
        else if (action === 'edit-question') editQuestion(id, btn.dataset.contentId);
        else if (action === 'delete-question') deleteQuestion(id);
        else if (action === 'edit') editBank(id);
        else if (action === 'delete') deleteBank(id);
        else if (action === 'publish-quiz') publishQuiz(id);
        else if (action === 'delete-quiz') deleteQuiz(id);
        else if (action === 'remove-group') removeQuizGroup(parseInt(btn.dataset.gid));
        e.stopPropagation();
    });

    // Event delegation for quiz list item click (select quiz)
    document.addEventListener('click', function(e) {
        var quizItem = e.target.closest('.quiz-item');
        if (!quizItem || e.target.closest('.actions')) return;
        selectQuiz(quizItem.dataset.id);
    });

    // Inline edit: difficulty select change
    document.addEventListener('change', function(e) {
        var el = e.target.closest('[data-inline-id][data-inline-field]');
        if (!el) return;
        updateQuestion(el.dataset.inlineId, el.dataset.inlineField, el.value);
    });

    // Inline edit: points input blur
    document.addEventListener('focusout', function(e) {
        var el = e.target.closest('input.inline-edit-number[data-inline-id]');
        if (!el) return;
        var val = parseFloat(el.value);
        if (isNaN(val) || val < 0.5) { el.value = '0.5'; val = 0.5; }
        updateQuestion(el.dataset.inlineId, el.dataset.inlineField, el.value);
    });

    // AI Generate button
    var aiBtn = document.getElementById('btn-ai-generate');
    if (aiBtn) aiBtn.addEventListener('click', function() {
        if (!currentBankId) { alert('Vui lòng chọn ngân hàng trước'); return; }
        document.getElementById('ai-input-section').style.display = 'block';
        document.getElementById('ai-loading').style.display = 'none';
        document.getElementById('ai-preview').style.display = 'none';
        document.getElementById('ai-modal').classList.add('active');
        loadCanvasPages();
    });
    // AI: Select all pages button
    var selectAllPagesBtn = document.getElementById('btn-ai-select-all-pages');
    if (selectAllPagesBtn) selectAllPagesBtn.addEventListener('click', function() {
        var cbs = document.querySelectorAll('.ai-page-cb');
        var allChecked = Array.from(cbs).every(function(cb) { return cb.checked; });
        cbs.forEach(function(cb) { cb.checked = !allChecked; });
        selectAllPagesBtn.textContent = allChecked ? 'Chọn tất cả' : 'Bỏ chọn';
    });
    // AI: Load selected pages content
    var loadPagesBtn = document.getElementById('btn-ai-load-selected');
    if (loadPagesBtn) loadPagesBtn.addEventListener('click', loadSelectedPages);
    var aiRunBtn = document.getElementById('btn-ai-run');
    if (aiRunBtn) aiRunBtn.addEventListener('click', function() { aiGenerate(false); });
    var aiRunFreshBtn = document.getElementById('btn-ai-run-fresh');
    if (aiRunFreshBtn) aiRunFreshBtn.addEventListener('click', function() { aiGenerate(true); });
    var aiAddRowBtn = document.getElementById('btn-ai-add-row');
    if (aiAddRowBtn) aiAddRowBtn.addEventListener('click', function() {
        var html = '<div class="ai-gen-row" style="display:flex;gap:8px;align-items:center;margin-bottom:6px;">' +
            '<input type="number" class="form-input ai-num" value="3" min="1" max="20" style="flex:0 0 60px;">' +
            '<select class="form-select ai-type" style="flex:1;">' +
                '<option value="MultiChoice">Trắc nghiệm</option>' +
                '<option value="TrueFalse">Đúng/Sai</option>' +
                '<option value="Blanks">Điền chỗ trống</option>' +
            '</select>' +
            '<select class="form-select ai-diff" style="flex:1;">' +
                '<option value="easy">Dễ</option>' +
                '<option value="medium" selected>Trung bình</option>' +
                '<option value="hard">Khó</option>' +
            '</select>' +
            '<button type="button" class="icon-btn danger" onclick="this.parentElement.remove()" style="flex:0 0 28px;font-size:14px;padding:0;line-height:32px;text-align:center;" title="Xóa">✕</button>' +
        '</div>';
        document.getElementById('ai-gen-groups').insertAdjacentHTML('beforeend', html);
    });
    var aiBackBtn = document.getElementById('btn-ai-back');
    if (aiBackBtn) aiBackBtn.addEventListener('click', function() {
        document.getElementById('ai-input-section').style.display = 'block';
        document.getElementById('ai-preview').style.display = 'none';
    });
    var aiImportBtn = document.getElementById('btn-ai-import');
    if (aiImportBtn) aiImportBtn.addEventListener('click', aiImport);
    var aiSelectAll = document.getElementById('ai-select-all');
    if (aiSelectAll) aiSelectAll.addEventListener('change', function() {
        document.querySelectorAll('.ai-q-check').forEach(function(cb) { cb.checked = aiSelectAll.checked; });
    });
    var aiCloseBtn = document.getElementById('btn-close-ai');
    if (aiCloseBtn) aiCloseBtn.addEventListener('click', function() {
        document.getElementById('ai-modal').classList.remove('active');
    });

    var videoBtn = document.getElementById('btn-ai-video');
    if (videoBtn) videoBtn.addEventListener('click', function() {
        if (!currentBankId) { alert('Vui lòng chọn ngân hàng trước'); return; }
        document.getElementById('video-input-section').style.display = 'block';
        document.getElementById('video-loading').style.display = 'none';
        document.getElementById('video-preview').style.display = 'none';
        document.getElementById('video-modal').classList.add('active');
    });
    var videoAddRowBtn = document.getElementById('btn-video-add-row');
    if (videoAddRowBtn) videoAddRowBtn.addEventListener('click', function() {
        var container = document.getElementById('video-gen-groups');
        var row = document.createElement('div');
        row.className = 'video-gen-row';
        row.style.cssText = 'display:flex;gap:8px;align-items:center;margin-bottom:6px;';
        row.innerHTML = '<input type="number" class="form-input video-num" value="3" min="1" max="20" style="flex:0 0 60px;">' +
            '<select class="form-select video-type" style="flex:1;">' +
                '<option value="mixed">Đa dạng</option><option value="MultiChoice">Trắc nghiệm</option><option value="TrueFalse">Đúng/Sai</option><option value="Blanks">Điền chỗ trống</option>' +
            '</select>' +
            '<button class="icon-btn danger" style="flex:0 0 28px;font-size:14px;" title="Xóa">&times;</button>';
        row.querySelector('.icon-btn').addEventListener('click', function() { row.remove(); });
        container.appendChild(row);
    });
    var closeVideoBtn = document.getElementById('btn-close-video');
    if (closeVideoBtn) closeVideoBtn.addEventListener('click', function() {
        document.getElementById('video-modal').classList.remove('active');
    });
    var videoGenBtn = document.getElementById('btn-video-generate');
    if (videoGenBtn) videoGenBtn.addEventListener('click', videoGenerate);
    var videoBackBtn = document.getElementById('btn-video-back');
    if (videoBackBtn) videoBackBtn.addEventListener('click', function() {
        document.getElementById('video-input-section').style.display = 'block';
        document.getElementById('video-preview').style.display = 'none';
    });
    var videoImportBtn = document.getElementById('btn-video-import');
    if (videoImportBtn) videoImportBtn.addEventListener('click', videoImport);

    // Assignment modal
    var createAssignBtn = document.getElementById('btn-create-assignment');
    if (createAssignBtn) createAssignBtn.addEventListener('click', showAssignmentModal);
    var closeAssignBtn = document.getElementById('btn-close-assignment');
    if (closeAssignBtn) closeAssignBtn.addEventListener('click', function() {
        document.getElementById('assignment-modal').classList.remove('active');
    });
    var cancelAssignBtn = document.getElementById('btn-cancel-assignment');
    if (cancelAssignBtn) cancelAssignBtn.addEventListener('click', function() {
        document.getElementById('assignment-modal').classList.remove('active');
    });
    var publishAssignBtn = document.getElementById('btn-publish-assignment');
    if (publishAssignBtn) publishAssignBtn.addEventListener('click', publishAssignment);

    // Toggle random/manual mode
    document.querySelectorAll('input[name="assign-mode"]').forEach(function(radio) {
        radio.addEventListener('change', function() {
            document.getElementById('assign-random-section').style.display = this.value === 'random' ? 'block' : 'none';
            document.getElementById('assign-manual-section').style.display = this.value === 'manual' ? 'block' : 'none';
        });
    });

    // Publish modal
    var closePublishBtn = document.getElementById('btn-close-publish');
    if (closePublishBtn) closePublishBtn.addEventListener('click', function() {
        document.getElementById('publish-modal').classList.remove('active');
    });
    var cancelPublishBtn = document.getElementById('btn-cancel-publish');
    if (cancelPublishBtn) cancelPublishBtn.addEventListener('click', function() {
        document.getElementById('publish-modal').classList.remove('active');
    });
    var confirmPublishBtn = document.getElementById('btn-confirm-publish');
    if (confirmPublishBtn) confirmPublishBtn.addEventListener('click', confirmPublish);

    // AI: Full-page text editor
    var aiTextToggle = document.getElementById('ai-text-toggle');
    if (aiTextToggle) aiTextToggle.addEventListener('click', openTextPage);
    var aiTextPageBack = document.getElementById('ai-text-page-back');
    if (aiTextPageBack) aiTextPageBack.addEventListener('click', closeTextPage);
    var aiTextPageSave = document.getElementById('ai-text-page-save');
    if (aiTextPageSave) aiTextPageSave.addEventListener('click', closeTextPage);

    // Init: load banks
    loadBanks();
});

var aiQuestions = [];
var existingTitles = [];
var currentQuestions = [];

var videoQuestions = [];

async function videoGenerate() {
    var url = document.getElementById('video-url').value.trim();
    if (!url) { alert('Vui lòng nhập YouTube URL'); return; }

    // Read from multi-row groups
    var rows = document.querySelectorAll('.video-gen-row');
    var totalNum = 0;
    var types = [];
    rows.forEach(function(row) {
        var n = parseInt(row.querySelector('.video-num')?.value) || 3;
        var t = row.querySelector('.video-type')?.value || 'mixed';
        totalNum += n;
        types.push({ num: n, type: t });
    });
    if (totalNum === 0) totalNum = 8;

    // If all same type, use that; otherwise mixed with instruction
    var allSameType = types.every(function(t) { return t.type === types[0].type; });
    var qType = allSameType ? types[0].type : 'mixed';
    var typeInstruction = '';
    if (!allSameType) {
        typeInstruction = types.map(function(t) { return t.num + ' câu ' + t.type; }).join(', ');
    }

    document.getElementById('video-input-section').style.display = 'none';
    document.getElementById('video-loading').style.display = 'block';
    document.getElementById('video-preview').style.display = 'none';

    try {
        var manualText = document.getElementById('video-text').value.trim();
        if (typeInstruction) {
            manualText = (manualText ? manualText + '. ' : '') + 'Phân bổ loại câu hỏi: ' + typeInstruction;
        }
        var data = await api('POST', '/banks/' + currentBankId + '/ai-video', {
            youtubeUrl: url,
            numQuestions: totalNum,
            questionType: qType,
            manualText: manualText
        });
        videoQuestions = data.questions || [];
        renderVideoPreview();
    } catch (err) {
        alert('Lỗi: ' + err.message);
        document.getElementById('video-input-section').style.display = 'block';
        document.getElementById('video-loading').style.display = 'none';
    }
}

function renderVideoPreview() {
    document.getElementById('video-loading').style.display = 'none';
    document.getElementById('video-preview').style.display = 'block';
    document.getElementById('video-count').textContent = videoQuestions.length;

    var typeLabels = { MultiChoice: 'Trắc nghiệm', TrueFalse: 'Đúng/Sai', Blanks: 'Điền chỗ trống' };
    var html = videoQuestions.map(function(q, i) {
        var mins = Math.floor(q.timestamp / 60);
        var secs = Math.floor(q.timestamp % 60);
        var timeStr = mins + ':' + (secs < 10 ? '0' : '') + secs;
        return '<div style="border:1px solid var(--h-border);border-radius:8px;padding:12px;margin-bottom:8px;">' +
            '<div style="display:flex;align-items:center;gap:10px;">' +
                '<input type="checkbox" class="video-q-check" data-idx="' + i + '" checked>' +
                '<span style="background:#e65100;color:white;padding:2px 8px;border-radius:4px;font-size:12px;font-weight:600;">' + timeStr + '</span>' +
                '<span style="font-size:11px;color:var(--h-text-sec);">' + esc(typeLabels[q.type] || q.type) + '</span>' +
            '</div>' +
            '<div style="margin-top:6px;">' +
                '<strong style="font-size:13px;">' + esc(q.title) + '</strong>' +
                '<p style="margin:4px 0 0;font-size:13px;color:var(--h-text-sec);">' + esc(q.questionText) + '</p>' +
            '</div>' +
            '<div style="margin-top:4px;display:flex;gap:6px;align-items:center;">' +
                '<label style="font-size:11px;">Timestamp:</label>' +
                '<input type="number" class="video-ts" data-idx="' + i + '" value="' + q.timestamp + '" min="0" style="width:60px;padding:2px 4px;border:1px solid var(--h-border);border-radius:4px;font-size:12px;" onchange="videoQuestions[' + i + '].timestamp=parseInt(this.value)||0">' +
                '<span style="font-size:11px;color:var(--h-text-sec);">giây</span>' +
            '</div>' +
        '</div>';
    }).join('');

    document.getElementById('video-results').innerHTML = html || '<p style="color:var(--h-danger);">Không tạo được câu hỏi từ video.</p>';
}

async function videoImport() {
    var selected = [];
    document.querySelectorAll('.video-q-check:checked').forEach(function(cb) {
        var idx = parseInt(cb.dataset.idx);
        if (videoQuestions[idx]) selected.push(videoQuestions[idx]);
    });
    if (selected.length === 0) { alert('Vui lòng chọn ít nhất 1 câu hỏi'); return; }

    var url = document.getElementById('video-url').value.trim();
    try {
        var data = await api('POST', '/banks/' + currentBankId + '/ai-video-import', {
            youtubeUrl: url,
            videoTitle: 'Video: ' + (currentBankName || ''),
            questions: selected
        });
        alert('Đã lưu video tương tác vào ngân hàng!');
        document.getElementById('video-modal').classList.remove('active');
        loadQuestions();
    } catch (err) {
        alert('Lỗi: ' + err.message);
    }
}

function showAssignmentModal() {
    if (!currentBankId) { alert('Vui lòng chọn ngân hàng trước'); return; }
    document.getElementById('assign-name').value = 'Kiểm tra ' + currentBankName;
    document.getElementById('assign-mode-random').checked = true;
    document.getElementById('assign-random-section').style.display = 'block';
    document.getElementById('assign-manual-section').style.display = 'none';

    // Show available question count
    var totalAvailable = currentQuestions ? currentQuestions.length : 0;
    document.getElementById('assign-available').textContent = '/ ' + totalAvailable + ' câu khả dụng';
    var pickInput = document.getElementById('assign-pick');
    pickInput.max = totalAvailable.toString();
    if (parseInt(pickInput.value) > totalAvailable) pickInput.value = totalAvailable.toString();

    // Load questions for manual selection
    var listEl = document.getElementById('assign-question-list');
    if (currentQuestions && currentQuestions.length > 0) {
        listEl.innerHTML = currentQuestions.map(function(q, i) {
            return '<label style="display:flex;align-items:center;gap:8px;padding:4px 0;cursor:pointer;border-bottom:1px solid #f0f0f0;">' +
                '<input type="checkbox" class="assign-q-check" data-id="' + q._id + '" checked>' +
                '<span style="font-size:13px;">' + esc(q.title) + '</span>' +
            '</label>';
        }).join('');
    } else {
        listEl.innerHTML = '<p style="color:var(--h-text-sec);font-size:13px;">Chưa có câu hỏi nào</p>';
    }

    // Load Canvas modules
    var moduleSelect = document.getElementById('assign-module');
    moduleSelect.innerHTML = '<option value="">Đang tải...</option>';
    api('GET', '/canvas-modules' + (CANVAS_COURSE_ID ? '?courseId=' + CANVAS_COURSE_ID : '')).then(function(data) {
        var modules = (data.modules || []).filter(function(m) { return m.name; });
        if (modules.length === 0) {
            moduleSelect.innerHTML = '<option value="">Không tìm thấy học phần</option>';
        } else {
            moduleSelect.innerHTML = modules.map(function(m) {
                return '<option value="' + m.id + '"' + (m.name === currentBankName ? ' selected' : '') + '>' + esc(m.name) + '</option>';
            }).join('');
        }
    }).catch(function() {
        moduleSelect.innerHTML = '<option value="">Lỗi tải học phần</option>';
    });

    document.getElementById('assignment-modal').classList.add('active');
}

async function publishAssignment() {
    var name = document.getElementById('assign-name').value.trim();
    if (!name) { alert('Vui lòng nhập tên bài tập'); return; }

    var moduleId = document.getElementById('assign-module').value;
    if (!moduleId) { alert('Vui lòng chọn học phần'); return; }

    var mode = document.querySelector('input[name="assign-mode"]:checked').value;
    var pickCount = parseInt(document.getElementById('assign-pick').value) || 5;

    // If manual mode, count selected
    if (mode === 'manual') {
        var checked = document.querySelectorAll('.assign-q-check:checked');
        pickCount = checked.length;
        if (pickCount === 0) { alert('Vui lòng chọn ít nhất 1 câu hỏi'); return; }
    }

    try {
        // Create quiz via existing API
        var quiz = await quizApi('POST', '/create', {
            name: name,
            description: '',
            questionGroups: [{
                bankId: currentBankId,
                pickCount: pickCount,
                pointsPerQuestion: 1
            }],
            settings: {
                shuffleQuestions: document.getElementById('assign-shuffle').checked,
                showProgressBar: document.getElementById('assign-progress').checked,
                passPercentage: parseInt(document.getElementById('assign-pass').value) || 0,
                allowedAttempts: parseInt(document.getElementById('assign-attempts').value) || -1
            }
        });

        // Publish with module
        var result = await quizApi('POST', '/publish/' + quiz._id, {
            canvasModuleId: moduleId,
            canvasCourseId: CANVAS_COURSE_ID
        });

        alert('Đã xuất bản! ' + result.snapshotCount + ' câu hỏi.');
        document.getElementById('assignment-modal').classList.remove('active');
    } catch (err) {
        alert('Lỗi: ' + err.message);
    }
}

function removeDiacritics(str) {
    return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function levenshteinSimilarity(a, b) {
    a = removeDiacritics(a); b = removeDiacritics(b);
    var m = a.length, n = b.length;
    if (m === 0 || n === 0) return 0;
    var dp = Array.from({length: m + 1}, function(_, i) { return i; });
    for (var j = 1; j <= n; j++) {
        var prev = dp[0]; dp[0] = j;
        for (var i = 1; i <= m; i++) {
            var temp = dp[i];
            dp[i] = a[i-1] === b[j-1] ? prev : 1 + Math.min(prev, dp[i], dp[i-1]);
            prev = temp;
        }
    }
    return 1 - dp[m] / Math.max(m, n);
}

var SIMILARITY_THRESHOLD = 0.8;

function openTextPage() {
    var editor = document.getElementById('ai-text-page-editor');
    var page = document.getElementById('ai-text-page');
    editor.value = document.getElementById('ai-text').value;
    page.style.display = 'flex';
    editor.focus();
}
function closeTextPage() {
    document.getElementById('ai-text').value = document.getElementById('ai-text-page-editor').value;
    document.getElementById('ai-text-page').style.display = 'none';
}

async function loadCanvasPages() {
    var container = document.getElementById('ai-pages-list');
    var nameLabel = document.getElementById('ai-module-name');
    if (!container) return;
    if (nameLabel) nameLabel.textContent = currentBankName || '';
    container.innerHTML = 'Đang tải...';

    try {
        var data = await api('GET', '/canvas-modules' + (CANVAS_COURSE_ID ? '?courseId=' + CANVAS_COURSE_ID : ''));
        var modules = data.modules || [];
        // Find module matching current bank name
        var matched = modules.find(function(m) { return m.name === currentBankName; });
        var items = matched ? matched.items.filter(function(it) { return it.type === 'Page' && it.pageUrl; }) : [];

        if (items.length === 0) {
            container.innerHTML = '<div style="color:var(--h-text-sec);padding:8px;">Không có bài học nào trong học phần này</div>';
            return;
        }

        container.innerHTML = items.map(function(item, i) {
            return '<label style="display:flex;align-items:center;gap:8px;padding:6px 4px;cursor:pointer;border-bottom:1px solid #f0f0f0;">' +
                '<input type="checkbox" class="ai-page-cb" data-url="' + esc(item.pageUrl) + '" checked>' +
                '<span>' + esc(item.title) + '</span>' +
            '</label>';
        }).join('');
    } catch (err) {
        container.innerHTML = '<div style="color:var(--h-danger);padding:8px;">Lỗi: ' + esc(err.message) + '</div>';
    }
}

async function loadSelectedPages() {
    var checkboxes = document.querySelectorAll('.ai-page-cb:checked');
    if (checkboxes.length === 0) { alert('Vui lòng chọn ít nhất 1 bài học'); return; }

    var textArea = document.getElementById('ai-text');
    textArea.value = '';
    var btn = document.getElementById('btn-ai-load-selected');
    if (btn) { btn.disabled = true; btn.textContent = 'Đang tải...'; }

    for (var i = 0; i < checkboxes.length; i++) {
        var url = checkboxes[i].dataset.url;
        try {
            var cacheKey = 'canvas-page:' + url;
            var cached = sessionStorage.getItem(cacheKey);
            var data;
            if (cached) {
                data = JSON.parse(cached);
            } else {
                data = await api('GET', '/canvas-pages/' + encodeURIComponent(url) + (CANVAS_COURSE_ID ? '?courseId=' + CANVAS_COURSE_ID : ''));
                try { sessionStorage.setItem(cacheKey, JSON.stringify(data)); }
                catch(e2) { /* QuotaExceededError */ }
            }
            textArea.value += (textArea.value ? '\\n\\n' : '') + '--- ' + data.title + ' ---\\n' + data.body;
        } catch (e) { /* skip */ }
    }

    if (btn) { btn.disabled = false; btn.textContent = 'Tải nội dung đã chọn'; }
    // Open full-page editor after loading content
    openTextPage();
}

async function aiGenerate(skipCache) {
    var text = document.getElementById('ai-text').value;
    var notes = document.getElementById('ai-notes').value;

    // PDF extract (if file selected) — server-side parsing
    var pdfText = '';
    var pdfFile = document.getElementById('ai-pdf').files[0];
    if (pdfFile) {
        try {
            var formData = new FormData();
            formData.append('pdf', pdfFile);
            var pdfUrl = API_BASE + '/parse-pdf' + (LTIK ? '?ltik=' + encodeURIComponent(LTIK) : '');
            var pdfResp = await fetch(pdfUrl, { method: 'POST', body: formData });
            if (pdfResp.ok) {
                var pdfData = await pdfResp.json();
                pdfText = pdfData.text || '';
            } else {
                var pdfErr = await pdfResp.json().catch(function() { return {}; });
                alert('Lỗi đọc PDF: ' + (pdfErr.error || 'Không rõ lỗi'));
                return;
            }
        } catch(e) { alert('Lỗi upload PDF: ' + e.message); return; }
    }

    if (!text.trim() && !pdfText.trim()) { alert('Vui lòng nhập nội dung bài giảng hoặc upload PDF'); return; }

    // Collect all generation rows
    var rows = document.querySelectorAll('.ai-gen-row');
    var genGroups = [];
    rows.forEach(function(row) {
        var num = parseInt(row.querySelector('.ai-num').value) || 5;
        var type = row.querySelector('.ai-type').value;
        var diff = row.querySelector('.ai-diff').value;
        genGroups.push({ num: num, type: type, diff: diff });
    });
    if (genGroups.length === 0) return;

    document.getElementById('ai-input-section').style.display = 'none';
    document.getElementById('ai-loading').style.display = 'block';
    var totalGroups = genGroups.length;
    document.getElementById('ai-loading').innerHTML = '<div style="text-align:center;padding:40px;"><div class="spinner"></div><p style="margin-top:16px;color:var(--h-text-sec);">Đang tạo câu hỏi bằng AI (' + totalGroups + ' dạng), có thể mất đến ' + (totalGroups * 15) + ' giây...</p></div>';
    document.getElementById('ai-preview').style.display = 'none';

    try {
        aiQuestions = [];
        for (var i = 0; i < genGroups.length; i++) {
            var g = genGroups[i];
            var data = await api('POST', '/banks/' + currentBankId + '/ai-generate', {
                text: text,
                notes: notes,
                pdfText: pdfText,
                numQuestions: g.num,
                questionType: g.type,
                difficulty: g.diff,
                skipCache: !!skipCache
            });
            var qs = data.questions || [];
            // Tag each question with its group type/difficulty for display
            qs.forEach(function(q) { q._genType = g.type; q._genDiff = g.diff; });
            aiQuestions = aiQuestions.concat(qs);
        }
        renderAIPreview();
    } catch (err) {
        var msg = err.message || 'Lỗi không xác định';
        if (msg.includes('quá tải') || msg.includes('429')) {
            msg = 'Gemini API đang quá tải. Vui lòng đợi 1-2 phút rồi thử lại.';
        }
        alert('Lỗi AI: ' + msg);
        document.getElementById('ai-input-section').style.display = 'block';
        document.getElementById('ai-loading').style.display = 'none';
    }
}

function renderAIPreview() {
    document.getElementById('ai-loading').style.display = 'none';
    document.getElementById('ai-preview').style.display = 'block';
    document.getElementById('ai-count').textContent = aiQuestions.length;

    var html = aiQuestions.map(function(q, i) {
        var answersHtml = q.answers.map(function(a) {
            return '<div style="padding:4px 8px;margin:2px 0;border-radius:4px;font-size:13px;' +
                (a.correct ? 'background:#e8f5e9;color:#2e7d32;font-weight:600;' : 'background:#f5f5f5;') +
                '">' + (a.correct ? '✓ ' : '✗ ') + esc(a.text) + '</div>';
        }).join('');

        return '<div style="border:1px solid var(--h-border);border-radius:8px;padding:14px;margin-bottom:10px;">' +
            '<div style="display:flex;align-items:flex-start;gap:10px;">' +
                '<input type="checkbox" class="ai-q-check" data-idx="' + i + '" checked style="margin-top:4px;">' +
                '<div style="flex:1;">' +
                    '<strong>' + esc(q.title) + '</strong>' +
                    (q.source ? '<div style="font-size:11px;color:#1976d2;margin-top:2px;">📄 ' + esc(q.source.replace(/^\\[Nguồn:\\s*/, '').replace(/]$/, '')) + '</div>' : '') +
                    (function() { for (var j = 0; j < existingTitles.length; j++) { if (levenshteinSimilarity(q.title, existingTitles[j]) >= SIMILARITY_THRESHOLD) return '<div style="font-size:11px;color:#e65100;margin-top:2px;">⚠️ Có thể trùng: "' + esc(existingTitles[j].substring(0, 50)) + '"</div>'; } return ''; })() +
                    '<p style="margin:6px 0;font-size:14px;">' + esc(q.questionText) + '</p>' +
                    answersHtml +
                    (q.explanation ? '<div style="margin-top:6px;font-size:12px;color:var(--h-text-sec);font-style:italic;">💡 ' + esc(q.explanation) + '</div>' : '') +
                '</div>' +
            '</div>' +
        '</div>';
    }).join('');

    document.getElementById('ai-results').innerHTML = html || '<p style="color:var(--h-danger);">Không tạo được câu hỏi. Thử lại với nội dung khác.</p>';
}

async function aiImport() {
    var selected = [];
    document.querySelectorAll('.ai-q-check:checked').forEach(function(cb) {
        var idx = parseInt(cb.dataset.idx);
        if (aiQuestions[idx]) selected.push(aiQuestions[idx]);
    });

    if (selected.length === 0) { alert('Vui lòng chọn ít nhất 1 câu hỏi'); return; }

    try {
        // Group selected questions by type
        var groups = {};
        selected.forEach(function(q) {
            var key = (q._genType || 'MultiChoice') + '|' + (q._genDiff || 'medium');
            if (!groups[key]) groups[key] = { type: q._genType || 'MultiChoice', diff: q._genDiff || 'medium', questions: [] };
            groups[key].questions.push(q);
        });

        var totalImported = 0;
        var totalSkipped = 0;
        for (var key in groups) {
            var g = groups[key];
            var data = await api('POST', '/banks/' + currentBankId + '/ai-import', {
                questions: g.questions,
                questionType: g.type,
                difficulty: g.diff
            });
            totalImported += data.imported || 0;
            totalSkipped += data.skipped || 0;
        }
        var msg = 'Đã thêm ' + totalImported + ' câu hỏi vào ngân hàng!';
        if (totalSkipped > 0) {
            msg += '\\n(' + totalSkipped + ' câu bị bỏ qua do trùng lặp)';
        }
        alert(msg);
        document.getElementById('ai-modal').classList.remove('active');
        loadQuestions();
    } catch (err) {
        alert('Lỗi import: ' + err.message);
    }
}

</script>

</body>
</html>`;
}
