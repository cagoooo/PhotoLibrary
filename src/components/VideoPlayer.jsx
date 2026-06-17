import React, { useRef, useEffect, useState } from 'react';
import { Play, Pause, Download, Volume2, VolumeX, Edit2, RotateCcw, Check, Loader2, Maximize, Minimize } from 'lucide-react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL } from '@ffmpeg/util';


// 本地 11 首多樣性 BGM 音軌配置 (擺脫網路 CORS 與 403 阻擋)
const BGM_TEMPLATES = {
  gentle: "./audio/gentle.mp3",
  inspiring: "./audio/inspiring.mp3",
  energetic: "./audio/energetic.mp3",
  happy: "./audio/happy.mp3",
  cheerful: "./audio/cheerful.mp3",
  relaxed: "./audio/relaxed.mp3",
  epic: "./audio/epic.mp3",
  ambient: "./audio/ambient.mp3",
  lofi: "./audio/lofi.mp3",
  acoustic: "./audio/acoustic.mp3",
  retro: "./audio/retro.mp3"
};

// 微軟 Edge-TTS 11 種語音選項 (包括台灣、普通話及粵語，極具人聲質感)
const TTS_VOICES = [
  { value: 'zh-TW-YunJheNeural', label: '臺灣男聲 - 雲哲 (沉穩自然)' },
  { value: 'zh-TW-HsiaoChenNeural', label: '臺灣女聲 - 曉臻 (親切溫柔)' },
  { value: 'zh-TW-HsiaoYuNeural', label: '臺灣女聲 - 曉雨 (自然流暢)' },
  { value: 'zh-CN-XiaoxiaoNeural', label: '普通話女聲 - 曉曉 (活潑生動)' },
  { value: 'zh-CN-YunyangNeural', label: '普通話男聲 - 雲揚 (專業新聞)' },
  { value: 'zh-CN-YunjianNeural', label: '普通話男聲 - 雲健 (說書影評)' },
  { value: 'zh-CN-XiaoyiNeural', label: '普通話女聲 - 曉伊 (溫柔日常)' },
  { value: 'zh-CN-YunxiNeural', label: '普通話男聲 - 雲希 (陽光小夥)' },
  { value: 'zh-CN-XiaochenNeural', label: '普通話女聲 - 曉辰 (專業客服)' },
  { value: 'zh-HK-HiuMaanNeural', label: '粵語女聲 - 曉佳 (自然流利)' },
  { value: 'zh-HK-WanLungNeural', label: '粵語男聲 - 雲龍 (沉穩穩重)' }
];

// 輔助函數：將秒數格式化為 MM:SS
const formatTime = (seconds) => {
  if (isNaN(seconds) || seconds === null) return "00:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

// 輔助函數：取得適應環境之 TTS API URL
const getTtsApiUrl = (text, voice, rate, timestamp) => {
  const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  const baseUrl = isLocal ? '/api/tts' : (import.meta.env.VITE_TTS_API_URL || 'https://tts-adbqeupora-uc.a.run.app');
  return `${baseUrl}?text=${encodeURIComponent(text)}&voice=${voice}&rate=${encodeURIComponent(rate)}&_t=${timestamp}`;
};

export default function VideoPlayer({ images, script, onUpdateScript }) {
  const canvasRef = useRef(null);
  const audioRef = useRef(null);
  const videoPlayerRef = useRef(null);
  
  // 狀態管理與全螢幕狀態
  const [isFullscreen, setIsFullscreen] = useState(false);

  const handleToggleFullscreen = () => {
    const container = videoPlayerRef.current;
    if (!container) return;

    if (!document.fullscreenElement) {
      container.requestFullscreen().catch(err => {
        console.error(`全螢幕啟用失敗: ${err.message}`);
      });
    } else {
      document.exitFullscreen();
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);
  
  // 狀態管理
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [bgmVolume, setBgmVolume] = useState(0.3);
  const [ttsVolume, setTtsVolume] = useState(0.8);
  const [muted, setMuted] = useState(false);
  const [ttsEnabled, setTtsEnabled] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportStatus, setExportStatus] = useState("idle"); // idle, recording, transcoding
  
  const [editingSceneIndex, setEditingSceneIndex] = useState(null);
  const [editSubtitle, setEditSubtitle] = useState("");
  const [editNarration, setEditNarration] = useState("");
  const [editEffect, setEditEffect] = useState("zoom-in");
  const [editTransition, setEditTransition] = useState("crossfade");
  const [editDuration, setEditDuration] = useState(4);

  // Edge-TTS 人聲選項狀態
  const [ttsVoice, setTtsVoice] = useState('zh-TW-YunJheNeural');
  const [ttsLoadProgress, setTtsLoadProgress] = useState(0);
  const [isFallbackMode, setIsFallbackMode] = useState(false);
  const [ttsErrorMessage, setTtsErrorMessage] = useState("");

  // 快取圖片與 Edge TTS 音訊
  const [loadedImages, setLoadedImages] = useState([]);
  const [loadedTtsAudios, setLoadedTtsAudios] = useState({});
  const [isTtsLoading, setIsTtsLoading] = useState(false);
  
  // 影片時間點與場景對照表
  const [timeline, setTimeline] = useState([]);
  
  const requestRef = useRef(null);
  const prevTimeRef = useRef(null);
  const currentSceneIndexRef = useRef(-1);
  const isPlayingRef = useRef(false);
  
  // 音效檔案 Refs 與播放狀態
  const sfxBellRef = useRef(new Audio("./audio/bell.wav"));
  const sfxShutterRef = useRef(new Audio("./audio/shutter.wav"));
  const sfxWhooshRef = useRef(new Audio("./audio/whoosh.wav"));
  const sfxBellSourceRef = useRef(null);
  const sfxShutterSourceRef = useRef(null);
  const sfxWhooshSourceRef = useRef(null);
  const playedSfxRef = useRef({ bell: false, scenes: {} });
  const ttsGainNodeRef = useRef(null);

  // 用於記錄 Web Audio API 創建 of Source Nodes，防範重複連接出錯
  const audioContextRef = useRef(null);
  const bgmSourceNodeRef = useRef(null);
  const ttsSourceNodesRef = useRef({});
  const sessionTimestampRef = useRef(Date.now());
  
  // 匯出設定狀態 (畫質解析度與影片格式)
  const [exportResolution, setExportResolution] = useState('720p');
  const [exportMimeType, setExportMimeType] = useState('webm-vp9');

  // 1. 計算影片時間軸與總時長 (動態根據載入之 TTS 旁白時長調整每幕時間，防止語音被截斷)
  useEffect(() => {
    if (!script || !script.scenes) return;

    let accumTime = 0;
    const tl = [];
    
    // 開頭片頭 (3秒)
    tl.push({
      type: 'intro',
      start: accumTime,
      end: accumTime + 3,
      duration: 3,
      title: script.title,
      subtitle: script.subtitle
    });
    accumTime += 3;

    // 每張照片場景
    script.scenes.forEach((scene, index) => {
      // 預設時長（若無音訊或音訊無效）
      let sceneDur = scene.duration || 4;
      
      // 🔍 核心邏輯：如果該場景有載入好的 TTS 音訊，則調整時長為：Max(原訂時長, 旁白長度 + 0.6秒自然停頓/呼吸時間)
      const ttsAudio = loadedTtsAudios[index];
      if (ttsAudio && ttsAudio.duration && !isNaN(ttsAudio.duration)) {
        sceneDur = Math.max(sceneDur, ttsAudio.duration + 0.6);
      }

      tl.push({
        type: 'photo',
        index: index,
        photoIndex: scene.photoIndex,
        start: accumTime,
        end: accumTime + sceneDur,
        duration: sceneDur,
        narration: scene.narration,
        subtitle: scene.subtitle,
        effect: scene.effect || 'zoom-in',
        transition: scene.transition || 'crossfade'
      });
      accumTime += sceneDur;
    });

    // 結尾片尾 (3秒)
    tl.push({
      type: 'outro',
      start: accumTime,
      end: accumTime + 3,
      duration: 3,
      title: "謝謝觀看",
      subtitle: "Made with ❤️ by 阿凱老師"
    });
    accumTime += 3;

    setTimeline(tl);
    setDuration(accumTime);
  }, [script, loadedTtsAudios]);

  // 2. 預先載入所有圖片
  useEffect(() => {
    if (!images || images.length === 0) return;
    
    const loadAll = async () => {
      const promises = images.map((imgFile) => {
        return new Promise((resolve) => {
          const imgObj = new Image();
          imgObj.src = URL.createObjectURL(imgFile);
          imgObj.onload = () => resolve(imgObj);
        });
      });
      const objs = await Promise.all(promises);
      setLoadedImages(objs);
    };
    
    loadAll();
  }, [images]);

  // 3. 預先載入 Edge TTS 音訊檔 (透過本地 WebSocket 代理 `/api/tts`)
  useEffect(() => {
    if (!script || !script.scenes || script.scenes.length === 0) return;

    let isMounted = true;

    const loadTtsAudiosData = async () => {
      setIsTtsLoading(true);
      setTtsLoadProgress(0);
      setIsFallbackMode(false);
      setTtsErrorMessage("");
      const audios = {};
      const totalScenes = script.scenes.length;
      let completedCount = 0;
      let circuitBroken = false; // 斷路器標記

      // 🚶 循序 (Sequential) 載入語音旁白，加上 2 次重試與快速超時，防範卡死並自動斷路降級
      for (let index = 0; index < totalScenes; index++) {
        if (!isMounted) return;

        // ⏱️ 增加 300ms 間隔延遲，避免短時間內發送多個請求被微軟 API 速率限制 (Rate Limit) 阻擋
        if (index > 0 && !circuitBroken) {
          await new Promise(resolve => setTimeout(resolve, 300));
        }

        const scene = script.scenes[index];
        
        if (circuitBroken) {
          // 斷路器已啟動：不再請求雲端，直接走本地 fallback
          completedCount++;
          if (isMounted) setTtsLoadProgress(Math.round((completedCount / totalScenes) * 100));
          continue;
        }

        let success = false;
        let retryCount = 0;
        const maxRetries = 2; // 最多重試 2 次以節省等待時間

        while (!success && retryCount < maxRetries) {
          if (!isMounted) return;
          let timeoutId = null;
          try {
            const url = getTtsApiUrl(scene.narration, ttsVoice, '+20%', sessionTimestampRef.current);
            
            // ⏱️ 使用 AbortController 進行 10 秒超時控制，防止 TCP 掛起卡死並保留足夠時間給網路連線
            const controller = new AbortController();
            timeoutId = setTimeout(() => controller.abort(), 10000);
            
            const res = await fetch(url, { signal: controller.signal });
            clearTimeout(timeoutId);
            
            if (!isMounted) return;
            if (!res.ok) {
              const errBody = await res.text().catch(() => "");
              throw new Error(`HTTP 錯誤 ${res.status}: ${errBody || "伺服器未提供詳情"}`);
            }
            const blob = await res.blob();
            const blobUrl = URL.createObjectURL(blob);
            
            const audioObj = new Audio(blobUrl);
            audioObj.preload = "auto";
            
            // ⏳ 等待音訊元資料 (Metadata) 載入，以取得真實語音時長
            await new Promise((resolve) => {
              if (audioObj.readyState >= 1) { // HAVE_METADATA 或更高
                resolve();
              } else {
                audioObj.addEventListener('loadedmetadata', () => resolve(), { once: true });
                audioObj.addEventListener('error', () => resolve(), { once: true });
                // 3秒防卡死安全閾值
                setTimeout(resolve, 3000);
              }
            });
            
            audios[index] = audioObj;
            success = true;
          } catch (err) {
            if (timeoutId) clearTimeout(timeoutId);
            if (!isMounted) return;
            retryCount++;
            console.warn(`[Edge TTS] 載入 Scene ${index} 失敗，進行第 ${retryCount}/${maxRetries} 次重試...`, err);
            
            // 友善格式化與儲存錯誤訊息
            if (isMounted) {
              const friendlyMessage = err.name === 'AbortError'
                ? "連線逾時 (超過 10 秒未收到伺服器回應，可能是學校網路延遲或微軟語音服務連線延遲)"
                : err.message;
              setTtsErrorMessage(friendlyMessage);
            }

            if (retryCount < maxRetries) {
              await new Promise(resolve => setTimeout(resolve, 1000));
            } else {
              console.error(`[Edge TTS] Scene ${index} 連續失敗，啟動斷路器，後續自動降級為本地語音。`);
              circuitBroken = true;
              if (isMounted) setIsFallbackMode(true);
            }
          }
        }

        completedCount++;
        if (isMounted) setTtsLoadProgress(Math.round((completedCount / totalScenes) * 100));
      }

      if (isMounted) {
        setLoadedTtsAudios(audios);
        setIsTtsLoading(false);
      }
    };

    loadTtsAudiosData();

    return () => {
      isMounted = false;
    };
  }, [script, ttsVoice]);

  // 同步 ref 狀態以供 requestAnimationFrame 內讀取
  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  // 4. 背景音樂 (BGM) 控制
  useEffect(() => {
    const bgm = audioRef.current;
    if (!bgm) return;

    if (isPlaying && !isExporting) {
      bgm.play().catch(err => console.log("BGM 播放受瀏覽器安全限制，需互動後啟動", err));
    } else {
      bgm.pause();
    }
  }, [isPlaying, isExporting]);

  // 監聽播放進度與設定，以實現 BGM 背景音樂的淡入與淡出效果 (開頭淡入 2 秒，結尾淡出 2 秒)
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || isExporting) return; // 匯出時由 Web Audio API 的 GainNode 獨立控制，此處不干擾

    let fadeFactor = 1.0;
    const fadeDuration = 2.0; // 淡入淡出時間 2 秒

    if (currentTime < fadeDuration) {
      // 影片開頭淡入
      fadeFactor = currentTime / fadeDuration;
    } else if (duration > 0 && currentTime > duration - fadeDuration) {
      // 影片結尾淡出
      fadeFactor = Math.max(0, (duration - currentTime) / fadeDuration);
    }

    audio.volume = muted ? 0 : bgmVolume * fadeFactor;
  }, [currentTime, bgmVolume, muted, duration, isExporting]);

  // 5. Edge TTS 語音旁白播放與控制邏輯
  const playEdgeTts = (index, offsetTime = 0) => {
    if (!ttsEnabled || isExporting) return;
    
    const activeTts = loadedTtsAudios[index];
    if (activeTts) {
      activeTts.volume = muted ? 0 : ttsVolume;
      
      // 對齊相對時間播放（如果沒有超出時長）
      if (activeTts.duration && offsetTime >= activeTts.duration) {
        return; // 已播放完畢，不重播
      }

      // 🔍 檢查是否已經在正確播放，若是，則跳過重設，防止播放抖動
      if (!activeTts.paused) {
        if (Math.abs(activeTts.currentTime - offsetTime) < 0.5) {
          return;
        }
      }

      // 🛡️ 核心防護：如果該音軌目前正在啟動播放（Promise 處於 pending 狀態），
      // 且時間軸沒有被大幅拖曳，則直接 return，防止多訊框重複 reset 時間軸
      if (activeTts.isPlayPending) {
        if (Math.abs(activeTts.currentTime - offsetTime) < 0.5) {
          return;
        }
      }

      // 暫停所有其他正在播放的旁白音軌
      Object.keys(loadedTtsAudios).forEach(key => {
        if (parseInt(key) !== index && loadedTtsAudios[key]) {
          loadedTtsAudios[key].pause();
          loadedTtsAudios[key].isPlayPending = false; // 重設其他音軌的狀態鎖
        }
      });

      activeTts.currentTime = offsetTime;
      activeTts.isPlayPending = true; // 標記為播放啟動中
      
      console.log(`[Edge TTS] 嘗試同步/播放 Scene ${index}, offsetTime: ${offsetTime}, readyState: ${activeTts.readyState}`);
      activeTts.play()
        .then(() => {
          activeTts.isPlayPending = false; // 成功啟動播放，釋放鎖
          console.log(`[Edge TTS] 成功播放/同步 Scene ${index}`);
        })
        .catch(err => {
          activeTts.isPlayPending = false; // 啟動播放失敗，釋放鎖
          console.error(`[Edge TTS] 播放 Scene ${index} 失敗:`, err);
        });
    } else {
      // 🛡️ 語音降級播放防護網：如果 Edge-TTS 雲端音軌加載失敗，降級調用原生 SpeechSynthesis 播報
      const scene = script?.scenes?.[index];
      if (scene && scene.narration) {
        // 在 offsetTime 剛開始的瞬間發聲，避免動畫每影格重複觸發
        if (offsetTime < 0.5) {
          try {
            window.speechSynthesis.cancel(); // 停止之前未講完的話
            const utterance = new SpeechSynthesisUtterance(scene.narration);
            utterance.lang = 'zh-TW';
            
            // 嘗試挑選合適的中文人聲 (優先台灣，隨後任何中文)
            const voices = window.speechSynthesis.getVoices();
            const twVoice = voices.find(v => v.lang.includes('zh-TW') || v.lang.includes('zh-'));
            if (twVoice) utterance.voice = twVoice;
            
            utterance.rate = 0.95; // 稍微放慢語速以求清晰
            window.speechSynthesis.speak(utterance);
            console.log(`[Edge TTS] 雲端加載超時，已降級調用原生 SpeechSynthesis 播報 Scene ${index}`);
          } catch (e) {
            console.error("SpeechSynthesis Fallback 錯誤:", e);
          }
        }
      }
    }
  };

  const pauseAllEdgeTts = () => {
    Object.values(loadedTtsAudios).forEach(audio => {
      audio.pause();
    });
  };

  // 監聽 isPlaying 狀態來同步控制 TTS 旁白的暫停與播放
  useEffect(() => {
    if (!isPlaying) {
      pauseAllEdgeTts();
    } else {
      // 點擊播放時，立刻同步播放當前場景的 Edge-TTS 旁白
      const activeScene = timeline.find(s => currentTime >= s.start && currentTime < s.end);
      if (activeScene && activeScene.type === 'photo' && ttsEnabled) {
        const offset = currentTime - activeScene.start;
        playEdgeTts(activeScene.index, offset);
      }
    }
    return () => pauseAllEdgeTts();
  }, [isPlaying]);

  // 6. 核心 Canvas 渲染邏輯
  const drawCanvas = (time) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;

    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, width, height);

    const activeScene = timeline.find(s => time >= s.start && time < s.end);
    if (!activeScene) {
      if (time >= duration && duration > 0) {
        setIsPlaying(false);
        setCurrentTime(0);
        currentSceneIndexRef.current = -1;
        pauseAllEdgeTts();
        playedSfxRef.current = { bell: false, scenes: {} };
        if (audioRef.current) audioRef.current.currentTime = 0;
      }
      return;
    }

    // 🎬 播放/預覽時的過渡音效 (SFX) 觸發器 (避免重複播放)
    if (isPlaying && !isExporting) {
      // 1. 開場風鈴 (Intro)
      if (activeScene.type === 'intro') {
        if (!playedSfxRef.current.bell) {
          playedSfxRef.current.bell = true;
          sfxBellRef.current.volume = muted ? 0 : ttsVolume;
          sfxBellRef.current.currentTime = 0;
          sfxBellRef.current.play().catch(e => console.log("SFX Bell error:", e));
        }
      }
      // 2. 照片場景轉場與快門
      else if (activeScene.type === 'photo') {
        const idx = activeScene.index;
        if (!playedSfxRef.current.scenes[idx]) {
          playedSfxRef.current.scenes[idx] = { whoosh: false, shutter: false };
        }
        const sceneSfx = playedSfxRef.current.scenes[idx];

        // 轉場風聲 (進入照片的瞬間)
        if (!sceneSfx.whoosh) {
          sceneSfx.whoosh = true;
          sfxWhooshRef.current.volume = muted ? 0 : bgmVolume * 0.8;
          sfxWhooshRef.current.currentTime = 0;
          sfxWhooshRef.current.play().catch(e => console.log("SFX Whoosh error:", e));
        }

        // 相機快門 (轉場結束 0.5 秒後)
        if (time >= activeScene.start + 0.5 && !sceneSfx.shutter) {
          sceneSfx.shutter = true;
          sfxShutterRef.current.volume = muted ? 0 : ttsVolume * 0.7;
          sfxShutterRef.current.currentTime = 0;
          sfxShutterRef.current.play().catch(e => console.log("SFX Shutter error:", e));
        }
      }
    }

    // 每一幀都同步播放/對齊 Edge-TTS (內部會自動進行狀態對齊與防抖)
    if (activeScene.type === 'photo') {
      currentSceneIndexRef.current = `photo-${activeScene.index}`;
      if (isPlaying && !isExporting) {
        const offset = time - activeScene.start;
        playEdgeTts(activeScene.index, offset);
      }
    } else {
      const prevSceneKey = currentSceneIndexRef.current;
      currentSceneIndexRef.current = activeScene.type;
      // 僅在場景切換的瞬間暫停旁白，避免在 Intro/Outro 期間每影格重複暫停而中斷解鎖
      if (isPlaying && prevSceneKey !== activeScene.type) {
        pauseAllEdgeTts();
      }
    }

    // 6.1 繪製開頭片頭 (Intro)
    if (activeScene.type === 'intro') {
      const progress = (time - activeScene.start) / activeScene.duration;
      
      const gradient = ctx.createLinearGradient(0, 0, width, height);
      gradient.addColorStop(0, '#1e1b4b');
      gradient.addColorStop(1, '#0f172a');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);

      ctx.fillStyle = 'rgba(6, 182, 212, 0.15)';
      ctx.beginPath();
      ctx.arc(width / 2 - 200 + progress * 100, height / 2 - 50, 80 + progress * 20, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = 'rgba(79, 70, 229, 0.15)';
      ctx.beginPath();
      ctx.arc(width / 2 + 200 - progress * 100, height / 2 + 100, 100 - progress * 10, 0, Math.PI * 2);
      ctx.fill();

      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 54px "Noto Sans TC", sans-serif';
      const titleAlpha = Math.min(1, progress * 2) * Math.max(0, (1 - progress) * 4);
      ctx.globalAlpha = titleAlpha;
      ctx.fillText(activeScene.title, width / 2, height / 2 - 40);

      ctx.fillStyle = '#38bdf8';
      ctx.font = '500 24px "Noto Sans TC", sans-serif';
      ctx.fillText(activeScene.subtitle, width / 2, height / 2 + 40);
      
      ctx.globalAlpha = 1.0;
    }

    // 6.2 繪製照片場景 (Photo Scene with Ken Burns & Transitions)
    else if (activeScene.type === 'photo') {
      const sceneProgress = (time - activeScene.start) / activeScene.duration;
      const imgObj = loadedImages[activeScene.photoIndex];

      if (imgObj) {
        let scale = 1.05;
        let dx = 0;
        let dy = 0;
        let rotation = 0;

        if (activeScene.effect === 'zoom-in') {
          scale = 1.05 + sceneProgress * 0.12;
        } else if (activeScene.effect === 'zoom-out') {
          scale = 1.17 - sceneProgress * 0.12;
        } else if (activeScene.effect === 'pan-left') {
          scale = 1.12;
          dx = (0.5 - sceneProgress) * (width * 0.05);
        } else if (activeScene.effect === 'pan-right') {
          scale = 1.12;
          dx = (sceneProgress - 0.5) * (width * 0.05);
        } else if (activeScene.effect === 'pan-up-zoom') {
          scale = 1.05 + sceneProgress * 0.12;
          dy = (0.5 - sceneProgress) * (height * 0.05);
        } else if (activeScene.effect === 'pan-down-zoom') {
          scale = 1.05 + sceneProgress * 0.12;
          dy = (sceneProgress - 0.5) * (height * 0.05);
        } else if (activeScene.effect === 'rotate-right') {
          scale = 1.08 + sceneProgress * 0.10;
          rotation = sceneProgress * (Math.PI / 180 * 3); // 0 到 3 度
        } else if (activeScene.effect === 'rotate-left') {
          scale = 1.08 + sceneProgress * 0.10;
          rotation = -sceneProgress * (Math.PI / 180 * 3); // 0 到 -3 度
        }

        ctx.save();
        ctx.translate(width / 2 + dx, height / 2 + dy);
        ctx.rotate(rotation);
        ctx.scale(scale, scale);
        
        const imgRatio = imgObj.width / imgObj.height;
        const canvasRatio = width / height;
        let drawWidth, drawHeight;

        if (imgRatio > canvasRatio) {
          drawHeight = height;
          drawWidth = height * imgRatio;
        } else {
          drawWidth = width;
          drawHeight = width / imgRatio;
        }

        ctx.drawImage(imgObj, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
        ctx.restore();

        // 6.2.1 轉場特效 (Transition Effects)
        const transDuration = 0.5; // 轉場時間 0.5 秒
        if (sceneProgress < transDuration / activeScene.duration) {
          const prevScene = timeline.find(s => s.start <= activeScene.start - 0.1 && s.end >= activeScene.start);
          if (prevScene && prevScene.type === 'photo') {
            const prevImgObj = loadedImages[prevScene.photoIndex];
            if (prevImgObj) {
              const transProgress = (time - activeScene.start) / transDuration; // 0 到 1
              
              ctx.save();
              
              const transType = activeScene.transition || 'crossfade';
              let prevAlpha = 1.0;
              let transDx = 0;
              let transDy = 0;
              let transScaleOffset = 1.0;

              if (transType === 'crossfade') {
                prevAlpha = 1 - transProgress;
              } else if (transType === 'slide-left') {
                transDx = -transProgress * width;
              } else if (transType === 'slide-right') {
                transDx = transProgress * width;
              } else if (transType === 'slide-up') {
                transDy = -transProgress * height;
              } else if (transType === 'slide-down') {
                transDy = transProgress * height;
              } else if (transType === 'zoom-transition') {
                prevAlpha = 1 - transProgress;
                transScaleOffset = 1.0 + transProgress * 0.4;
              } else if (transType === 'fade-to-black') {
                if (transProgress < 0.5) {
                  prevAlpha = 1.0;
                } else {
                  prevAlpha = 0.0;
                }
              } else if (transType === 'wipe-right') {
                ctx.save();
                ctx.beginPath();
                ctx.rect(0, 0, width * (1 - transProgress), height);
                ctx.clip();
              } else if (transType === 'circle-crop') {
                ctx.save();
                ctx.beginPath();
                const radius = Math.max(width, height) * (1 - transProgress);
                ctx.arc(width / 2, height / 2, radius, 0, Math.PI * 2);
                ctx.clip();
              } else if (transType === 'blur-transition') {
                ctx.save();
                prevAlpha = 1 - transProgress;
                ctx.filter = `blur(${transProgress * 15}px)`;
              }

              ctx.globalAlpha = prevAlpha;
              
              // 計算 prevScene 原有的 Ken Burns 效果在結束時的終點狀態
              let prevScale = 1.05;
              let prevDx = 0, prevDy = 0, prevRotation = 0;
              if (prevScene.effect === 'zoom-in') prevScale = 1.17;
              else if (prevScene.effect === 'zoom-out') prevScale = 1.05;
              else if (prevScene.effect === 'pan-left') { prevScale = 1.12; prevDx = -width * 0.025; }
              else if (prevScene.effect === 'pan-right') { prevScale = 1.12; prevDx = width * 0.025; }
              else if (prevScene.effect === 'pan-up-zoom') { prevScale = 1.17; prevDy = -height * 0.025; }
              else if (prevScene.effect === 'pan-down-zoom') { prevScale = 1.17; prevDy = height * 0.025; }
              else if (prevScene.effect === 'rotate-right') { prevScale = 1.18; prevRotation = Math.PI / 180 * 3; }
              else if (prevScene.effect === 'rotate-left') { prevScale = 1.18; prevRotation = -Math.PI / 180 * 3; }

              ctx.translate(width / 2 + prevDx + transDx, height / 2 + prevDy + transDy);
              ctx.rotate(prevRotation);
              ctx.scale(prevScale * transScaleOffset, prevScale * transScaleOffset);

              const pImgRatio = prevImgObj.width / prevImgObj.height;
              let pdWidth, pdHeight;
              if (pImgRatio > canvasRatio) {
                pdHeight = height;
                pdWidth = height * pImgRatio;
              } else {
                pdWidth = width;
                pdHeight = width / pImgRatio;
              }
              ctx.drawImage(prevImgObj, -pdWidth / 2, -pdHeight / 2, pdWidth, pdHeight);
              if (transType === 'wipe-right' || transType === 'circle-crop' || transType === 'blur-transition') {
                ctx.restore();
                ctx.filter = 'none';
              }
              ctx.restore();

              // 如果是 fade-to-black，額外繪製黑幕遮罩
              if (transType === 'fade-to-black') {
                ctx.save();
                let maskAlpha = 0;
                if (transProgress < 0.5) {
                  maskAlpha = transProgress * 2; // 0 -> 1 (漸暗)
                } else {
                  maskAlpha = (1 - transProgress) * 2; // 1 -> 0 (漸亮)
                }
                ctx.fillStyle = 'black';
                ctx.globalAlpha = maskAlpha;
                ctx.fillRect(0, 0, width, height);
                ctx.restore();
              }
            }
          }
        }
      }

      // 6.2.2 字幕繪製
      ctx.save();
      const captionText = activeScene.subtitle;
      
      // 📐 根據當前 Canvas 實體寬度計算等比因子，基準寬度為 1280px
      const scaleFactor = width / 1280;
      const fontSize = Math.round(36 * scaleFactor); // 基準字體放大為 36px 更加醒目
      
      ctx.font = `bold ${fontSize}px "Noto Sans TC", sans-serif`;
      const textWidth = ctx.measureText(captionText).width;
      
      const paddingX = 40 * scaleFactor;
      const paddingY = 18 * scaleFactor;
      const rectWidth = textWidth + paddingX * 2;
      const rectHeight = fontSize + paddingY * 2;
      const rectX = (width - rectWidth) / 2;
      const rectY = height - (140 * scaleFactor); // 向上微調位置留出底部安全範圍

      ctx.fillStyle = 'rgba(0, 0, 0, 0.72)';
      ctx.beginPath();
      ctx.roundRect(rectX, rectY, rectWidth, rectHeight, 16 * scaleFactor); // 圓角等比調整
      ctx.fill();

      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(captionText, width / 2, rectY + rectHeight / 2);
      ctx.restore();
    }

    // 6.3 繪製結尾片尾 (Outro)
    else if (activeScene.type === 'outro') {
      const progress = (time - activeScene.start) / activeScene.duration;
      
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, width, height);

      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      ctx.font = 'bold 44px "Noto Sans TC", sans-serif';
      ctx.fillStyle = '#ffffff';
      const outroAlpha = Math.min(1, progress * 2) * Math.max(0, (1 - progress) * 4);
      ctx.globalAlpha = outroAlpha;
      ctx.fillText(activeScene.title, width / 2, height / 2 - 30);

      ctx.font = '500 20px "Noto Sans TC", sans-serif';
      ctx.fillStyle = '#94a3b8';
      ctx.fillText(activeScene.subtitle, width / 2, height / 2 + 30);

      ctx.globalAlpha = 1.0;
    }
  };

  // 7. 播放時間更新迴圈
  const playLoop = (timestamp) => {
    if (!isPlayingRef.current) return;

    if (!prevTimeRef.current) prevTimeRef.current = timestamp;
    const elapsed = (timestamp - prevTimeRef.current) / 1000;
    prevTimeRef.current = timestamp;

    setCurrentTime(prevTime => {
      const nextTime = prevTime + elapsed;
      if (nextTime >= duration) {
        setIsPlaying(false);
        prevTimeRef.current = null;
        pauseAllEdgeTts();
        playedSfxRef.current = { bell: false, scenes: {} };
        return 0;
      }
      return nextTime;
    });

    requestRef.current = requestAnimationFrame(playLoop);
  };

  useEffect(() => {
    if (isPlaying) {
      prevTimeRef.current = null;
      requestRef.current = requestAnimationFrame(playLoop);
    } else {
      cancelAnimationFrame(requestRef.current);
    }
    return () => cancelAnimationFrame(requestRef.current);
  }, [isPlaying, duration]);

  useEffect(() => {
    drawCanvas(currentTime);
  }, [currentTime, loadedImages, timeline, loadedTtsAudios]);

  // 取得或建立 AudioContext (Lazy Load) 並確保解鎖運作
  const getAudioContext = async () => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
    }
    const ctx = audioContextRef.current;
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }
    return ctx;
  };

  // 8. 影片控制按鈕
  const handlePlayPause = () => {
    const audio = audioRef.current;
    if (isPlaying) {
      setIsPlaying(false);
      if (audio) audio.pause();
    } else {
      setIsPlaying(true);
      if (audio) {
        audio.currentTime = currentTime;
        audio.play().catch(err => console.log(err));
      }
      
      // 同步解鎖 AudioContext
      getAudioContext().catch(e => console.log("AudioContext 解鎖失敗:", e));
      
      // 🔓 透過 User Gesture 同步解鎖所有旁白音軌，避免被 Autoplay Policy 阻擋
      Object.keys(loadedTtsAudios).forEach(key => {
        const ttsAudio = loadedTtsAudios[key];
        if (ttsAudio) {
          const originalMuted = ttsAudio.muted;
          ttsAudio.muted = true;
          ttsAudio.play()
            .then(() => {
              ttsAudio.pause();
              ttsAudio.muted = originalMuted;
              ttsAudio.isPlayPending = false; // 確保解鎖完成後重設播放鎖
              console.log(`[Edge TTS] 成功解鎖 Scene ${key} 的音軌`);
            })
            .catch(err => {
              ttsAudio.isPlayPending = false; // 確保解鎖失敗後也重設播放鎖
              console.warn(`[Edge TTS] 解鎖 Scene ${key} 的音軌失敗:`, err);
            });
        }
      });
    }
  };

  const handleStop = () => {
    setIsPlaying(false);
    setCurrentTime(0);
    currentSceneIndexRef.current = -1;
    pauseAllEdgeTts();
    playedSfxRef.current = { bell: false, scenes: {} };
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
  };

  const handleTimeSeek = (e) => {
    const time = parseFloat(e.target.value);
    setCurrentTime(time);
    playedSfxRef.current = { bell: false, scenes: {} };
    
    // 時間軸拖曳時，如果正在播放，同步對齊旁白語音時間
    if (isPlayingRef.current) {
      const activeScene = timeline.find(s => time >= s.start && time < s.end);
      if (activeScene && activeScene.type === 'photo' && ttsEnabled) {
        const offset = time - activeScene.start;
        playEdgeTts(activeScene.index, offset);
      } else {
        pauseAllEdgeTts();
      }
    } else {
      pauseAllEdgeTts();
    }

    if (audioRef.current) {
      audioRef.current.currentTime = time;
    }
  };

  // 9. 編輯場景
  const startEditingScene = (index, scene) => {
    setEditingSceneIndex(index);
    setEditSubtitle(scene.subtitle);
    setEditNarration(scene.narration);
    setEditEffect(scene.effect || "zoom-in");
    setEditTransition(scene.transition || "crossfade");
    setEditDuration(scene.duration || 4);
  };

  const saveEditedScene = async (index) => {
    const updatedScenes = [...script.scenes];
    updatedScenes[index] = {
      ...updatedScenes[index],
      subtitle: editSubtitle,
      narration: editNarration,
      effect: editEffect,
      transition: editTransition,
      duration: editDuration
    };
    onUpdateScript({
      ...script,
      scenes: updatedScenes
    });
    setEditingSceneIndex(null);

    // 重新載入編輯後的 Edge-TTS 語音旁白
    try {
      const url = getTtsApiUrl(editNarration, ttsVoice, '+20%', Date.now());
      const res = await fetch(url);
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      
      const audioObj = new Audio(blobUrl);
      
      // ⏳ 等待音訊元資料 (Metadata) 載入，以取得真實語音時長
      await new Promise((resolve) => {
        if (audioObj.readyState >= 1) { // HAVE_METADATA 或更高
          resolve();
        } else {
          audioObj.addEventListener('loadedmetadata', () => resolve(), { once: true });
          audioObj.addEventListener('error', () => resolve(), { once: true });
          setTimeout(resolve, 3000); // 3秒防卡死安全閾值
        }
      });

      setLoadedTtsAudios(prev => ({
        ...prev,
        [index]: audioObj
      }));
    } catch (e) {
      console.error("更新 TTS 失敗:", e);
    }
  };

  // 10. 匯出下載影片與混音
  const handleExportVideo = async () => {
    if (isExporting) return;
    
    setIsExporting(true);
    setExportStatus("recording");
    setIsPlaying(false);
    handleStop();
    setExportProgress(0);

    const canvas = canvasRef.current;
    const bgmAudio = audioRef.current;
    if (!canvas) {
      setIsExporting(false);
      setExportStatus("idle");
      return;
    }

    // 🎬 根據畫質設定調整 Canvas 的寬高
    const resolutionConfigs = {
      '720p': { w: 1280, h: 720, bps: 3000000 },
      '1080p': { w: 1920, h: 1080, bps: 6000000 },
      '2k': { w: 2560, h: 1440, bps: 12000000 }
    };
    const config = resolutionConfigs[exportResolution] || resolutionConfigs['720p'];
    const originalWidth = canvas.width;
    const originalHeight = canvas.height;
    
    // 暫時調整 Canvas 的實體大小，利用 CSS 限制顯示大小，使得繪製出的影像為真實高畫質
    canvas.width = config.w;
    canvas.height = config.h;

    try {
      // 🎛️ 取得或解鎖全域唯一的 AudioContext，防止新創 Context 處於 suspended 狀態無聲音
      const audioContext = await getAudioContext();
      const dest = audioContext.createMediaStreamDestination();
      let hasAudioTracks = false;

      // 10.1 混入 BGM
      let bgmSource = null;
      let bgmGainNode = null;
      if (bgmAudio && !muted) {
        bgmAudio.volume = 1.0; // 🔓 強制重設音量為 1.0，防止因 handleStop 重設為 0 導致 Web Audio 擷取到靜音
        
        await new Promise((resolve) => {
          const check = () => {
            if (bgmAudio.readyState >= 2) resolve();
            else setTimeout(check, 100);
          };
          check();
        });

        // 確保每個 MediaElement 僅 createMediaElementSource 一次，以防拋出 InvalidStateError
        if (!bgmSourceNodeRef.current) {
          bgmSourceNodeRef.current = audioContext.createMediaElementSource(bgmAudio);
        }
        bgmSource = bgmSourceNodeRef.current;
        
        // 使用 GainNode 控制導出影片中的 BGM 音量與淡入淡出 (開頭淡入 2 秒，結尾淡出 2 秒)
        bgmGainNode = audioContext.createGain();
        bgmGainNode.gain.setValueAtTime(0, audioContext.currentTime); // 初始音量設為 0，在定時器中動態調整

        bgmSource.connect(bgmGainNode);
        bgmGainNode.connect(dest);
        bgmGainNode.connect(audioContext.destination);
        hasAudioTracks = true;
      }

      // 10.2 混入 Edge-TTS 旁白 (加入獨立音量控制)
      let ttsGainNode = null;
      if (ttsEnabled) {
        ttsGainNode = audioContext.createGain();
        ttsGainNode.gain.setValueAtTime(muted ? 0 : ttsVolume, audioContext.currentTime);

        Object.keys(loadedTtsAudios).forEach((key) => {
          const ttsAudio = loadedTtsAudios[key];
          if (ttsAudio) {
            // 確保每個旁白 SourceNode 僅 createMediaElementSource 一次
            if (!ttsSourceNodesRef.current[key]) {
              ttsSourceNodesRef.current[key] = audioContext.createMediaElementSource(ttsAudio);
            }
            const ttsSource = ttsSourceNodesRef.current[key];
            ttsSource.connect(ttsGainNode);
            hasAudioTracks = true;
          }
        });

        ttsGainNode.connect(dest);
        ttsGainNode.connect(audioContext.destination);
      }

      // 10.2.5 混入過渡與事件音效 (SFX)
      const sfxBellSource = sfxBellSourceRef.current || audioContext.createMediaElementSource(sfxBellRef.current);
      sfxBellSourceRef.current = sfxBellSource;
      sfxBellSource.connect(dest);
      sfxBellSource.connect(audioContext.destination);

      const sfxShutterSource = sfxShutterSourceRef.current || audioContext.createMediaElementSource(sfxShutterRef.current);
      sfxShutterSourceRef.current = sfxShutterSource;
      sfxShutterSource.connect(dest);
      sfxShutterSource.connect(audioContext.destination);

      const sfxWhooshSource = sfxWhooshSourceRef.current || audioContext.createMediaElementSource(sfxWhooshRef.current);
      sfxWhooshSourceRef.current = sfxWhooshSource;
      sfxWhooshSource.connect(dest);
      sfxWhooshSource.connect(audioContext.destination);
      hasAudioTracks = true;

      // 10.3 擷取影像與音軌 (30 FPS)
      const canvasStream = canvas.captureStream(30);
      const videoTracks = canvasStream.getVideoTracks();

      const tracks = [...videoTracks];
      if (hasAudioTracks) {
        const audioTracks = dest.stream.getAudioTracks();
        tracks.push(...audioTracks);
      }
      const combinedStream = new MediaStream(tracks);

      // 選擇封裝格式與編碼器 (若是 mp4 則先用 webm 錄製，再用 ffmpeg 轉換)
      let mimeType = 'video/webm;codecs=vp9';
      let fileExt = 'webm';
      if (exportMimeType === 'webm-vp8') {
        mimeType = 'video/webm;codecs=vp8';
      } else if (exportMimeType === 'mp4') {
        mimeType = 'video/webm;codecs=vp9'; // 先以高品質 webm 錄影，再藉 WASM 轉成 mp4
        fileExt = 'mp4';
      }
      
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'video/webm';
        fileExt = 'webm';
      }

      const recorder = new MediaRecorder(combinedStream, {
        mimeType,
        videoBitsPerSecond: config.bps
      });
      const chunks = [];
      
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          chunks.push(e.data);
        }
      };

      recorder.onstop = async () => {
        const blob = new Blob(chunks, { type: chunks[0].type });

        if (exportMimeType === 'mp4') {
          setExportStatus("transcoding");
          setExportProgress(0);
          console.log("[FFmpeg] Start converting to MP4 format...");

          const ffmpeg = new FFmpeg();
          
          try {
            ffmpeg.on('log', ({ message }) => {
              console.log("[FFmpeg Log]", message);
            });
            ffmpeg.on('progress', ({ progress }) => {
              setExportProgress(Math.round(progress * 100));
            });

            await ffmpeg.load({
              coreURL: await toBlobURL('https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm/ffmpeg-core.js', 'text/javascript'),
              wasmURL: await toBlobURL('https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm/ffmpeg-core.wasm', 'application/wasm')
            });

            console.log("[FFmpeg] Writing webm to FS...");
            const webmBuffer = await blob.arrayBuffer();
            await ffmpeg.writeFile('input.webm', new Uint8Array(webmBuffer));

            console.log("[FFmpeg] Executing convert command...");
            // -c:v copy 視訊無損複製，音訊轉 aac，速度超快且不會有崩潰與 OOM
            await ffmpeg.exec(['-i', 'input.webm', '-c:v', 'copy', '-c:a', 'aac', 'output.mp4']);

            console.log("[FFmpeg] Reading output MP4...");
            const mp4Data = await ffmpeg.readFile('output.mp4');
            const mp4Blob = new Blob([mp4Data.buffer], { type: 'video/mp4' });
            const mp4Url = URL.createObjectURL(mp4Blob);

            const a = document.createElement('a');
            a.href = mp4Url;
            a.download = `${script.title || "activity"}_${exportResolution}_output.mp4`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);

          } catch (transcodeError) {
            console.error("[FFmpeg] Conversion failed, fallback to WebM:", transcodeError);
            alert("MP4 轉碼失敗，自動降級下載原始 WebM 影片檔");
            
            const webmUrl = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = webmUrl;
            a.download = `${script.title || "activity"}_${exportResolution}_output.webm`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
          }
        } else {
          // 下載原始 webm 檔案
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `${script.title || "activity"}_${exportResolution}_output.${fileExt}`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
        }
        
        // 🧹 錄製與轉檔完成後，主動斷開 Web Audio 連接，還原為普通播放狀態
        if (bgmSource && bgmGainNode) {
          bgmSource.disconnect(bgmGainNode);
          bgmGainNode.disconnect(dest);
          bgmGainNode.disconnect(audioContext.destination);
        }
        if (bgmAudio) {
          bgmAudio.volume = muted ? 0 : bgmVolume; // 還原背景音樂音量
        }
        if (ttsEnabled && ttsGainNode) {
          Object.keys(loadedTtsAudios).forEach((key) => {
            const ttsSource = ttsSourceNodesRef.current[key];
            if (ttsSource) {
              ttsSource.disconnect(ttsGainNode);
            }
          });
          ttsGainNode.disconnect(dest);
          ttsGainNode.disconnect(audioContext.destination);
        }

        if (sfxBellSource) {
          sfxBellSource.disconnect(dest);
          sfxBellSource.disconnect(audioContext.destination);
        }
        if (sfxShutterSource) {
          sfxShutterSource.disconnect(dest);
          sfxShutterSource.disconnect(audioContext.destination);
        }
        if (sfxWhooshSource) {
          sfxWhooshSource.disconnect(dest);
          sfxWhooshSource.disconnect(audioContext.destination);
        }

        // 還原畫布原始解析度並重繪
        canvas.width = originalWidth;
        canvas.height = originalHeight;
        drawCanvas(currentTime);
        
        setIsExporting(false);
        setExportStatus("idle");
        setExportProgress(0);
        handleStop();
      };

      recorder.start();
      
      if (bgmAudio) {
        bgmAudio.currentTime = 0;
        bgmAudio.play().catch(err => console.log(err));
      }

      let exportTime = 0;
      const fps = 30;
      const interval = 1000 / fps;
      let lastCheckedSceneIndex = -1;
      const exportPlayedSfx = { bell: false, scenes: {} };

      const exportTimer = setInterval(() => {
        exportTime += interval / 1000;
        
        if (exportTime >= duration) {
          clearInterval(exportTimer);
          recorder.stop();
          if (bgmAudio) bgmAudio.pause();
          Object.values(loadedTtsAudios).forEach(a => a.pause());
        } else {
          setCurrentTime(exportTime);
          setExportProgress(Math.round((exportTime / duration) * 100));

          // 🎛️ 動態計算並更新 BGM GainNode 的音量，以實現精準的淡入與淡出
          if (bgmGainNode) {
            const fadeDuration = 2.0; // 淡入淡出時間 2 秒
            let currentGain = bgmVolume;
            if (exportTime < fadeDuration) {
              currentGain = bgmVolume * (exportTime / fadeDuration);
            } else if (exportTime > duration - fadeDuration) {
              currentGain = Math.max(0, bgmVolume * ((duration - exportTime) / fadeDuration));
            }
            bgmGainNode.gain.setValueAtTime(currentGain, audioContext.currentTime);
          }

          // 🎬 導出時的過渡音效 (SFX) 觸發器
          // 1. 開場風鈴
          if (exportTime >= 0 && !exportPlayedSfx.bell) {
            exportPlayedSfx.bell = true;
            sfxBellRef.current.volume = muted ? 0 : ttsVolume;
            sfxBellRef.current.currentTime = 0;
            sfxBellRef.current.play().catch(e => console.log("Export SFX Bell error:", e));
          }

          const activeScene = timeline.find(s => exportTime >= s.start && exportTime < s.end);
          if (activeScene && activeScene.type === 'photo') {
            const idx = activeScene.index;
            if (!exportPlayedSfx.scenes[idx]) {
              exportPlayedSfx.scenes[idx] = { whoosh: false, shutter: false };
            }
            const sceneSfx = exportPlayedSfx.scenes[idx];

            // 轉場風聲
            if (!sceneSfx.whoosh) {
              sceneSfx.whoosh = true;
              sfxWhooshRef.current.volume = muted ? 0 : bgmVolume * 0.8;
              sfxWhooshRef.current.currentTime = 0;
              sfxWhooshRef.current.play().catch(e => console.log("Export SFX Whoosh error:", e));
            }

            // 相機快門
            if (exportTime >= activeScene.start + 0.5 && !sceneSfx.shutter) {
              sceneSfx.shutter = true;
              sfxShutterRef.current.volume = muted ? 0 : ttsVolume * 0.7;
              sfxShutterRef.current.currentTime = 0;
              sfxShutterRef.current.play().catch(e => console.log("Export SFX Shutter error:", e));
            }

            if (ttsEnabled) {
              if (lastCheckedSceneIndex !== activeScene.index) {
                lastCheckedSceneIndex = activeScene.index;
                
                Object.values(loadedTtsAudios).forEach(a => a.pause());
                const ttsAudio = loadedTtsAudios[activeScene.index];
                if (ttsAudio) {
                  ttsAudio.currentTime = 0;
                  ttsAudio.volume = muted ? 0 : ttsVolume;
                  ttsAudio.play().catch(e => console.log(e));
                }
              }
            }
          } else if (activeScene && activeScene.type !== 'photo') {
            lastCheckedSceneIndex = -1;
            Object.values(loadedTtsAudios).forEach(a => a.pause());
          }
        }
      }, interval);

    } catch (error) {
      console.error("匯出影片錯誤:", error);
      alert("匯出影片失敗，原因：" + error.message);
      
      // 還原解析度
      canvas.width = originalWidth;
      canvas.height = originalHeight;
      drawCanvas(currentTime);
      
      setIsExporting(false);
      setExportStatus("idle");
      setExportProgress(0);
    }
  };

  const currentBgmUrl = BGM_TEMPLATES[script.bgmTheme] || BGM_TEMPLATES.gentle;

  return (
    <div ref={videoPlayerRef} className={`video-player-component ${isFullscreen ? 'fullscreen' : ''}`}>
      {/* 背景音樂元素 */}
      <audio 
        ref={audioRef} 
        src={`${currentBgmUrl}?_t=${sessionTimestampRef.current}`} 
        crossOrigin="anonymous"
        loop 
        style={{ display: 'none' }}
      />

      {/* 影片預覽渲染 Canvas */}
      <div className="video-preview-wrapper">
        <canvas 
          ref={canvasRef} 
          width={1280} 
          height={720} 
          className="canvas-video"
        />
        
        {/* ✨ Glassmorphism 語音轉檔 Loading 遮罩 */}
        {isTtsLoading && (
          <div className="tts-loading-overlay">
            <div className="tts-loading-card">
              <div className="tts-loading-spinner-wrapper">
                <Loader2 className="animate-spin loader-icon" size={32} />
                <span className="tts-percentage-badge">{ttsLoadProgress}%</span>
              </div>
              <div className="tts-loading-text-group">
                <h4>語音旁白合成中</h4>
                <p>正在生成微軟高品質 Neural 數位人聲旁白...</p>
              </div>
              <div className="tts-progress-track">
                <div 
                  className="tts-progress-fill" 
                  style={{ width: `${ttsLoadProgress}%` }}
                ></div>
              </div>
            </div>
          </div>
        )}

        {/* 中央播放按鈕 (轉檔時不顯示此按鈕，避免衝突) */}
        {!isPlaying && !isExporting && !isTtsLoading && (
          <div className="video-overlay-play" onClick={handlePlayPause}>
            <button className="btn-play-center" aria-label="播放">
              <Play size={32} style={{ marginLeft: '4px' }} />
            </button>
          </div>
        )}
      </div>

      {/* 匯出進度條 */}
      {isExporting && (
        <div style={{ marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '0.3rem', fontWeight: 'bold' }}>
            <span>
              {exportStatus === 'transcoding' 
                ? "⚡ FFmpeg.wasm 正在轉換影片為 Apple 相容 MP4 格式 (無損轉封裝)..." 
                : "🎬 正在匯出影片（將旁白配音、音樂與轉場音效打包錄製中）..."}
            </span>
            <span>{exportProgress}%</span>
          </div>
          <div style={{ width: '100%', height: '8px', backgroundColor: 'var(--border-color)', borderRadius: '4px', overflow: 'hidden' }}>
            <div style={{ width: `${exportProgress}%`, height: '100%', backgroundColor: exportStatus === 'transcoding' ? '#10b981' : 'var(--primary)', transition: 'width 0.1s linear' }}></div>
          </div>
        </div>
      )}

      {/* 影片控制列 */}
      <div className="video-controls">
        <div className="control-buttons-left">
          <button 
            className="btn-secondary" 
            onClick={handlePlayPause}
            disabled={isExporting || isTtsLoading}
            title={isPlaying ? "暫停" : "播放"}
          >
            {isPlaying ? <Pause size={16} /> : <Play size={16} />}
          </button>
          
          <button 
            className="btn-secondary" 
            onClick={handleStop}
            disabled={isExporting}
            title="重設"
          >
            <RotateCcw size={16} />
          </button>

          <span className="video-time-display">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>
        </div>

        <input 
          type="range" 
          min={0} 
          max={duration || 100} 
          step={0.1}
          value={currentTime} 
          onChange={handleTimeSeek}
          className="video-timeline-slider"
          style={{ flex: 1, margin: '0 1.5rem', cursor: 'pointer' }}
          disabled={isExporting}
        />

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <button 
            onClick={() => setMuted(!muted)} 
            className="btn-secondary" 
            style={{ padding: '0.4rem' }}
            disabled={isExporting}
            title={muted ? "取消靜音" : "靜音"}
          >
            {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
          </button>
          <button 
            onClick={handleToggleFullscreen} 
            className="btn-secondary" 
            style={{ padding: '0.4rem' }}
            title={isFullscreen ? "退出全螢幕" : "全螢幕"}
          >
            {isFullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
          </button>
        </div>
      </div>

      {/* 音效與旁白設定 */}
      <div className="audio-options-grid">
        <div className={`audio-option-card ${ttsEnabled ? 'active' : ''}`}>
          <div className="audio-card-header">
            <span>🗣️ Edge-TTS 語音旁白</span>
            <input 
              type="checkbox" 
              checked={ttsEnabled} 
              onChange={(e) => setTtsEnabled(e.target.checked)}
              disabled={isExporting || isTtsLoading}
            />
          </div>
          <div style={{ marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', marginBottom: '0.2rem' }}>
              <span style={{ minWidth: '70px', color: 'var(--text-secondary)' }}>旁白音量:</span>
              <input 
                type="range" 
                min={0} 
                max={1} 
                step={0.05} 
                value={ttsVolume}
                onChange={(e) => setTtsVolume(parseFloat(e.target.value))}
                style={{ flex: 1, height: '4px', cursor: 'pointer' }}
                disabled={!ttsEnabled || isExporting}
              />
              <span style={{ fontWeight: 'bold', width: '30px', textAlign: 'right' }}>{Math.round(ttsVolume * 100)}%</span>
            </div>

            <select
              value={ttsVoice}
              onChange={(e) => setTtsVoice(e.target.value)}
              className="audio-select"
              disabled={isExporting || isTtsLoading || !ttsEnabled}
              style={{ width: '100%', padding: '0.35rem 0.5rem', fontSize: '0.8rem' }}
            >
              {TTS_VOICES.map(voice => (
                <option key={voice.value} value={voice.value}>{voice.label}</option>
              ))}
            </select>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: 0 }}>
              {isTtsLoading ? (
                <span style={{ color: 'var(--primary)', fontWeight: 'bold' }}>
                  ⏳ 正在轉檔旁白 {ttsLoadProgress}%...
                </span>
              ) : isFallbackMode ? (
                <span style={{ color: '#f59e0b', fontWeight: 'bold', display: 'block' }}>
                  ⚠️ 雲端語音載入失敗，已降級為本地語音 (Web Speech API) 播放！
                  {ttsErrorMessage && (
                    <span style={{ display: 'block', fontSize: '0.7rem', color: '#ef4444', marginTop: '4px', whiteSpace: 'pre-wrap', wordBreak: 'break-all', backgroundColor: 'rgba(239, 68, 68, 0.08)', padding: '0.5rem', borderRadius: '4px', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                      詳細錯誤：{ttsErrorMessage}
                    </span>
                  )}
                </span>
              ) : (
                "已啟用微軟高品質 Neural 語音，效果自然且極具人聲質感！"
              )}
            </p>
          </div>
        </div>

        <div className="audio-option-card active">
          <div className="audio-card-header">
            <span>🎵 背景音樂 (BGM) - 11 種風格</span>
          </div>
          <div style={{ marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', marginBottom: '0.2rem' }}>
              <span style={{ minWidth: '70px', color: 'var(--text-secondary)' }}>音樂音量:</span>
              <input 
                type="range" 
                min={0} 
                max={1} 
                step={0.05} 
                value={bgmVolume}
                onChange={(e) => setBgmVolume(parseFloat(e.target.value))}
                style={{ flex: 1, height: '4px', cursor: 'pointer' }}
                disabled={isExporting}
              />
              <span style={{ fontWeight: 'bold', width: '30px', textAlign: 'right' }}>{Math.round(bgmVolume * 100)}%</span>
            </div>

            <select 
              value={script.bgmTheme || "gentle"} 
              onChange={(e) => onUpdateScript({ ...script, bgmTheme: e.target.value })}
              className="audio-select"
              disabled={isExporting}
            >
              <option value="gentle">溫柔鋼琴 (Gentle Piano)</option>
              <option value="inspiring">夢想啟發 (Dreaming Big)</option>
              <option value="energetic">科技律動 (Tech House)</option>
              <option value="happy">歡樂滑稽 (Funny Bits)</option>
              <option value="cheerful">陽光輕快 (Cheerful Ukulele)</option>
              <option value="relaxed">放鬆舒適 (Relaxed Cozy)</option>
              <option value="epic">史詩壯麗 (Epic Sport)</option>
              <option value="ambient">安靜空間 (Ambient Space)</option>
              <option value="lofi">Lofi 氛圍 (Lofi Chill)</option>
              <option value="acoustic">木吉他 (Acoustic Guitar)</option>
              <option value="retro">復古電子 (Retro Synth)</option>
            </select>
          </div>
        </div>
      </div>

      {/* 🎬 匯出畫質與格式設定 */}
      <div className="audio-options-grid" style={{ marginTop: '1.5rem', marginBottom: '1rem' }}>
        <div className="audio-option-card active">
          <div className="audio-card-header">
            <span>🎬 匯出影片畫質解析度</span>
          </div>
          <select 
            value={exportResolution} 
            onChange={(e) => setExportResolution(e.target.value)}
            className="audio-select"
            disabled={isExporting}
            style={{ width: '100%', padding: '0.35rem 0.5rem', fontSize: '0.8rem', marginTop: '0.5rem' }}
          >
            <option value="720p">720p HD (標準高清 - 1280x720)</option>
            <option value="1080p">1080p Full HD (高畫質 - 1920x1080)</option>
            <option value="2k">2K Quad HD (極致超高清 - 2560x1440)</option>
          </select>
        </div>

        <div className="audio-option-card active">
          <div className="audio-card-header">
            <span>💿 影片封裝格式 (與裝置相容性)</span>
          </div>
          <select 
            value={exportMimeType} 
            onChange={(e) => setExportMimeType(e.target.value)}
            className="audio-select"
            disabled={isExporting}
            style={{ width: '100%', padding: '0.35rem 0.5rem', fontSize: '0.8rem', marginTop: '0.5rem' }}
          >
            <option value="mp4">MP4 (相容性 100% 格式，適合 iPhone 與 Safari)</option>
            <option value="webm-vp9">WebM (高品質 VP9 編碼 - 電腦播放推薦)</option>
            <option value="webm-vp8">WebM (通用 VP8 編碼 - 相容舊瀏覽器)</option>
          </select>
        </div>
      </div>

      {/* 匯出下載按鈕 */}
      <div className="btn-export-row">
        <button 
          className="btn-primary" 
          onClick={handleExportVideo}
          disabled={isExporting || images.length === 0 || isTtsLoading}
        >
          <Download size={18} />
          {isExporting 
            ? (exportStatus === 'transcoding' ? `正在轉檔 MP4 ${exportProgress}%...` : `正在匯出影片 ${exportProgress}%...`) 
            : `匯出下載影片 (${exportMimeType === 'mp4' ? 'MP4' : 'WebM'})`}
        </button>
      </div>

      {/* 腳本與字幕編輯區 */}
      <div style={{ marginTop: '2.5rem' }}>
        <h4 style={{ fontSize: '1.1rem', fontWeight: 'bold', marginBottom: '1rem', borderBottom: '1.5px solid var(--border-color)', paddingBottom: '0.5rem' }}>
          📝 影片腳本與字幕編輯
        </h4>
        
        <div className="scenes-editor-list">
          {script.scenes.map((scene, idx) => (
            <div key={idx} className="scene-editor-card">
              <div className="scene-card-thumb">
                <img src={URL.createObjectURL(images[scene.photoIndex])} alt={`照片 ${idx + 1}`} />
                <div style={{ textAlign: 'center', fontSize: '0.75rem', fontWeight: 'bold', marginTop: '4px', color: 'var(--text-secondary)' }}>
                  場景 {idx + 1}
                </div>
              </div>

              <div className="scene-card-fields">
                {editingSceneIndex === idx ? (
                  <>
                    <div className="scene-input-group">
                      <label>字幕內容 (顯示於影片下方)</label>
                      <input 
                        type="text" 
                        value={editSubtitle} 
                        onChange={(e) => setEditSubtitle(e.target.value)}
                        className="input-text"
                      />
                    </div>
                    <div className="scene-input-group">
                      <label>旁白腳本 (微軟語音朗讀內容)</label>
                      <textarea 
                        value={editNarration} 
                        onChange={(e) => setEditNarration(e.target.value)}
                        className="textarea-subtitle"
                      />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.6rem', marginBottom: '0.6rem', marginTop: '0.4rem' }}>
                      <div className="scene-input-group" style={{ margin: 0 }}>
                        <label style={{ fontSize: '0.75rem', fontWeight: 'bold' }}>鏡頭動效</label>
                        <select 
                          value={editEffect} 
                          onChange={(e) => setEditEffect(e.target.value)}
                          className="audio-select"
                          style={{ width: '100%', fontSize: '0.8rem', padding: '0.25rem', height: 'auto', border: '1px solid var(--border-color)', borderRadius: '4px' }}
                        >
                          <option value="zoom-in">🔍 微放大 (Zoom In)</option>
                          <option value="zoom-out">🔎 微縮小 (Zoom Out)</option>
                          <option value="pan-left">⬅️ 向左平移 (Pan Left)</option>
                          <option value="pan-right">➡️ 向右平移 (Pan Right)</option>
                          <option value="pan-up-zoom">⬆️ 向上平移+放大</option>
                          <option value="pan-down-zoom">⬇️ 向下平移+放大</option>
                          <option value="rotate-right">↪️ 順時針旋轉+慢放大</option>
                          <option value="rotate-left">↩️ 逆時針旋轉+慢放大</option>
                        </select>
                      </div>
                      <div className="scene-input-group" style={{ margin: 0 }}>
                        <label style={{ fontSize: '0.75rem', fontWeight: 'bold' }}>轉場特效</label>
                        <select 
                          value={editTransition} 
                          onChange={(e) => setEditTransition(e.target.value)}
                          className="audio-select"
                          style={{ width: '100%', fontSize: '0.8rem', padding: '0.25rem', height: 'auto', border: '1px solid var(--border-color)', borderRadius: '4px' }}
                        >
                          <option value="crossfade">🌫️ 淡入淡出 (Crossfade)</option>
                          <option value="slide-left">👈 向左推入 (Slide Left)</option>
                          <option value="slide-right">👉 向右推入 (Slide Right)</option>
                          <option value="slide-up">👆 向上推入 (Slide Up)</option>
                          <option value="slide-down">👇 向下推入 (Slide Down)</option>
                          <option value="zoom-transition">💥 鏡頭縮放轉場 (Zoom)</option>
                          <option value="fade-to-black">🖤 漸變黑屏轉場 (Black)</option>
                          <option value="wipe-right">👉 向右擦除 (Wipe Right)</option>
                          <option value="circle-crop">🎯 圓形收縮 (Circle Crop)</option>
                          <option value="blur-transition">🌫️ 模糊過渡 (Blur Fade)</option>
                        </select>
                      </div>
                      <div className="scene-input-group" style={{ margin: 0 }}>
                        <label style={{ fontSize: '0.75rem', fontWeight: 'bold' }}>播放時間</label>
                        <select 
                          value={editDuration} 
                          onChange={(e) => setEditDuration(parseInt(e.target.value))}
                          className="audio-select"
                          style={{ width: '100%', fontSize: '0.8rem', padding: '0.25rem', height: 'auto', border: '1px solid var(--border-color)', borderRadius: '4px' }}
                        >
                          <option value="2">2 秒</option>
                          <option value="3">3 秒</option>
                          <option value="4">4 秒 (標準)</option>
                          <option value="5">5 秒</option>
                          <option value="6">6 秒</option>
                          <option value="8">8 秒</option>
                        </select>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.4rem' }}>
                      <button className="btn-primary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }} onClick={() => saveEditedScene(idx)}>
                        <Check size={14} style={{ marginRight: '4px' }} /> 儲存
                      </button>
                      <button className="btn-secondary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }} onClick={() => setEditingSceneIndex(null)}>
                        取消
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <strong style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>字幕：</strong>
                      <span style={{ fontSize: '0.9rem' }}>{scene.subtitle}</span>
                    </div>
                    <div>
                      <strong style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>旁白：</strong>
                      <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{scene.narration}</span>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.8rem', fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                      <span>⏱️ 時長: {scene.duration || 4}秒</span>
                      <span>🎬 特效: {
                        scene.effect === 'zoom-in' ? '🔍 微放大' : 
                        scene.effect === 'zoom-out' ? '🔎 微縮小' : 
                        scene.effect === 'pan-left' ? '⬅️ 向左平移' : 
                        scene.effect === 'pan-right' ? '➡️ 向右平移' :
                        scene.effect === 'pan-up-zoom' ? '⬆️ 向上平移+放大' :
                        scene.effect === 'pan-down-zoom' ? '⬇️ 向下平移+放大' :
                        scene.effect === 'rotate-right' ? '↪️ 順時針旋轉+慢放大' :
                        scene.effect === 'rotate-left' ? '↩️ 逆時針旋轉+慢放大' : '無特效'
                      }</span>
                      <span>🌫️ 轉場: {
                        scene.transition === 'crossfade' ? '淡入淡出' : 
                        scene.transition === 'slide-left' ? '向左推入' : 
                        scene.transition === 'slide-right' ? '向右推入' : 
                        scene.transition === 'slide-up' ? '向上推入' : 
                        scene.transition === 'slide-down' ? '向下推入' : 
                        scene.transition === 'zoom-transition' ? '鏡頭縮放' : 
                        scene.transition === 'fade-to-black' ? '漸變黑屏' : 
                        scene.transition === 'wipe-right' ? '向右擦除' : 
                        scene.transition === 'circle-crop' ? '圓形收縮' : 
                        scene.transition === 'blur-transition' ? '模糊過渡' : '漸變淡入'
                      }</span>
                    </div>
                    <div style={{ marginTop: '0.4rem' }}>
                      <button 
                        className="btn-secondary" 
                        style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem', gap: '0.2rem' }}
                        onClick={() => startEditingScene(idx, scene)}
                        disabled={isExporting}
                      >
                        <Edit2 size={12} /> 編輯內容
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
