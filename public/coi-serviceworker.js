/*! coi-serviceworker v0.1.7 | MIT License | https://github.com/gzguidoti/coi-serviceworker */
if (typeof window === 'undefined') {
    self.addEventListener("install", () => self.skipWaiting());
    self.addEventListener("activate", event => event.waitUntil(self.clients.claim()));
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
} else {
    // 註冊 Service Worker
    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    if (!isLocal) {
        navigator.serviceWorker.register(window.document.currentScript.src)
            .then(registration => {
                registration.addEventListener("updatefound", () => {
                    location.reload();
                });
                if (registration.active && !navigator.serviceWorker.controller) {
                    location.reload();
                }
            })
            .catch(err => console.error("[coi-sw] Registration failed: ", err));
    }
}
