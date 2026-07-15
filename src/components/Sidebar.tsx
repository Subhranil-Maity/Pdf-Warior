import { DndContext, closestCenter, DragEndEvent, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useStore } from '../store';
import { PageThumbnail } from './PageThumbnail';
import styles from '../styles/Sidebar.module.css';

export function Sidebar() {
  const sourceFiles = useStore(s => s.sourceFiles);
  const pages = useStore(s => s.pages);
  const toggleAllForFile = useStore(s => s.toggleAllForFile);
  const reorderPages = useStore(s => s.reorderPages);
  const setContextMenu = useStore(s => s.setContextMenu);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  );

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
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
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
    </aside>
  );
}
