import { DndContext, closestCenter, DragEndEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { open } from '@tauri-apps/plugin-dialog';
import { useStore } from '../store';
import { PageThumbnail } from './PageThumbnail';
import styles from '../styles/Sidebar.module.css';

export function Sidebar() {
  const sourceFiles = useStore(s => s.sourceFiles);
  const pages = useStore(s => s.pages);
  const openFiles = useStore(s => s.openFiles);
  const toggleAllForFile = useStore(s => s.toggleAllForFile);
  const reorderPages = useStore(s => s.reorderPages);

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
      <button className={styles.addButton} onClick={handleOpen}>+ Add PDF</button>

      {sourceFiles.map(sf => (
        <div key={sf.path} className={styles.fileGroup} style={{ borderColor: sf.color }}>
          <span className={styles.fileName} title={sf.path}>{basename(sf.path)}</span>
          <button className={styles.toggleAllBtn} onClick={() => toggleAllForFile(sf.path)}>all / none</button>
        </div>
      ))}

      <div className={styles.pagesContainer}>
        <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={pages.map(p => p.id)} strategy={verticalListSortingStrategy}>
            {pages.map((page, i) => (
              <PageThumbnail key={page.id} page={page} index={i} />
            ))}
          </SortableContext>
        </DndContext>
      </div>
    </aside>
  );
}
