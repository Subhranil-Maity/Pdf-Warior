import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store';
import styles from '../styles/Sidebar.module.css';

export function ContextMenu() {
  const contextMenu = useStore(s => s.contextMenu);
  const setContextMenu = useStore(s => s.setContextMenu);
  const toggleAllForFile = useStore(s => s.toggleAllForFile);
  const removeFileGroup = useStore(s => s.removeFileGroup);
  const togglePageIncluded = useStore(s => s.togglePageIncluded);
  const rotatePage = useStore(s => s.rotatePage);
  const flipPage = useStore(s => s.flipPage);
  const savePageIndividually = useStore(s => s.savePageIndividually);

  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (!contextMenu) {
      setIsVisible(false);
      return;
    }

    // Set initial layout-approximate position immediately to avoid flashing
    const approxWidth = contextMenu.type === 'page' ? 220 : 180;
    const approxHeight = contextMenu.type === 'page' ? 360 : 120;
    let initialX = contextMenu.x;
    let initialY = contextMenu.y;

    if (initialX + approxWidth > window.innerWidth) {
      initialX = Math.max(8, window.innerWidth - approxWidth - 8);
    }
    if (initialY + approxHeight > window.innerHeight) {
      initialY = Math.max(8, window.innerHeight - approxHeight - 8);
    }

    setPosition({ x: initialX, y: initialY });
    setIsVisible(true);

    // Measure precisely once mounted
    const timer = requestAnimationFrame(() => {
      if (menuRef.current) {
        const rect = menuRef.current.getBoundingClientRect();
        let preciseX = contextMenu.x;
        let preciseY = contextMenu.y;

        if (preciseX + rect.width > window.innerWidth) {
          preciseX = window.innerWidth - rect.width - 8;
        }
        if (preciseX < 8) preciseX = 8;

        if (preciseY + rect.height > window.innerHeight) {
          preciseY = window.innerHeight - rect.height - 8;
        }
        if (preciseY < 8) preciseY = 8;

        setPosition({ x: preciseX, y: preciseY });
      }
    });

    return () => cancelAnimationFrame(timer);
  }, [contextMenu]);

  if (!contextMenu || !isVisible) return null;

  function basename(path: string) {
    return path.split(/[\\/]/).pop() || path;
  }

  return (
    <div
      ref={menuRef}
      className={styles.contextMenu}
      style={{ top: `${position.y}px`, left: `${position.x}px` }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className={styles.contextHeader} title={contextMenu.filePath}>
        {basename(contextMenu.filePath)}
      </div>
      <div className={styles.contextDivider} />

      {contextMenu.type === 'group' ? (
        <>
          <button
            className={styles.contextItem}
            onClick={() => {
              toggleAllForFile(contextMenu.filePath);
              setContextMenu(null);
            }}
          >
            👁️ Toggle All Pages
          </button>
          <button
            className={`${styles.contextItem} ${styles.dangerItem}`}
            onClick={() => {
              removeFileGroup(contextMenu.filePath);
              setContextMenu(null);
            }}
          >
            🗑️ Remove PDF Group
          </button>
        </>
      ) : (
        <>
          {contextMenu.pageId && (
            <>
              <button
                className={styles.contextItem}
                onClick={() => {
                  if (contextMenu.pageId) togglePageIncluded(contextMenu.pageId);
                  setContextMenu(null);
                }}
              >
                📄 Toggle This Page
              </button>
              
              <div className={styles.contextDivider} />
              
              <button
                className={styles.contextItem}
                onClick={() => {
                  if (contextMenu.pageId) rotatePage(contextMenu.pageId, 'left');
                  setContextMenu(null);
                }}
              >
                🔄 Rotate Left
              </button>

              <button
                className={styles.contextItem}
                onClick={() => {
                  if (contextMenu.pageId) rotatePage(contextMenu.pageId, 'right');
                  setContextMenu(null);
                }}
              >
                🔄 Rotate Right
              </button>

              <button
                className={styles.contextItem}
                onClick={() => {
                  if (contextMenu.pageId) flipPage(contextMenu.pageId, 'long');
                  setContextMenu(null);
                }}
              >
                ↔️ Flip Long Side
              </button>

              <button
                className={styles.contextItem}
                onClick={() => {
                  if (contextMenu.pageId) flipPage(contextMenu.pageId, 'short');
                  setContextMenu(null);
                }}
              >
                ↕️ Flip Short Side
              </button>

              <div className={styles.contextDivider} />

              <button
                className={styles.contextItem}
                onClick={() => {
                  if (contextMenu.pageId) savePageIndividually(contextMenu.pageId);
                  setContextMenu(null);
                }}
              >
                💾 Save Page Individually
              </button>

              <div className={styles.contextDivider} />
              <div className={styles.contextDetail}>
                Source Page Index: {contextMenu.pageIndex! + 1}
              </div>
            </>
          )}
        </>
      )}

      <div className={styles.contextDivider} />
      <div className={styles.contextDetail} title={contextMenu.filePath}>
        Path: {contextMenu.filePath}
      </div>
    </div>
  );
}
