/*! coi-serviceworker v0.1.7 (modified) | MIT License | https://github.com/gzguidoti/coi-serviceworker */
// 這支 Service Worker 身兼兩職：
//   1. 為 GitHub Pages 上的頁面注入 COEP / COOP 標頭，達成 cross-origin isolation（ffmpeg.wasm 需要）。
//   2. 版本更新通知：每次部署 BUILD_VERSION 會變動 → 瀏覽器偵測到 SW 位元不同 → 觸發更新流程，
//      由前端 <UpdateNotification /> 主動提示使用者「有新版本，點擊重新整理」。
// 註冊與更新提示的前端邏輯放在 src/components/UpdateNotification.jsx。

if (typeof window === 'undefined') {
    // 🏷️ 建置版本號：由 Vite 建置插件（vite.config.js 的 swVersionPlugin）在 build 時自動以
    // git SHA 或時間戳取代 __BUILD_VERSION__，確保每次部署 SW 內容位元都會改變，
    // 否則瀏覽器會認為 SW 沒變、永遠不觸發更新偵測。
    const BUILD_VERSION = '__BUILD_VERSION__';
    console.log('[coi-sw] Service Worker 版本：', BUILD_VERSION);

    self.addEventListener('install', () => {
        // 首次安裝（尚無啟用中的舊版 SW）→ 立即接管，讓 COEP 標頭即時生效（coi 啟動程序）。
        // 版本更新（已有啟用中的舊版 SW）→ 不呼叫 skipWaiting，停在 waiting 狀態，
        // 等使用者在畫面上按「立即更新」後才接管，避免在操作中途無預警重整。
        if (!self.registration.active) {
            self.skipWaiting();
        }
    });

    self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

    // 接收前端指令：使用者點「立即更新」→ 跳過等待，啟用新版 SW（隨後觸發 controllerchange → reload）
    self.addEventListener('message', event => {
        if (event.data === 'SKIP_WAITING' || (event.data && event.data.type === 'SKIP_WAITING')) {
            self.skipWaiting();
        }
    });

    self.addEventListener("fetch", event => {
        const url = new URL(event.request.url);
        // 排除開發環境之 Vite HMR 等資源請求以防衝突
        if (
            url.pathname.includes('/@vite/') ||
            url.pathname.includes('/@react-refresh') ||
            url.pathname.includes('/node_modules/')
        ) {
            return;
        }

        if (event.request.cache === "only-if-cached" && event.request.mode !== "same-origin") {
            return;
        }

        event.respondWith(
            fetch(event.request)
                .then(response => {
                    if (response.status === 0) {
                        return response;
                    }
                    const newHeaders = new Headers(response.headers);
                    newHeaders.set("Cross-Origin-Embedder-Policy", "require-corp");
                    newHeaders.set("Cross-Origin-Opener-Policy", "same-origin");
                    return new Response(response.body, {
                        status: response.status,
                        statusText: response.statusText,
                        headers: newHeaders
                    });
                })
                .catch(e => console.error("[coi-sw] Fetch failed:", e))
        );
    });
}
