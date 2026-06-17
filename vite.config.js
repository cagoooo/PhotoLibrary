import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { spawn } from 'child_process'
import fs from 'fs'
import path from 'path'

// 0.5 秒靜音 MP3 的 Base64 數據，用於容錯與處理無發音字元的文字
const SILENT_MP3_BASE64 = 'SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU2LjM2LjEwMAAAAAAAAAAAAAAA//OEAAAAAAAAAAAAAAAAAAAAAAAASW5mbwAAAA8AAAAEAAABIADAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDV1dXV1dXV1dXV1dXV1dXV1dXV1dXV1dXV6urq6urq6urq6urq6urq6urq6urq6urq6v////////////////////////////////8AAAAATGF2YzU2LjQxAAAAAAAAAAAAAAAAJAAAAAAAAAAAASDs90hvAAAAAAAAAAAAAAAAAAAA//MUZAAAAAGkAAAAAAAAA0gAAAAATEFN//MUZAMAAAGkAAAAAAAAA0gAAAAARTMu//MUZAYAAAGkAAAAAAAAA0gAAAAAOTku//MUZAkAAAGkAAAAAAAAA0gAAAAANVVV';
const silentMp3Buffer = Buffer.from(SILENT_MP3_BASE64, 'base64');

// 檢查是否含有英文字母、數字、中文字元、日文假名、韓文諺文等可發音字元
function hasSpokenCharacters(text) {
  if (!text) return false;
  const spokenPattern = /[\w\d\u4e00-\u9fa5\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]/i;
  return spokenPattern.test(text);
}

// 🛠️ Edge TTS 本地 Python 代理插件
function edgeTtsPlugin() {
  return {
    name: 'vite-plugin-edge-tts',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.url && req.url.startsWith('/api/tts')) {
          try {
            const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
            const text = url.searchParams.get('text');
            const voice = url.searchParams.get('voice') || 'zh-TW-YunJheNeural';
            const rate = url.searchParams.get('rate') || '+20%';

            // 1. 如果完全沒有傳入 text 參數
            if (text === null) {
              res.statusCode = 400;
              res.setHeader('Content-Type', 'text/plain; charset=utf-8');
              res.end('錯誤：缺少 text 參數');
              return;
            }

            // 2. 如果 text 是空字串，或只包含標點符號/空白等無法發音的字元
            if (!hasSpokenCharacters(text)) {
              console.log(`[Edge TTS] 偵測到無發音字元或空白文字 ("${text}")，自動回傳靜音檔`);
              res.statusCode = 200;
              res.setHeader('Content-Type', 'audio/mpeg');
              res.setHeader('Cache-Control', 'public, max-age=86400');
              res.end(silentMp3Buffer);
              return;
            }

            console.log(`[Edge TTS] 正在透過 Python 生成語音 (${voice}) 文字: "${text}"...`);

            const audioBuffer = await getAudioFromPythonEdgeTts(text, voice, rate);
            
            res.statusCode = 200;
            res.setHeader('Content-Type', 'audio/mpeg');
            res.setHeader('Cache-Control', 'public, max-age=86400'); // 快取 1 天
            res.end(audioBuffer);

          } catch (error) {
            console.error('[Edge TTS] 錯誤:', error);
            
            // 3. 如果執行過程發生 NoAudioReceived 錯誤，自動容錯回傳靜音檔，避免阻斷整個播放流程
            if (error.message && error.message.includes('NoAudioReceived')) {
              console.log(`[Edge TTS] 偵測到 NoAudioReceived 錯誤，自動容錯回傳靜音檔`);
              res.statusCode = 200;
              res.setHeader('Content-Type', 'audio/mpeg');
              res.setHeader('Cache-Control', 'public, max-age=86400');
              res.end(silentMp3Buffer);
              return;
            }

            res.statusCode = 500;
            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
            res.end('語音生成失敗: ' + error.message);
          }
        } else {
          next();
        }
      });
    }
  };
}

// 藉由本地 Python 的 edge_tts 模組生成音訊，規避 wss 認證限制
function getAudioFromPythonEdgeTts(text, voice, rate) {
  return new Promise((resolve, reject) => {
    // 建立隨機的臨時檔名以防並行請求衝突
    const tempFile = path.join(process.cwd(), `temp_tts_${Date.now()}_${Math.random().toString(36).substring(7)}.mp3`);
    
    // 執行 python -m edge_tts 命令行
    const py = spawn('python', [
      '-m', 'edge_tts',
      '--text', text,
      '--write-media', tempFile,
      '--voice', voice,
      `--rate=${rate}`
    ], {
      env: process.env
    });

    let stderr = '';
    py.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    py.on('close', (code) => {
      if (code !== 0) {
        try {
          if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
        } catch (e) {}
        reject(new Error(`Python 執行錯誤 (退出代碼 ${code}): ${stderr}`));
        return;
      }
      
      try {
        if (fs.existsSync(tempFile)) {
          const buffer = fs.readFileSync(tempFile);
          fs.unlinkSync(tempFile); // 讀取後立即刪除臨時檔
          resolve(buffer);
        } else {
          reject(new Error("音訊檔未生成成功"));
        }
      } catch (err) {
        try {
          if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
        } catch (e) {}
        reject(err);
      }
    });
  });
}

// 🏷️ 建置時將 Service Worker 內的 __BUILD_VERSION__ 佔位字串替換成 git SHA 或時間戳，
// 確保每次部署 coi-serviceworker.js 的位元都會改變，瀏覽器才偵測得到新版本並提示使用者更新。
function swVersionPlugin() {
  return {
    name: 'sw-build-version',
    apply: 'build',
    closeBundle() {
      const swPath = path.resolve(process.cwd(), 'dist/coi-serviceworker.js');
      if (!fs.existsSync(swPath)) return;
      const sha = (process.env.GITHUB_SHA || '').slice(0, 7);
      const version = sha || new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
      const code = fs.readFileSync(swPath, 'utf-8').replace(/__BUILD_VERSION__/g, version);
      fs.writeFileSync(swPath, code);
      console.log(`[sw-build-version] 已將 Service Worker 版本標記為 ${version}`);
    }
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), edgeTtsPlugin(), swVersionPlugin()],
  base: './',
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    }
  }
})
