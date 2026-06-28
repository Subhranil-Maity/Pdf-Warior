import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { PageRef, useStore } from '../store';
import styles from '../styles/PageThumbnail.module.css';

interface Props {
  page: PageRef;
  index: number;
}

export function PageThumbnail({ page, index }: Props) {
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

  return (
    <div
      ref={setNodeRef}
      className={`${styles.thumb} ${isSelected ? styles.selected : ''} ${!page.included ? styles.excluded : ''}`}
      onClick={() => selectPage(page.id)}
      style={style}
      {...listeners}
      {...attributes}
    >
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
      <div className={styles.imageContainer}>
        {page.thumbnailUrl ? (
          <img className={styles.image} src={page.thumbnailUrl} alt={`Page ${index + 1}`} draggable={false} />
        ) : (
          <div className={styles.skeleton} />
        )}
      </div>
      <span className={styles.pageNum}>{index + 1}</span>
      {!page.included && <div className={styles.skipBadge}>SKIP</div>}
    </div>
  );
}
