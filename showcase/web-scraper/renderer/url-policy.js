(function exposeUrlPolicy(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.WebScraperUrlPolicy = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function createUrlPolicy() {
  function normalizeHttpUrl(value) {
    let url;
    try {
      url = new URL(String(value ?? '').trim());
    } catch {
      throw new TypeError('页面地址必须是有效的 HTTP(S) URL');
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new TypeError('页面地址必须使用 HTTP(S) 协议');
    }
    return url.href;
  }

  function createSafeNavigation(webview, onError = () => {}) {
    function validate(value) {
      try {
        return normalizeHttpUrl(value);
      } catch (error) {
        onError(error);
        throw error;
      }
    }

    function load(value) {
      const url = validate(value);
      webview.loadURL(url);
      return url;
    }

    function pageTemplate(value, timeoutMs = 30000) {
      const url = validate(value);
      return new Promise((resolve, reject) => {
        let settled = false;
        const finish = (fn, arg) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          webview.removeEventListener('did-finish-load', onLoaded);
          webview.removeEventListener('did-fail-load', onFailed);
          fn(arg);
        };
        const onLoaded = () => finish(resolve, url);
        const onFailed = (_event, code, description) => finish(reject, new Error(`页面加载失败: ${code} ${description}`));
        const timer = setTimeout(() => finish(reject, new Error('页面加载超时')), timeoutMs);
        webview.addEventListener('did-finish-load', onLoaded);
        webview.addEventListener('did-fail-load', onFailed);
        try {
          const loading = webview.loadURL(url);
          if (loading && typeof loading.catch === 'function') {
            loading.catch((error) => finish(reject, error));
          }
        } catch (error) {
          finish(reject, error);
        }
      });
    }

    return Object.freeze({
      addressBar: load,
      pageTemplate,
      ruleset: load,
    });
  }

  return { createSafeNavigation, normalizeHttpUrl };
}));
