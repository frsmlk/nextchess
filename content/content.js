// NextChess — Main orchestrator

(async () => {
  const board = await waitFor('wc-chess-board');
  if (!board) return;

  BoardOverlay.init(board);

  // ─── Toggle ───
  let _overlayVisible = true;

  function createToggle() {
    const tryInsert = (attempts = 0) => {
      const switchMenu = document.querySelector('.switch-menu-component');
      if (!switchMenu) {
        if (attempts < 20) setTimeout(() => tryInsert(attempts + 1), 300);
        return;
      }

      const group = document.createElement('div');
      group.className = 'switch-group-component';
      group.innerHTML = `
        <div class="cc-switch-component cc-switch-secondary cc-switch-small" data-cy="cc-switch-nextchess">
          <input checked type="checkbox" class="cc-switch-checkbox" id="nextchess-toggle" name="nextchess-toggle">
          <label class="cc-switch-label" for="nextchess-toggle">
            <div class="cc-switch-button">
              <svg xmlns="http://www.w3.org/2000/svg" class="cc-switch-glyph" viewBox="0 0 90 90">
                <path class="cc-switch-glyph-correct" d="m55.6 45 16.9-16.9a2 2 0 0 0 0-3L65 17.6a2 2 0 0 0-3 0L45 34.4 28.1 17.5a2 2 0 0 0-3 0L17.6 25a2 2 0 0 0 0 3l16.8 17-16.9 16.9a2 2 0 0 0 0 3l7.5 7.5a2 2 0 0 0 3 0l17-16.9 16.8 17a2 2 0 0 0 3 0l7.6-7.6a2 2 0 0 0 0-3z"></path>
                <path class="cc-switch-glyph-incorrect" d="M78.4 27.2 71 19.7a2 2 0 0 0-3 0l-31 31-14.7-14.8a2 2 0 0 0-3 0l-7.6 7.5a2 2 0 0 0 0 3l23.8 23.9a2 2 0 0 0 3.1 0l9-9.1 31-31a2 2 0 0 0 0-3"></path>
              </svg>
            </div>
          </label>
        </div>
        <label class="switch-group-label" for="nextchess-toggle">NextChess</label>
      `;
      switchMenu.appendChild(group);

      const checkbox = group.querySelector('#nextchess-toggle');
      checkbox.addEventListener('change', () => {
        _overlayVisible = checkbox.checked;
        BoardOverlay.setVisible(_overlayVisible);
      });
    };
    tryInsert();
  }

  createToggle();

  // ─── Position cache ───
  const _cache = new Map();

  // ─── State ───
  let _lastFen = null;
  let _settled = false;
  let _settleTimer = null;
  let _settleRetries = 0;

  setInterval(poll, 500);
  poll();

  function poll() {
    try {
      if (!_overlayVisible) return;

      const fen = DomReader.getFEN();
      if (!fen) return;

      // ── New position ──
      if (fen !== _lastFen) {
        _lastFen = fen;
        _settled = false;
        _settleRetries = 0;
        clearSettle();

        // Clear the board immediately — clean slate
        BoardOverlay.clear();

        // Cached? Show instantly
        if (_cache.has(fen)) {
          _settled = true;
          const flip = DomReader.isBoardFlipped();
          restoreFromCache(fen, flip);
          return;
        }

        // Not cached — show a tiny "thinking" dot, then wait
        BoardOverlay.showThinking();

        // Settle after 1.5s (enough for engine + user to pause)
        _settleTimer = setTimeout(() => doSettle(), 1500);
        return;
      }

      // ── Same position, not yet settled ──
      // Do nothing — let the settle timer fire

    } catch (e) {}
  }

  function restoreFromCache(fen, flip) {
    const c = _cache.get(fen);
    if (!c) return;
    chrome.storage.sync.get(['numLinesToShow'], (s) => {
      BoardOverlay.drawEngineLines(c.lines, fen, flip, s.numLinesToShow || 3, true);
      if (c.played) {
        BoardOverlay.drawPlayedMove(c.played, fen, flip, c.matchRank);
      }
    });
  }

  function doSettle() {
    if (_settled) return;
    clearSettle();

    const fen = DomReader.getFEN();
    if (!fen || fen !== _lastFen) return; // position changed while waiting

    const lines = DomReader.getEngineLines();
    const played = DomReader.getPlayedMove();
    const flip = DomReader.isBoardFlipped();

    // No lines yet — retry up to 3 times
    if (lines.length === 0) {
      _settleRetries++;
      if (_settleRetries < 3) {
        _settleTimer = setTimeout(() => doSettle(), 1000);
        return;
      }
      BoardOverlay.clear();
      _settled = true;
      return;
    }

    _settled = true;
    BoardOverlay.hideThinking();

    // Compute matchRank
    let matchRank = -1;
    if (played) {
      for (let i = 0; i < lines.length && i < 2; i++) {
        if (!lines[i].moves?.length) continue;
        try {
          const eng = ChessUtils.resolveMove(lines[i].moves[0], fen);
          const pl = ChessUtils.resolveMove(played, fen);
          if (eng?.to && pl?.to && eng.to === pl.to &&
              eng?.from && pl?.from && eng.from === pl.from) {
            matchRank = i;
            break;
          }
        } catch (e) {}
      }
    }

    // Cache
    _cache.set(fen, { lines, played, matchRank });
    if (_cache.size > 200) {
      const first = _cache.keys().next().value;
      _cache.delete(first);
    }

    // Draw everything at once — single fade, no stagger
    chrome.storage.sync.get(['numLinesToShow'], (s) => {
      BoardOverlay.drawEngineLines(lines, fen, flip, s.numLinesToShow || 3, false);
      if (played) {
        BoardOverlay.drawPlayedMove(played, fen, flip, matchRank);
      }
    });
  }

  function clearSettle() {
    if (_settleTimer) { clearTimeout(_settleTimer); _settleTimer = null; }
  }

  function waitFor(sel, tries = 50, ms = 200) {
    return new Promise(r => {
      let n = 0;
      const c = () => {
        const el = document.querySelector(sel);
        if (el) r(el);
        else if (++n >= tries) r(null);
        else setTimeout(c, ms);
      };
      c();
    });
  }
})();
