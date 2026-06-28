import { useEffect, useState, useRef } from 'react';
import { useStore } from '../store';
import { renderPageToObjectUrl } from '../pdfRenderer';
import styles from '../styles/MainPreview.module.css';

export function MainPreview() {
  const selectedPageId = useStore(s => s.selectedPageId);
  const pages = useStore(s => s.pages);
  const selectPage = useStore(s => s.selectPage);
  
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedPage = pages.find(p => p.id === selectedPageId);
  const selectedIndex = pages.findIndex(p => p.id === selectedPageId);

  useEffect(() => {
    if (!selectedPage) {
      setImgUrl(null);
      return;
    }

    let isMounted = true;
    setLoading(true);
    
    // We revoke the PREVIOUS url right away or wait till the new one is ready?
    // Let's just create a new one.
    
    renderPageToObjectUrl(selectedPage.sourceFile, selectedPage.sourcePageIndex, 1200)
      .then(url => {
        if (isMounted) {
          setImgUrl(prev => {
            if (prev) URL.revokeObjectURL(prev);
            return url;
          });
          setLoading(false);
        } else {
          URL.revokeObjectURL(url);
        }
      })
      .catch(err => {
        console.error("Preview render failed", err);
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [selectedPage?.sourceFile, selectedPage?.sourcePageIndex]);

  useEffect(() => {
    containerRef.current?.focus();
  }, [selectedPageId]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (pages.length === 0) return;
    
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      const next = (selectedIndex + 1) % pages.length;
      selectPage(pages[next].id);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      const prev = (selectedIndex - 1 + pages.length) % pages.length;
      selectPage(pages[prev].id);
    }
  };

  if (!selectedPage) {
    return (
      <div className={styles.container} tabIndex={0} ref={containerRef}>
        <div className={styles.emptyState}>Open a PDF to get started</div>
      </div>
    );
  }

  return (
    <div 
      className={styles.container} 
      tabIndex={0} 
      ref={containerRef}
      onKeyDown={handleKeyDown}
    >
      {loading ? (
        <div className={styles.loading}>Loading preview...</div>
      ) : imgUrl ? (
        <img className={styles.image} src={imgUrl} alt="Preview" />
      ) : (
        <div className={styles.emptyState}>Failed to render</div>
      )}
    </div>
  );
}
