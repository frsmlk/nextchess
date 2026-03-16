// Reads engine lines, FEN, and played move from chess.com analysis DOM

const DomReader = (() => {

  function getBoard() {
    return document.querySelector('wc-chess-board');
  }

  function getFEN() {
    // Strategy 1: [fen] attribute on analysis container
    const fenEl = document.querySelector('[fen]');
    if (fenEl) {
      const fen = fenEl.getAttribute('fen');
      if (fen && fen.includes('/')) return fen;
    }

    // Strategy 2: Board element
    const board = getBoard();
    if (board) {
      const fen = board.getAttribute('fen');
      if (fen && fen.includes('/')) return fen;
    }

    // Strategy 3: Reconstruct from pieces
    if (board) return reconstructFEN(board);
    return null;
  }

  function reconstructFEN(board) {
    const pieces = board.querySelectorAll('.piece');
    if (!pieces.length) return null;

    const grid = Array.from({ length: 8 }, () => Array(8).fill(null));

    for (const el of pieces) {
      let color = null, piece = null, file = null, rank = null;
      for (const cls of el.classList) {
        if (cls.length === 2 && 'wb'.includes(cls[0]) && 'prnbqk'.includes(cls[1])) {
          color = cls[0]; piece = cls[1];
        }
        const m = cls.match(/^square-(\d)(\d)$/);
        if (m) { file = +m[1] - 1; rank = +m[2] - 1; }
      }
      if (color && piece && file !== null && rank !== null) {
        grid[rank][file] = color === 'w' ? piece.toUpperCase() : piece;
      }
    }

    let fen = '';
    for (let r = 7; r >= 0; r--) {
      let empty = 0;
      for (let f = 0; f < 8; f++) {
        if (!grid[r][f]) { empty++; }
        else { if (empty) { fen += empty; empty = 0; } fen += grid[r][f]; }
      }
      if (empty) fen += empty;
      if (r > 0) fen += '/';
    }
    return fen + ' w KQkq - 0 1';
  }

  function isBoardFlipped() {
    const el = document.querySelector('[boardisflipped]');
    if (el) return el.getAttribute('boardisflipped') === 'true';
    const board = getBoard();
    if (board) {
      if (board.classList.contains('flipped')) return true;
      if (board.getAttribute('flipped') === 'true') return true;
    }
    return false;
  }

  // ─── Engine lines ───

  function getEngineLines() {
    const lines = [];
    for (const el of document.querySelectorAll('.engine-line-component')) {
      const line = parseEngineLine(el);
      if (line) lines.push(line);
    }
    return lines;
  }

  function parseEngineLine(el) {
    const scoreEl = el.querySelector('.score-text-score');
    if (!scoreEl) return null;
    const score = scoreEl.textContent.trim();

    // Validate score — must look like +0.43, -1.2, M5, 0.00 etc
    if (!score || !/^[+-]?\d/.test(score) && !/^M\d/i.test(score)) return null;

    const moves = [];
    for (const moveEl of el.querySelectorAll('.move-san-component')) {
      const san = extractSAN(moveEl);
      if (san) moves.push(san);
    }
    if (!moves.length) return null;

    const idx = el.getAttribute('line-index') || '0';
    return { score, moves, lineIndex: parseInt(idx) || 0 };
  }

  function extractSAN(moveEl) {
    // Plain text moves (e4, d5, O-O, exd5, etc)
    const textEl = moveEl.querySelector('[data-cy="move-san-text"]');
    if (textEl) {
      const t = textEl.textContent.trim();
      if (t && isValidSAN(t)) return t;
    }

    // Figurine notation (piece icon + destination)
    const figurine = moveEl.querySelector('.move-san-figurine');
    const highlight = moveEl.querySelector('.move-san-highlight');
    if (figurine && highlight) {
      let piece = '';
      for (const cls of figurine.classList) {
        if (cls.includes('knight')) piece = 'N';
        else if (cls.includes('bishop')) piece = 'B';
        else if (cls.includes('rook')) piece = 'R';
        else if (cls.includes('queen')) piece = 'Q';
        else if (cls.includes('king')) piece = 'K';
      }
      const spans = highlight.querySelectorAll('span:not(.move-san-figurine):not(.move-san-san)');
      let dest = '';
      for (const s of spans) dest += s.textContent.trim();
      if (piece && dest) return piece + dest;
    }

    return null;
  }

  // Sanity check — SAN should contain a-h and 1-8 somewhere, or be castling
  function isValidSAN(s) {
    if (s === 'O-O' || s === 'O-O-O') return true;
    return /[a-h][1-8]/.test(s);
  }

  // ─── Played move (what the user actually played next) ───

  function getPlayedMove() {
    const container = document.querySelector('[selectedply]');
    if (!container) return null;
    const ply = parseInt(container.getAttribute('selectedply'));
    if (isNaN(ply)) return null;

    // Check if we're on the main line by looking for a selected/highlighted
    // node in the main move list. If the user made a move outside the game,
    // the selected node will be in a variation, not the main line (0-N).
    const selectedNode = document.querySelector('.node-highlight-content .selected, .node .selected');
    if (selectedNode) {
      const parentNode = selectedNode.closest('[data-node]');
      if (parentNode) {
        const nodeId = parentNode.getAttribute('data-node');
        // Main line nodes are "0-N". Variations are "1-N", "2-N", etc.
        if (!nodeId || !nodeId.startsWith('0-')) return null;
      }
    }

    // Also check: if there's no move at this ply in the main line, we're past the game
    const moveNode = document.querySelector(`[data-node="0-${ply}"]`);
    if (!moveNode) return null;

    // Check the move node is a main-line ply (not a variation)
    if (!moveNode.classList.contains('main-line-ply')) return null;

    const content = moveNode.querySelector('.node-highlight-content');
    if (!content) return null;

    const figurine = content.querySelector('[data-figurine]');
    let piece = '';
    if (figurine) {
      const f = figurine.getAttribute('data-figurine');
      if (f && f !== 'P') piece = f;
    }

    let text = '';
    for (const node of content.childNodes) {
      if (node.nodeType === 3) {
        text += node.textContent.trim();
      } else if (node.nodeType === 1 && !node.hasAttribute('data-figurine')) {
        text += node.textContent.trim();
      }
    }
    text = text.replace(/^\d+\.\s*/, '').trim();

    const san = piece + text;
    if (san && isValidSAN(san)) return san;
    return null;
  }

  return { getBoard, getFEN, isBoardFlipped, getEngineLines, getPlayedMove };
})();
