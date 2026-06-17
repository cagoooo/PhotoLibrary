import React from 'react';

export default function Footer() {
  const currentYear = new Date().getFullYear();
  
  return (
    <footer className="app-footer">
      <div className="footer-content">
        <p>
          &copy; {currentYear} Smart Photo Video Generator. All Rights Reserved.
        </p>
        <p className="author-credit">
          Made with ❤️ by <a href="https://www.smes.tyc.edu.tw/modules/tadnews/page.php?ncsn=11&nsn=16#a5" target="_blank" rel="noopener noreferrer">阿凱老師</a>
        </p>
      </div>
    </footer>
  );
}
