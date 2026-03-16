// NextChess — Board overlay
// Two SVG layers + hover interaction

const BoardOverlay = (() => {
  let _svgBg = null;
  let _svgFg = null;
  let _svgHit = null;
  let _boardEl = null;
  let _lineData = {};

  const RANKS = [
    { fill: 'rgba(129,182,76,0.28)', stroke: '#81b64c', badge: '#81b64c' },
    { fill: 'rgba(108,166,212,0.18)', stroke: '#6ca6d4', badge: '#6ca6d4' },
    { fill: 'rgba(160,160,160,0.12)', stroke: '#999', badge: '#999' },
    { fill: 'rgba(140,140,140,0.08)', stroke: '#777', badge: '#777' },
    { fill: 'rgba(140,140,140,0.06)', stroke: '#666', badge: '#666' },
  ];
  const BAD = { fill: 'rgba(229,133,109,0.2)', stroke: '#e5856d', badge: '#e5856d' };
  const PLAYED = { fill: 'rgba(230,190,60,0.22)', stroke: '#e6be3c', badge: '#e6be3c' };

  let _fgWrap = null; // HTML div that sits OUTSIDE the board, overlaid on top

  function init(boardEl) {
    _boardEl = boardEl;
    cleanup();

    // Background SVG lives INSIDE the board (behind pieces)
    _svgBg = makeSvg(10);
    _boardEl.insertBefore(_svgBg, _boardEl.firstChild);

    // Foreground + hit SVGs live in an EXTERNAL div overlaid on top of the board.
    // This guarantees they render above pieces regardless of chess.com's stacking.
    _fgWrap = document.createElement('div');
    _fgWrap.className = 'nextchess-fg-wrap';
    _fgWrap.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:9999;';

    _svgFg = makeSvg(1);
    _svgHit = makeSvg(2);
    _fgWrap.appendChild(_svgFg);
    _fgWrap.appendChild(_svgHit);

    // Insert the wrapper as a sibling of the board, inside its parent
    // The parent (board-layout-chessboard) has position:relative
    const boardParent = _boardEl.parentElement;
    if (boardParent) {
      boardParent.style.position = 'relative';
      boardParent.appendChild(_fgWrap);
    } else {
      // Fallback: put inside board
      _boardEl.appendChild(_fgWrap);
    }

    // Sync wrapper position/size to the board
    syncFgPosition();
    _resizeObserver = new ResizeObserver(syncFgPosition);
    _resizeObserver.observe(_boardEl);

    PreviewBoard.init();
  }

  let _resizeObserver = null;

  function syncFgPosition() {
    if (!_fgWrap || !_boardEl) return;
    const boardParent = _boardEl.parentElement;
    if (!boardParent) return;
    const parentRect = boardParent.getBoundingClientRect();
    const boardRect = _boardEl.getBoundingClientRect();
    _fgWrap.style.left = (boardRect.left - parentRect.left) + 'px';
    _fgWrap.style.top = (boardRect.top - parentRect.top) + 'px';
    _fgWrap.style.width = boardRect.width + 'px';
    _fgWrap.style.height = boardRect.height + 'px';
  }

  function makeSvg(z) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'nextchess-svg-overlay');
    svg.setAttribute('viewBox', '0 0 800 800');
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    svg.style.cssText = `position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:${z};`;
    return svg;
  }

  function sqPos(alg, flip) {
    if (!alg || typeof alg !== 'string' || alg.length < 2) return null;
    const f = 'abcdefgh'.indexOf(alg[0]);
    const r = parseInt(alg[1]) - 1;
    if (f < 0 || f > 7 || isNaN(r) || r < 0 || r > 7) return null;
    return flip ? { x: (7 - f) * 100, y: r * 100 } : { x: f * 100, y: (7 - r) * 100 };
  }

  function safeResolve(san, fen) {
    try {
      const res = ChessUtils.resolveMove(san, fen);
      if (res.to && sqPos(res.to, false)) return res;
      return null;
    } catch (e) { return null; }
  }

  // ─── Background layer ───

  function addSquareFill(pos, style, fade) {
    const cls = fade ? 'nextchess-marker nextchess-played-marker' : 'nextchess-marker';
    const g = mk('g', { class: cls });
    g.appendChild(mk('rect', {
      x: pos.x + 2, y: pos.y + 2, width: 96, height: 96, rx: 4, fill: style.fill,
    }));
    g.appendChild(mk('rect', {
      x: pos.x + 3, y: pos.y + 3, width: 94, height: 94, rx: 3,
      fill: 'none', stroke: style.stroke, 'stroke-width': 2, opacity: 0.5,
    }));
    _svgBg.appendChild(g);
  }

  // Source square: soft colored fill (matches destination color, lower opacity)
  function addSourceMark(alg, flip, style) {
    const pos = sqPos(alg, flip);
    if (!pos) return;
    const g = mk('g', { class: 'nextchess-marker' });
    // Faint fill matching the destination color
    g.appendChild(mk('rect', {
      x: pos.x + 2, y: pos.y + 2, width: 96, height: 96, rx: 4,
      fill: style.fill, opacity: 0.5,
    }));
    // Thin solid border
    g.appendChild(mk('rect', {
      x: pos.x + 4, y: pos.y + 4, width: 92, height: 92, rx: 3,
      fill: 'none', stroke: style.stroke, 'stroke-width': 1.5, opacity: 0.3,
    }));
    _svgBg.appendChild(g);
  }

  // ─── Foreground layer ───

  // Returns the text element ref so we can update it during spin
  function addBadge(pos, label, bgColor) {
    const g = mk('g', { class: 'nextchess-marker' });
    const bx = pos.x + 5, by = pos.y + 5;
    const w = Math.max(label.length * 7 + 10, 22);
    g.appendChild(mk('rect', { x: bx, y: by, width: w, height: 22, rx: 4, fill: bgColor, opacity: 0.85 }));
    const txt = mk('text', {
      x: bx + w / 2, y: by + 12,
      'text-anchor': 'middle', 'dominant-baseline': 'central',
      fill: '#fff', 'font-size': 11, 'font-weight': 500,
      'font-family': "'Courier New',monospace",
    }, label);
    g.appendChild(txt);
    _svgFg.appendChild(g);
    return { textEl: txt, bgEl: g, finalLabel: label };
  }

  function addScore(pos, score) {
    if (!score || !isValidScore(score)) return null;
    const g = mk('g', { class: 'nextchess-marker' });
    const tw = score.length * 8 + 10;
    const tx = pos.x + 95, ty = pos.y + 91;
    g.appendChild(mk('rect', {
      x: tx - tw, y: ty - 17, width: tw, height: 18, rx: 3, fill: 'rgba(0,0,0,0.55)',
    }));
    const txt = mk('text', {
      x: tx - tw / 2, y: ty - 8,
      'text-anchor': 'middle', 'dominant-baseline': 'central',
      fill: '#fff', 'font-size': 10.5, 'font-weight': 700, opacity: 0.8,
      'font-family': "'Courier New',monospace",
    }, score);
    g.appendChild(txt);
    _svgFg.appendChild(g);
    return { textEl: txt, finalLabel: score };
  }

  // ─── Hover zones (interaction layer) ───

  let _hoverIntent = null; // delay before showing preview

  function addHoverZone(alg, pos, flip, fen, moves, fromAlg) {
    if (!_svgHit) return;
    _lineData[alg] = { fen, moves, flip, fromAlg };

    const rect = mk('rect', {
      x: pos.x, y: pos.y, width: 100, height: 100,
      fill: 'transparent', cursor: 'pointer',
      'pointer-events': 'auto',
      class: 'nextchess-hover-zone',
    });

    rect.addEventListener('mouseenter', (e) => {
      // Wait 300ms before triggering — ignore drive-by cursors
      clearHoverIntent();
      _hoverIntent = setTimeout(() => {
        const data = _lineData[alg];
        if (!data || !data.moves?.length) return;

        PreviewBoard.clearHideTimeout();
        ensureKeyListener();

        if (_svgBg) _svgBg.classList.add('nextchess-dimmed');
        if (_svgFg) _svgFg.classList.add('nextchess-dimmed');

        _svgHit.appendChild(mk('rect', {
          x: pos.x + 1, y: pos.y + 1, width: 98, height: 98, rx: 4,
          fill: 'rgba(129,182,76,0.3)', stroke: '#81b64c', 'stroke-width': 2.5,
          class: 'nextchess-hover-highlight',
        }));

        if (data.fromAlg) {
          const srcPos = sqPos(data.fromAlg, flip);
          if (srcPos) {
            _svgHit.appendChild(mk('rect', {
              x: srcPos.x + 1, y: srcPos.y + 1, width: 98, height: 98, rx: 4,
              fill: 'rgba(129,182,76,0.15)', stroke: '#81b64c', 'stroke-width': 1.5,
              'stroke-dasharray': '6,4', class: 'nextchess-hover-highlight',
            }));
            const n = squareToNumeric(data.fromAlg);
            if (n) {
              const p = _boardEl.querySelector(`.piece.square-${n}`);
              if (p) p.classList.add('nextchess-piece-glow');
            }
          }
        }

        const br = _boardEl.getBoundingClientRect();
        const sx = br.width / 800, sy = br.height / 800;
        PreviewBoard.show(data.fen, data.moves, br.left + (pos.x + 100) * sx, br.top + (pos.y + 50) * sy, data.flip, clearHoverState);
      }, 300);
    });

    rect.addEventListener('mouseleave', () => {
      clearHoverIntent();
      PreviewBoard.scheduleHide();
      scheduleHoverClear();
    });

    _svgHit.appendChild(rect);
  }

  function clearHoverIntent() {
    if (_hoverIntent) { clearTimeout(_hoverIntent); _hoverIntent = null; }
  }

  // ─── Keyboard capture for preview board ───
  // Single global listener, always active, only intercepts when preview is visible
  let _keyListenerAdded = false;

  function ensureKeyListener() {
    if (_keyListenerAdded) return;
    _keyListenerAdded = true;

    document.addEventListener('keydown', (e) => {
      if (!PreviewBoard.isVisible()) return;

      const keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', ' '];
      if (!keys.includes(e.key)) return;

      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      PreviewBoard.handleKey(e.key);
    }, true); // capture phase — runs before chess.com's handlers
  }

  let _hoverClearTimeout = null;

  function scheduleHoverClear() {
    if (_hoverClearTimeout) clearTimeout(_hoverClearTimeout);
    _hoverClearTimeout = setTimeout(() => {
      // Don't clear if the preview is still open (cursor moved to popup)
      if (PreviewBoard.isVisible()) return;
      clearHoverState();
    }, 300);
  }

  function clearHoverState() {
    if (_hoverClearTimeout) { clearTimeout(_hoverClearTimeout); _hoverClearTimeout = null; }
    if (_svgBg) _svgBg.classList.remove('nextchess-dimmed');
    if (_svgFg) _svgFg.classList.remove('nextchess-dimmed');
    if (_svgHit) _svgHit.querySelectorAll('.nextchess-hover-highlight').forEach(e => e.remove());
    if (_boardEl) _boardEl.querySelectorAll('.nextchess-piece-glow').forEach(el => el.classList.remove('nextchess-piece-glow'));
  }

  function squareToNumeric(alg) {
    if (!alg || alg.length < 2) return null;
    const f = 'abcdefgh'.indexOf(alg[0]) + 1;
    const r = parseInt(alg[1]);
    if (f < 1 || f > 8 || isNaN(r) || r < 1 || r > 8) return null;
    return '' + f + r;
  }

  function clearHoverZones() {
    _lineData = {};
    if (_svgHit) _svgHit.querySelectorAll('.nextchess-hover-zone').forEach(e => e.remove());
  }

  // ─── Thinking indicator — tiny pulsing dot, top-right of board ───

  function showThinking() {
    hideThinking();
    if (!_svgFg) return;
    const dot = mk('g', { class: 'nextchess-thinking' });
    dot.appendChild(mk('circle', {
      cx: 785, cy: 15, r: 6,
      fill: '#81b64c', opacity: 0.6,
      class: 'nextchess-thinking-dot',
    }));
    _svgFg.appendChild(dot);
  }

  function hideThinking() {
    if (_svgFg) _svgFg.querySelectorAll('.nextchess-thinking').forEach(e => e.remove());
  }

  // ─── Public API ───

  // Returns total number of squares drawn (for stagger timing)
  // instant = true skips stagger animation (used for cache restore)
  function drawEngineLines(lines, fen, flip, numBest = 3, instant = false) {
    clear();
    hideThinking();

    const total = lines.length;
    const best = lines.slice(0, numBest);

    // Collect worst moves
    const worstItems = [];
    if (total > numBest) {
      const worstStart = Math.max(total - 2, numBest);
      for (let i = worstStart; i < total; i++) {
        const line = lines[i];
        if (!line.moves?.length) continue;
        const res = safeResolve(line.moves[0], fen);
        if (!res) continue;
        const destPos = sqPos(res.to, flip);
        if (!destPos) continue;
        const alreadyShown = best.some(b => {
          const r = safeResolve(b.moves?.[0], fen);
          return r && r.to === res.to;
        });
        if (!alreadyShown) worstItems.push({ line, res, destPos, idx: i });
      }
    }

    function drawBest(i, line, res, st, destPos) {
      const moveSan = line.moves[0];

      // Castling in engine line — use rank color, not purple
      if (moveSan === 'O-O' || moveSan === 'O-O-O') {
        const cs = getCastleSquares(moveSan, fen);
        if (cs) {
          // All 4 squares in the rank's color
          for (const sq of [cs.kingFrom, cs.kingTo, cs.rookFrom, cs.rookTo]) {
            const p = sqPos(sq, flip);
            if (p) addSquareFill(p, st, !instant);
          }
          // Badge on king destination
          const kp = sqPos(cs.kingTo, flip);
          if (kp) {
            const castleLabel = moveSan === 'O-O' ? '0-0' : '0-0-0';
            addBadge(kp, `${i + 1} ${castleLabel}`, st.badge);
            addScore(kp, line.score);
          }
          // Rook icon on rook destination
          const rp = sqPos(cs.rookTo, flip);
          if (rp) {
            const rG = mk('g', { class: 'nextchess-marker' });
            rG.appendChild(mk('rect', { x: rp.x + 5, y: rp.y + 5, width: 22, height: 22, rx: 4, fill: st.badge, opacity: 0.85 }));
            rG.appendChild(mk('text', {
              x: rp.x + 16, y: rp.y + 17,
              'text-anchor': 'middle', 'dominant-baseline': 'central',
              fill: '#fff', 'font-size': 14,
            }, '\u265C'));
            _svgFg.appendChild(rG);
          }
          // Hover zone on king destination for castling
          const hoverPos = sqPos(cs.kingTo, flip);
          if (hoverPos) addHoverZone(cs.kingTo, hoverPos, flip, fen, line.moves, cs.kingFrom);
          return;
        }
      }

      if (i === 0 && res.from) {
        addSourceMark(res.from, flip, st);
      }
      addSquareFill(destPos, st, !instant);
      addBadge(destPos, String(i + 1), st.badge);
      addScore(destPos, line.score);
      // Hover zone for preview
      addHoverZone(res.to, destPos, flip, fen, line.moves, res.from);
    }

    function drawWorst(w) {
      addSquareFill(w.destPos, BAD, !instant);
      addBadge(w.destPos, `${w.idx + 1}/${total}`, BAD.badge);
      addScore(w.destPos, w.line.score);
      const wRes = safeResolve(w.line.moves?.[0], fen);
      if (wRes?.to) addHoverZone(wRes.to, w.destPos, flip, fen, w.line.moves, wRes.from);
    }

    // Draw everything at once — no stagger
    for (let i = 0; i < best.length; i++) {
      const line = best[i];
      if (!line.moves?.length) continue;
      const res = safeResolve(line.moves[0], fen);
      if (!res) continue;
      const st = RANKS[i] || RANKS[RANKS.length - 1];
      const destPos = sqPos(res.to, flip);
      if (!destPos) continue;
      drawBest(i, line, res, st, destPos);
    }

    for (const w of worstItems) {
      drawWorst(w);
    }
  }

  const CASTLE = { fill: 'rgba(168,130,214,0.25)', stroke: '#a882d6', badge: '#a882d6' };

  // Get all squares involved in a castling move
  function getCastleSquares(san, fen) {
    if (san !== 'O-O' && san !== 'O-O-O') return null;
    const side = fen.split(' ')[1] || 'w';
    const rank = (side === 'w') ? '1' : '8';
    if (san === 'O-O') {
      return {
        kingFrom: 'e' + rank, kingTo: 'g' + rank,
        rookFrom: 'h' + rank, rookTo: 'f' + rank,
      };
    } else {
      return {
        kingFrom: 'e' + rank, kingTo: 'c' + rank,
        rookFrom: 'a' + rank, rookTo: 'd' + rank,
      };
    }
  }

  function drawCastleMove(san, fen, flip, cssClass, style, matchRank) {
    style = style || PLAYED;
    const cs = getCastleSquares(san, fen);
    if (!cs) return;

    // All 4 squares in the provided style color
    for (const sq of [cs.kingFrom, cs.kingTo, cs.rookFrom, cs.rookTo]) {
      const pos = sqPos(sq, flip);
      if (!pos) continue;
      const g = mk('g', { class: cssClass });
      g.appendChild(mk('rect', {
        x: pos.x + 2, y: pos.y + 2, width: 96, height: 96, rx: 4, fill: style.fill,
      }));
      g.appendChild(mk('rect', {
        x: pos.x + 3, y: pos.y + 3, width: 94, height: 94, rx: 3,
        fill: 'none', stroke: style.stroke, 'stroke-width': 2, opacity: 0.5,
      }));
      _svgBg.appendChild(g);
    }

    // Badge on king destination
    const kp = sqPos(cs.kingTo, flip);
    if (kp) {
      const castleNotation = san === 'O-O' ? '0-0' : '0-0-0';
      const label = (matchRank === 0) ? `Best! ${castleNotation}`
                  : (matchRank >= 0) ? `${matchRank + 1} ${castleNotation}`
                  : castleNotation;

      const fgG = mk('g', { class: cssClass });
      const bx = kp.x + 5, by = kp.y + 5;
      const w = Math.max(label.length * 7 + 10, 22);
      fgG.appendChild(mk('rect', { x: bx, y: by, width: w, height: 22, rx: 4, fill: style.badge, opacity: 0.85 }));
      fgG.appendChild(mk('text', {
        x: bx + w / 2, y: by + 12,
        'text-anchor': 'middle', 'dominant-baseline': 'central',
        fill: '#fff', 'font-size': 11, 'font-weight': 500,
        'font-family': "'Courier New',monospace",
      }, label));
      _svgFg.appendChild(fgG);

      // Rook icon on rook destination
      const rp = sqPos(cs.rookTo, flip);
      if (rp) {
        const rG = mk('g', { class: cssClass });
        rG.appendChild(mk('rect', { x: rp.x + 5, y: rp.y + 5, width: 22, height: 22, rx: 4, fill: style.badge, opacity: 0.85 }));
        rG.appendChild(mk('text', {
          x: rp.x + 16, y: rp.y + 17,
          'text-anchor': 'middle', 'dominant-baseline': 'central',
          fill: '#fff', 'font-size': 14,
        }, '\u265C'));
        _svgFg.appendChild(rG);
      }
    }
  }

  // matchRank: 0 = best move, 1 = second best, -1 = not a top move
  function drawPlayedMove(san, fen, flip, matchRank = -1) {
    if (!san) return;


    // ── Castling: special treatment ──
    if (san === 'O-O' || san === 'O-O-O') {
      const cssClass = (matchRank >= 0)
        ? 'nextchess-marker nextchess-great-marker'
        : 'nextchess-marker nextchess-played-marker';
      // Use rank color if matched, otherwise played-move color
      const castleStyle = (matchRank === 0)
        ? { fill: 'rgba(129,182,76,0.35)', stroke: '#81b64c', badge: '#81b64c' }
        : (matchRank === 1)
          ? { fill: 'rgba(108,166,212,0.30)', stroke: '#6ca6d4', badge: '#6ca6d4' }
          : PLAYED;
      drawCastleMove(san, fen, flip, cssClass, castleStyle, matchRank);
      return;
    }

    // ── Normal move ──
    const res = safeResolve(san, fen);
    if (!res) return;
    const destPos = sqPos(res.to, flip);
    if (!destPos) return;

    const parts = fen.split(' ');
    const side = (parts[1] === 'b') ? 'Black' : 'White';

    const isGreat = matchRank === 0;
    const isGood = matchRank === 1;
    const cssClass = (isGreat || isGood)
      ? 'nextchess-marker nextchess-great-marker'
      : 'nextchess-marker nextchess-played-marker';

    // Best/2nd: show the colored square + rank badge
    if (isGreat || isGood) {
      const style = isGreat
        ? { fill: 'rgba(129,182,76,0.35)', stroke: '#81b64c', badge: '#81b64c' }
        : { fill: 'rgba(108,166,212,0.30)', stroke: '#6ca6d4', badge: '#6ca6d4' };

      const bgG = mk('g', { class: cssClass });
      bgG.appendChild(mk('rect', {
        x: destPos.x + 2, y: destPos.y + 2, width: 96, height: 96, rx: 4, fill: style.fill,
      }));
      bgG.appendChild(mk('rect', {
        x: destPos.x + 3, y: destPos.y + 3, width: 94, height: 94, rx: 3,
        fill: 'none', stroke: style.stroke, 'stroke-width': isGreat ? 3 : 2, opacity: isGreat ? 0.8 : 0.5,
      }));
      _svgBg.appendChild(bgG);

      if (res.from) addSourceMark(res.from, flip, style);

      // Rank badge top-left
      const label = isGreat ? 'Best!' : '2';
      addBadge(destPos, label, style.badge);
    }

    // "Played" chip — bottom-left corner of the destination square
    // Just a small pill, no square fill for non-top moves
    const chipG = mk('g', { class: cssClass });
    const cx = destPos.x + 5, cy = destPos.y + 73;
    const chipLabel = side;
    const cw = Math.max(chipLabel.length * 6.5 + 8, 22);
    chipG.appendChild(mk('rect', {
      x: cx, y: cy, width: cw, height: 20, rx: 4,
      fill: 'rgba(0,0,0,0.5)',
    }));
    chipG.appendChild(mk('rect', {
      x: cx, y: cy, width: cw, height: 20, rx: 4,
      fill: 'none', stroke: PLAYED.stroke, 'stroke-width': 1, opacity: 0.6,
    }));
    chipG.appendChild(mk('text', {
      x: cx + cw / 2, y: cy + 11,
      'text-anchor': 'middle', 'dominant-baseline': 'central',
      fill: PLAYED.stroke, 'font-size': 9.5, 'font-weight': 600,
      'font-family': "'Courier New',monospace",
    }, chipLabel));
    _svgFg.appendChild(chipG);
  }

  function drawWorstMove(san, fen, flip) {
    if (!san) return;
    const res = safeResolve(san, fen);
    if (!res) return;
    const destPos = sqPos(res.to, flip);
    if (!destPos) return;
    if (res.from) addSourceMark(res.from, flip, BAD);
    addSquareFill(destPos, BAD);
    addBadge(destPos, '!', BAD.badge);
  }

  function clear() {
    hideThinking();
    clearHoverZones();
    PreviewBoard.hide();
    if (_svgBg) _svgBg.querySelectorAll('.nextchess-marker').forEach(e => e.remove());
    if (_svgFg) _svgFg.querySelectorAll('.nextchess-marker').forEach(e => e.remove());
  }

  function setVisible(visible) {
    const d = visible ? '' : 'none';
    if (_svgBg) _svgBg.style.display = d;
    if (_fgWrap) _fgWrap.style.display = d;
    if (!visible) PreviewBoard.hide();
  }

  function cleanup() {
    PreviewBoard.hide();
    if (_resizeObserver) { _resizeObserver.disconnect(); _resizeObserver = null; }
    if (_svgBg) { _svgBg.remove(); _svgBg = null; }
    if (_fgWrap) { _fgWrap.remove(); _fgWrap = null; }
    _svgFg = null;
    _svgHit = null;
  }

  function isValidScore(s) { return /^[+-]?\d/.test(s) || /^M\d/i.test(s); }

  function mk(tag, attrs, text) {
    const e = document.createElementNS('http://www.w3.org/2000/svg', tag);
    if (attrs) for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    if (text) e.textContent = text;
    return e;
  }

  return { init, drawEngineLines, showThinking, hideThinking, drawPlayedMove, drawWorstMove, setVisible, clear, cleanup };
})();
