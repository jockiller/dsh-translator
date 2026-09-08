/* dsh-translator-pro client bundle - v0.1.1 */
(function() {
  function initModule(require) {
    var module = { exports: {} };
    var exports = module.exports;
    var React = typeof window !== "undefined" && window.React ? window.React : (require ? require("react") : null);

    var plugin = (function() {
// Client-side Cordis Plugin for DSH Input Translator Pro
// Slot 1: conversation.input.overlay (Top-right floating button inside composer card)
// Slot 2: settings.plugin.item (Plugin configuration card)

return {
  inject: ['slots'],
  apply(ctx) {
    try {
      const slots = ctx.get('slots');
      if (!slots) {
        console.warn('[dsh-translator-pro] slots service not available');
        return;
      }

    const DEFAULT_PLUGIN_VERSION = '0.1.1';
    const STORAGE_KEY_HISTORY = 'dsh_translator_history_v1';

    const DEFAULT_CONFIG = {
      enabled: true,
      targetLang: '智能中英互译',
      activeProvider: 'current',
      zhipu: {
        id: 'zhipu',
        name: '智谱 GLM-4-Flash',
        endpoint: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
        model: 'glm-4-flash',
        apiKey: ''
      },
      customs: []
    };

    const BUILTIN_PROVIDERS = {
      current: {
        id: 'current',
        name: '当前会话模型',
        builtin: true,
        useCurrentModel: true,
        endpoint: '',
        model: '',
        apiKey: ''
      },
      zhipu: {
        id: 'zhipu',
        name: '智谱 GLM-4-Flash',
        builtin: true,
        useCurrentModel: false,
        endpoint: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
        model: 'glm-4-flash',
        apiKey: ''
      }
    };

    function makeCustomProvider(name, endpoint, model, apiKey) {
      return {
        id: 'c_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
        name: (name && name.trim()) || '自定义 API',
        builtin: false,
        useCurrentModel: false,
        endpoint: (endpoint && endpoint.trim()) || '',
        model: (model && model.trim()) || '',
        apiKey: apiKey || ''
      };
    }

    // 历史记录存储在浏览器的 localStorage 中
    function getHistory() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY_HISTORY);
        if (!raw) return [];
        const arr = JSON.parse(raw);
        return Array.isArray(arr) ? arr : [];
      } catch (e) {
        return [];
      }
    }

    function saveHistoryItem(original, translated, model) {
      if (!original || !translated) return [];
      try {
        let list = getHistory();
        list = list.filter(item => item.original !== original);
        const newItem = {
          id: 'tr_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
          original,
          translated,
          model: model || 'glm-4-flash',
          time: new Date().toISOString()
        };
        list.unshift(newItem);
        if (list.length > 10) {
          list = list.slice(0, 10);
        }
        localStorage.setItem(STORAGE_KEY_HISTORY, JSON.stringify(list));
        return list;
      } catch (e) {
        return [];
      }
    }

    function removeHistoryItem(id) {
      try {
        let list = getHistory().filter(it => it.id !== id);
        localStorage.setItem(STORAGE_KEY_HISTORY, JSON.stringify(list));
        return list;
      } catch (e) {
        return [];
      }
    }

    function clearAllHistory() {
      try {
        localStorage.removeItem(STORAGE_KEY_HISTORY);
      } catch (e) {}
      return [];
    }

    // 配置信息（含提供商与密钥）落盘在 ~/.dsh/translator-config.json
    let storeState = { ...DEFAULT_CONFIG };
    let storeLoaded = false;
    const storeListeners = new Set();

    function notifyStoreListeners() {
      for (const listener of storeListeners) {
        try { listener({ ...storeState }); } catch (_) {}
      }
    }

    async function fetchServerConfig() {
      try {
        const res = await fetch('/api/translator/config');
        if (res.ok) {
          const data = await res.json();
          if (data.success && data.config) {
            storeState = {
              ...DEFAULT_CONFIG,
              ...data.config,
              zhipu: { ...DEFAULT_CONFIG.zhipu, ...(data.config.zhipu || {}) },
              customs: Array.isArray(data.config.customs) ? data.config.customs : []
            };
            storeLoaded = true;
            notifyStoreListeners();
            return storeState;
          }
        }
      } catch (err) {
        console.warn('[dsh-translator] fetchServerConfig error:', err);
      }
      return storeState;
    }

    // 后台立即触发预加载
    fetchServerConfig();

    async function updateServerConfig(patch) {
      storeState = {
        ...storeState,
        ...patch,
        zhipu: patch.zhipu ? { ...storeState.zhipu, ...patch.zhipu } : storeState.zhipu,
        customs: patch.customs !== undefined ? patch.customs : storeState.customs
      };
      notifyStoreListeners();

      try {
        const res = await fetch('/api/translator/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(storeState)
        });
        if (res.ok) {
          const data = await res.json();
          if (data.success && data.config) {
            storeState = {
              ...DEFAULT_CONFIG,
              ...data.config,
              zhipu: { ...DEFAULT_CONFIG.zhipu, ...(data.config.zhipu || {}) },
              customs: Array.isArray(data.config.customs) ? data.config.customs : []
            };
          }
        }
      } catch (err) {
        console.error('[dsh-translator] updateServerConfig error:', err);
      }
      return storeState;
    }

    function useTranslatorConfig() {
      const [state, setState] = React.useState(storeState);
      React.useEffect(() => {
        storeListeners.add(setState);
        if (!storeLoaded) {
          fetchServerConfig();
        }
        return () => {
          storeListeners.delete(setState);
        };
      }, []);
      return [state, updateServerConfig];
    }

    function getProviderById(cfg, provId) {
      if (provId === 'current') return BUILTIN_PROVIDERS.current;
      if (provId === 'zhipu') {
        return {
          ...BUILTIN_PROVIDERS.zhipu,
          ...(cfg.zhipu || {})
        };
      }
      return (cfg.customs || []).find(c => c.id === provId) || null;
    }

    function formatTimeAgo(isoString) {
      if (!isoString) return '刚刚';
      const diff = Math.max(0, Date.now() - new Date(isoString).getTime());
      const mins = Math.floor(diff / 60000);
      if (mins < 1) return '刚刚';
      if (mins < 60) return `${mins} 分钟前`;
      const hours = Math.floor(mins / 60);
      if (hours < 24) return `${hours} 小时前`;
      const days = Math.floor(hours / 24);
      return `${days} 天前`;
    }

    const css = `
      /* ==================== 输入框右上角悬浮翻译挂件样式 ==================== */
      .dsh-tr-float-btn {
        position: absolute;
        top: 8px;
        right: 12px;
        z-index: 12;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 26px;
        height: 26px;
        padding: 0;
        border-radius: 7px;
        border: 1px solid transparent;
        background: transparent;
        color: var(--dsw-alias-label-tertiary, #8c959f);
        cursor: pointer;
        outline: none;
        transition: all 0.15s ease;
        user-select: none;
        -webkit-user-select: none;
      }
      .dsh-tr-float-btn:hover {
        background: var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, 0.06));
        color: var(--dsw-alias-state-business-primary, #0969da);
        border-color: var(--dsw-alias-border-l3, rgba(0, 0, 0, 0.12));
      }
      .dsh-tr-float-btn.active-draft {
        color: var(--dsw-alias-label-secondary, #57606a);
      }
      .dsh-tr-float-btn.loading {
        pointer-events: none;
        opacity: 0.8;
      }

      /* ==================== 翻译预览与历史弹窗 ==================== */
      .dsh-tr-overlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.46);
        backdrop-filter: blur(5px);
        -webkit-backdrop-filter: blur(5px);
        z-index: 10005;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 16px;
      }
      .dsh-tr-modal {
        width: 580px;
        max-width: 95vw;
        height: 540px;
        max-height: 88vh;
        background: var(--dsw-alias-bg-layer-2, #ffffff);
        color: var(--dsw-alias-label-primary, #1f2328);
        border: 1px solid var(--dsw-alias-border-l3, rgba(0, 0, 0, 0.14));
        border-radius: 14px;
        box-shadow: 0 16px 48px rgba(0, 0, 0, 0.35);
        display: flex;
        flex-direction: column;
        overflow: hidden;
        font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, sans-serif;
        animation: dshTrPop 0.16s ease-out;
      }
      @keyframes dshTrPop {
        from { opacity: 0; transform: scale(0.96); }
        to { opacity: 1; transform: scale(1); }
      }

      /* 头部 Header */
      .dsh-tr-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 10px 16px;
        border-bottom: 1px solid var(--dsw-alias-border-l4, rgba(0, 0, 0, 0.08));
        background: var(--dsw-alias-bg-layer-3, rgba(0, 0, 0, 0.02));
      }
      .dsh-tr-title-wrap {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .dsh-tr-title {
        font-size: 14px;
        font-weight: 700;
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .dsh-tr-model-badge {
        font-size: 11px;
        font-weight: 600;
        padding: 1px 6px;
        border-radius: 4px;
        background: var(--dsw-alias-state-business-primary-subtle, rgba(9, 105, 218, 0.1));
        color: var(--dsw-alias-state-business-primary, #0969da);
        font-family: monospace;
      }
      .dsh-tr-tabs {
        display: inline-flex;
        background: var(--dsw-alias-bg-layer-4, rgba(0, 0, 0, 0.05));
        padding: 2px;
        border-radius: 6px;
      }
      .dsh-tr-tab-btn {
        padding: 3px 10px;
        font-size: 12px;
        border-radius: 5px;
        border: none;
        background: transparent;
        color: var(--dsw-alias-label-secondary, #656d76);
        cursor: pointer;
        font-weight: 500;
        transition: all 0.12s;
      }
      .dsh-tr-tab-btn.active {
        background: var(--dsw-alias-bg-layer-2, #ffffff);
        color: var(--dsw-alias-label-primary, #1f2328);
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        font-weight: 600;
      }
      .dsh-tr-close-btn {
        border: none;
        background: transparent;
        font-size: 14px;
        padding: 4px 6px;
        border-radius: 4px;
        color: var(--dsw-alias-label-tertiary, #8c959f);
        cursor: pointer;
      }
      .dsh-tr-close-btn:hover {
        background: var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, 0.08));
        color: var(--dsw-alias-label-primary, #1f2328);
      }

      /* 弹窗主体 */
      .dsh-tr-body {
        flex: 1 1 auto;
        min-height: 0;
        overflow-y: auto;
        padding: 14px 16px;
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      .dsh-tr-field-group {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .dsh-tr-field-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        font-size: 12px;
        font-weight: 600;
        color: var(--dsw-alias-label-secondary, #656d76);
      }
      .dsh-tr-textarea {
        width: 100%;
        box-sizing: border-box;
        min-height: 90px;
        max-height: 220px;
        padding: 8px 10px;
        border-radius: 8px;
        border: 1px solid var(--dsw-alias-border-l3, rgba(0, 0, 0, 0.14));
        background: var(--dsw-alias-bg-layer-1, #ffffff);
        color: var(--dsw-alias-label-primary, #1f2328);
        font-size: 13px;
        line-height: 1.5;
        font-family: inherit;
        resize: vertical;
        outline: none;
        transition: border-color 0.15s;
      }
      .dsh-tr-textarea:focus {
        border-color: var(--dsw-alias-state-business-primary, #0969da);
      }
      .dsh-tr-trans-preview {
        min-height: 100px;
        max-height: 240px;
        overflow-y: auto;
        padding: 10px 12px;
        border-radius: 8px;
        background: var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, 0.03));
        border: 1px solid var(--dsw-alias-border-l4, rgba(0, 0, 0, 0.1));
        font-size: 13.5px;
        line-height: 1.6;
        white-space: pre-wrap;
        word-break: break-word;
        color: var(--dsw-alias-label-primary, #1f2328);
      }
      .dsh-tr-status-loading {
        display: flex;
        align-items: center;
        gap: 8px;
        color: var(--dsw-alias-label-secondary, #656d76);
        font-size: 13px;
        padding: 24px 0;
        justify-content: center;
      }
      .dsh-tr-status-error {
        color: #d9363e;
        background: rgba(217, 54, 62, 0.08);
        border: 1px solid rgba(217, 54, 62, 0.25);
        padding: 10px 12px;
        border-radius: 8px;
        font-size: 12.5px;
        line-height: 1.5;
      }

      /* 弹窗底部操作按钮条 */
      .dsh-tr-footer {
        padding: 10px 16px;
        border-top: 1px solid var(--dsw-alias-border-l4, rgba(0, 0, 0, 0.08));
        background: var(--dsw-alias-bg-layer-3, rgba(0, 0, 0, 0.02));
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      .dsh-tr-btn-group {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .dsh-tr-btn {
        padding: 6px 12px;
        font-size: 12.5px;
        border-radius: 6px;
        cursor: pointer;
        font-weight: 500;
        transition: all 0.15s;
        border: 1px solid var(--dsw-alias-border-l3, rgba(0, 0, 0, 0.14));
        background: var(--dsw-alias-bg-layer-1, #ffffff);
        color: var(--dsw-alias-label-primary, #1f2328);
      }
      .dsh-tr-btn:hover {
        background: var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, 0.06));
      }
      .dsh-tr-btn-primary {
        background: var(--dsw-alias-state-business-primary, #0969da) !important;
        color: #ffffff !important;
        border-color: transparent !important;
        font-weight: 600;
      }
      .dsh-tr-btn-primary:hover {
        opacity: 0.9;
      }
      .dsh-tr-btn-primary:disabled {
        opacity: 0.45;
        cursor: not-allowed;
      }

      /* 历史记录列表 */
      .dsh-tr-history-list {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .dsh-tr-history-item {
        border: 1px solid var(--dsw-alias-border-l4, rgba(0, 0, 0, 0.08));
        background: var(--dsw-alias-bg-layer-1, #ffffff);
        border-radius: 8px;
        padding: 10px 12px;
        display: flex;
        flex-direction: column;
        gap: 6px;
        transition: border-color 0.15s;
      }
      .dsh-tr-history-item:hover {
        border-color: var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.2));
      }
      .dsh-tr-history-top {
        display: flex;
        align-items: center;
        justify-content: space-between;
        font-size: 11px;
        color: var(--dsw-alias-label-tertiary, #8c959f);
      }
      .dsh-tr-history-content {
        font-size: 12.5px;
        line-height: 1.45;
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .dsh-tr-history-orig {
        color: var(--dsw-alias-label-primary, #1f2328);
        overflow: hidden;
        text-overflow: ellipsis;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
      }
      .dsh-tr-history-trans {
        color: var(--dsw-alias-state-business-primary, #0969da);
        font-weight: 500;
        overflow: hidden;
        text-overflow: ellipsis;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
      }
      .dsh-tr-history-actions {
        display: flex;
        align-items: center;
        gap: 6px;
        margin-top: 4px;
      }
      .dsh-tr-mini-btn {
        padding: 2px 7px;
        font-size: 11px;
        border-radius: 4px;
        border: 1px solid var(--dsw-alias-border-l4, rgba(0, 0, 0, 0.1));
        background: transparent;
        color: var(--dsw-alias-label-secondary, #656d76);
        cursor: pointer;
      }
      .dsh-tr-mini-btn:hover {
        background: var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, 0.06));
        color: var(--dsw-alias-label-primary, #1f2328);
      }
      .dsh-tr-mini-btn.active-provider {
        background: var(--dsw-alias-state-business-primary-subtle, rgba(9, 105, 218, 0.12)) !important;
        color: var(--dsw-alias-state-business-primary, #0969da) !important;
        border-color: var(--dsw-alias-state-business-primary, #0969da) !important;
        font-weight: 600;
      }

      /* 旋转动画 */
      .dsh-tr-spin {
        animation: dshTrSpin 1s linear infinite;
      }
      @keyframes dshTrSpin {
        100% { transform: rotate(360deg); }
      }

      /* ==================== 设置面板卡片样式 ==================== */
      .dsh-tr-settings-card {
        border: .5px solid var(--dsw-alias-border-l4, rgba(255, 255, 255, 0.12));
        background: var(--dsw-alias-bg-layer-3, rgba(22, 24, 29, 0.94));
        border-radius: 16px;
        list-style: none;
        transition: border-color .16s, background .16s;
        margin-bottom: 10px;
        overflow: hidden;
      }
      .dsh-tr-settings-card:hover {
        border-color: var(--dsw-alias-label-dimmed, #0969da);
      }
      .dsh-tr-settings-card-open {
        background: var(--dsw-alias-bg-layer-2, rgba(22, 24, 29, 0.94));
        border-color: var(--dsw-alias-label-dimmed, rgba(255, 255, 255, 0.2));
      }
      .dsh-tr-settings-header {
        appearance: none;
        width: 100%;
        font: inherit;
        color: inherit;
        text-align: left;
        cursor: pointer;
        background: 0 0;
        border: 0;
        border-radius: 12px;
        align-items: center;
        gap: 12px;
        padding: 14px 16px;
        display: flex;
        user-select: none;
      }
      .dsh-tr-settings-head-text {
        flex-direction: column;
        flex: 1;
        gap: 4px;
        min-width: 0;
        display: flex;
      }
      .dsh-tr-settings-name {
        font-size: 15px;
        font-weight: 600;
        line-height: 1.4;
      }
      .dsh-tr-settings-desc {
        font-size: 13px;
        line-height: 1.5;
        color: var(--dsw-alias-label-secondary, #8c959f);
      }
      .dsh-tr-settings-body {
        border-top: .5px solid var(--dsw-alias-border-l4, rgba(255, 255, 255, 0.12));
        padding: 14px 16px;
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      .dsh-tr-cfg-row {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .dsh-tr-cfg-label {
        font-size: 13px;
        font-weight: 600;
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      .dsh-tr-cfg-input {
        width: 100%;
        box-sizing: border-box;
        padding: 6px 10px;
        font-size: 13px;
        border-radius: 6px;
        border: 1px solid var(--dsw-alias-border-l3, rgba(0, 0, 0, 0.15));
        background: var(--dsw-alias-bg-layer-1, #ffffff);
        color: var(--dsw-alias-label-primary, #1f2328);
        outline: none;
      }
      .dsh-tr-cfg-input:focus {
        border-color: var(--dsw-alias-state-business-primary, #0969da);
      }
    `;

    // 动态注入样式
    if (typeof document !== 'undefined' && !document.getElementById('dsh-translator-style')) {
      const styleEl = document.createElement('style');
      styleEl.id = 'dsh-translator-style';
      styleEl.textContent = css;
      document.head.appendChild(styleEl);
    }

    // 构造翻译 Prompt
    function buildMessages(text, targetLang) {
      const systemPrompt = `你是一个极高精准度的专业翻译助手。
【核心任务】
1. 语言智能识别与对调转换：
   - 若用户输入主要为中文，请将其翻译为地道、自然、准确的英文；
   - 若用户输入主要为英文（或其他外语），请将其翻译为流畅优雅的中文；
   - 若用户显式要求翻译为特定语言（如【${targetLang}】），则严格翻译为该语言。
2. 保持原格式：
   - 严格保留所有的换行、标点符号、Markdown 格式、代码块及特殊标识符（如 camelCase、snake_case、URL 等）。
3. 绝对禁则：
   - 只输出翻译后的纯净结果，严禁输出任何问候、引言、多余解释或前后引号。`;

      const userPrompt = targetLang === '智能中英互译' ?
        `请将以下内容进行智能翻译（中文翻英文，英文/外语翻中文）：\n\n${text}` :
        `请将以下内容翻译为【${targetLang}】：\n\n${text}`;

      return [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ];
    }

    // ==================== 弹窗预览与历史找回组件 ====================
    function TranslatorModal({ onClose, initialText, sessionId, currentModelInfo, onConfirmReplace, onConfirmAppend }) {
      const [tab, setTab] = React.useState('preview'); // preview | history
      const [sourceText, setSourceText] = React.useState(initialText || '');
      const [translatedText, setTranslatedText] = React.useState('');
      const [loading, setLoading] = React.useState(false);
      const [errorMsg, setErrorMsg] = React.useState('');
      const [copied, setCopied] = React.useState(false);

      const [fullConfig, setFullConfig] = useTranslatorConfig();
      const configRef = React.useRef(fullConfig);
      configRef.current = fullConfig;

      const activeProviderId = fullConfig.activeProvider || 'current';
      const activeProv = getProviderById(fullConfig, activeProviderId) || BUILTIN_PROVIDERS.current;
      const [historyList, setHistoryList] = React.useState(() => getHistory());

      const activeModelLabel = React.useMemo(() => {
        if (activeProviderId === 'current') {
          return currentModelInfo?.model ? `${currentModelInfo.model} (当前)` : '当前会话模型';
        }
        return activeProv?.name || activeProv?.model || '自定义 API';
      }, [activeProviderId, activeProv, currentModelInfo]);

      // 执行翻译函数
      const doTranslate = React.useCallback(async (textToTranslate, targetProvId) => {
        const text = (textToTranslate || '').trim();
        if (!text) {
          setErrorMsg('待翻译文本为空，请输入或粘贴需要翻译的文本。');
          return;
        }

        const cfg = configRef.current;
        const provId = targetProvId || cfg.activeProvider || 'current';
        const prov = getProviderById(cfg, provId);
        if (!prov) return;
        const isCurrent = provId === 'current';

        if (!isCurrent && (!prov.apiKey || !prov.apiKey.trim())) {
          setErrorMsg(`未配置 ${prov.name} 的 API Key，请在插件设置中填写或切换为当前会话模型。`);
          return;
        }

        setLoading(true);
        setErrorMsg('');
        setTranslatedText('');

        try {
          const reqBody = {
            useCurrentModel: isCurrent,
            sessionId: sessionId || '',
            provider: isCurrent ? (currentModelInfo?.provider || '') : '',
            model: isCurrent
              ? (currentModelInfo?.model || '')
              : (prov.model ? prov.model.trim() : ''),
            endpoint: prov.endpoint ? prov.endpoint.trim() : '',
            apiKey: prov.apiKey ? prov.apiKey.trim() : '',
            messages: buildMessages(text, cfg.targetLang),
            temperature: 0.1
          };

          const res = await fetch('/api/translator/translate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(reqBody)
          });

          const data = await res.json();
          if (!res.ok || !data.success) {
            setErrorMsg(data.error || `请求失败 (HTTP ${res.status})`);
          } else {
            const resText = data.text || '';
            setTranslatedText(resText);
            // 自动保存历史记录至 localStorage（保留最近 10 条）
            saveHistoryItem(text, resText, data.model || activeModelLabel);
            setHistoryList(getHistory());
          }
        } catch (e) {
          setErrorMsg(`网络请求错误: ${e.message}`);
        } finally {
          setLoading(false);
        }
      }, [sessionId, currentModelInfo, activeModelLabel]);

      const handleSwitchProvider = (newId) => {
        if (!getProviderById(fullConfig, newId)) return;
        setFullConfig({ activeProvider: newId });
        if (sourceText && sourceText.trim()) {
          doTranslate(sourceText, newId);
        }
      };

      // 仅在弹窗打开挂载时执行一次
      React.useEffect(() => {
        if (initialText && initialText.trim()) {
          doTranslate(initialText);
        } else {
          setTab('history');
        }
      }, []);

      // 复制功能
      const handleCopy = (text) => {
        if (!text) return;
        navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      };

      // 从历史找回
      const handleRestoreHistory = (text, type = 'replace') => {
        if (type === 'replace') {
          onConfirmReplace(text);
        } else {
          onConfirmAppend(text);
        }
        onClose();
      };

      // 删除单条历史
      const handleDeleteHistory = (id) => {
        const next = removeHistoryItem(id);
        setHistoryList(next);
      };

      // 清空历史
      const handleClearHistory = () => {
        clearAllHistory();
        setHistoryList([]);
      };

      return React.createElement('div', {
        className: 'dsh-tr-overlay',
        onClick: (e) => {
          if (e.target === e.currentTarget) onClose();
        }
      },
        React.createElement('div', { className: 'dsh-tr-modal' },
          // 头部 Header
          React.createElement('div', { className: 'dsh-tr-header' },
            React.createElement('div', { className: 'dsh-tr-title-wrap' },
              React.createElement('div', { className: 'dsh-tr-title' },
                React.createElement('span', null, '快捷翻译助手'),
                React.createElement('span', { className: 'dsh-tr-model-badge' }, activeModelLabel)
              )
            ),
            // Tabs 切换
            React.createElement('div', { className: 'dsh-tr-tabs' },
              React.createElement('button', {
                type: 'button',
                className: `dsh-tr-tab-btn ${tab === 'preview' ? 'active' : ''}`,
                onClick: () => setTab('preview')
              }, '翻译预览'),
              React.createElement('button', {
                type: 'button',
                className: `dsh-tr-tab-btn ${tab === 'history' ? 'active' : ''}`,
                onClick: () => setTab('history')
              }, `历史记录 (${historyList.length})`)
            ),
            React.createElement('button', {
              type: 'button',
              className: 'dsh-tr-close-btn',
              onClick: onClose,
              title: '关闭'
            }, 'x')
          ),

          // 主体 Body: 翻译预览 Tab
          tab === 'preview' ? React.createElement('div', { className: 'dsh-tr-body' },
            // 顶部提供商快捷切换条
            React.createElement('div', {
              style: {
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0 0 4px 0',
                borderBottom: '1px solid var(--dsw-alias-border-l4, rgba(0, 0, 0, 0.08))',
                flexWrap: 'wrap',
                gap: 6
              }
            },
              React.createElement('span', {
                style: { fontSize: '11.5px', color: 'var(--dsw-alias-label-secondary)', fontWeight: 600 }
              }, '翻译服务:'),
              React.createElement('div', { style: { display: 'flex', gap: 5, flexWrap: 'wrap' } },
                React.createElement('button', {
                  type: 'button',
                  className: `dsh-tr-mini-btn ${activeProviderId === 'current' ? 'active-provider' : ''}`,
                  onClick: () => handleSwitchProvider('current')
                }, '当前会话模型'),
                React.createElement('button', {
                  type: 'button',
                  className: `dsh-tr-mini-btn ${activeProviderId === 'zhipu' ? 'active-provider' : ''}`,
                  onClick: () => handleSwitchProvider('zhipu')
                }, '智谱 GLM-4-Flash'),
                (fullConfig.customs || []).map(c => React.createElement('button', {
                  key: c.id,
                  type: 'button',
                  className: `dsh-tr-mini-btn ${activeProviderId === c.id ? 'active-provider' : ''}`,
                  onClick: () => handleSwitchProvider(c.id)
                }, c.name || '自定义 API'))
              )
            ),

            // 原文区
            React.createElement('div', { className: 'dsh-tr-field-group' },
              React.createElement('div', { className: 'dsh-tr-field-header' },
                React.createElement('span', null, '输入框原文：'),
                React.createElement('span', { style: { fontSize: '11px', color: 'var(--dsw-alias-label-tertiary)' } }, `${sourceText.length} 字`)
              ),
              React.createElement('textarea', {
                className: 'dsh-tr-textarea',
                value: sourceText,
                placeholder: '在此输入或粘贴需要翻译的文本...',
                onChange: (e) => setSourceText(e.target.value)
              })
            ),

            // 重试翻译按钮
            React.createElement('div', { style: { display: 'flex', justifyContent: 'flex-end' } },
              React.createElement('button', {
                type: 'button',
                className: 'dsh-tr-btn',
                disabled: loading || !sourceText.trim(),
                onClick: () => doTranslate(sourceText)
              }, loading ? '正在翻译...' : '重新翻译')
            ),

            // 译文区
            React.createElement('div', { className: 'dsh-tr-field-group' },
              React.createElement('div', { className: 'dsh-tr-field-header' },
                React.createElement('span', null, `翻译结果 (${fullConfig.targetLang})：`),
                translatedText ? React.createElement('button', {
                  type: 'button',
                  className: 'dsh-tr-mini-btn',
                  onClick: () => handleCopy(translatedText)
                }, copied ? '已复制' : '复制译文') : null
              ),
              loading ? React.createElement('div', { className: 'dsh-tr-status-loading' },
                React.createElement('svg', {
                  className: 'dsh-tr-spin',
                  width: 16,
                  height: 16,
                  viewBox: '0 0 24 24',
                  fill: 'none',
                  stroke: 'currentColor',
                  strokeWidth: 2
                },
                  React.createElement('path', { d: 'M21 12a9 9 0 1 1-6.219-8.56' })
                ),
                React.createElement('span', null, '正在调用模型翻译，请稍候...')
              ) : errorMsg ? React.createElement('div', { className: 'dsh-tr-status-error' },
                React.createElement('div', { style: { fontWeight: 600, marginBottom: 4 } }, '翻译失败'),
                React.createElement('div', null, errorMsg)
              ) : React.createElement('div', {
                className: 'dsh-tr-trans-preview',
                contentEditable: true,
                suppressContentEditableWarning: true,
                onBlur: (e) => setTranslatedText(e.currentTarget.innerText)
              }, translatedText || '暂无译文，请在上方输入内容后点击翻译。')
            )
          ) : null,

          // 主体 Body: 历史记录 Tab
          tab === 'history' ? React.createElement('div', { className: 'dsh-tr-body' },
            historyList.length === 0 ? React.createElement('div', {
              style: { textAlign: 'center', color: 'var(--dsw-alias-label-tertiary)', padding: '60px 0', fontSize: '13px' }
            }, '暂无历史记录。') :
            React.createElement(React.Fragment, null,
              React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 } },
                React.createElement('span', { style: { fontSize: '12px', color: 'var(--dsw-alias-label-secondary)' } }, '历史记录:'),
                React.createElement('button', {
                  type: 'button',
                  className: 'dsh-tr-mini-btn',
                  style: { color: '#d9363e' },
                  onClick: handleClearHistory
                }, '清空历史')
              ),
              React.createElement('div', { className: 'dsh-tr-history-list' },
                historyList.map(item => React.createElement('div', { key: item.id, className: 'dsh-tr-history-item' },
                  React.createElement('div', { className: 'dsh-tr-history-top' },
                    React.createElement('span', null, `${item.model} · ${formatTimeAgo(item.time)}`),
                    React.createElement('button', {
                      type: 'button',
                      className: 'dsh-tr-mini-btn',
                      onClick: () => handleDeleteHistory(item.id),
                      title: '删除此条'
                    }, 'x')
                  ),
                  React.createElement('div', { className: 'dsh-tr-history-content' },
                    React.createElement('div', { className: 'dsh-tr-history-orig', title: '原文' }, `原文: ${item.original}`),
                    React.createElement('div', { className: 'dsh-tr-history-trans', title: '译文' }, `译文: ${item.translated}`)
                  ),
                  React.createElement('div', { className: 'dsh-tr-history-actions' },
                    React.createElement('button', {
                      type: 'button',
                      className: 'dsh-tr-mini-btn',
                      onClick: () => handleRestoreHistory(item.original, 'replace')
                    }, '找回原文至输入框'),
                    React.createElement('button', {
                      type: 'button',
                      className: 'dsh-tr-mini-btn',
                      onClick: () => handleRestoreHistory(item.translated, 'replace')
                    }, '填入译文至输入框'),
                    React.createElement('button', {
                      type: 'button',
                      className: 'dsh-tr-mini-btn',
                      onClick: () => handleCopy(item.translated)
                    }, '复制译文')
                  )
                ))
              )
            )
          ) : null,

          // 底部操作按钮条 (仅在预览 Tab 显示替换确认操作)
          tab === 'preview' ? React.createElement('div', { className: 'dsh-tr-footer' },
            React.createElement('button', {
              type: 'button',
              className: 'dsh-tr-btn',
              onClick: onClose
            }, '取消'),
            React.createElement('div', { className: 'dsh-tr-btn-group' },
              React.createElement('button', {
                type: 'button',
                className: 'dsh-tr-btn',
                disabled: !translatedText,
                onClick: () => {
                  onConfirmAppend(translatedText);
                  onClose();
                }
              }, '追加到输入框末尾'),
              React.createElement('button', {
                type: 'button',
                className: 'dsh-tr-btn dsh-tr-btn-primary',
                disabled: !translatedText || loading,
                onClick: () => {
                  onConfirmReplace(translatedText);
                  onClose();
                }
              }, '确认替换至输入框')
            )
          ) : null
        )
      );
    }

    // ==================== 输入框右上角悬浮图标 (conversation.input.overlay) ====================
    function TranslatorOverlayIcon(props) {
      const useInput = props.useInput;
      const inputActions = props.inputActions;
      const sessionId = props.sessionId;

      const [modalOpen, setModalOpen] = React.useState(false);
      const [currentDraft, setCurrentDraft] = React.useState('');

      // 获取当前会话选中的模型信息
      let currentModelInfo = null;
      try {
        const modelDirectories = ctx.get('modelDirectories') || ctx.modelDirectories;
        const sessions = ctx.get('sessions') || ctx.sessions;
        const sid = sessionId || sessions?.list?.getSnapshot?.()?.current;
        if (sid && modelDirectories) {
          const dir = modelDirectories.directoryFor?.(sid);
          const snap = dir?.store?.getSnapshot?.();
          if (snap?.current) {
            currentModelInfo = snap.current;
          }
        }
      } catch (e) {}

      // 获取插件配置（自动响应 ~/.dsh/translator-config.json）
      const [fullConfig] = useTranslatorConfig();
      const isEnabled = fullConfig.enabled !== false;

      // 实时订阅输入框状态
      let draftText = '';
      if (typeof useInput === 'function') {
        try {
          const inputState = useInput((s) => s);
          draftText = inputState?.draft || '';
        } catch (e) {
          draftText = '';
        }
      }

      if (!isEnabled) return null;

      const handleClick = (e) => {
        e.stopPropagation();
        e.preventDefault();
        setCurrentDraft(draftText);
        setModalOpen(true);
      };

      const handleConfirmReplace = (newText) => {
        if (inputActions && typeof inputActions.setDraft === 'function') {
          inputActions.setDraft(newText);
        }
      };

      const handleConfirmAppend = (appendContent) => {
        if (inputActions && typeof inputActions.setDraft === 'function') {
          const base = draftText ? (draftText + '\n\n' + appendContent) : appendContent;
          inputActions.setDraft(base);
        }
      };

      return React.createElement(React.Fragment, null,
        React.createElement('button', {
          type: 'button',
          className: `dsh-tr-float-btn ${draftText ? 'active-draft' : ''}`,
          onClick: handleClick,
          title: draftText ? '快捷翻译并预览替换' : '快捷翻译与历史找回'
        },
          React.createElement('svg', {
            width: 14,
            height: 14,
            viewBox: '0 0 24 24',
            fill: 'none',
            stroke: 'currentColor',
            strokeWidth: 2,
            strokeLinecap: 'round',
            strokeLinejoin: 'round'
          },
            React.createElement('path', { d: 'm5 8 6 6' }),
            React.createElement('path', { d: 'm4 14 6-6 2-3' }),
            React.createElement('path', { d: 'M2 5h12' }),
            React.createElement('path', { d: 'M7 2h1' }),
            React.createElement('path', { d: 'm22 22-5-10-5 10' }),
            React.createElement('path', { d: 'M14 18h6' })
          )
        ),

        // 弹窗
        modalOpen ? React.createElement(ModalErrorBoundary, { onClose: () => setModalOpen(false) },
          React.createElement(TranslatorModal, {
            onClose: () => setModalOpen(false),
            initialText: currentDraft,
            sessionId: sessionId,
            currentModelInfo: currentModelInfo,
            onConfirmReplace: handleConfirmReplace,
            onConfirmAppend: handleConfirmAppend
          })
        ) : null
      );
    }

    // ==================== 设置面板卡片 (settings.plugin.item) ====================
    function TranslatorSettingsCard() {
      const [open, setOpen] = React.useState(false);
      const [fullConfig, updateConfig] = useTranslatorConfig();
      const [selectedTab, setSelectedTab] = React.useState(() => fullConfig.activeProvider || 'current');
      const [showKey, setShowKey] = React.useState(false);
      const [saveNotice, setSaveNotice] = React.useState(false);

      const activeProviderId = fullConfig.activeProvider || 'current';

      const triggerSaveNotice = () => {
        setSaveNotice(true);
        setTimeout(() => setSaveNotice(false), 2000);
      };

      const updateGeneral = (field, value) => {
        updateConfig({ [field]: value });
        triggerSaveNotice();
      };

      const handleSelectActive = (provId) => {
        setSelectedTab(provId);
        updateConfig({ activeProvider: provId });
        triggerSaveNotice();
      };

      const updateProviderField = (provId, field, value) => {
        if (provId === 'current') return;
        if (provId === 'zhipu') {
          updateConfig({ zhipu: { ...(fullConfig.zhipu || {}), [field]: value } });
          triggerSaveNotice();
          return;
        }
        // 自定义项更新
        const customs = (fullConfig.customs || []).map(c =>
          c.id === provId ? { ...c, [field]: value } : c
        );
        updateConfig({ customs });
        triggerSaveNotice();
      };

      const addCustomProvider = () => {
        const newProv = makeCustomProvider(`自定义 API ${(fullConfig.customs || []).length + 1}`, '', '', '');
        const customs = [...(fullConfig.customs || []), newProv];
        updateConfig({ customs });
        setSelectedTab(newProv.id);
        triggerSaveNotice();
      };

      const removeCustomProvider = (provId) => {
        const customs = (fullConfig.customs || []).filter(c => c.id !== provId);
        const patch = { customs };
        if (fullConfig.activeProvider === provId) {
          patch.activeProvider = 'current';
        }
        updateConfig(patch);
        if (selectedTab === provId) {
          setSelectedTab(patch.activeProvider || 'current');
        }
        triggerSaveNotice();
      };

      const currentEditing = selectedTab === 'zhipu'
        ? (fullConfig.zhipu || BUILTIN_PROVIDERS.zhipu)
        : (fullConfig.customs || []).find(c => c.id === selectedTab);
      const isEditingCustom = selectedTab !== 'current' && selectedTab !== 'zhipu' && currentEditing;

      return React.createElement('li', {
        className: 'dsh-tr-settings-card' + (open ? ' dsh-tr-settings-card-open' : '')
      },
        React.createElement('button', {
          type: 'button',
          className: 'dsh-tr-settings-header',
          'aria-expanded': open,
          onClick: () => setOpen(!open)
        },
          React.createElement('span', { className: 'dsh-tr-settings-head-text' },
            React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 6 } },
              React.createElement('span', { className: 'dsh-tr-settings-name' }, '输入框快捷翻译助手'),
              React.createElement('span', {
                style: {
                  fontSize: '10.5px',
                  fontWeight: 600,
                  color: 'var(--dsw-alias-label-secondary)',
                  background: 'rgba(255, 255, 255, 0.06)',
                  border: '1px solid var(--dsw-alias-border-l4)',
                  padding: '1px 5px',
                  borderRadius: '4px',
                  fontFamily: 'monospace'
                }
              }, `v${DEFAULT_PLUGIN_VERSION}`)
            ),
            React.createElement('span', { className: 'dsh-tr-settings-desc' },
              '输入框右上角悬浮小图标，点击弹窗预览翻译、确认替换并自动记录最近 10 次历史。'
            )
          ),
          React.createElement('svg', {
            style: { transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .16s', flex: 'none', color: 'var(--dsw-alias-label-secondary)' },
            width: 14,
            height: 14,
            viewBox: '0 0 16 16',
            fill: 'none',
            stroke: 'currentColor',
            strokeWidth: '1.5'
          },
            React.createElement('path', { d: 'M4 6l4 4 4-4' })
          )
        ),
        open ? React.createElement('div', { className: 'dsh-tr-settings-body' },
          // 功能开关
          React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0' } },
            React.createElement('div', null,
              React.createElement('div', { style: { fontSize: '13.5px', fontWeight: 600 } }, '启用输入框翻译按钮'),
              React.createElement('div', { style: { fontSize: '12px', color: 'var(--dsw-alias-label-secondary)' } }, '在对话输入框右上角展示快捷翻译图标')
            ),
            React.createElement('input', {
              type: 'checkbox',
              checked: fullConfig.enabled,
              onChange: (e) => updateGeneral('enabled', e.target.checked)
            })
          ),

          // 提供商选择与配置 Tabs
          React.createElement('div', { className: 'dsh-tr-cfg-row' },
            React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
              React.createElement('label', { className: 'dsh-tr-cfg-label' }, '服务提供商:'),
              React.createElement('span', {
                style: {
                  fontSize: '11px',
                  color: 'var(--dsw-alias-state-business-primary, #0969da)',
                  background: 'var(--dsw-alias-state-business-primary-subtle, rgba(9, 105, 218, 0.1))',
                  padding: '2px 7px',
                  borderRadius: '4px',
                  fontWeight: 600
                }
              }, `当前生效: ${(getProviderById(fullConfig, activeProviderId) || {}).name || activeProviderId}`)
            ),
            React.createElement('div', { style: { display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 } },
              React.createElement('button', {
                type: 'button',
                className: `dsh-tr-mini-btn ${selectedTab === 'current' ? 'active-provider' : ''}`,
                onClick: () => handleSelectActive('current')
              }, '当前会话模型'),
              React.createElement('button', {
                type: 'button',
                className: `dsh-tr-mini-btn ${selectedTab === 'zhipu' ? 'active-provider' : ''}`,
                onClick: () => handleSelectActive('zhipu')
              }, '智谱 GLM-4-Flash'),
              (fullConfig.customs || []).map(c => React.createElement('button', {
                key: c.id,
                type: 'button',
                className: `dsh-tr-mini-btn ${selectedTab === c.id ? 'active-provider' : ''}`,
                onClick: () => handleSelectActive(c.id)
              }, c.name || '自定义 API')),
              React.createElement('button', {
                type: 'button',
                className: 'dsh-tr-mini-btn',
                style: { borderStyle: 'dashed' },
                onClick: addCustomProvider
              }, '+ 添加自定义')
            )
          ),

          // 选中的提供商独立表单区域
          selectedTab === 'zhipu' ? React.createElement('div', {
            style: {
              background: 'var(--dsw-alias-bg-layer-1, rgba(0, 0, 0, 0.02))',
              border: '1px solid var(--dsw-alias-border-l4, rgba(0, 0, 0, 0.08))',
              borderRadius: '8px',
              padding: '12px 14px',
              display: 'flex',
              flexDirection: 'column',
              gap: 10
            }
          },
            // API Key
            React.createElement('div', { className: 'dsh-tr-cfg-row' },
              React.createElement('label', { className: 'dsh-tr-cfg-label' },
                React.createElement('span', null, 'API Key:'),
                React.createElement('button', {
                  type: 'button',
                  className: 'dsh-tr-mini-btn',
                  onClick: () => setShowKey(!showKey)
                }, showKey ? '隐藏' : '显示')
              ),
              React.createElement('input', {
                type: showKey ? 'text' : 'password',
                className: 'dsh-tr-cfg-input',
                value: currentEditing.apiKey || '',
                placeholder: '请在此输入您的智谱 API Key',
                onChange: (e) => updateProviderField(selectedTab, 'apiKey', e.target.value)
              })
            ),

            // Model Name
            React.createElement('div', { className: 'dsh-tr-cfg-row' },
              React.createElement('label', { className: 'dsh-tr-cfg-label' }, 'Model Name:'),
              React.createElement('input', {
                type: 'text',
                className: 'dsh-tr-cfg-input',
                value: currentEditing.model || '',
                placeholder: 'glm-4-flash',
                onChange: (e) => updateProviderField(selectedTab, 'model', e.target.value)
              })
            ),

            // API Base URL
            React.createElement('div', { className: 'dsh-tr-cfg-row' },
              React.createElement('label', { className: 'dsh-tr-cfg-label' }, 'API Base URL:'),
              React.createElement('input', {
                type: 'text',
                className: 'dsh-tr-cfg-input',
                value: currentEditing.endpoint || '',
                placeholder: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
                onChange: (e) => updateProviderField(selectedTab, 'endpoint', e.target.value)
              })
            )
          ) : null,

          isEditingCustom ? React.createElement('div', {
            style: {
              background: 'var(--dsw-alias-bg-layer-1, rgba(0, 0, 0, 0.02))',
              border: '1px solid var(--dsw-alias-border-l4, rgba(0, 0, 0, 0.08))',
              borderRadius: '8px',
              padding: '12px 14px',
              display: 'flex',
              flexDirection: 'column',
              gap: 10
            }
          },
            // 显示名称（仅自定义）
            React.createElement('div', { className: 'dsh-tr-cfg-row' },
              React.createElement('label', { className: 'dsh-tr-cfg-label' }, '显示名称:'),
              React.createElement('input', {
                type: 'text',
                className: 'dsh-tr-cfg-input',
                value: currentEditing.name || '',
                placeholder: '例如: OpenRouter / DeepSeek 官方',
                onChange: (e) => updateProviderField(selectedTab, 'name', e.target.value)
              })
            ),

            // API Key
            React.createElement('div', { className: 'dsh-tr-cfg-row' },
              React.createElement('label', { className: 'dsh-tr-cfg-label' },
                React.createElement('span', null, 'API Key:'),
                React.createElement('button', {
                  type: 'button',
                  className: 'dsh-tr-mini-btn',
                  onClick: () => setShowKey(!showKey)
                }, showKey ? '隐藏' : '显示')
              ),
              React.createElement('input', {
                type: showKey ? 'text' : 'password',
                className: 'dsh-tr-cfg-input',
                value: currentEditing.apiKey || '',
                placeholder: '请在此输入 API Key',
                onChange: (e) => updateProviderField(selectedTab, 'apiKey', e.target.value)
              })
            ),

            // Model Name
            React.createElement('div', { className: 'dsh-tr-cfg-row' },
              React.createElement('label', { className: 'dsh-tr-cfg-label' }, 'Model Name:'),
              React.createElement('input', {
                type: 'text',
                className: 'dsh-tr-cfg-input',
                value: currentEditing.model || '',
                placeholder: 'gpt-4o-mini',
                onChange: (e) => updateProviderField(selectedTab, 'model', e.target.value)
              })
            ),

            // API Base URL
            React.createElement('div', { className: 'dsh-tr-cfg-row' },
              React.createElement('label', { className: 'dsh-tr-cfg-label' }, 'API Base URL:'),
              React.createElement('input', {
                type: 'text',
                className: 'dsh-tr-cfg-input',
                value: currentEditing.endpoint || '',
                placeholder: 'https://api.openai.com/v1/chat/completions',
                onChange: (e) => updateProviderField(selectedTab, 'endpoint', e.target.value)
              })
            ),

            // 删除该自定义项
            React.createElement('div', { style: { display: 'flex', justifyContent: 'flex-end' } },
              React.createElement('button', {
                type: 'button',
                className: 'dsh-tr-mini-btn',
                style: { color: '#d9363e' },
                onClick: () => removeCustomProvider(selectedTab)
              }, '删除此提供商')
            )
          ) : null,

          // 目标语言
          React.createElement('div', { className: 'dsh-tr-cfg-row' },
            React.createElement('label', { className: 'dsh-tr-cfg-label' }, '目标语言:'),
            React.createElement('select', {
              className: 'dsh-tr-cfg-input',
              value: fullConfig.targetLang,
              onChange: (e) => updateGeneral('targetLang', e.target.value)
            },
              React.createElement('option', { value: '智能中英互译' }, '智能中英互译 (推荐)'),
              React.createElement('option', { value: '中文' }, '始终翻译为中文'),
              React.createElement('option', { value: '英文' }, '始终翻译为英文'),
              React.createElement('option', { value: '日文' }, '翻译为日文'),
              React.createElement('option', { value: '韩文' }, '翻译为韩文')
            )
          ),

          saveNotice ? React.createElement('div', {
            style: { color: '#34d399', fontSize: '12px', fontWeight: 600 }
          }, '设置已自动保存在本地') : null
        ) : null
      );
    }

    // 弹窗内部独立错误边界（弹窗异常不影响输入框右上角按钮）
    class ModalErrorBoundary extends React.Component {
      constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
      }
      static getDerivedStateFromError(error) {
        return { hasError: true, error };
      }
      componentDidCatch(error, info) {
        console.error('[dsh-translator modal error]', error, info);
      }
      render() {
        if (this.state.hasError) {
          return React.createElement('div', {
            className: 'dsh-tr-overlay',
            onClick: this.props.onClose
          },
            React.createElement('div', {
              className: 'dsh-tr-modal',
              style: { padding: '24px', alignItems: 'center', justifyContent: 'center', textAlign: 'center', gap: '16px' }
            },
              React.createElement('div', { style: { fontSize: '14px', fontWeight: 600, color: '#d9363e' } }, '翻译组件运行异常'),
              React.createElement('div', { style: { fontSize: '12px', color: 'var(--dsw-alias-label-secondary)' } }, String(this.state.error?.message || this.state.error)),
              React.createElement('button', {
                type: 'button',
                className: 'dsh-tr-btn',
                onClick: this.props.onClose
              }, '关闭')
            )
          );
        }
        return this.props.children;
      }
    }

    // 错误边界
    class TranslatorErrorBoundary extends React.Component {
      constructor(props) {
        super(props);
        this.state = { hasError: false };
      }
      static getDerivedStateFromError() {
        return { hasError: true };
      }
      componentDidCatch(error, info) {
        console.error('[dsh-translator error]', error, info);
      }
      render() {
        if (this.state.hasError) return null;
        return this.props.children;
      }
    }

    function SafeTranslatorOverlay(props) {
      return React.createElement(TranslatorErrorBoundary, null,
        React.createElement(TranslatorOverlayIcon, props)
      );
    }

    // 1. 注入输入框右上角挂件 (conversation.input.overlay)
    slots.inject('conversation.input.overlay', () => slots.register(
      {
        name: 'conversation.input.overlay',
        id: 'translator-input-float-icon',
        order: 20
      },
      SafeTranslatorOverlay
    ));

    // 2. 注入设置界面插件配置项 (settings.plugin.item)
    slots.inject('settings.plugin.item', () => slots.register(
      {
        name: 'settings.plugin.item',
        key: 'dsh-translator-pro',
        order: 50
      },
      TranslatorSettingsCard
    ));
  } catch (err) {
    console.error('[dsh-translator-pro] client apply error:', err);
  }
  }
};

    })();

    exports.name = "dsh-translator-pro";
    exports.inject = ["slots"];
    exports.apply = plugin.apply;
    exports.default = { name: exports.name, inject: exports.inject, apply: exports.apply };
    return module.exports;
  }

  if (typeof window !== "undefined" && window.__ModuleLoader__ && window.__ModuleLoader__.load) {
    window.__ModuleLoader__.load({
      id: "dsh-translator-pro",
      factory: initModule
    });
  }
})();
