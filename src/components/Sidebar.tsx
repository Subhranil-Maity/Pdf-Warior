import { useState, useEffect } from 'react';
import { DndContext, closestCenter, DragEndEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useStore } from '../store';
import { PageThumbnail } from './PageThumbnail';
import styles from '../styles/Sidebar.module.css';

interface ContextMenuState {
  x: number;
  y: number;
  type: 'group' | 'page';
  filePath: string;
  pageId?: string;
  pageIndex?: number;
}

export function Sidebar() {
  const sourceFiles = useStore(s => s.sourceFiles);
  const pages = useStore(s => s.pages);
  const toggleAllForFile = useStore(s => s.toggleAllForFile);
  const reorderPages = useStore(s => s.reorderPages);
  const removeFileGroup = useStore(s => s.removeFileGroup);
  const togglePageIncluded = useStore(s => s.togglePageIncluded);

  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  useEffect(() => {
    const handleClose = () => setContextMenu(null);
    window.addEventListener('click', handleClose);
    return () => window.removeEventListener('click', handleClose);
  }, []);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (active.id !== over?.id) {
      const oldIndex = pages.findIndex((p) => p.id === active.id);
      const newIndex = pages.findIndex((p) => p.id === over?.id);
      reorderPages(oldIndex, newIndex);
    }
  };

  function basename(path: string) {
    return path.split(/[\\/]/).pop() || path;
  }

  return (
    <aside className={styles.sidebar}>
      <div className={styles.sidebarTitle}>PDF Groups</div>
      
      {sourceFiles.length === 0 ? (
        <div className={styles.emptySidebar}>No PDFs loaded. Click "+ Add PDF" above to start.</div>
      ) : (
        sourceFiles.map(sf => (
          <div
            key={sf.path}
            className={styles.fileGroup}
            style={{ borderColor: sf.color }}
            onContextMenu={(e) => {
              e.preventDefault();
              setContextMenu({
                x: e.clientX,
                y: e.clientY,
                type: 'group',
                filePath: sf.path
              });
            }}
          >
            <span className={styles.fileName} title={sf.path}>{basename(sf.path)}</span>
            <button className={styles.toggleAllBtn} onClick={(e) => {
              e.stopPropagation();
              toggleAllForFile(sf.path);
            }}>all / none</button>
          </div>
        ))
      )}

      {pages.length > 0 && (
        <div className={styles.pagesContainer}>
          <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={pages.map(p => p.id)} strategy={verticalListSortingStrategy}>
              {pages.map((page, i) => (
                <PageThumbnail
                  key={page.id}
                  page={page}
                  index={i}
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
                />
              ))}
            </SortableContext>
          </DndContext>
        </div>
      )}

      {contextMenu && (
        <div
          className={styles.contextMenu}
          style={{ top: `${contextMenu.y}px`, left: `${contextMenu.x}px` }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className={styles.contextHeader} title={contextMenu.filePath}>
            {basename(contextMenu.filePath)}
          </div>
          <div className={styles.contextDivider} />
          
          <button
            className={`${styles.contextItem} ${styles.dangerItem}`}
            onClick={() => {
              removeFileGroup(contextMenu.filePath);
              setContextMenu(null);
            }}
          >
            🗑️ Remove PDF Group
          </button>
          
          <button
            className={styles.contextItem}
            onClick={() => {
              toggleAllForFile(contextMenu.filePath);
              setContextMenu(null);
            }}
          >
            👁️ Toggle All Pages
          </button>
          
          {contextMenu.type === 'page' && contextMenu.pageId && (
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
              <div className={styles.contextDetail}>
                Source Page Index: {contextMenu.pageIndex! + 1}
              </div>
            </>
          )}
          
          <div className={styles.contextDivider} />
          <div className={styles.contextDetail} title={contextMenu.filePath}>
            Path: {contextMenu.filePath}
          </div>
        </div>
      )}
    </aside>
  );
}
