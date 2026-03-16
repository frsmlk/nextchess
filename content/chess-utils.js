// Chess utility functions for coordinate conversion and move parsing

const ChessUtils = (() => {
  const FILES = 'abcdefgh';
  const PIECE_OFFSETS = {
    n: [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]],
    b: [[-1, -1], [-1, 1], [1, -1], [1, 1]],
    r: [[-1, 0], [1, 0], [0, -1], [0, 1]],
    q: [[-1, -1], [-1, 1], [1, -1], [1, 1], [-1, 0], [1, 0], [0, -1], [0, 1]],
    k: [[-1, -1], [-1, 1], [1, -1], [1, 1], [-1, 0], [1, 0], [0, -1], [0, 1]],
  };

  // Convert algebraic (e4) to chess.com numeric (54)
  function algebraicToNumeric(sq) {
    const file = FILES.indexOf(sq[0]) + 1;
    const rank = parseInt(sq[1]);
    return file * 10 + rank;
  }

  // Convert chess.com numeric (54) to algebraic (e4)
  function numericToAlgebraic(num) {
    const file = Math.floor(num / 10);
    const rank = num % 10;
    return FILES[file - 1] + rank;
  }

  // Convert algebraic to {file, rank} (0-indexed)
  function algebraicToCoords(sq) {
    return {
      file: FILES.indexOf(sq[0]),
      rank: parseInt(sq[1]) - 1,
    };
  }

  // Convert {file, rank} (0-indexed) to algebraic
  function coordsToAlgebraic(file, rank) {
    return FILES[file] + (rank + 1);
  }

  // Parse FEN into a board array (8x8, board[rank][file], rank 0 = rank 1)
  function parseFEN(fen) {
    const parts = fen.split(' ');
    const placement = parts[0];
    const sideToMove = parts[1] || 'w';
    const castling = parts[2] || '-';
    const enPassant = parts[3] || '-';

    const board = Array.from({ length: 8 }, () => Array(8).fill(null));
    const ranks = placement.split('/');

    for (let r = 0; r < 8; r++) {
      let file = 0;
      for (const ch of ranks[r]) {
        if (ch >= '1' && ch <= '8') {
          file += parseInt(ch);
        } else {
          const color = ch === ch.toUpperCase() ? 'w' : 'b';
          const piece = ch.toLowerCase();
          board[7 - r][file] = { color, piece };
          file++;
        }
      }
    }

    return { board, sideToMove, castling, enPassant };
  }

  // Find all pieces of a given type and color on the board
  function findPieces(board, piece, color) {
    const results = [];
    for (let rank = 0; rank < 8; rank++) {
      for (let file = 0; file < 8; file++) {
        const sq = board[rank][file];
        if (sq && sq.piece === piece && sq.color === color) {
          results.push({ file, rank });
        }
      }
    }
    return results;
  }

  // Check if a square is on the board
  function inBounds(file, rank) {
    return file >= 0 && file < 8 && rank >= 0 && rank < 8;
  }

  // Check if a sliding piece can reach from src to dst (no obstacles)
  function canSlide(board, srcFile, srcRank, dstFile, dstRank) {
    const df = Math.sign(dstFile - srcFile);
    const dr = Math.sign(dstRank - srcRank);
    let f = srcFile + df;
    let r = srcRank + dr;
    while (f !== dstFile || r !== dstRank) {
      if (board[r][f] !== null) return false;
      f += df;
      r += dr;
    }
    return true;
  }

  // Resolve a SAN move to {from, to} algebraic squares given a FEN
  function resolveMove(san, fen) {
    const parsed = parseFEN(fen);
    const { board, sideToMove, castling } = parsed;
    const color = sideToMove;

    // Castling
    if (san === 'O-O' || san === 'O-O-O') {
      const rank = color === 'w' ? 0 : 7;
      const rankStr = color === 'w' ? '1' : '8';
      if (san === 'O-O') {
        return { from: 'e' + rankStr, to: 'g' + rankStr };
      } else {
        return { from: 'e' + rankStr, to: 'c' + rankStr };
      }
    }

    // Strip check/mate/annotation symbols
    let clean = san.replace(/[+#!?]/g, '');

    // Promotion
    let promotion = null;
    const promoMatch = clean.match(/=([QRBN])/i);
    if (promoMatch) {
      promotion = promoMatch[1].toLowerCase();
      clean = clean.replace(/=[QRBN]/i, '');
    }

    // Capture indicator
    const isCapture = clean.includes('x');
    clean = clean.replace('x', '');

    // Determine piece type
    let pieceType;
    if (clean[0] >= 'A' && clean[0] <= 'Z') {
      pieceType = clean[0].toLowerCase();
      clean = clean.slice(1);
    } else {
      pieceType = 'p';
    }

    // Destination square is the last two characters
    const destSq = clean.slice(-2);
    const dest = algebraicToCoords(destSq);
    clean = clean.slice(0, -2);

    // Disambiguation (remaining characters)
    let disambigFile = null;
    let disambigRank = null;
    for (const ch of clean) {
      if (ch >= 'a' && ch <= 'h') disambigFile = FILES.indexOf(ch);
      if (ch >= '1' && ch <= '8') disambigRank = parseInt(ch) - 1;
    }

    // Find candidate pieces
    const candidates = findPieces(board, pieceType, color);

    for (const cand of candidates) {
      // Apply disambiguation
      if (disambigFile !== null && cand.file !== disambigFile) continue;
      if (disambigRank !== null && cand.rank !== disambigRank) continue;

      // Check if this piece can reach the destination
      if (pieceType === 'p') {
        // Pawn logic
        const dir = color === 'w' ? 1 : -1;
        const startRank = color === 'w' ? 1 : 6;

        if (isCapture) {
          // Pawn captures diagonally
          if (cand.file !== dest.file && Math.abs(cand.file - dest.file) === 1 && cand.rank + dir === dest.rank) {
            return { from: coordsToAlgebraic(cand.file, cand.rank), to: destSq };
          }
        } else {
          // Pawn pushes forward
          if (cand.file === dest.file) {
            if (cand.rank + dir === dest.rank && board[dest.rank][dest.file] === null) {
              return { from: coordsToAlgebraic(cand.file, cand.rank), to: destSq };
            }
            // Double push
            if (cand.rank === startRank && cand.rank + 2 * dir === dest.rank &&
                board[cand.rank + dir][dest.file] === null && board[dest.rank][dest.file] === null) {
              return { from: coordsToAlgebraic(cand.file, cand.rank), to: destSq };
            }
          }
        }
      } else if (pieceType === 'n') {
        const df = Math.abs(cand.file - dest.file);
        const dr = Math.abs(cand.rank - dest.rank);
        if ((df === 1 && dr === 2) || (df === 2 && dr === 1)) {
          return { from: coordsToAlgebraic(cand.file, cand.rank), to: destSq };
        }
      } else if (pieceType === 'k') {
        const df = Math.abs(cand.file - dest.file);
        const dr = Math.abs(cand.rank - dest.rank);
        if (df <= 1 && dr <= 1) {
          return { from: coordsToAlgebraic(cand.file, cand.rank), to: destSq };
        }
      } else if (pieceType === 'b') {
        const df = Math.abs(cand.file - dest.file);
        const dr = Math.abs(cand.rank - dest.rank);
        if (df === dr && df > 0 && canSlide(board, cand.file, cand.rank, dest.file, dest.rank)) {
          return { from: coordsToAlgebraic(cand.file, cand.rank), to: destSq };
        }
      } else if (pieceType === 'r') {
        if ((cand.file === dest.file || cand.rank === dest.rank) &&
            canSlide(board, cand.file, cand.rank, dest.file, dest.rank)) {
          return { from: coordsToAlgebraic(cand.file, cand.rank), to: destSq };
        }
      } else if (pieceType === 'q') {
        const df = Math.abs(cand.file - dest.file);
        const dr = Math.abs(cand.rank - dest.rank);
        if ((df === dr || cand.file === dest.file || cand.rank === dest.rank) && (df > 0 || dr > 0) &&
            canSlide(board, cand.file, cand.rank, dest.file, dest.rank)) {
          return { from: coordsToAlgebraic(cand.file, cand.rank), to: destSq };
        }
      }
    }

    // Fallback: return destination only
    return { from: null, to: destSq };
  }

  return {
    algebraicToNumeric,
    numericToAlgebraic,
    algebraicToCoords,
    coordsToAlgebraic,
    parseFEN,
    resolveMove,
  };
})();
