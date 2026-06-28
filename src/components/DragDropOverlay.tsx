import { useEffect, useState } from 'react';
import { useStore } from '../store';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import styles from '../styles/DragDropOverlay.module.css';

export function DragDropOverlay() {
  const [isDragging, setIsDragging] = useState(false);
  const openFiles = useStore((s) => s.openFiles);

  useEffect(() => {
    const webview = getCurrentWebview();
    const promise = webview.onDragDropEvent((event) => {
      const payload = event.payload;
      if (payload.type === 'enter') {
        setIsDragging(true);
      } else if (payload.type === 'leave') {
        setIsDragging(false);
      } else if (payload.type === 'drop') {
        setIsDragging(false);
        const pdfPaths = payload.paths.filter((p) =>
          p.toLowerCase().endsWith('.pdf')
        );
        if (pdfPaths.length > 0) {
          openFiles(pdfPaths);
        }
      }
    });

    return () => {
      promise.then((unlisten) => unlisten());
    };
  }, [openFiles]);

  return (
    <div className={`${styles.overlay} ${isDragging ? styles.visible : ''}`}>
      <div className={styles.box}>
        <svg
          className={styles.icon}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
          <polyline points="14 2 14 8 20 8" />
          <path d="M9 15h6" />
          <path d="M12 12v6" />
        </svg>
        <div className={styles.title}>Drop to Load PDFs</div>
        <div className={styles.subtitle}>
          Release your PDF files to import them into the workspace
        </div>
      </div>
    </div>
  );
}
