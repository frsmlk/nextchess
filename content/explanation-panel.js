// NextChess — Explanation panel
// Design: native to chess.com sidebar + retro-sleek flair

const ExplanationPanel = (() => {
  let _panel = null;
  let _isMinimized = false;
  let _onExplainClick = null;

  function create() {
    if (_panel) return;

    _panel = document.createElement('div');
    _panel.className = 'nextchess-panel';
    _panel.innerHTML = `
      <div class="nextchess-panel-header">
        <div class="nextchess-panel-brand">
          <div class="nextchess-panel-logo">N</div>
          <span class="nextchess-panel-title">NextChess</span>
        </div>
        <div class="nextchess-panel-controls">
          <button class="nextchess-btn-toggle" title="Toggle panel">&mdash;</button>
        </div>
      </div>
      <div class="nextchess-panel-body">
        <div class="nextchess-accent"></div>
        <div class="nextchess-state nextchess-no-key" style="display:none">
          <p>API key needed for AI analysis.</p>
          <p class="nextchess-hint">Click the NextChess icon in your toolbar</p>
        </div>
        <div class="nextchess-state nextchess-ready" style="display:none">
          <button class="nextchess-btn nextchess-btn-full nextchess-btn-explain">Explain Position</button>
          <p class="nextchess-hint">Arrows show top engine moves on the board</p>
        </div>
        <div class="nextchess-state nextchess-loading" style="display:none">
          <div class="nextchess-spinner"></div>
          <p>analyzing</p>
        </div>
        <div class="nextchess-state nextchess-error" style="display:none">
          <p class="nextchess-error-msg"></p>
          <button class="nextchess-btn nextchess-btn-ghost nextchess-btn-full nextchess-btn-retry">Retry</button>
        </div>
        <div class="nextchess-state nextchess-result" style="display:none"></div>
      </div>
    `;

    // Place inside the sidebar tab content, below the analysis view
    const tabContent = document.querySelector('.sidebar-tab-content-component') ||
                       document.querySelector('.sidebar-view-content');
    if (tabContent) {
      tabContent.appendChild(_panel);
    } else {
      const sidebar = document.querySelector('.sidebar-component');
      if (sidebar) {
        sidebar.appendChild(_panel);
      } else {
        _panel.classList.add('nextchess-panel-floating');
        document.body.appendChild(_panel);
      }
    }

    // Events
    _panel.querySelector('.nextchess-btn-toggle').addEventListener('click', toggleMinimize);
    _panel.querySelector('.nextchess-btn-explain').addEventListener('click', () => _onExplainClick?.());
    _panel.querySelector('.nextchess-btn-retry').addEventListener('click', () => _onExplainClick?.());

    checkApiKey();
  }

  function onExplain(cb) { _onExplainClick = cb; }

  function checkApiKey() {
    chrome.storage.sync.get(['claudeApiKey'], (r) => {
      showState(r.claudeApiKey ? 'ready' : 'no-key');
    });
  }

  function showState(state) {
    if (!_panel) return;
    _panel.querySelectorAll('.nextchess-state').forEach(el => el.style.display = 'none');
    const target = _panel.querySelector(`.nextchess-${state}`);
    if (target) target.style.display = (state === 'loading') ? 'flex' : 'block';
  }

  function showLoading() { showState('loading'); }

  function showError(msg) {
    if (!_panel) return;
    _panel.querySelector('.nextchess-error-msg').textContent = msg;
    showState('error');
  }

  function showExplanation(data) {
    if (!_panel) return;
    const el = _panel.querySelector('.nextchess-result');
    let h = '';

    // Summary
    if (data.summary) {
      h += `<div class="nextchess-section">
        <div class="nextchess-section-label">Position</div>
        <p class="nextchess-summary">${esc(data.summary)}</p>
      </div>`;
    }

    // Best moves
    if (data.bestMoves?.length) {
      h += `<div class="nextchess-section">
        <div class="nextchess-section-label">Best Moves</div>`;
      data.bestMoves.forEach((m, i) => {
        const rankClass = i < 3 ? `nextchess-move-rank-${i + 1}` : 'nextchess-move-rank-3';
        h += `<div class="nextchess-move">
          <div class="nextchess-move-rank ${rankClass}">${i + 1}</div>
          <div class="nextchess-move-body">
            <div class="nextchess-move-top">
              <span class="nextchess-move-san">${esc(m.move)}</span>
              ${m.concept ? `<span class="nextchess-move-concept">${esc(m.concept)}</span>` : ''}
            </div>
            <p class="nextchess-move-why">${esc(m.why)}</p>
          </div>
        </div>`;
      });
      h += `</div>`;
    }

    // Worst move
    if (data.worstMove) {
      h += `<div class="nextchess-section">
        <div class="nextchess-section-label">Avoid</div>
        <div class="nextchess-move nextchess-move-bad">
          <div class="nextchess-move-rank nextchess-move-rank-bad">!</div>
          <div class="nextchess-move-body">
            <div class="nextchess-move-top">
              <span class="nextchess-move-san">${esc(data.worstMove.move)}</span>
              ${data.worstMove.concept ? `<span class="nextchess-move-concept">${esc(data.worstMove.concept)}</span>` : ''}
            </div>
            <p class="nextchess-move-why">${esc(data.worstMove.why)}</p>
          </div>
        </div>
      </div>`;
    }

    // Re-explain
    h += `<div class="nextchess-divider"></div>`;
    h += `<button class="nextchess-btn nextchess-btn-ghost nextchess-btn-full nextchess-btn-again">Explain Again</button>`;

    el.innerHTML = h;
    el.querySelector('.nextchess-btn-again')?.addEventListener('click', () => _onExplainClick?.());
    showState('result');
  }

  function toggleMinimize() {
    if (!_panel) return;
    _isMinimized = !_isMinimized;
    _panel.classList.toggle('nextchess-minimized', _isMinimized);
    const btn = _panel.querySelector('.nextchess-btn-toggle');
    btn.innerHTML = _isMinimized ? '&#43;' : '&mdash;';
  }

  function hide() { if (_panel) _panel.style.display = 'none'; }
  function show() { if (_panel) _panel.style.display = ''; }

  function esc(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  function destroy() { _panel?.remove(); _panel = null; }

  return { create, onExplain, showLoading, showError, showExplanation, showState, checkApiKey, show, hide, destroy };
})();
