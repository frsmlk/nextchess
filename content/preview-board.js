// NextChess — Mini preview board
// Animated pieces, media controls, clickable move bar

const PreviewBoard = (() => {
  let _container = null;
  let _boardEl = null;
  let _piecesLayer = null;
  let _moveBar = null;
  let _timer = null;
  let _currentStep = 0;
  let _pieces = null;
  let _pieceEls = null;
  let _pieceUrlBase = null;
  let _boardBgUrl = null;
  let _flip = false;
  let _moveSound = null;
  let _captureSound = null;
  let _isPlaying = true;
  let _moves = [];
  let _fen = null;
  let _sideToMove = 'w';
  let _hideTimeout = null;
  let _onHideCb = null;
  let _isHovered = false;

  const SQ = 12.5;

  function init() {
    if (_container) return;
    detectTheme();
    loadSounds();

    _container = document.createElement('div');
    _container.className = 'nextchess-preview';
    _container.style.display = 'none';

    // Keep open when hovering the popup itself
    _container.addEventListener('mouseenter', () => {
      clearHideTimeout();
      _isHovered = true;
    });
    _container.addEventListener('mouseleave', () => {
      _isHovered = false;
      scheduleHide();
    });

    // ─ Move bar with arrows ─
    const barWrap = document.createElement('div');
    barWrap.className = 'nextchess-preview-bar';

    const leftBtn = document.createElement('button');
    leftBtn.className = 'nextchess-preview-arrow nextchess-preview-arrow-left';
    leftBtn.textContent = '\u2039'; // ‹
    leftBtn.addEventListener('click', () => stepTo(_currentStep - 1));

    const rightBtn = document.createElement('button');
    rightBtn.className = 'nextchess-preview-arrow nextchess-preview-arrow-right';
    rightBtn.textContent = '\u203A'; // ›
    rightBtn.addEventListener('click', () => stepTo(_currentStep + 1));

    _moveBar = document.createElement('div');
    _moveBar.className = 'nextchess-preview-moves';

    barWrap.appendChild(leftBtn);
    barWrap.appendChild(_moveBar);
    barWrap.appendChild(rightBtn);
    _container.appendChild(barWrap);

    // ─ Board ─
    const boardWrap = document.createElement('div');
    boardWrap.className = 'nextchess-preview-board-wrap';

    _boardEl = document.createElement('div');
    _boardEl.className = 'nextchess-preview-board';
    if (_boardBgUrl) {
      _boardEl.style.backgroundImage = `url('${_boardBgUrl}')`;
      _boardEl.style.backgroundSize = 'cover';
    }

    for (let vr = 7; vr >= 0; vr--) {
      for (let vf = 0; vf < 8; vf++) {
        const cell = document.createElement('div');
        cell.className = 'nextchess-preview-cell';
        cell.classList.add((vr + vf) % 2 === 0 ? 'nextchess-preview-dark' : 'nextchess-preview-light');
        _boardEl.appendChild(cell);
      }
    }

    _piecesLayer = document.createElement('div');
    _piecesLayer.className = 'nextchess-preview-pieces';
    _boardEl.appendChild(_piecesLayer);

    boardWrap.appendChild(_boardEl);
    _container.appendChild(boardWrap);

    document.body.appendChild(_container);
  }

  function detectTheme() {
    const sample = document.querySelector('wc-chess-board .piece');
    if (sample) {
      const bg = getComputedStyle(sample).backgroundImage;
      const m = bg.match(/url\("?([^"]+\/pieces\/[^/]+\/\d+\/)\w+\.png"?\)/);
      if (m) _pieceUrlBase = m[1];
    }
    const st = document.getElementById('board-styles-analysis-board');
    if (st) {
      const m = st.textContent.match(/background-image:\s*url\('([^']+)'\)/);
      if (m) _boardBgUrl = m[1];
    }
    if (!_pieceUrlBase) _pieceUrlBase = 'https://images.chesscomfiles.com/chess-themes/pieces/neo/150/';
  }

  function loadSounds() {
    try {
      _moveSound = new Audio('https://images.chesscomfiles.com/chess-themes/sounds/_LATEST_/default/move-self.mp3');
      _captureSound = new Audio('https://images.chesscomfiles.com/chess-themes/sounds/_LATEST_/default/capture.mp3');
      _moveSound.volume = 0.3;
      _captureSound.volume = 0.3;
    } catch (e) {}
  }

  function playSound(cap) {
    try { const s = cap ? _captureSound : _moveSound; if (s) { s.currentTime = 0; s.play().catch(() => {}); } } catch (e) {}
  }

  // ─── Show / Hide ───

  function show(fen, moves, anchorX, anchorY, flip, onHide) {
    init();
    clearHideTimeout();
    stopAutoPlay();

    _flip = flip;
    _fen = fen;
    _moves = moves;
    _sideToMove = fen.split(' ')[1] || 'w';
    _currentStep = 0;
    _isPlaying = true;
    _onHideCb = onHide || null;

    _pieces = parseFen(fen);
    renderPieces();
    clearHighlights();
    renderMoveBar();


    const pw = 260, ph = 310;
    let left = anchorX + 16, top = anchorY - ph / 2;
    if (left + pw > window.innerWidth - 10) left = anchorX - pw - 16;
    if (top < 10) top = 10;
    if (top + ph > window.innerHeight - 10) top = window.innerHeight - ph - 10;

    _container.style.left = left + 'px';
    _container.style.top = top + 'px';
    _container.style.display = '';

    startAutoPlay();
  }

  function hide() {
    if (_container) _container.style.display = 'none';
    stopAutoPlay();
    if (_onHideCb) { _onHideCb(); _onHideCb = null; }
  }

  function scheduleHide() {
    clearHideTimeout();
    _hideTimeout = setTimeout(() => hide(), 200);
  }

  function clearHideTimeout() {
    if (_hideTimeout) { clearTimeout(_hideTimeout); _hideTimeout = null; }
  }

  // ─── Auto-play ───

  function startAutoPlay() {
    stopAutoPlay();
    if (!_isPlaying || !_moves.length) return;
    _timer = setInterval(() => {
      if (_currentStep >= _moves.length) {
        // Loop
        resetBoard();
        return;
      }
      doStep(_currentStep);
      _currentStep++;
      renderMoveBar();
    }, 1400);
  }

  function stopAutoPlay() {
    if (_timer) { clearInterval(_timer); _timer = null; }
  }

  function togglePlay() {
    _isPlaying = !_isPlaying;

    if (_isPlaying) {
      if (_currentStep >= _moves.length) resetBoard();
      startAutoPlay();
    } else {
      stopAutoPlay();
    }
  }

  // ─── Step to specific position ───

  function stepTo(n) {
    if (n < 0) n = 0;
    if (n > _moves.length) n = _moves.length;

    // Pause auto-play when manually stepping
    _isPlaying = false;

    stopAutoPlay();

    // Rebuild from scratch up to step n
    _pieces = parseFen(_fen);
    renderPieces();
    clearHighlights();

    let side = _sideToMove;
    let lastFrom = null, lastTo = null;

    for (let i = 0; i < n; i++) {
      const result = applyMoveToGrid(_pieces, _moves[i], side);
      if (result) {
        lastFrom = result.from;
        lastTo = result.to;
        side = side === 'w' ? 'b' : 'w';
      }
    }

    renderPieces();
    if (lastFrom && lastTo) {
      highlightSquares(lastFrom.f, lastFrom.r, lastTo.f, lastTo.r);
    }

    _currentStep = n;
    renderMoveBar();
  }

  function resetBoard() {
    _pieces = parseFen(_fen);
    _currentStep = 0;
    renderPieces();
    clearHighlights();
    renderMoveBar();
  }

  // ─── Move bar ───

  function renderMoveBar() {
    if (!_moveBar) return;
    _moveBar.innerHTML = '';

    _moves.forEach((m, i) => {
      if (i % 2 === 0) {
        const num = document.createElement('span');
        num.className = 'nextchess-preview-movenum';
        num.textContent = (Math.floor(i / 2) + 1) + '.';
        _moveBar.appendChild(num);
      }

      const span = document.createElement('span');
      span.className = 'nextchess-preview-move';
      if (i < _currentStep) span.classList.add('nextchess-preview-move-past');
      else if (i === _currentStep) span.classList.add('nextchess-preview-move-current');
      else span.classList.add('nextchess-preview-move-future');

      span.textContent = m;
      span.addEventListener('click', () => stepTo(i + 1));
      _moveBar.appendChild(span);
    });

    // Scroll current move into view
    const current = _moveBar.querySelector('.nextchess-preview-move-current');
    if (current) current.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  }

  // ─── Rendering ───

  function renderPieces() {
    if (!_piecesLayer) return;
    _piecesLayer.innerHTML = '';
    _pieceEls = Array.from({ length: 8 }, () => Array(8).fill(null));

    for (let r = 0; r < 8; r++) {
      for (let f = 0; f < 8; f++) {
        const pc = _pieces[r][f];
        if (!pc) continue;
        const img = mkPieceImg(pc, f, r);
        _piecesLayer.appendChild(img);
        _pieceEls[r][f] = img;
      }
    }
  }

  function mkPieceImg(pc, f, r) {
    const img = document.createElement('img');
    img.src = _pieceUrlBase + pc + '.png';
    img.className = 'nextchess-preview-piece';
    img.draggable = false;
    const p = sqPercent(f, r);
    img.style.left = p.left + '%';
    img.style.top = p.top + '%';
    img.style.width = SQ + '%';
    img.style.height = SQ + '%';
    return img;
  }

  function sqPercent(f, r) {
    return _flip
      ? { left: (7 - f) * SQ, top: r * SQ }
      : { left: f * SQ, top: (7 - r) * SQ };
  }

  // ─── Animated move (for auto-play) ───

  function doStep(idx) {
    const san = _moves[idx];
    let side = _sideToMove;
    for (let i = 0; i < idx; i++) side = side === 'w' ? 'b' : 'w';

    try {
      const fenStr = gridToFen(_pieces, side);
      const res = ChessUtils.resolveMove(san, fenStr);
      if (!res?.to) return;

      const toF = 'abcdefgh'.indexOf(res.to[0]);
      const toR = parseInt(res.to[1]) - 1;

      // Castling
      if (san === 'O-O' || san === 'O-O-O') {
        const rank = side === 'w' ? 0 : 7;
        if (san === 'O-O') {
          slidePiece(4, rank, 6, rank);
          slidePiece(7, rank, 5, rank);
          _pieces[rank][6] = _pieces[rank][4]; _pieces[rank][4] = null;
          _pieces[rank][5] = _pieces[rank][7]; _pieces[rank][7] = null;
        } else {
          slidePiece(4, rank, 2, rank);
          slidePiece(0, rank, 3, rank);
          _pieces[rank][2] = _pieces[rank][4]; _pieces[rank][4] = null;
          _pieces[rank][3] = _pieces[rank][0]; _pieces[rank][0] = null;
        }
        highlightSquares(4, rank, san === 'O-O' ? 6 : 2, rank);
        playSound(false);
        return;
      }

      if (!res.from) return;
      const fromF = 'abcdefgh'.indexOf(res.from[0]);
      const fromR = parseInt(res.from[1]) - 1;
      const isCapture = _pieces[toR][toF] !== null;

      if (isCapture && _pieceEls[toR]?.[toF]) {
        const cap = _pieceEls[toR][toF];
        cap.style.opacity = '0';
        cap.style.transform = 'scale(0.5)';
        setTimeout(() => cap.remove(), 200);
        _pieceEls[toR][toF] = null;
      }

      slidePiece(fromF, fromR, toF, toR);
      _pieces[toR][toF] = _pieces[fromR][fromF];
      _pieces[fromR][fromF] = null;

      highlightSquares(fromF, fromR, toF, toR);
      playSound(isCapture);
    } catch (e) {}
  }

  function slidePiece(fromF, fromR, toF, toR) {
    const el = _pieceEls[fromR]?.[fromF];
    if (!el) return;
    const dest = sqPercent(toF, toR);
    el.style.transition = 'left 0.25s ease, top 0.25s ease';
    el.style.left = dest.left + '%';
    el.style.top = dest.top + '%';
    _pieceEls[fromR][fromF] = null;
    _pieceEls[toR][toF] = el;
  }

  // ─── Board apply (non-animated, for stepTo) ───

  function applyMoveToGrid(grid, san, side) {
    try {
      const fenStr = gridToFen(grid, side);
      const res = ChessUtils.resolveMove(san, fenStr);
      if (!res?.to) return null;
      const toF = 'abcdefgh'.indexOf(res.to[0]);
      const toR = parseInt(res.to[1]) - 1;

      if (san === 'O-O' || san === 'O-O-O') {
        const rank = side === 'w' ? 0 : 7;
        if (san === 'O-O') {
          grid[rank][6] = grid[rank][4]; grid[rank][4] = null;
          grid[rank][5] = grid[rank][7]; grid[rank][7] = null;
        } else {
          grid[rank][2] = grid[rank][4]; grid[rank][4] = null;
          grid[rank][3] = grid[rank][0]; grid[rank][0] = null;
        }
        return { from: { f: 4, r: rank }, to: { f: san === 'O-O' ? 6 : 2, r: rank } };
      }

      if (!res.from) return null;
      const fromF = 'abcdefgh'.indexOf(res.from[0]);
      const fromR = parseInt(res.from[1]) - 1;
      grid[toR][toF] = grid[fromR][fromF];
      grid[fromR][fromF] = null;
      return { from: { f: fromF, r: fromR }, to: { f: toF, r: toR } };
    } catch (e) { return null; }
  }

  // ─── Highlights ───

  function highlightSquares(fromF, fromR, toF, toR) {
    clearHighlights();
    hlCell(fromF, fromR, 'nextchess-preview-from');
    hlCell(toF, toR, 'nextchess-preview-to');
  }

  function hlCell(f, r, cls) {
    if (!_boardEl) return;
    const vf = _flip ? (7 - f) : f;
    const vr = _flip ? (7 - r) : r;
    const idx = (7 - vr) * 8 + vf;
    const cells = _boardEl.querySelectorAll('.nextchess-preview-cell');
    if (cells[idx]) cells[idx].classList.add(cls);
  }

  function clearHighlights() {
    if (!_boardEl) return;
    _boardEl.querySelectorAll('.nextchess-preview-from,.nextchess-preview-to').forEach(
      el => el.classList.remove('nextchess-preview-from', 'nextchess-preview-to')
    );
  }

  // ─── Helpers ───

  function gridToFen(grid, side) {
    let s = '';
    for (let r = 7; r >= 0; r--) {
      let empty = 0;
      for (let f = 0; f < 8; f++) {
        const p = grid[r][f];
        if (!p) { empty++; }
        else { if (empty) { s += empty; empty = 0; } s += p[0] === 'w' ? p[1].toUpperCase() : p[1]; }
      }
      if (empty) s += empty;
      if (r > 0) s += '/';
    }
    return s + ` ${side} KQkq - 0 1`;
  }

  function parseFen(fen) {
    const grid = Array.from({ length: 8 }, () => Array(8).fill(null));
    const rows = fen.split(' ')[0].split('/');
    for (let r = 0; r < 8; r++) {
      let f = 0;
      for (const ch of rows[r]) {
        if (ch >= '1' && ch <= '8') { f += parseInt(ch); }
        else { grid[7 - r][f] = (ch === ch.toUpperCase() ? 'w' : 'b') + ch.toLowerCase(); f++; }
      }
    }
    return grid;
  }

  function handleKey(key) {
    switch (key) {
      case 'ArrowLeft': stepTo(_currentStep - 1); break;
      case 'ArrowRight': stepTo(_currentStep + 1); break;
      case 'ArrowUp': case 'Home': stepTo(0); break;
      case 'ArrowDown': case 'End': stepTo(_moves.length); break;
      case ' ': togglePlay(); break;
    }
  }

  function isVisible() {
    return _container && _container.style.display !== 'none';
  }

  function isHovered() {
    return _isHovered;
  }

  return { show, hide, scheduleHide, clearHideTimeout, handleKey, isVisible, isHovered, init };
})();
