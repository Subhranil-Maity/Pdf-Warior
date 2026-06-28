import { useEffect, useState, useRef } from 'react';
import { useStore, PageRef } from '../store';
import { renderPageToObjectUrl } from '../pdfRenderer';
import styles from '../styles/MainPreview.module.css';

function PreviewPage({ page }: { page: PageRef }) {
  const [imgUrl, setImgUrl] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    let currentUrl: string | null = null;
    
    renderPageToObjectUrl(page.sourceFile, page.sourcePageIndex, 1200)
      .then(res => {
        if (isMounted) {
          currentUrl = res.url;
          setImgUrl(res.url);
        } else {
          URL.revokeObjectURL(res.url);
        }
      })
      .catch(err => {
        console.error("Preview render failed", err);
      });

    return () => {
      isMounted = false;
      if (currentUrl) URL.revokeObjectURL(currentUrl);
    };
  }, [page.sourceFile, page.sourcePageIndex]);

  if (!imgUrl) {
    return <div className={styles.loadingPage}>Loading preview...</div>;
  }

  const transformStyle = {
    transform: `rotate(${page.rotation || 0}deg) scaleX(${page.flipHorizontal ? -1 : 1}) scaleY(${page.flipVertical ? -1 : 1})`,
    transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
  };

  return <img className={styles.image} src={imgUrl} alt="Preview" style={transformStyle} />;
}

export function MainPreview() {
  const pages = useStore(s => s.pages);
  const selectedPageId = useStore(s => s.selectedPageId);
  const setContextMenu = useStore(s => s.setContextMenu);
  const containerRef = useRef<HTMLDivElement>(null);

  const includedPages = pages.filter(p => p.included);

  useEffect(() => {
    if (selectedPageId) {
      const el = document.getElementById(`preview-page-${selectedPageId}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [selectedPageId]);

  if (includedPages.length === 0) {
    return (
      <div className={styles.container} tabIndex={0} ref={containerRef}>
        <div className={styles.emptyState}>No pages included. Open a PDF or select pages to begin.</div>
      </div>
    );
  }

  return (
    <div className={styles.container} tabIndex={0} ref={containerRef}>
      <div className={styles.pageList}>
        {includedPages.map((page, index) => (
          <div 
            key={page.id} 
            id={`preview-page-${page.id}`} 
            className={styles.pageWrapper}
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setContextMenu({
                x: e.clientX,
                y: e.clientY,
                type: 'page',
                filePath: page.sourceFile,
                pageId: page.id,
                pageIndex: page.sourcePageIndex
              });
            }}
          >
            <PreviewPage page={page} />
            <div className={styles.pageLabel}>Output Page {index + 1}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
