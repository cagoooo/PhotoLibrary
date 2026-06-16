import React, { useEffect, useState } from 'react';
import { Sun, Moon } from 'lucide-react';

// 預設一律為淺色模式 (Light Theme First)，不使用 'system' 預設
const DEFAULT_THEME = 'light';

export default function ThemeToggle() {
  const [theme, setTheme] = useState(() => {
    // 優先從 localStorage 取得使用者偏好
    const savedTheme = localStorage.getItem('theme-pref');
    return savedTheme || DEFAULT_THEME;
  });

  useEffect(() => {
    // 套用主題至 HTML 元素
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme-pref', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => (prev === 'light' ? 'dark' : 'light'));
  };

  return (
    <button 
      onClick={toggleTheme} 
      className="theme-toggle-btn"
      title={theme === 'light' ? '切換至暗色模式' : '切換至亮色模式'}
      aria-label="主題切換"
    >
      {theme === 'light' ? (
        <Moon size={20} className="icon-theme" />
      ) : (
        <Sun size={20} className="icon-theme" />
      )}
      <span className="theme-text">
        {theme === 'light' ? '暗色模式' : '亮色模式'}
      </span>
    </button>
  );
}
