import React, { useState, useEffect } from 'react';
import { Sparkles, Image as ImageIcon, BookOpen, AlertCircle, Play, Film, Check, ArrowRight, CheckCircle, XCircle, Loader2, Eye, EyeOff } from 'lucide-react';
import { generateVideoScript, testApiKey } from './utils/gemini';
import OnboardingDialog from './components/OnboardingDialog';
import Footer from './components/Footer';
import ThemeToggle from './components/ThemeToggle';
import VideoPlayer from './components/VideoPlayer';

export default function App() {
  // 核心狀態
  const [images, setImages] = useState([]);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [apiKey, setApiKey] = useState('');
  
  // 影片生成結果與載入狀態
  const [videoScript, setVideoScript] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  
  // UI 狀態
  const [isOnboardingOpen, setIsOnboardingOpen] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  
  // 金鑰測試狀態
  const [isTestingKey, setIsTestingKey] = useState(false);
  const [keyTestStatus, setKeyTestStatus] = useState(null); // 'success' | 'error' | null
  const [keyTestError, setKeyTestError] = useState('');
  const [showKey, setShowKey] = useState(false);

  // 1. 初始化讀取 API Key (優先從環境變數或 localStorage)
  useEffect(() => {
    // 依據鐵律，從環境變數或本地 localStorage 讀取
    const envKey = import.meta.env.VITE_GEMINI_API_KEY || '';
    const savedKey = localStorage.getItem('gemini-api-key') || '';
    
    // 如果環境變數有值且非 __PLACEHOLDER__ 形式，優先使用
    if (envKey && !envKey.includes('__FIREBASE_API_KEY__') && !envKey.includes('__PLACEHOLDER__')) {
      setApiKey(envKey);
    } else if (savedKey) {
      setApiKey(savedKey);
    }

    // 第一次開啟的使用者，主動展示 Onboarding
    const hasSeenOnboarding = localStorage.getItem('has-seen-onboarding');
    if (!hasSeenOnboarding) {
      setIsOnboardingOpen(true);
      localStorage.setItem('has-seen-onboarding', 'true');
    }
  }, []);

  // 當影片腳本生成成功時，自動平滑捲動至影片區塊
  useEffect(() => {
    if (videoScript) {
      setTimeout(() => {
        const element = document.getElementById('video-preview-section');
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 100);
    }
  }, [videoScript]);

  // 保存 API Key 至 localStorage
  const handleApiKeyChange = (e) => {
    const val = e.target.value;
    setApiKey(val);
    localStorage.setItem('gemini-api-key', val);
    setKeyTestStatus(null); // 當使用者修改 Key 時，重置驗證狀態
    setKeyTestError('');
  };

  // 測試 API Key 測試連線
  const handleTestKey = async () => {
    if (!apiKey) {
      setKeyTestStatus('error');
      setKeyTestError('請先輸入 API Key 再進行測試！');
      return;
    }
    
    setIsTestingKey(true);
    setKeyTestStatus(null);
    setKeyTestError('');
    
    try {
      await testApiKey(apiKey);
      setKeyTestStatus('success');
    } catch (err) {
      setKeyTestStatus('error');
      setKeyTestError(err.message || '驗證失敗，請確認金鑰正確性。');
    } finally {
      setIsTestingKey(false);
    }
  };

  // 2. 處理拖曳上傳
  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDropFiles = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      addFiles(Array.from(e.dataTransfer.files));
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      addFiles(Array.from(e.target.files));
    }
  };

  // 過濾並加入圖片檔案
  const addFiles = (fileList) => {
    const imgFiles = fileList.filter(file => file.type.startsWith('image/'));
    if (imgFiles.length === 0) {
      setError('上傳的檔案中沒有包含有效的圖片格式。');
      return;
    }
    setError('');
    setImages(prev => [...prev, ...imgFiles]);
  };

  // 刪除照片
  const handleDeletePhoto = (idx) => {
    setImages(prev => prev.filter((_, i) => i !== idx));
  };

  // 3. 原生 HTML5 照片拖曳排序
  const handlePhotoDragStart = (e, index) => {
    e.dataTransfer.setData("text/plain", index);
  };

  const handlePhotoDrop = (e, targetIndex) => {
    const sourceIndex = parseInt(e.dataTransfer.getData("text/plain"));
    if (isNaN(sourceIndex)) return;
    
    const updatedImages = [...images];
    const [draggedItem] = updatedImages.splice(sourceIndex, 1);
    updatedImages.splice(targetIndex, 0, draggedItem);
    setImages(updatedImages);
  };

  // 4. 呼叫 Gemini 分析照片並生成影片腳本
  const handleGenerateScript = async () => {
    if (!apiKey) {
      setError('請先輸入並設定您的 API 授權金鑰！');
      return;
    }
    if (images.length === 0) {
      setError('請先上傳至少一張照片紀錄！');
      return;
    }

    setIsLoading(true);
    setError('');
    setVideoScript(null);

    try {
      const script = await generateVideoScript(images, title, description, apiKey);
      setVideoScript(script);
    } catch (err) {
      setError(err.message || '分析照片失敗，請檢查 API Key 是否正確或網路狀態。');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="app-container">
      {/* 導覽列 */}
      <header className="app-header">
        <div className="header-content">
          <div className="logo-section">
            <Film className="logo-icon" size={24} />
            <h1>智慧自動化照片成果轉影片產生器</h1>
          </div>
          
          <div className="nav-actions">
            <button 
              className="theme-toggle-btn" 
              onClick={() => setIsOnboardingOpen(true)}
              title="使用說明"
            >
              <BookOpen size={18} />
              <span className="theme-text">說明</span>
            </button>
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* 主體內容 */}
      <main className="app-main">
        {/* Onboarding 指南 */}
        <OnboardingDialog 
          isOpen={isOnboardingOpen} 
          onClose={() => setIsOnboardingOpen(false)} 
        />

        {/* 歡迎橫幅 */}
        <div className="intro-banner">
          <h2>📸 智慧自動化，照片成果一秒轉精美影片！</h2>
          <p>
            只需要上傳您的照片紀錄，多模態智慧分析技術將自動識別照片中發生的故事、編寫流暢中文旁白與字幕，並搭配精彩的 Ken Burns 動效與背景音樂，自動把照片成果轉換成專業的剪輯影片！
          </p>
          <div className="banner-buttons">
            <button className="btn-secondary" onClick={() => setIsOnboardingOpen(true)}>
              <BookOpen size={16} /> 觀看使用說明
            </button>
          </div>
        </div>

        {/* 錯誤提示 */}
        {error && (
          <div className="alert-error">
            <AlertCircle size={18} />
            <span>{error}</span>
          </div>
        )}

        {/* 主面板 Grid */}
        <div className="grid-container">
          {/* 左側：設定與上傳區 */}
          <div className="panel-card">
            <h3>🔑 Step 1: 基礎設定與金鑰</h3>
            
            {/* API Key 設定區 */}
            <div className="api-key-box">
              <div className="api-key-label">
                <span>API 授權金鑰 (Gemini API Key)</span>
                <a 
                  href="https://aistudio.google.com/app/apikey" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  style={{ fontSize: '0.8rem', fontWeight: 'bold' }}
                >
                  申請免費金鑰 ↗
                </a>
              </div>
              <div className="api-key-input-wrapper" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <div style={{ position: 'relative', flexGrow: 1, display: 'flex', alignItems: 'center' }}>
                  <input 
                    id="api-auth-key-input-field"
                    name="api-auth-key-input-field"
                    type={showKey ? "text" : "password"} 
                    value={apiKey} 
                    onChange={handleApiKeyChange}
                    placeholder="輸入 AIzaSy 開頭的 API 授權金鑰..."
                    className="input-text"
                    style={{ width: '100%', paddingRight: '2.5rem' }}
                    disabled={isTestingKey}
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey(!showKey)}
                    style={{
                      position: 'absolute',
                      right: '0.75rem',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      color: 'var(--text-secondary)',
                      display: 'flex',
                      alignItems: 'center',
                      padding: 0
                    }}
                    title={showKey ? "隱藏金鑰" : "顯示金鑰"}
                  >
                    {showKey ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                <button 
                  type="button" 
                  onClick={handleTestKey} 
                  disabled={isTestingKey || !apiKey}
                  className="btn-secondary"
                  style={{ flexShrink: 0, padding: '0.6rem 1rem' }}
                >
                  {isTestingKey ? (
                    <>
                      <Loader2 className="animate-spin" size={16} style={{ marginRight: '4px' }} />
                      測試中
                    </>
                  ) : "測試連線"}
                </button>
              </div>
              
              {/* 金鑰測試狀態展示 */}
              {keyTestStatus === 'success' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#10b981', fontSize: '0.8rem', marginTop: '0.5rem', fontWeight: 'bold' }}>
                  <CheckCircle size={16} />
                  <span>驗證成功！您的 API 授權金鑰有效且可正常使用。</span>
                </div>
              )}
              {keyTestStatus === 'error' && (
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.4rem', color: '#ef4444', fontSize: '0.8rem', marginTop: '0.5rem', fontWeight: 'bold' }}>
                  <XCircle size={16} style={{ marginTop: '2px', flexShrink: 0 }} />
                  <span>驗證失敗：{keyTestError}</span>
                </div>
              )}

              <div className="alert-warning">
                💡 <b>安全警告：</b>本網頁為純前端應用，您的金鑰僅儲存在本地瀏覽器 (localStorage)，絕不會上傳到任何第三方伺服器。
              </div>
            </div>

            <h3 style={{ marginTop: '2rem' }}>📸 Step 2: 上傳活動照片紀錄</h3>
            
            {/* 拖放上傳區 */}
            <div 
              className={`upload-dropzone ${dragActive ? 'drag-active' : ''}`}
              onDragEnter={handleDrag}
              onDragOver={handleDrag}
              onDragLeave={handleDrag}
              onDrop={handleDropFiles}
              onClick={() => document.getElementById('file-upload-input').click()}
            >
              <input 
                id="file-upload-input"
                type="file" 
                multiple 
                accept="image/*"
                onChange={handleFileChange}
                style={{ display: 'none' }}
              />
              <ImageIcon className="icon-upload" size={40} />
              <p>將您的活動照片拖曳至此處，或點擊進行上傳</p>
              <p className="small-text">支援 PNG, JPG, WEBP 格式 (建議 3-10 張，多選後可拖曳排序)</p>
            </div>

            {/* 照片預覽 */}
            {images.length > 0 && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.8rem' }}>
                  <span style={{ fontSize: '0.9rem', fontWeight: 'bold', color: 'var(--text-secondary)' }}>
                    已上傳照片 ({images.length} 張，可拖曳左右照片調整順序)：
                  </span>
                  <button 
                    onClick={() => setImages([])} 
                    style={{ fontSize: '0.8rem', color: '#ef4444', fontWeight: 'bold' }}
                  >
                    全部清除
                  </button>
                </div>
                
                <div className="photo-preview-grid">
                  {images.map((file, idx) => (
                    <div 
                      key={`${file.name}-${idx}`} 
                      className="photo-preview-card"
                      draggable
                      onDragStart={(e) => handlePhotoDragStart(e, idx)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => handlePhotoDrop(e, idx)}
                    >
                      <img src={URL.createObjectURL(file)} alt="預覽" />
                      <button 
                        className="btn-delete-photo" 
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeletePhoto(idx);
                        }}
                        title="刪除"
                      >
                        ✕
                      </button>
                      <div className="photo-badge">{idx + 1}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <h3 style={{ marginTop: '2rem' }}>✍️ Step 3: 活動主題說明 (可選)</h3>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '2rem' }}>
              <div className="scene-input-group">
                <label style={{ fontSize: '0.85rem', fontWeight: 'bold' }}>活動名稱/標題</label>
                <input 
                  type="text" 
                  value={title} 
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="例如：石門國小三甲 micro:bit 創意實作課"
                  className="input-text"
                />
              </div>

              <div className="scene-input-group">
                <label style={{ fontSize: '0.85rem', fontWeight: 'bold' }}>活動詳細描述 (讓系統寫出更精準的腳本)</label>
                <textarea 
                  value={description} 
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="例如：小朋友第一次使用 micro:bit 編寫光感應警報器，從一開始的接線排錯，到最後成功發光發聲的開心過程。"
                  className="textarea-subtitle"
                  style={{ minHeight: '80px' }}
                />
              </div>
            </div>

            {/* 分析按鈕 */}
            <button 
              className="btn-primary" 
              style={{ width: '100%', justifyContent: 'center', padding: '0.9rem' }}
              onClick={handleGenerateScript}
              disabled={isLoading || images.length === 0}
            >
              {isLoading ? (
                <>
                  <div className="spinner" style={{ width: '20px', height: '20px', borderWidth: '3px', margin: '0 8px 0 0' }}></div>
                  系統正在分析照片內容並撰寫影片腳本...
                </>
              ) : (
                <>
                  <Sparkles size={18} />
                  開始分析照片並產生影片
                </>
              )}
            </button>
          </div>

          {/* 右側：成果預覽與匯出區 */}
          <div className="panel-card" id="video-preview-section">
            <h3>🎬 Step 4: 成果預覽與影片編輯</h3>
            
            {isLoading && (
              <div className="loading-box">
                <div className="spinner"></div>
                <h4>📷 系統正在運用視覺技術識別照片...</h4>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
                  我們正在運用多模態視覺技術分析照片，辨識其中的場景、人物動作及故事主線，並為每一幕生成適合的旁白配音與字幕。請耐心等候！
                </p>
              </div>
            )}

            {!isLoading && !videoScript && (
              <div className="loading-box" style={{ backgroundColor: 'var(--bg-primary)', borderStyle: 'dashed' }}>
                <Film size={48} style={{ color: 'var(--text-muted)', marginBottom: '1rem' }} />
                <h4>等待影片腳本生成</h4>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', maxWidth: '320px', margin: '0.5rem auto 0' }}>
                  請在上傳完照片並填妥活動主題後，點擊「開始分析照片」按鈕，您的影片成果將會在此處生成預覽。
                </p>
              </div>
            )}

            {!isLoading && videoScript && (
              <div className="fade-in">
                {/* 顯示產生的影片標題與副標題 */}
                <div style={{ marginBottom: '1.5rem', padding: '1rem', backgroundColor: 'var(--primary-light)', borderRadius: '12px', borderLeft: '4px solid var(--primary)' }}>
                  <h4 style={{ fontSize: '1.1rem', fontWeight: 'bold', color: 'var(--primary-hover)' }}>
                    ✨ 智慧生成影片主題：
                  </h4>
                  <p style={{ fontWeight: '800', fontSize: '1.25rem', marginTop: '0.2rem' }}>{videoScript.title}</p>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{videoScript.subtitle}</p>
                </div>

                {/* 影片播放器主體 */}
                <VideoPlayer 
                  images={images} 
                  script={videoScript} 
                  onUpdateScript={setVideoScript}
                />
              </div>
            )}
          </div>
        </div>
      </main>

      {/* 頁尾 */}
      <Footer />
    </div>
  );
}
