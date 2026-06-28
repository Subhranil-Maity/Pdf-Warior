import { useEffect, useState, useRef } from 'react';
import { useStore, PageRef } from '../store';
import { renderPageToObjectUrl } from '../pdfRenderer';
import { open } from '@tauri-apps/plugin-dialog';
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
  const openFiles = useStore(s => s.openFiles);
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

  const handleOpen = async () => {
    const selected = await open({
      multiple: true,
      filters: [{ name: 'PDF', extensions: ['pdf'] }]
    });
    if (selected) {
      const paths = Array.isArray(selected) ? selected : [selected];
      openFiles(paths);
    }
  };

  if (includedPages.length === 0) {
    return (
      <div className={styles.container} tabIndex={0} ref={containerRef}>
        <div className={styles.emptyState} onClick={handleOpen} style={{ cursor: 'pointer' }}>
          <svg
            width="48"
            height="48"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ marginBottom: '16px', color: 'rgba(74, 144, 217, 0.6)' }}
          >
            <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
            <polyline points="14 2 14 8 20 8" />
            <path d="M12 18v-6" />
            <polyline points="9 15 12 12 15 15" />
          </svg>
          <div>No pages included.</div>
          <div style={{ fontSize: '12px', marginTop: '8px', color: 'rgba(255, 255, 255, 0.3)' }}>
            Drag & drop PDF files here, or click to browse
          </div>
        </div>
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
