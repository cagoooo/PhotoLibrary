import React, { useEffect, useState } from 'react';
import { RefreshCw, X } from 'lucide-react';

// Service Worker 路徑：用相對路徑以相容 GitHub Pages 子路徑部署（例如 /PhotoLibrary/）。
const SW_URL = './coi-serviceworker.js';

/**
 * 負責註冊 Service Worker 並在偵測到新版本時，於畫面右下角主動提示使用者重新整理。
 * 同時保留 coi-serviceworker 的 cross-origin isolation 啟動程序（首次安裝後重整一次取得 COEP 標頭）。
 */
export default function UpdateNotification() {
  const [waitingWorker, setWaitingWorker] = useState(null);
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    // 開發環境（localhost / 127.0.0.1）不註冊 SW，交由 index.html 的解除註冊邏輯處理，避免與 Vite HMR 衝突。
    const isLocal = ['localhost', '127.0.0.1'].includes(window.location.hostname);
    if (isLocal) return;

    let refreshing = false;
    let cleanupFocus = () => {};

    // 新版 SW 接管後會觸發 controllerchange → 重整頁面載入最新版（加旗標防止無限重整）。
    const onControllerChange = () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);

    const promptUpdate = (worker) => {
      setWaitingWorker(worker);
      setShow(true);
    };

    navigator.serviceWorker
      .register(SW_URL, { updateViaCache: 'none' })
      .then((reg) => {
        // coi 啟動程序：首次安裝完成但頁面尚未受 SW 控制 → 重整一次以取得 COEP 跨域隔離標頭。
        if (reg.active && !navigator.serviceWorker.controller) {
          window.location.reload();
          return;
        }

        // 已有等待中的新版本（先前已就緒但卡在 waiting）→ 直接提示。
        if (reg.waiting && navigator.serviceWorker.controller) {
          promptUpdate(reg.waiting);
        }

        // 偵測到新版本正在安裝。
        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;
          if (!newWorker) return;
          newWorker.addEventListener('statechange', () => {
            // 安裝完成且當前已有 controller → 代表是「更新」而非首次安裝，才提示使用者。
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              promptUpdate(newWorker);
            }
          });
        });

        // 使用者切回分頁時主動向伺服器確認是否有新版本（部署後不必等下次冷啟動才偵測到）。
        const checkForUpdate = () => {
          if (document.visibilityState === 'visible') reg.update().catch(() => {});
        };
        document.addEventListener('visibilitychange', checkForUpdate);
        cleanupFocus = () => document.removeEventListener('visibilitychange', checkForUpdate);
      })
      .catch((err) => console.error('[SW] 註冊失敗:', err));

    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
      cleanupFocus();
    };
  }, []);

  const handleUpdate = () => {
    // 通知等待中的 SW 跳過等待並接管；接管後 controllerchange 會自動重整。
    if (waitingWorker) {
      waitingWorker.postMessage('SKIP_WAITING');
    } else {
      window.location.reload();
    }
    setShow(false);
  };

  if (!show) return null;

  return (
    <div className="update-toast" role="alert" aria-live="polite">
      <RefreshCw size={20} className="update-toast__icon" />
      <div className="update-toast__text">
        <strong>有新版本可用 🎉</strong>
        <span>重新整理即可載入最新功能與修正。</span>
      </div>
      <button className="update-toast__btn" onClick={handleUpdate}>
        立即更新
      </button>
      <button
        className="update-toast__close"
        onClick={() => setShow(false)}
        aria-label="稍後再說"
        title="稍後再說"
      >
        <X size={16} />
      </button>
    </div>
  );
}
