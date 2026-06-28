import { open } from '@tauri-apps/plugin-dialog';
import { useStore } from '../store';
import styles from '../styles/Toolbar.module.css';

export function Toolbar() {
  const openFiles = useStore(s => s.openFiles);
  const undo = useStore(s => s.undo);
  const redo = useStore(s => s.redo);
  const save = useStore(s => s.save);
  const pages = useStore(s => s.pages);
  const isProcessing = useStore(s => s.isProcessing);
  const processingProgress = useStore(s => s.processingProgress);
  const historyIndex = useStore(s => s.historyIndex);
  const history = useStore(s => s.history);

  const canUndo = historyIndex > 0;
  const canRedo = historyIndex + 1 < history.length;
  const canSave = pages.some(p => p.included);

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

  return (
    <div className={styles.toolbar}>
      <button className={styles.button} onClick={handleOpen} disabled={isProcessing}>+ Add PDF</button>
      <div className={styles.divider} />
      <button className={styles.button} onClick={undo} disabled={!canUndo || isProcessing}>Undo</button>
      <button className={styles.button} onClick={redo} disabled={!canRedo || isProcessing}>Redo</button>
      
      <div className={styles.saveGroup}>
        {isProcessing && (
          <div className={styles.progressContainer}>
            <span>Saving...</span>
            <div className={styles.progressBar}>
              <div className={styles.progressFill} style={{ width: `${processingProgress * 100}%` }} />
            </div>
          </div>
        )}
        <button className={styles.saveButton} onClick={save} disabled={!canSave || isProcessing}>Save →</button>
      </div>
    </div>
  );
}
