import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DSH_DIR = process.env.DSH_HOME || path.join(os.homedir(), '.dsh');
const CONFIG_FILE = path.join(DSH_DIR, 'translator-config.json');

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

function readDiskConfig() {
  try {
    if (!fs.existsSync(CONFIG_FILE)) {
      return { ...DEFAULT_CONFIG };
    }
    const raw = fs.readFileSync(CONFIG_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    return {
      enabled: parsed.enabled !== false,
      targetLang: parsed.targetLang || DEFAULT_CONFIG.targetLang,
      activeProvider: parsed.activeProvider || DEFAULT_CONFIG.activeProvider,
      zhipu: {
        ...DEFAULT_CONFIG.zhipu,
        ...(parsed.zhipu || {})
      },
      customs: Array.isArray(parsed.customs) ? parsed.customs : []
    };
  } catch (e) {
    console.warn('[dsh-translator-pro] read disk config failed:', e.message);
    return { ...DEFAULT_CONFIG };
  }
}

function writeDiskConfig(data) {
  try {
    if (!fs.existsSync(DSH_DIR)) {
      fs.mkdirSync(DSH_DIR, { recursive: true });
    }
    const merged = {
      enabled: data.enabled !== false,
      targetLang: data.targetLang || DEFAULT_CONFIG.targetLang,
      activeProvider: data.activeProvider || DEFAULT_CONFIG.activeProvider,
      zhipu: {
        ...DEFAULT_CONFIG.zhipu,
        ...(data.zhipu || {})
      },
      customs: Array.isArray(data.customs) ? data.customs : []
    };
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(merged, null, 2), {
      encoding: 'utf-8',
      mode: 0o600
    });
    return merged;
  } catch (e) {
    console.error('[dsh-translator-pro] write disk config failed:', e.message);
    throw e;
  }
}

function getPluginVersion() {
  try {
    const pkgPath = path.join(__dirname, '../package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    return pkg.version || '0.0.1';
  } catch (e) {
    return '0.0.1';
  }
}

export const name = 'dsh-translator-pro';
export const inject = [];

function writeJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  });
  res.end(JSON.stringify(data));
}

export function apply(ctx) {
  try {
    // 注册 settings 命名空间，使插件正常挂载并进入设置列表
    ctx.inject(['settings'], (sctx) => {
      try {
        const mockSchema = Object.assign((input) => ({ enabled: input?.enabled ?? true }), {
          toJSON: () => ({
            uid: 1,
            refs: {
              1: { type: 'object', dict: { enabled: 2 } },
              2: { type: 'boolean' }
            }
          })
        });
        sctx.settings?.register?.('dsh-translator-pro', mockSchema, { base: { enabled: true } });
      } catch (e) {
        console.warn('[dsh-translator-pro] settings register warning:', e.message);
      }
    });
  } catch (e) {
    console.warn('[dsh-translator-pro] settings service inject failed:', e.message);
  }

  try {
    // 注册 Web 路由（提供 Node 端代理请求以规避前端 CORS 跨域限制）
    ctx.inject(['webServer'], (sctx) => {
      try {
        sctx.effect(() => {
          return sctx.webServer.register({
            kind: 'prefix',
            path: '/api/translator',
            handler: async (req, res) => {
          if (req.method === 'OPTIONS') {
            res.writeHead(204, {
              'Access-Control-Allow-Origin': '*',
              'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
              'Access-Control-Allow-Headers': 'Content-Type, Authorization'
            });
            res.end();
            return;
          }

          const url = new URL(req.url ?? '/', 'http://127.0.0.1');
          const pathname = url.pathname;

          // 1. 版本查询接口
          if (pathname === '/api/translator/version' && req.method === 'GET') {
            writeJson(res, 200, { version: getPluginVersion() });
            return;
          }

          // 2. 读取磁盘配置接口 (GET)
          if (pathname === '/api/translator/config' && req.method === 'GET') {
            try {
              const cfg = readDiskConfig();
              writeJson(res, 200, { success: true, config: cfg });
            } catch (err) {
              writeJson(res, 500, { success: false, error: err.message });
            }
            return;
          }

          // 3. 写入磁盘配置接口 (POST)
          if (pathname === '/api/translator/config' && req.method === 'POST') {
            let body = '';
            req.on('data', (chunk) => { body += chunk; });
            req.on('end', () => {
              try {
                const payload = JSON.parse(body || '{}');
                const saved = writeDiskConfig(payload);
                writeJson(res, 200, { success: true, config: saved });
              } catch (err) {
                writeJson(res, 500, { success: false, error: err.message });
              }
            });
            return;
          }

          // 4. 翻译代理接口 (POST)
          if (pathname === '/api/translator/translate' && req.method === 'POST') {
            let body = '';
            req.on('data', (chunk) => {
              body += chunk;
            });
            req.on('end', async () => {
              try {
                const payload = JSON.parse(body || '{}');
                const {
                  useCurrentModel = false,
                  sessionId = '',
                  provider: reqProvider = '',
                  endpoint = 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
                  model = '',
                  apiKey = '',
                  messages = [],
                  temperature = 0.1
                } = payload;

                if (!Array.isArray(messages) || messages.length === 0) {
                  writeJson(res, 400, {
                    success: false,
                    error: '待翻译文本为空。'
                  });
                  return;
                }

                // 模式 A：直接使用当前会话模型（DSH 内部 LLM 服务，无需额外配置 API Key）
                if (useCurrentModel) {
                  const llm = ctx.get('llm');
                  if (!llm || typeof llm.stream !== 'function') {
                    writeJson(res, 500, {
                      success: false,
                      error: 'DSH 内部 LLM 服务未就绪，无法直接调用当前模型。'
                    });
                    return;
                  }

                  let targetProvider = reqProvider;
                  let targetModel = reqModel;

                  if (!targetProvider || !targetModel) {
                    const sessions = ctx.get('sessions');
                    const sess = sessionId ? sessions?.get(sessionId) : null;
                    const reqCtx = sess?.requestContext?.();
                    const reqHdr = sess?.requestHeader?.();
                    targetProvider = targetProvider || reqCtx?.provider || reqHdr?.config?.provider;
                    targetModel = targetModel || reqCtx?.model || reqHdr?.config?.model;
                  }

                  if (!targetProvider || !targetModel) {
                    const defaultModel = ctx.get('agentDefaultModel')?.currentSelection?.();
                    targetProvider = targetProvider || defaultModel?.provider;
                    targetModel = targetModel || defaultModel?.model;
                  }

                  if (!targetProvider || !targetModel) {
                    writeJson(res, 400, {
                      success: false,
                      error: '未检测到当前会话模型，请先在对话框底部选择模型或在插件设置中指定提供商。'
                    });
                    return;
                  }

                  const sysMsg = messages.find((m) => m.role === 'system');
                  const userMsg = messages.find((m) => m.role === 'user');
                  const userText = typeof userMsg?.content === 'string'
                    ? userMsg.content
                    : (Array.isArray(userMsg?.content) ? userMsg.content.map((c) => c.text || '').join('') : '');

                  const controller = new AbortController();
                  const timeoutId = setTimeout(() => controller.abort(), 60000);

                  try {
                    const streamOptions = {
                      provider: targetProvider,
                      model: targetModel,
                      system: sysMsg?.content || '',
                      messages: [
                        {
                          id: 'tr_' + Date.now(),
                          role: 'user',
                          content: [{ type: 'text', text: userText }],
                          source: { kind: 'user' }
                        }
                      ],
                      temperature: typeof temperature === 'number' ? temperature : 0.1,
                      signal: controller.signal
                    };
                    if (sessionId) {
                      streamOptions.sessionId = sessionId;
                    }

                    let translatedText = '';
                    let reasoningText = '';

                    for await (const chunk of llm.stream(streamOptions)) {
                      if (chunk.type === 'text-delta') {
                        translatedText += chunk.text;
                      } else if (chunk.type === 'reasoning-delta') {
                        reasoningText += chunk.text;
                      } else if (chunk.type === 'finish') {
                        if (chunk.reason.kind === 'error' || chunk.reason.kind === 'aborted') {
                          throw new Error(chunk.reason.failure?.message || '模型响应中断');
                        }
                      }
                    }

                    clearTimeout(timeoutId);

                    const finalResult = translatedText.trim() || reasoningText.trim();
                    if (!finalResult) {
                      writeJson(res, 500, {
                        success: false,
                        error: '当前模型未返回有效翻译文本。'
                      });
                      return;
                    }

                    writeJson(res, 200, {
                      success: true,
                      text: finalResult,
                      model: targetModel
                    });
                    return;
                  } catch (streamErr) {
                    clearTimeout(timeoutId);
                    const isTimeout = streamErr.name === 'AbortError';
                    writeJson(res, 500, {
                      success: false,
                      error: isTimeout ? '调用当前模型超时 (60s)' : `调用当前模型失败: ${streamErr.message}`
                    });
                    return;
                  }
                }

                // 模式 B：外部独立提供商调用（OpenAI 兼容协议）
                if (!apiKey || typeof apiKey !== 'string' || !apiKey.trim()) {
                  writeJson(res, 400, {
                    success: false,
                    error: '未配置有效的 API Key，请在 DSH 插件设置中填写，或切换为“当前会话模型”。'
                  });
                  return;
                }

                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 45000);

                const targetEndpoint = (endpoint && endpoint.trim()) || 'https://open.bigmodel.cn/api/paas/v4/chat/completions';
                const targetModelName = (model && model.trim()) || '';

                if (!targetModelName) {
                  writeJson(res, 400, {
                    success: false,
                    error: '未配置 Model Name，请在插件设置中填写该提供商的模型名称。'
                  });
                  return;
                }

                try {
                  const upstreamRes = await fetch(targetEndpoint, {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      'Authorization': `Bearer ${apiKey.trim()}`
                    },
                    body: JSON.stringify({
                      model: targetModelName,
                      messages,
                      temperature: typeof temperature === 'number' ? temperature : 0.1,
                      stream: false
                    }),
                    signal: controller.signal
                  });

                  clearTimeout(timeoutId);

                  if (!upstreamRes.ok) {
                    const errText = await upstreamRes.text();
                    let errMsg = `上游接口请求失败 (HTTP ${upstreamRes.status})`;
                    try {
                      const errJson = JSON.parse(errText);
                      errMsg = errJson.error?.message || errJson.message || errMsg;
                    } catch (_) {}
                    writeJson(res, upstreamRes.status, {
                      success: false,
                      error: errMsg
                    });
                    return;
                  }

                  const data = await upstreamRes.json();
                  const choice = data.choices?.[0];
                  const translatedText = choice?.message?.content || '';

                  writeJson(res, 200, {
                    success: true,
                    text: translatedText.trim(),
                    model: data.model || model
                  });
                } catch (fetchErr) {
                  clearTimeout(timeoutId);
                  const isTimeout = fetchErr.name === 'AbortError';
                  writeJson(res, 504, {
                    success: false,
                    error: isTimeout ? '请求上游模型超时 (45s)' : `网络请求异常: ${fetchErr.message}`
                  });
                }
              } catch (parseErr) {
                writeJson(res, 400, {
                  success: false,
                  error: '解析请求体失败 (JSON 格式错误)'
                });
              }
            });
            return;
          }

          // 5. 提供商连通性测试接口 (POST)
          if (pathname === '/api/translator/test' && req.method === 'POST') {
            let body = '';
            req.on('data', (chunk) => { body += chunk; });
            req.on('end', async () => {
              try {
                const payload = JSON.parse(body || '{}');
                const {
                  endpoint = 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
                  model = '',
                  apiKey = ''
                } = payload;

                if (!apiKey || typeof apiKey !== 'string' || !apiKey.trim()) {
                  writeJson(res, 400, {
                    success: false,
                    error: '未配置 API Key。'
                  });
                  return;
                }
                if (!model || typeof model !== 'string' || !model.trim()) {
                  writeJson(res, 400, {
                    success: false,
                    error: '未配置 Model Name。'
                  });
                  return;
                }

                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 20000);

                try {
                  const upstreamRes = await fetch((endpoint && endpoint.trim()) || 'https://open.bigmodel.cn/api/paas/v4/chat/completions', {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      'Authorization': `Bearer ${apiKey.trim()}`
                    },
                    body: JSON.stringify({
                      model: model.trim(),
                      messages: [
                        { role: 'user', content: '回复"OK"两个字母，不要输出任何其他内容。' }
                      ],
                      temperature: 0,
                      stream: false
                    }),
                    signal: controller.signal
                  });

                  clearTimeout(timeoutId);

                  if (!upstreamRes.ok) {
                    const errText = await upstreamRes.text();
                    let errMsg = `上游接口请求失败 (HTTP ${upstreamRes.status})`;
                    try {
                      const errJson = JSON.parse(errText);
                      errMsg = errJson.error?.message || errJson.message || errMsg;
                    } catch (_) {}
                    writeJson(res, 200, {
                      success: false,
                      error: errMsg
                    });
                    return;
                  }

                  const data = await upstreamRes.json();
                  const reply = data.choices?.[0]?.message?.content || '';

                  writeJson(res, 200, {
                    success: true,
                    reply: reply.trim().slice(0, 100),
                    model: data.model || model.trim()
                  });
                } catch (fetchErr) {
                  clearTimeout(timeoutId);
                  const isTimeout = fetchErr.name === 'AbortError';
                  writeJson(res, 200, {
                    success: false,
                    error: isTimeout ? '连接测试超时 (20s)' : `网络请求异常: ${fetchErr.message}`
                  });
                }
              } catch (parseErr) {
                writeJson(res, 400, {
                  success: false,
                  error: '解析请求体失败 (JSON 格式错误)'
                });
              }
            });
            return;
          }

          writeJson(res, 404, { error: 'Not found' });
        }
      });
    }, 'dsh-translator-pro: webServer routes');
      } catch (err) {
        console.error('[dsh-translator-pro] register route error:', err.message);
      }
    });
  } catch (e) {
    console.error('[dsh-translator-pro] webServer service inject failed:', e.message);
  }
}

export default {
  name,
  inject,
  apply
};
