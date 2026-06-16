import React from 'react';
import { X, BookOpen, Check } from 'lucide-react';

export default function OnboardingDialog({ isOpen, onClose }) {
  if (!isOpen) return null;

  const steps = [
    {
      num: "1",
      emoji: "🔑",
      title: "配置金鑰",
      color: "var(--pirls-peach)",
      desc: "在右上方設定您的 Gemini API Key。金鑰只會儲存在您的瀏覽器中，安全有保障！"
    },
    {
      num: "2",
      emoji: "📸",
      title: "上傳活動照片",
      color: "var(--pirls-sage)",
      desc: "批次拖放或點擊上傳多張活動照片。您可以拖曳卡片來為照片重新排序，完美呈現時間軸。"
    },
    {
      num: "3",
      emoji: "✍️",
      title: "輸入活動標題",
      color: "var(--pirls-sky)",
      desc: "提供這次活動的標題與簡短說明（例如：三年級資訊課 micro:bit 體驗），讓 AI 能更準確掌握主題。"
    },
    {
      num: "4",
      emoji: "🤖",
      title: "AI 偵測與分析",
      color: "var(--pirls-lemon)",
      desc: "點擊「開始分析」，Gemini 視覺技術會自動偵測照片內容，並為您量身寫好精彩的旁白與字幕。"
    },
    {
      num: "5",
      emoji: "🎬",
      title: "編輯、播放與下載",
      color: "var(--pirls-rose)",
      desc: "預覽影片播放效果，自由編輯字幕與旁白，最後點擊「匯出影片」即可下載包含背景音樂的專屬成果片！"
    }
  ];

  return (
    <div className="onboarding-overlay" onClick={onClose}>
      <div className="onboarding-content" onClick={e => e.stopPropagation()}>
        <header className="onboarding-header">
          <div className="title-wrapper">
            <BookOpen className="icon-header" />
            <h2>📖 快速上手指南</h2>
          </div>
          <button className="btn-close" onClick={onClose} aria-label="關閉">
            <X size={20} />
          </button>
        </header>

        <div className="onboarding-body">
          <p className="onboarding-intro">
            歡迎使用！這款工具能讓您上傳照片，並透過 Gemini 的多模態視覺辨識，自動編寫故事腳本並剪輯成專業的成果影片。
          </p>

          <div className="onboarding-steps">
            {steps.map((step) => (
              <div 
                key={step.num} 
                className="onboarding-step-card" 
                style={{ '--step-color': step.color }}
              >
                <div className="step-num-badge">Step {step.num}</div>
                <div className="step-icon-circle">{step.emoji}</div>
                <div className="step-text-wrapper">
                  <h3>{step.title}</h3>
                  <p>{step.desc}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="onboarding-tips">
            <h4>💡 老師貼心小提示：</h4>
            <ul>
              <li><strong>照片解析度：</strong> 圖片過大會被自動壓縮以加快 API 回傳速度，建議單次上傳 3 到 10 張最為合適。</li>
              <li><strong>旁白配音：</strong> 預覽時瀏覽器會用語音合成唸出旁白，您可以調整是否開啟。</li>
              <li><strong>影片下載：</strong> 匯出下載需要花費與影片等長的時間進行實時錄製，請耐心等候！</li>
            </ul>
          </div>
        </div>

        <footer className="onboarding-footer">
          <span className="footer-note">如有使用上的問題或意見反饋，歡迎聯繫阿凱老師！</span>
          <button className="btn-confirm" onClick={onClose}>
            <Check size={16} style={{ marginRight: '6px' }} />
            我知道了
          </button>
        </footer>
      </div>
    </div>
  );
}
