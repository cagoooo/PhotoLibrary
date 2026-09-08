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
          Made with ❤️ by <a href="https://www.smes.tyc.edu.tw/modules/school/index.php?department_id=2&zone_id=0&page_id=2&content_id=11&type=news&from_op=all_news#a5" target="_blank" rel="noopener noreferrer">阿凱老師</a>
        </p>
      </div>
    </footer>
  );
}
