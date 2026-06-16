import React from 'react';

export default function Footer() {
  const currentYear = new Date().getFullYear();
  
  return (
    <footer className="app-footer">
      <div className="footer-content">
        <p>
          &copy; {currentYear} AI Photo Video Generator. All Rights Reserved.
        </p>
        <p className="author-credit">
          Made with ❤️ by <a href="https://mail.smes.tyc.edu.tw/~ipad/" target="_blank" rel="noopener noreferrer">阿凱老師</a>
        </p>
      </div>
    </footer>
  );
}
