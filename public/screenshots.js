'use strict';
(() => {
  const app = window.welcomeTabs;
  if (!app) return;
  const $ = id => document.getElementById(id);
  const panel = $('screenshots-panel'), list = $('screenshots-list');
  const captureButton = $('capture-screenshot'), reloadButton = $('reload-screenshots');
  const retry = $('retry-history');
  const messages = {
    zh: {
      welcome: '欢迎', screenshots: '截图', pages: '页面', heading: '截图历史',
      help: '在本机 Mac 启动后台后，点击截图并拖动选择桌面区域。权限问题请为启动后台的宿主应用检查“隐私与安全性 → 屏幕与系统音频录制”，授权后按系统要求重启后台再重试。',
      capture: '区域截图', reload: '刷新历史', retry: '重试', loading: '正在加载历史…', empty: '暂无截图。点击“{capture}”创建第一张截图。',
      capturing: '正在截图并保存，请选择桌面区域…', saved: '截图已保存', cancelled: '截图已取消',
      deleted: '截图已删除', remove: '删除截图', expand: '放大截图，再次点击还原', restore: '还原截图', image: '截图',
      historyError: '历史加载失败：', failure: '操作失败：',
      INVALID_INPUT: '请求无效，请重试。', FORBIDDEN: '权限或访问被拒绝，请检查后台宿主的屏幕录制权限后重试。',
      BUSY: '已有截图正在处理中，请稍后重试。', UNSUPPORTED_PLATFORM: '此截图功能仅支持本机 macOS 后台。',
      CAPTURE_TIMEOUT: '截图超时，请重试。', CAPTURE_FAILED: '未完成截图，请检查权限或重试。',
      STORAGE_FAILED: '存储失败，请检查后台磁盘后重试。', NETWORK: '连接失败，请确认本机后台已启动，刷新历史核对已保存截图后再重试。'
    },
    en: {
      welcome: 'Welcome', screenshots: 'Screenshots', pages: 'Pages', heading: 'Screenshot history',
      help: 'Start the backend on this Mac, then capture and drag to select a desktop region. For permission issues, check Privacy & Security → Screen & System Audio Recording for the app hosting the backend. Grant access and restart the backend if required, then retry.',
      capture: 'Capture region', reload: 'Refresh history', retry: 'Retry', loading: 'Loading history…', empty: 'No screenshots yet. Select “{capture}” to create your first screenshot.',
      capturing: 'Capturing and saving; select a desktop region…', saved: 'Screenshot saved', cancelled: 'Capture cancelled',
      deleted: 'Screenshot deleted', remove: 'Delete screenshot', expand: 'Enlarge screenshot; click again to restore', restore: 'Restore screenshot', image: 'Screenshot',
      historyError: 'History loading failed: ', failure: 'Operation failed: ',
      INVALID_INPUT: 'Invalid request. Please retry.', FORBIDDEN: 'Permission or access denied. Check screen recording permission for the backend host and retry.',
      BUSY: 'A capture is already in progress. Please retry later.', UNSUPPORTED_PLATFORM: 'Capture requires a local macOS backend.',
      CAPTURE_TIMEOUT: 'Capture timed out. Please retry.', CAPTURE_FAILED: 'Capture did not complete. Check permissions or retry.',
      STORAGE_FAILED: 'Storage failed. Check the backend disk and retry.', NETWORK: 'Connection failed. Start the local backend, refresh history to check saved captures, then retry.'
    }
  };
  const t = key => messages[app.language][key] || messages[app.language].CAPTURE_FAILED;
  // The empty-state guide names the capture button, so its label cannot drift from the call to action.
  const emptyGuide = () => t('empty').replace('{capture}', () => t('capture'));
  const errorCode = error => Object.hasOwn(messages.en, error?.message) ? error.message : 'CAPTURE_FAILED';
  let items = new Map(), history = 'idle', historyError = '', notice = '', noticeError = '';
  let capturing = false, loading = false, expandedId = null, restoreView = null;
  const deleting = new Set(), cards = new Map();
  let csrfToken = null, sessionPromise = null;
  // Session bootstrap is shared by writes. Integration may inject a token in the page.
  async function session() {
    if (csrfToken) return csrfToken;
    const embedded = document.querySelector('meta[name="csrf-token"]')?.content;
    if (embedded) return (csrfToken = embedded);
    if (!sessionPromise) sessionPromise = (async () => {
      const body = await request('/api/session');
      const token = body.csrfToken || body.token;
      if (typeof token !== 'string' || !token) throw new Error('FORBIDDEN');
      return (csrfToken = token);
    })().finally(() => { sessionPromise = null; });
    return sessionPromise;
  }
  async function request(url, options = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.method === 'POST' ? 130000 : 15000);
    try {
      const response = await fetch(url, {...options, credentials: 'same-origin', signal: controller.signal});
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        const code = body.error?.code;
        throw new Error(Object.hasOwn(messages.en, code) ? code : 'CAPTURE_FAILED');
      }
      return response.status === 204 ? null : await response.json();
    } catch (error) {
      if (Object.hasOwn(messages.en, error.message)) throw error;
      throw new Error('NETWORK');
    } finally { clearTimeout(timer); }
  }
  async function write(url, method, body) {
    const token = await session();
    return request(url, {method, headers: {'Content-Type': 'application/json', 'X-CSRF-Token': token}, body: JSON.stringify(body)});
  }
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  function record(item) {
    if (!item || !uuid.test(item.id) || !Number.isFinite(Date.parse(item.createdAt)) ||
        !Number.isInteger(item.width) || item.width <= 0 || !Number.isInteger(item.height) || item.height <= 0 ||
        item.url !== '/api/screenshots/' + item.id + '/image') throw new Error('STORAGE_FAILED');
    return item;
  }
  // Keep the image's grid slot while its button is fixed to the viewport.
  function setCardExpanded(card, value) {
    if (value) {
      const height = card.root.getBoundingClientRect().height;
      card.root.style.boxSizing = 'border-box';
      card.root.style.minHeight = height + 'px';
    } else { card.root.style.minHeight = ''; card.root.style.boxSizing = ''; }
    card.imageButton.setAttribute('aria-expanded', String(value));
    card.imageButton.setAttribute('aria-label', t(value ? 'restore' : 'expand'));
  }
  function findNeighbor(id, key) {
    const positions = [...cards].filter(([, card]) => card.root.isConnected)
      .map(([id, card]) => ({id, rect: card.root.getBoundingClientRect()}))
      .filter(({rect}) => rect.width > 0 && rect.height > 0 && Number.isFinite(rect.top) && Number.isFinite(rect.left))
      .sort((a, b) => a.rect.top - b.rect.top || a.rect.left - b.rect.left);
    const rows = [];
    for (const entry of positions) {
      let row = rows.find(row => Math.abs(row[0].rect.top - entry.rect.top) < 1);
      if (!row) rows.push(row = []);
      row.push(entry);
    }
    for (const row of rows) row.sort((a, b) => a.rect.left - b.rect.left);
    const r = rows.findIndex(row => row.some(entry => entry.id === id));
    if (r < 0) return null;
    const c = rows[r].findIndex(entry => entry.id === id);
    const target = key === 'ArrowLeft' ? rows[r][c - 1] : key === 'ArrowRight' ? rows[r][c + 1] :
      key === 'ArrowUp' ? rows[r - 1]?.[c] : key === 'ArrowDown' ? rows[r + 1]?.[c] : null;
    return target?.id || null;
  }
  function navigateScreenshot(id, key) {
    const targetId = findNeighbor(id, key);
    if (!targetId) return false;
    const target = cards.get(targetId);
    if (expandedId) {
      const previous = cards.get(expandedId);
      setCardExpanded(target, true);
      if (previous) setCardExpanded(previous, false);
      expandedId = targetId;
      if ([...cards.values()].some(card => card.imageButton === restoreView.focus)) restoreView.focus = target.imageButton;
    }
    target.imageButton.focus({preventScroll: true});
    return true;
  }
  function closeExpanded(restoreFocus = true) {
    if (!expandedId) return;
    const card = cards.get(expandedId);
    expandedId = null;
    if (card) setCardExpanded(card, false);
    document.body.style.overflow = restoreView.overflow;
    const focus = restoreView.focus;
    if (restoreFocus && focus?.isConnected) focus.focus({preventScroll: true});
    window.scrollTo({left: restoreView.x, top: restoreView.y});
    restoreView = null;
  }
  function toggleExpanded(id) {
    if (expandedId === id) { closeExpanded(); return; }
    closeExpanded();
    app.closeGallery?.();
    restoreView = {overflow: document.body.style.overflow, x: window.scrollX, y: window.scrollY, focus: document.activeElement};
    expandedId = id;
    document.body.style.overflow = 'hidden';
    setCardExpanded(cards.get(id), true);
  }
  function render() {
    $('welcome-tab').textContent = t('welcome'); $('screenshots-tab').textContent = t('screenshots');
    document.querySelector('[role="tablist"]').setAttribute('aria-label', t('pages'));
    $('screenshots-heading').textContent = t('heading'); $('screenshots-help').textContent = t('help');
    captureButton.textContent = t('capture'); captureButton.disabled = capturing;
    reloadButton.textContent = t('reload'); reloadButton.disabled = loading;
    retry.textContent = t('retry'); retry.hidden = history !== 'error'; retry.disabled = loading;
    $('capture-status').textContent = noticeError ? t('failure') + t(noticeError) : notice ? t(notice) : '';
    $('history-status').textContent = history === 'loading' ? t('loading') : history === 'error' ? t('historyError') + t(historyError) : items.size ? '' : emptyGuide();
    panel.setAttribute('aria-busy', String(loading));
    $('history-status').setAttribute('aria-busy', String(loading));
    for (const [id, card] of cards) {
      card.image.alt = t('image') + ' · ' + items.get(id).createdAt;
      card.imageButton.setAttribute('aria-label', t(id === expandedId ? 'restore' : 'expand'));
      card.remove.textContent = t('remove'); card.remove.disabled = deleting.has(id);
    }
  }
  function renderRecords() {
    for (const [id, card] of cards) if (!items.has(id)) { card.root.remove(); cards.delete(id); }
    const sorted = [...items.values()].sort((a,b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
    for (const item of sorted) {
      let card = cards.get(item.id);
      if (!card) {
        const root = document.createElement('figure'), imageButton = document.createElement('button');
        const image = document.createElement('img'), caption = document.createElement('figcaption'), remove = document.createElement('button');
        root.className = 'screenshot'; imageButton.className = 'screenshot-image'; remove.className = 'screenshot-delete';
        imageButton.type = remove.type = 'button'; imageButton.setAttribute('aria-expanded', 'false');
        imageButton.append(image); root.append(imageButton, caption, remove);
        imageButton.addEventListener('click', () => toggleExpanded(item.id));
        imageButton.addEventListener('keydown', event => {
          if (document.activeElement === imageButton && ['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)) {
            event.preventDefault();
            navigateScreenshot(item.id, event.key);
          }
          if (event.key === 'Escape') closeExpanded();
        });
        remove.addEventListener('click', () => deleteItem(item.id));
        card = {root, imageButton, image, caption, remove}; cards.set(item.id, card);
      }
      if (card.image.getAttribute('src') !== item.url) card.image.src = item.url;
      card.caption.textContent = item.createdAt + ' · ' + item.width + ' × ' + item.height;
      // Avoid moving focused nodes when their position has not changed.
      const position = sorted.indexOf(item);
      if (list.children[position] !== card.root) list.insertBefore(card.root, list.children[position] || null);
    }
    render();
  }
  async function loadHistory() {
    if (loading) return;
    loading = true; history = 'loading'; render();
    try {
      const body = await request('/api/screenshots');
      if (!Array.isArray(body.items)) throw new Error('STORAGE_FAILED');
      const next = new Map(body.items.map(item => {record(item); return [item.id, item];}));
      // A write completed after this list request began: retain that newer local state.
      if (writeGeneration !== loadGeneration) { history = 'ready'; return; }
      const focusRemoved = [...cards].some(([id, card]) => !next.has(id) && card.root.contains(document.activeElement));
      if (expandedId && !next.has(expandedId)) closeExpanded(false);
      items = next; history = 'ready'; renderRecords();
      if (focusRemoved) reloadButton.focus({preventScroll: true});
    } catch (error) { history = 'error'; historyError = errorCode(error); }
    finally { loading = false; render(); }
  }
  let writeGeneration = 0, loadGeneration = 0;
  function reload() { if (!loading) { loadGeneration = writeGeneration; return loadHistory(); } }
  async function capture() {
    if (capturing) return;
    capturing = true; notice = 'capturing'; noticeError = ''; render();
    try {
      const result = await write('/api/screenshots', 'POST', {requestId: window.crypto.randomUUID()});
      if (!result || typeof result !== 'object') throw new Error('CAPTURE_FAILED');
      if (result.cancelled === true) notice = 'cancelled';
      else { const item = record(result.item); writeGeneration++; items.set(item.id,item); notice = 'saved'; renderRecords(); }
    } catch (error) { notice = ''; noticeError = errorCode(error); }
    finally { capturing = false; render(); }
  }
  async function deleteItem(id) {
    if (deleting.has(id)) return;
    deleting.add(id); notice = ''; noticeError = ''; render();
    try {
      await write('/api/screenshots/' + id, 'DELETE', {});
      if (expandedId === id) closeExpanded(false);
      const ownedFocus = cards.get(id)?.root.contains(document.activeElement);
      items.delete(id); writeGeneration++; notice = 'deleted'; renderRecords();
      if (ownedFocus) captureButton.focus({preventScroll: true});
    } catch (error) { noticeError = errorCode(error); }
    finally { deleting.delete(id); render(); }
  }
  function selectTab(id, focus = false) {
    closeExpanded(false); app.closeGallery?.();
    const screenshots = id === 'screenshots-tab';
    $('welcome-panel').hidden = screenshots; panel.hidden = !screenshots;
    for (const tab of [$('welcome-tab'), $('screenshots-tab')]) {
      const selected = tab.id === id;
      tab.setAttribute('aria-selected', String(selected)); tab.tabIndex = selected ? 0 : -1;
    }
    if (focus || !$('welcome-panel').contains(document.activeElement) && !panel.contains(document.activeElement)) $(id).focus({preventScroll:true});
    if (screenshots && history === 'idle') reload();
  }
  for (const tab of [$('welcome-tab'), $('screenshots-tab')]) {
    tab.addEventListener('click', () => selectTab(tab.id, true));
    tab.addEventListener('keydown', event => {
      if (['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) {
        event.preventDefault();
        const id = event.key === 'Home' ? 'welcome-tab' : event.key === 'End' ? 'screenshots-tab' : tab.id === 'welcome-tab' ? 'screenshots-tab' : 'welcome-tab';
        selectTab(id, true);
      }
    });
  }
  captureButton.addEventListener('click', capture); reloadButton.addEventListener('click', reload); retry.addEventListener('click', reload);
  app.renderLanguage = render;
  render();
})();
