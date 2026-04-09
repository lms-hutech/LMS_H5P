/**
 * HUTECH University branded theme for H5P in Canvas LMS.
 * Injects CSS design system + branded UI components.
 */

// HUTECH logo - real PNG image served from /hutech_logo.png
const HUTECH_LOGO_HTML = `<img src="/hutech_logo.png" alt="HUTECH" style="height:56px;width:auto;object-fit:contain;">`;

/**
 * Full CSS design system with HUTECH branding
 */
export const THEME_CSS = `
<style>
  :root {
    --h-primary: #1a73e8;
    --h-primary-dark: #1557b0;
    --h-accent: #C41E3A;
    --h-accent-light: #FDE8EC;
    --h-success: #2e7d32;
    --h-success-bg: #e8f5e9;
    --h-warning: #f57c00;
    --h-warning-bg: #fff3e0;
    --h-danger: #c62828;
    --h-danger-bg: #ffebee;
    --h-surface: #ffffff;
    --h-surface-alt: #f8f9fa;
    --h-text: #202124;
    --h-text-sec: #5f6368;
    --h-border: #dadce0;
    --h-shadow: 0 1px 3px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.08);
    --h-shadow-lg: 0 8px 32px rgba(0,0,0,0.2);
    --h-radius: 8px;
    --h-font: 'Segoe UI', Roboto, -apple-system, sans-serif;
  }
  html, body { margin: 0; padding: 0; font-family: var(--h-font); }

  /* Header Bar */
  .hutech-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 12px 20px; background: var(--h-surface-alt);
    border-bottom: 1px solid var(--h-border); flex-wrap: wrap; gap: 8px;
  }
  .hutech-header .brand {
    display: flex; align-items: center; gap: 10px;
  }
  .hutech-header .brand-name {
    font-size: 14px; font-weight: 600; color: var(--h-text);
  }
  .hutech-header .brand-accent {
    color: var(--h-accent); font-weight: 700;
  }
  .hutech-header .actions {
    display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
  }

  /* Buttons */
  .h-btn {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 8px 16px; border-radius: 6px; font-size: 14px;
    font-weight: 500; cursor: pointer; border: 2px solid transparent;
    transition: all 0.2s; font-family: var(--h-font); text-decoration: none;
  }
  .h-btn-primary {
    background: transparent; color: var(--h-primary); border-color: var(--h-primary);
  }
  .h-btn-primary:hover {
    background: var(--h-primary); color: white;
  }
  .h-btn-accent {
    background: transparent; color: var(--h-accent); border-color: var(--h-accent);
  }
  .h-btn-accent:hover {
    background: var(--h-accent); color: white;
  }
  .h-btn-sm {
    padding: 6px 12px; font-size: 13px;
  }

  /* Badge */
  .h-badge {
    display: inline-flex; align-items: center; gap: 4px;
    padding: 4px 12px; border-radius: 12px; font-size: 13px; font-weight: 600;
    color: white;
  }
  .h-badge-primary { background: var(--h-primary); }
  .h-badge-warning { background: var(--h-warning); }
  .h-badge-danger { background: var(--h-danger); }

  /* Score Result Card */
  .h-score-card {
    display: none; margin: 0; padding: 16px 20px;
    border-left: 4px solid var(--h-success);
    background: var(--h-success-bg);
    font-family: var(--h-font);
  }
  .h-score-card.active { display: block; }
  .h-score-card.fail {
    border-left-color: var(--h-danger); background: var(--h-danger-bg);
  }
  .h-score-card .score-header {
    display: flex; align-items: center; gap: 8px; margin-bottom: 8px;
    font-size: 15px; font-weight: 600; color: var(--h-text);
  }
  .h-score-card .score-bar {
    height: 8px; border-radius: 4px; background: var(--h-border);
    margin: 8px 0; overflow: hidden;
  }
  .h-score-card .score-bar-fill {
    height: 100%; border-radius: 4px;
    background: linear-gradient(90deg, var(--h-primary), var(--h-success));
    transition: width 0.8s ease;
  }
  .h-score-card.fail .score-bar-fill {
    background: linear-gradient(90deg, var(--h-danger), var(--h-warning));
  }
  .h-score-card .score-details {
    display: flex; gap: 16px; flex-wrap: wrap; font-size: 14px; color: var(--h-text-sec);
  }
  .h-score-card .score-big {
    font-size: 28px; font-weight: 700; color: var(--h-success);
  }
  .h-score-card.fail .score-big { color: var(--h-danger); }
  .h-score-card .score-pct {
    font-size: 16px; color: var(--h-text-sec); margin-left: 4px;
  }

  /* Exhausted State */
  .h-exhausted {
    display: none; padding: 16px 20px;
    border-left: 4px solid var(--h-warning);
    background: var(--h-warning-bg);
    font-family: var(--h-font);
  }
  .h-exhausted.active { display: block; }
  .h-exhausted .exhausted-title {
    font-size: 15px; font-weight: 600; color: var(--h-warning);
    margin-bottom: 4px;
  }
  .h-exhausted .exhausted-text {
    font-size: 14px; color: var(--h-text-sec);
  }
  .h-exhausted .exhausted-score {
    margin-top: 8px; font-size: 14px; color: var(--h-text);
    font-weight: 600;
  }

  /* History Modal */
  .h-modal-overlay {
    display: none; position: fixed; top: 0; left: 0;
    width: 100%; height: 100%; background: rgba(0,0,0,0.5);
    z-index: 99999; justify-content: center; align-items: center;
  }
  .h-modal-overlay.active { display: flex; }
  .h-modal {
    background: var(--h-surface); border-radius: 12px;
    padding: 0; max-width: 520px; width: 92%; max-height: 80vh;
    overflow: hidden; box-shadow: var(--h-shadow-lg);
  }
  .h-modal-header {
    display: flex; justify-content: space-between; align-items: center;
    padding: 16px 20px; border-bottom: 1px solid var(--h-border);
    background: var(--h-surface-alt);
  }
  .h-modal-header h3 {
    margin: 0; font-size: 16px; font-weight: 600; color: var(--h-text);
    display: flex; align-items: center; gap: 8px;
  }
  .h-modal-close {
    background: none; border: none; font-size: 22px; cursor: pointer;
    color: var(--h-text-sec); padding: 4px 8px; border-radius: 4px;
  }
  .h-modal-close:hover { background: var(--h-border); }
  .h-modal-body {
    padding: 16px 20px; overflow-y: auto; max-height: 60vh;
  }
  .h-modal-footer {
    padding: 12px 20px; border-top: 1px solid var(--h-border);
    background: var(--h-surface-alt); text-align: right;
  }

  /* History Table */
  .h-history-row {
    display: flex; align-items: center; gap: 12px; padding: 10px 0;
    border-bottom: 1px solid #f0f0f0; font-size: 14px;
  }
  .h-history-row:last-child { border-bottom: none; }
  .h-history-num {
    width: 28px; height: 28px; border-radius: 50%;
    background: var(--h-surface-alt); display: flex;
    align-items: center; justify-content: center;
    font-size: 12px; font-weight: 600; color: var(--h-text-sec);
    flex-shrink: 0;
  }
  .h-history-bar {
    flex: 1; height: 6px; border-radius: 3px;
    background: var(--h-border); overflow: hidden;
  }
  .h-history-bar-fill {
    height: 100%; border-radius: 3px;
    background: var(--h-primary); transition: width 0.5s;
  }
  .h-history-bar-fill.fail { background: var(--h-danger); }
  .h-history-pct {
    width: 40px; text-align: right; font-weight: 600; font-size: 13px;
  }
  .h-history-pct.pass { color: var(--h-success); }
  .h-history-pct.fail { color: var(--h-danger); }
  .h-history-meta {
    font-size: 12px; color: var(--h-text-sec); width: 110px; text-align: right;
  }
  .h-history-best {
    margin-top: 12px; padding: 10px 14px; border-radius: 8px;
    background: #e3f2fd; font-size: 14px; color: #1565c0;
    display: flex; align-items: center; gap: 8px;
  }
  .h-no-data {
    text-align: center; padding: 24px; color: var(--h-text-sec); font-size: 14px;
  }
</style>`;

/**
 * Build header HTML for instructor view
 */
export function instructorHeader(
    contentId: string,
    overwriteId: string
): string {
    return `
    <div class="hutech-header">
        <div class="brand">
            ${HUTECH_LOGO_HTML}
        </div>
        <div class="actions">
            <button class="h-btn h-btn-primary" onclick="window.location.href='/h5p/edit/${contentId}'">
                ✏️ Chỉnh sửa
            </button>
            <button class="h-btn h-btn-accent" onclick="window.location.href='/h5p/new?overwriteId=${overwriteId}'">
                🔄 Tạo lại
            </button>
        </div>
    </div>`;
}

/**
 * Build header + score panel + history modal HTML for student view
 */
export function studentUI(
    contentId: string,
    userId: string,
    currentAttempts: number,
    maxAttempts: number,
    exhausted: boolean,
    ltik: string
): string {
    const badgeClass = exhausted
        ? 'h-badge-danger'
        : maxAttempts > 0 && currentAttempts >= maxAttempts - 1
          ? 'h-badge-warning'
          : 'h-badge-primary';

    return `
    <div class="hutech-header">
        <div class="brand">
            ${HUTECH_LOGO_HTML}
        </div>
        <div class="actions">
            ${maxAttempts > 0 ? `<span class="h-badge ${badgeClass}" id="attempt-badge">📝 Lần ${currentAttempts}/${maxAttempts}</span>` : ''}
            <button class="h-btn h-btn-primary h-btn-sm" onclick="document.getElementById('h5p-history-modal').className='h-modal-overlay active'; loadHistory();">
                📋 Lịch sử
            </button>
        </div>
    </div>

    <div class="h-score-card" id="h5p-score-result"></div>

    <div class="h-exhausted ${exhausted ? 'active' : ''}" id="h5p-exhausted">
        <div class="exhausted-title">⚠️ Bạn đã sử dụng hết ${currentAttempts}/${maxAttempts} lượt làm bài</div>
        <div class="exhausted-text">Liên hệ giảng viên nếu cần thêm lượt.</div>
        <div class="exhausted-score" id="h5p-exhausted-score"></div>
    </div>

    <!-- History Modal -->
    <div class="h-modal-overlay" id="h5p-history-modal" onclick="if(event.target===this)this.className='h-modal-overlay'">
        <div class="h-modal">
            <div class="h-modal-header">
                <h3>📋 Lịch sử làm bài</h3>
                <button class="h-modal-close" onclick="document.getElementById('h5p-history-modal').className='h-modal-overlay'">✕</button>
            </div>
            <div class="h-modal-body" id="h5p-history-content">
                <div class="h-no-data">Đang tải...</div>
            </div>
            <div class="h-modal-footer">
                <button class="h-btn h-btn-primary h-btn-sm" onclick="document.getElementById('h5p-history-modal').className='h-modal-overlay'">Đóng</button>
            </div>
        </div>
    </div>`;
}

/**
 * Client-side JavaScript for student scoring + history
 */
export function studentScript(
    contentId: string,
    userId: string,
    currentAttempts: number,
    maxAttempts: number,
    exhausted: boolean
): string {
    return (
        `
    <sc` +
        `ript>
    (function() {
        var maxAttempts = ${maxAttempts};
        var currentAttempts = ${currentAttempts};
        var exhausted = ${exhausted};
        var submitting = false;

        function disableAll() {
            setInterval(function() {
                document.querySelectorAll('.h5p-question-try-again, [class*="retry"], [class*="Retry"], .h5p-question-check-answer, .h5p-joubelui-button, .h5p-question-buttons button').forEach(function(btn) {
                    btn.style.display = 'none';
                });
                document.querySelectorAll('.h5p-content input, .h5p-content textarea, .h5p-content select').forEach(function(el) {
                    el.setAttribute('disabled', 'disabled');
                });
            }, 500);
        }

        function hideRetry() {
            setInterval(function() {
                document.querySelectorAll('.h5p-question-try-again, [class*="retry"], [class*="Retry"]').forEach(function(btn) {
                    btn.style.display = 'none';
                });
            }, 500);
        }

        if (exhausted) disableAll();

        // Show score result
        window.showScoreResult = function(score, maxScore) {
            var pct = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;
            var pass = pct >= 50;
            var el = document.getElementById('h5p-score-result');
            el.className = 'h-score-card active' + (pass ? '' : ' fail');
            el.innerHTML = '<div class="score-header">' + (pass ? '✅' : '❌') + ' Kết quả</div>'
                + '<div style="display:flex;align-items:baseline;gap:8px"><span class="score-big">' + score + '/' + maxScore + '</span><span class="score-pct">(' + pct + '%)</span></div>'
                + '<div class="score-bar"><div class="score-bar-fill" style="width:' + pct + '%"></div></div>'
                + '<div class="score-details"><span>📊 Điểm: ' + score + '/' + maxScore + '</span><span>📝 Lần: ' + currentAttempts + '/' + maxAttempts + '</span></div>';
        };

        // XHR interceptor for finishedData
        var origOpen = XMLHttpRequest.prototype.open;
        var origSend = XMLHttpRequest.prototype.send;
        XMLHttpRequest.prototype.open = function(m, u) { this._url = u; this._method = m; return origOpen.apply(this, arguments); };
        XMLHttpRequest.prototype.send = function(body) {
            if (this._method === 'POST' && this._url && this._url.indexOf('finishedData') !== -1) {
                if (submitting) return origSend.apply(this, arguments);
                submitting = true;
                try {
                    var params = new URLSearchParams(body);
                    var s = parseFloat(params.get('score')) || 0;
                    var ms = parseFloat(params.get('maxScore')) || 1;
                    if (window.showScoreResult) window.showScoreResult(s, ms);
                } catch(e) {}
                this.addEventListener('load', function() {
                    fetch('/h5p/attempts/${contentId}/${userId}')
                        .then(function(r) { return r.json(); })
                        .then(function(data) {
                            currentAttempts = data.attempts || (currentAttempts + 1);
                            var badge = document.getElementById('attempt-badge');
                            if (badge) {
                                badge.textContent = '📝 Lần ' + currentAttempts + '/' + maxAttempts;
                                badge.className = 'h-badge ' + (currentAttempts >= maxAttempts ? 'h-badge-danger' : currentAttempts >= maxAttempts - 1 ? 'h-badge-warning' : 'h-badge-primary');
                            }
                            if (maxAttempts > 0 && currentAttempts >= maxAttempts) {
                                disableAll();
                                document.getElementById('h5p-exhausted').className = 'h-exhausted active';
                            } else {
                                submitting = false;
                            }
                        }).catch(function() { submitting = false; });
                });
            }
            return origSend.apply(this, arguments);
        };

        document.addEventListener('click', function(e) {
            if (e.target && (e.target.className || '').indexOf('retry') !== -1) submitting = false;
        }, true);

        // Load history
        window.loadHistory = function() {
            fetch('/h5p/attempts/${contentId}/${userId}')
                .then(function(r) { return r.json(); })
                .then(function(data) {
                    var el = document.getElementById('h5p-history-content');
                    if (!data.history || data.history.length === 0) {
                        el.innerHTML = '<div class="h-no-data">Chưa có lần làm bài nào.</div>';
                        return;
                    }
                    var html = '';
                    data.history.forEach(function(h) {
                        var pass = h.percentage >= 50;
                        var mins = Math.floor(h.duration / 60);
                        var secs = h.duration % 60;
                        var timeStr = mins > 0 ? mins + ':' + (secs < 10 ? '0' : '') + secs : secs + 's';
                        var dateStr = new Date(h.completedAt).toLocaleString('vi-VN', {day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
                        html += '<div class="h-history-row">'
                            + '<div class="h-history-num">' + h.attempt + '</div>'
                            + '<div class="h-history-bar"><div class="h-history-bar-fill ' + (pass ? '' : 'fail') + '" style="width:' + h.percentage + '%"></div></div>'
                            + '<div class="h-history-pct ' + (pass ? 'pass' : 'fail') + '">' + h.percentage + '%</div>'
                            + '<div class="h-history-meta">' + h.score + '/' + h.maxScore + ' · ' + dateStr + '</div>'
                            + '</div>';
                    });
                    var best = data.history.reduce(function(a, b) { return a.percentage > b.percentage ? a : b; });
                    html += '<div class="h-history-best">🏆 Điểm cao nhất: <strong>' + best.score + '/' + best.maxScore + ' (' + best.percentage + '%)</strong></div>';
                    el.innerHTML = html;
                });
        };
    })();
    </sc` +
        `ript>`
    );
}

/**
 * Editor header (for Deep Linking page)
 */
export function editorHeader(): string {
    return `
    <div class="hutech-header">
        <div class="brand">
            ${HUTECH_LOGO_HTML}
        </div>
    </div>`;
}
