// Background service worker - handles Claude API calls

const CACHE = new Map();

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'EXPLAIN_POSITION') {
    handleExplainPosition(message).then(sendResponse);
    return true; // keep channel open for async
  }
});

async function handleExplainPosition({ fen, engineLines, sideToMove }) {
  // Check cache
  if (CACHE.has(fen)) {
    return { success: true, explanation: CACHE.get(fen) };
  }

  // Get settings
  const settings = await chrome.storage.sync.get(['claudeApiKey', 'claudeModel']);
  const apiKey = settings.claudeApiKey;

  if (!apiKey) {
    return { success: false, error: 'No API key set. Click the NextChess icon to add your Claude API key.' };
  }

  const model = settings.claudeModel || 'claude-haiku-4-5';

  // Build engine lines description
  let linesText = '';
  for (const line of engineLines) {
    linesText += `Line ${line.rank}: ${line.score} — ${line.moves.join(' ')}\n`;
  }

  const systemPrompt = `You are an expert chess coach helping a ~1100-1300 rated player improve. Given a FEN position and engine analysis lines, provide clear, practical explanations.

Your response must be valid JSON with this exact structure:
{
  "summary": "One sentence assessment of the position (who's better and why)",
  "bestMoves": [
    { "move": "e5", "why": "1-2 sentence explanation using concepts the player can understand", "concept": "Short concept name like Center Control, Development, King Safety, etc." }
  ],
  "worstMove": { "move": "h4", "why": "Why this natural-looking move is bad", "concept": "Concept name" }
}

Rules:
- Explain at a beginner-intermediate level. No deep calculation lines.
- Focus on chess principles: center control, development, king safety, pawn structure, piece activity, tactics.
- For best moves: explain the TOP 3 moves from the engine lines. Tell the player what the move DOES, not just that it's good.
- For worst move: pick a plausible-looking move that a ~1100 player might play that would be a mistake. Explain WHY it's bad.
- Use plain language. "Develops the knight to a good square controlling the center" not "Nc6 is +0.3".
- Keep it concise. Each explanation should be 1-2 sentences max.
- Return ONLY the JSON, no markdown code blocks.`;

  const userMessage = `Position (FEN): ${fen}
Side to move: ${sideToMove}

Engine analysis:
${linesText}

Explain the best moves and suggest a worst move to avoid.`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model,
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      console.error('[NextChess] API error:', response.status, errBody);

      if (response.status === 401) {
        return { success: false, error: 'Invalid API key. Check your key in the extension settings.' };
      }
      if (response.status === 429) {
        return { success: false, error: 'Rate limited. Wait a moment and try again.' };
      }
      return { success: false, error: `API error (${response.status}). Check the console for details.` };
    }

    const data = await response.json();
    const text = data.content?.[0]?.text;

    if (!text) {
      return { success: false, error: 'Empty response from Claude.' };
    }

    // Parse JSON from response (handle potential markdown wrapping)
    let explanation;
    try {
      const jsonStr = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
      explanation = JSON.parse(jsonStr);
    } catch (e) {
      console.error('[NextChess] Failed to parse response:', text);
      return { success: false, error: 'Could not parse AI response. Try again.' };
    }

    // Cache it
    CACHE.set(fen, explanation);

    // Keep cache size reasonable
    if (CACHE.size > 100) {
      const firstKey = CACHE.keys().next().value;
      CACHE.delete(firstKey);
    }

    return { success: true, explanation };
  } catch (err) {
    console.error('[NextChess] Fetch error:', err);
    return { success: false, error: 'Network error. Check your internet connection.' };
  }
}
