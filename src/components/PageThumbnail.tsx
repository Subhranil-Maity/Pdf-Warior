import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { PageRef, useStore } from '../store';
import styles from '../styles/PageThumbnail.module.css';

interface Props {
  page: PageRef;
  index: number;
  onContextMenu: (e: React.MouseEvent) => void;
}

export function PageThumbnail({ page, index, onContextMenu }: Props) {
  const sourceFiles = useStore(s => s.sourceFiles);
  const selectedPageId = useStore(s => s.selectedPageId);
  const togglePageIncluded = useStore(s => s.togglePageIncluded);
  const selectPage = useStore(s => s.selectPage);

  const sourceColor = sourceFiles.find(sf => sf.path === page.sourceFile)?.color || '#000';

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: page.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    borderColor: sourceColor,
    zIndex: isDragging ? 100 : 1,
  };

  const isSelected = selectedPageId === page.id;

  const width = page.width || 3;
  const height = page.height || 4;
  const isPortrait = (page.rotation === 0 || page.rotation === 180)
    ? (width <= height)
    : (width > height);

  const containerStyle = {
    aspectRatio: isPortrait ? '1 / 1.4142' : '1.4142 / 1',
  };

  const transformStyle = {
    transform: `rotate(${page.rotation || 0}deg) scaleX(${page.flipHorizontal ? -1 : 1}) scaleY(${page.flipVertical ? -1 : 1})`,
    transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
  };

  return (
    <div
      ref={setNodeRef}
      className={`${styles.thumb} ${isSelected ? styles.selected : ''} ${!page.included ? styles.excluded : ''}`}
      onClick={() => selectPage(page.id)}
      onContextMenu={onContextMenu}
      style={style}
      {...listeners}
      {...attributes}
    >
      <div className={styles.leftSection}>
        <input
          className={styles.checkbox}
          type="checkbox"
          checked={page.included}
          onChange={(e) => {
            e.stopPropagation();
            togglePageIncluded(page.id);
          }}
          onClick={(e) => e.stopPropagation()}
        />
        <span className={styles.pageNum}>{index + 1}</span>
      </div>
      <div className={styles.imageContainer} style={containerStyle}>
        {page.thumbnailUrl ? (
          <img 
            className={styles.image} 
            src={page.thumbnailUrl} 
            alt={`Page ${index + 1}`} 
            draggable={false} 
            style={transformStyle}
          />
        ) : (
          <div className={styles.skeleton} />
        )}
      </div>
      {!page.included && <div className={styles.skipBadge}>SKIP</div>}
    </div>
  );
}
