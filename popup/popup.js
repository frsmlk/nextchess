// Popup settings logic

const apiKeyInput = document.getElementById('apiKey');
const modelSelect = document.getElementById('model');
const numLinesRange = document.getElementById('numLines');
const numLinesVal = document.getElementById('numLinesVal');
const autoExplainCheck = document.getElementById('autoExplain');
const showWorstCheck = document.getElementById('showWorst');
const saveBtn = document.getElementById('saveBtn');
const statusEl = document.getElementById('status');

// Load saved settings
chrome.storage.sync.get(
  ['claudeApiKey', 'claudeModel', 'numLinesToShow', 'autoExplain', 'showWorstMove'],
  (result) => {
    if (result.claudeApiKey) apiKeyInput.value = result.claudeApiKey;
    if (result.claudeModel) modelSelect.value = result.claudeModel;
    if (result.numLinesToShow) {
      numLinesRange.value = result.numLinesToShow;
      numLinesVal.textContent = result.numLinesToShow;
    }
    if (result.autoExplain) autoExplainCheck.checked = result.autoExplain;
    if (result.showWorstMove !== undefined) showWorstCheck.checked = result.showWorstMove;
  }
);

// Range slider update
numLinesRange.addEventListener('input', () => {
  numLinesVal.textContent = numLinesRange.value;
});

// Save
saveBtn.addEventListener('click', () => {
  const apiKey = apiKeyInput.value.trim();

  if (!apiKey) {
    showStatus('Please enter your API key', 'err');
    return;
  }

  if (!apiKey.startsWith('sk-ant-')) {
    showStatus('API key should start with sk-ant-', 'err');
    return;
  }

  chrome.storage.sync.set({
    claudeApiKey: apiKey,
    claudeModel: modelSelect.value,
    numLinesToShow: parseInt(numLinesRange.value),
    autoExplain: autoExplainCheck.checked,
    showWorstMove: showWorstCheck.checked,
  }, () => {
    showStatus('Settings saved!', 'ok');
  });
});

function showStatus(msg, type) {
  statusEl.textContent = msg;
  statusEl.className = 'status ' + type;
  setTimeout(() => { statusEl.textContent = ''; }, 3000);
}
