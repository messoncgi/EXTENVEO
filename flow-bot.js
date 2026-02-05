// Flow Automation Bot - v7.4 (Selector Class Específico + IDs Parsing)
// Features:
// 1. GERAÇÃO: Separa prompts por "IDxx", lê assets anteriores, delay de segurança no Criar.
// 2. DOWNLOAD: Monitoramento contínuo, usa a classe específica .sc-93fd5d6e-2.jqFZVr para 1080p.

// =====================================================
// === CONFIGURAÇÃO GLOBAL ===
// =====================================================

const CONFIG = {
  // Configs de Geração
  DELAY_BETWEEN_PROMPTS: 5000,
  MONITORING_TIME: 50000,
  RETRY_DELAY: 4000,
  MAX_RETRIES: 3,
  WAIT_FOR_CREATE_BUTTON: 3500, // Tempo para o botão "Criar" ativar

  // Configs de Download
  CHECK_INTERVAL: 4000,      // Verifica novos vídeos a cada 4 segundos
  DOWNLOAD_WAIT_MENU: 600,   // Tempo (ms) para o menu abrir (Ajustado próximo ao seu teste de 500ms)
  COOLDOWN_DOWNLOAD: 3000    // Tempo entre downloads
};

const STATE = {
  isGenerating: false,
  promptsQueue: [],
  currentQueueIndex: 0,
  totalPrompts: 0,
  retryCounts: {},
  permanentFailures: [],
  isMonitoring: false,
  isDownloadingNow: false
};

const STORAGE_KEY = 'flow_downloaded_prompts_v1';

// =====================================================
// === SISTEMA DE MEMÓRIA (DOWNLOADS) ===
// =====================================================

function getMemory() {
  const data = localStorage.getItem(STORAGE_KEY);
  return data ? JSON.parse(data) : [];
}

function addToMemory(promptText) {
  const current = getMemory();
  const cleanText = normalizeText(promptText);
  if (!current.includes(cleanText)) {
    current.push(cleanText);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  }
}

function isDownloaded(promptText) {
  const current = getMemory();
  return current.includes(normalizeText(promptText));
}

function normalizeText(text) {
  return text.trim().replace(/\s+/g, ' ');
}

// =====================================================
// === UI INJECTION ===
// =====================================================

function injectUI() {
  const existing = document.getElementById('flow-auto-panel');
  if (existing) existing.remove();

  const panel = document.createElement('div');
  panel.id = 'flow-auto-panel';
  panel.style.cssText = `
    position: fixed; top: 20px; right: 20px; width: 340px;
    background: rgba(18, 18, 24, 0.95); backdrop-filter: blur(16px);
    border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 16px;
    box-shadow: 0 20px 40px rgba(0,0,0,0.6); z-index: 999999;
    font-family: sans-serif; color: #fff; padding: 20px; display: flex; flex-direction: column; gap: 12px;
  `;

  panel.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:10px;">
      <span style="font-weight:700; background:linear-gradient(90deg, #fff, #aaa); -webkit-background-clip:text; -webkit-text-fill-color:transparent;">Flow Bot v7.4</span>
      <span id="status-badge" style="font-size:10px; padding:2px 8px; border-radius:10px; background:rgba(255,255,255,0.1);">Pronto</span>
    </div>

    <div>
      <div style="font-size:11px; color:#888; margin-bottom:4px;">Cole sua lista (IDs + Assets):</div>
      <textarea id="prompts-input" placeholder="[USE ASSET: X] ID01 Descrição..." style="width:100%; height:120px; background:rgba(0,0,0,0.3); border:1px solid rgba(255,255,255,0.1); border-radius:8px; color:#eee; padding:8px; font-size:11px;"></textarea>
    </div>

    <div style="height:4px; background:rgba(255,255,255,0.1); border-radius:2px; overflow:hidden;">
      <div id="progress-bar" style="height:100%; width:0%; background:#0072ff; transition:width 0.3s;"></div>
    </div>

    <div style="display:flex; gap:8px;">
      <button id="btn-start-gen" class="auto-btn" style="flex:1; background:#0072ff; color:white; border:none; padding:8px; border-radius:6px; cursor:pointer;">▶ Iniciar Geração</button>
      <button id="btn-stop-gen" class="auto-btn" style="flex:1; background:rgba(255,50,50,0.2); color:#ff5555; border:1px solid rgba(255,50,50,0.2); padding:8px; border-radius:6px; cursor:pointer;" disabled>⏹ Parar</button>
    </div>

    <div style="margin-top:10px; border-top:1px solid rgba(255,255,255,0.1); padding-top:10px;">
      <div style="font-size:11px; color:#888; margin-bottom:4px; display:flex; justify-content:space-between;">
        <span>Monitor de Downloads</span>
        <span>Memória: <strong id="mem-count">0</strong></span>
      </div>
      <button id="btn-toggle-monitor" style="width:100%; background:rgba(16, 185, 129, 0.1); border:1px solid #10b981; color:#10b981; padding:8px; border-radius:6px; cursor:pointer; font-weight:600;">
        👁️ Ativar Monitoramento
      </button>
      <button id="btn-clear-mem" style="margin-top:5px; width:100%; background:transparent; border:none; color:#666; font-size:10px; cursor:pointer;">Limpar Memória</button>
    </div>

    <div id="log-console" style="height:120px; overflow-y:auto; background:rgba(0,0,0,0.4); border-radius:8px; padding:8px; font-size:10px; font-family:monospace; color:#aaa; border:1px solid rgba(255,255,255,0.05);">
      <div>Sistema v7.4 carregado.</div>
    </div>
  `;

  document.body.appendChild(panel);

  document.getElementById('btn-start-gen').addEventListener('click', startGeneration);
  document.getElementById('btn-stop-gen').addEventListener('click', stopGeneration);
  document.getElementById('btn-toggle-monitor').addEventListener('click', toggleMonitoring);
  document.getElementById('btn-clear-mem').addEventListener('click', clearMemory);

  const saved = localStorage.getItem('flow_auto_prompts_v5');
  if (saved) document.getElementById('prompts-input').value = saved;
  updateMemoryUI();
}

// =====================================================
// === PARSER POR ID ===
// =====================================================

function parsePrompts(text) {
  const regex = /((?:\[USE ASSET:[^\]]+\]\s*)*)(ID\d+)([\s\S]+?)(?=(?:(?:\[USE ASSET:[^\]]+\]\s*)*ID\d+)|$)/gi;
  const blocks = [];
  let match;

  const cleanText = text.replace(/\r\n/g, '\n');

  while ((match = regex.exec(cleanText)) !== null) {
    const rawAssets = match[1];
    const idLabel = match[2];
    const content = match[3];

    const assetsList = [];
    const assetMatches = rawAssets.match(/\[USE ASSET:\s*(.+?)\]/gi);
    if (assetMatches) {
        assetMatches.forEach(tag => {
            const cleanName = tag.replace(/^\[USE ASSET:\s*/i, '').replace(/\]$/, '').trim();
            assetsList.push(cleanName);
        });
    }

    const finalPrompt = `${idLabel} ${content.trim()}`;

    blocks.push({
      id: idLabel,
      assets: assetsList,
      prompt: finalPrompt
    });
  }

  return blocks;
}

// =====================================================
// === FUNÇÕES DE LOGS E UI ===
// =====================================================

function addLog(message, type = 'info') {
  const consoleEl = document.getElementById('log-console');
  if (!consoleEl) return;
  const color = type === 'error' ? '#ff5555' : type === 'success' ? '#55ff55' : type === 'download' ? '#00ccff' : '#aaa';
  const icon = type === 'download' ? '⬇️' : '•';
  const time = new Date().toLocaleTimeString('pt-BR', { hour12: false, hour: "numeric", minute: "numeric" });

  const div = document.createElement('div');
  div.style.color = color;
  div.style.marginBottom = '4px';
  div.innerHTML = `<span style="opacity:0.5">[${time}]</span> ${icon} ${message}`;

  consoleEl.appendChild(div);
  consoleEl.scrollTop = consoleEl.scrollHeight;
}

function updateMemoryUI() {
  const el = document.getElementById('mem-count');
  if (el) el.textContent = getMemory().length;
}

function clearMemory() {
  if (confirm("Limpar memória?")) {
    localStorage.removeItem(STORAGE_KEY);
    updateMemoryUI();
    addLog("Memória limpa.", "error");
  }
}

function delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

// =====================================================
// === PARTE 1: GERAÇÃO (CRIADOR) ===
// =====================================================

async function startGeneration() {
  if (STATE.isGenerating) return;

  const inputEl = document.getElementById('prompts-input');
  const input = inputEl.value;
  if (!input.trim()) { addLog('Lista vazia!', 'error'); return; }

  localStorage.setItem('flow_auto_prompts_v5', input);

  const parsedPrompts = parsePrompts(input);

  if (parsedPrompts.length === 0) {
      addLog('Nenhum prompt identificado! Verifique se usou "IDxx".', 'error');
      return;
  }

  STATE.promptsQueue = parsedPrompts;
  STATE.totalPrompts = parsedPrompts.length;
  STATE.currentQueueIndex = 0;
  STATE.isGenerating = true;
  STATE.retryCounts = {};

  document.getElementById('btn-start-gen').disabled = true;
  document.getElementById('btn-stop-gen').disabled = false;
  document.getElementById('prompts-input').disabled = true;

  addLog(`Identificados ${STATE.totalPrompts} prompts.`, 'info');

  while (STATE.isGenerating && STATE.currentQueueIndex < STATE.totalPrompts) {
    const idx = STATE.currentQueueIndex;
    const promptData = STATE.promptsQueue[idx];

    try {
      addLog(`Enviando ${promptData.id}...`);
      await processInitialPrompt(promptData);
      STATE.currentQueueIndex++;
      updateProgressBar();

      if (STATE.currentQueueIndex < STATE.totalPrompts) {
        await smartDelay(CONFIG.DELAY_BETWEEN_PROMPTS);
      }
    } catch (e) {
      addLog(`Erro ${promptData.id}: ${e.message}`, 'error');
      STATE.currentQueueIndex++;
    }
  }

  if (STATE.isGenerating) {
    await runPersistenceLoop();
  }
}

function stopGeneration() {
  STATE.isGenerating = false;
  document.getElementById('btn-start-gen').disabled = false;
  document.getElementById('btn-stop-gen').disabled = true;
  document.getElementById('prompts-input').disabled = false;
  addLog("Geração parada.", "error");
}

async function processInitialPrompt(promptData) {
  await resetPageState();

  if (promptData.assets && promptData.assets.length > 0) {
    addLog(`Selecionando ${promptData.assets.length} assets...`, 'info');
    for (const assetName of promptData.assets) {
      const found = await findAndClickAssetWithScroll(assetName);
      if(!found) addLog(`Asset não achado: ${assetName}`, 'error');
      await delay(1000);
    }
  }

  await setPromptText(promptData.prompt);
  await delay(CONFIG.WAIT_FOR_CREATE_BUTTON);
  await clickCreateButton();
}

async function runPersistenceLoop() {
  let activeFailures = true;
  let loopRound = 1;

  while (activeFailures && STATE.isGenerating) {
    addLog(`=== Verificação Ciclo #${loopRound} ===`);
    await smartDelay(CONFIG.MONITORING_TIME);

    const scrollContainer = findScrollableAssetContainer();
    if (scrollContainer) scrollContainer.scrollTop = 0;
    await delay(1500);

    const errorCards = findAllErrorCards();

    if (errorCards.length === 0) {
      addLog('Sucesso! Sem falhas.', 'success');
      activeFailures = false;
      stopGeneration();
      return;
    }

    const actionable = [];
    for (const card of errorCards) {
      const key = card.text.trim();
      const count = STATE.retryCounts[key] || 0;
      if (count < CONFIG.MAX_RETRIES) {
        actionable.push(card);
      }
    }

    if (actionable.length === 0) {
      addLog('Fim das tentativas.', 'error');
      stopGeneration();
      return;
    }

    addLog(`Corrigindo ${actionable.length} falhas...`, 'download');

    for (const card of actionable) {
      if (!STATE.isGenerating) break;
      try {
        const key = card.text.trim();
        const reuseBtn = findReuseButton(card.element);
        if (reuseBtn) {
          reuseBtn.click();
          await delay(2500);
          await clickCreateButton();
          STATE.retryCounts[key] = (STATE.retryCounts[key] || 0) + 1;
          addLog(`Reenviado com erro.`, 'info');
          await delay(CONFIG.RETRY_DELAY);
        }
      } catch (e) { console.error(e); }
    }
    loopRound++;
  }
}

// =====================================================
// === PARTE 2: MONITORAMENTO DE DOWNLOAD (OBSERVADOR) ===
// =====================================================

let monitorInterval = null;

function toggleMonitoring() {
  const btn = document.getElementById('btn-toggle-monitor');
  if (STATE.isMonitoring) {
    STATE.isMonitoring = false;
    clearInterval(monitorInterval);
    btn.textContent = "👁️ Ativar Monitoramento";
    btn.style.background = "rgba(16, 185, 129, 0.1)";
    btn.style.color = "#10b981";
    addLog("Monitor pausado.");
  } else {
    STATE.isMonitoring = true;
    btn.textContent = "◉ Monitorando...";
    btn.style.background = "#10b981";
    btn.style.color = "#fff";
    addLog("Monitor ativo.", "info");

    monitorInterval = setInterval(scanAndDownloadLoop, CONFIG.CHECK_INTERVAL);
    scanAndDownloadLoop();
  }
}

async function scanAndDownloadLoop() {
  if (STATE.isDownloadingNow) return;

  const promptElements = Array.from(document.querySelectorAll('.sc-e6a99d5c-3'));

  if (promptElements.length === 0) return;

  for (const promptEl of promptElements) {
    const text = promptEl.textContent;

    if (isDownloaded(text)) continue;

    const cardContainer = findCommonCardContainer(promptEl);

    if (cardContainer) {
      const downloadBtn = findDownloadButtonInCard(cardContainer);

      if (downloadBtn) {
        STATE.isDownloadingNow = true;

        addLog(`⬇️ Baixando vídeo...`, 'download');
        // AQUI USAMOS A NOVA LÓGICA DE CLASSE ESPECÍFICA
        const success = await triggerHighResDownload(downloadBtn);

        if (success) {
          addToMemory(text);
          updateMemoryUI();
          addLog(`✅ Salvo na memória.`, 'success');
        } else {
          addLog(`❌ Falha download.`, 'error');
        }

        STATE.isDownloadingNow = false;
        await delay(CONFIG.COOLDOWN_DOWNLOAD);
        return;
      }
    }
  }
}

async function triggerHighResDownload(mainBtn) {
  try {
    mainBtn.scrollIntoView({ block: 'center', behavior: 'smooth' });
    await delay(500);

    // 1. Clicar no botão Download (mantendo a busca dinâmica do botão)
    mainBtn.click();
    console.log('Clicado no botão de download.');

    // 2. Aguardar o menu (Tempo ajustado para 600ms, seguro baseado no seu teste)
    await delay(CONFIG.DOWNLOAD_WAIT_MENU);

    // 3. TENTATIVA PRIMÁRIA: Usando a classe específica que você validou
    const specificClassItem = document.querySelector('.sc-93fd5d6e-2.jqFZVr');

    if (specificClassItem) {
      specificClassItem.click();
      console.log("Clicado via Classe Específica (.jqFZVr)");

      await delay(300);
      document.body.click(); // Fecha menu se necessário
      return true;
    }

    // 4. FALLBACK: Se a classe mudar, tenta pelo texto (Segurança)
    console.log("Classe específica não achada, tentando fallback por texto...");
    const menuItems = Array.from(document.querySelectorAll('div[role="menuitem"]'));
    const textOption = menuItems.find(el => el.textContent.includes("1080p") || el.textContent.includes("Resolução ampliada"));

    if (textOption) {
        textOption.click();
        await delay(300);
        document.body.click();
        return true;
    }

    // Se falhar tudo
    document.body.click(); // Fecha o menu
    return false;

  } catch (e) {
    console.error(e);
    return false;
  }
}

// =====================================================
// === DOM UTILS ===
// =====================================================

function updateProgressBar() {
  const bar = document.getElementById('progress-bar');
  if (bar) {
    const pct = (STATE.currentQueueIndex / STATE.totalPrompts) * 100;
    bar.style.width = `${pct}%`;
  }
}

async function smartDelay(ms) {
  const steps = ms / 1000;
  for (let i = steps; i > 0; i--) {
    if (!STATE.isGenerating) break;
    await delay(1000);
  }
}

function findCommonCardContainer(childElement) {
  let current = childElement;
  for (let i = 0; i < 15; i++) {
    if (!current) return null;
    if (current.querySelector('button') && current.textContent.includes('Baixar')) {
      return current;
    }
    current = current.parentElement;
  }
  return null;
}

function findDownloadButtonInCard(container) {
  const buttons = Array.from(container.querySelectorAll('button'));
  return buttons.find(btn =>
    btn.textContent.includes("Baixar") ||
    (btn.querySelector('i') && btn.querySelector('i').textContent.includes("download"))
  );
}

function findAllErrorCards() {
  const allDivs = document.querySelectorAll('div');
  const errorCards = [];
  for (const div of allDivs) {
    if (div.textContent.trim() === "Falha na geração") {
      const container = findParentCard(div);
      if (container) {
        let promptText = "Texto não encontrado";
        const textBtn = container.querySelector('button[class*="sc-20145656-8"], button');
        if (textBtn) promptText = textBtn.textContent.replace(/\s+/g, ' ').trim();
        errorCards.push({ element: container, text: promptText });
      }
    }
  }
  return [...new Map(errorCards.map(item => [item.element, item])).values()];
}

function findParentCard(errorDiv) {
  let current = errorDiv;
  for (let i = 0; i < 7; i++) {
    if (!current) break;
    if (findReuseButton(current)) return current;
    current = current.parentElement;
  }
  return null;
}

function findReuseButton(container) {
  const buttons = container.querySelectorAll('button');
  for (const btn of buttons) {
    const txt = btn.textContent.toLowerCase();
    const html = btn.innerHTML;
    if (txt.includes('reutilizar') || html.includes('wrap_text')) return btn;
  }
  return null;
}

async function resetPageState() {
  await switchToImagesTab();
  const container = findScrollableAssetContainer();
  if (container) container.scrollTop = 0;
  await setPromptText('');
}

async function setPromptText(text) {
  const textarea = document.querySelector('#PINHOLE_TEXT_AREA_ELEMENT_ID') || document.querySelector('textarea');
  if (textarea) {
    textarea.focus();
    textarea.value = text;
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    textarea.dispatchEvent(new Event('change', { bubbles: true }));
  }
}

async function clickCreateButton() {
  const buttons = Array.from(document.querySelectorAll('button'));
  const createBtn = buttons.find(b => {
    const txt = b.textContent.toLowerCase();
    return (txt === 'criar' || txt.includes('arrow_forward')) && !b.disabled;
  });
  if (createBtn) { createBtn.click(); return true; }
  throw new Error('Botão Criar não encontrado');
}

async function switchToImagesTab() {
  const btns = Array.from(document.querySelectorAll('button'));
  const imagesBtn = btns.find(b => b.textContent.toLowerCase().includes('imagens'));
  if (imagesBtn) imagesBtn.click();
  await delay(500);
}

function findScrollableAssetContainer() {
  const allElements = document.querySelectorAll('*');
  for (const el of allElements) {
    const style = window.getComputedStyle(el);
    if ((style.overflowY === 'scroll' || style.overflowY === 'auto') && el.scrollHeight > el.clientHeight) {
      return el;
    }
  }
  return document.documentElement;
}

async function findAndClickAssetWithScroll(assetName) {
  const container = findScrollableAssetContainer();
  let attempts = 0;
  container.scrollTop = 0;
  await delay(300);
  while (attempts < 40) {
    const found = await tryClickAssetOnScreen(assetName);
    if (found) return true;
    container.scrollTop += 300;
    await delay(200);
    attempts++;
    if (container.scrollTop + container.clientHeight >= container.scrollHeight) break;
  }
  return false;
}

async function tryClickAssetOnScreen(assetName) {
  const elements = Array.from(document.querySelectorAll('div, button, span'));
  const target = elements.find(el => el.textContent.trim().startsWith(assetName) && el.offsetParent !== null);
  if (target) {
    target.scrollIntoView({ block: 'center' });
    target.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    await delay(300);
    let parent = target.parentElement;
    for(let i=0; i<5; i++) {
      if(!parent) break;
      const btn = findIncluirButton(parent);
      if(btn) { btn.click(); return true; }
      parent = parent.parentElement;
    }
  }
  return false;
}

function findIncluirButton(container) {
  const buttons = container.querySelectorAll('button');
  for (const btn of buttons) {
    if (btn.textContent.toLowerCase().includes('incluir') || btn.querySelector('i[class*="prompt"]')) return btn;
  }
  return null;
}

injectUI();
