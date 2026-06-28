import { useEffect } from 'react';
import { Toolbar } from './components/Toolbar';
import { Sidebar } from './components/Sidebar';
import { MainPreview } from './components/MainPreview';
import { ContextMenu } from './components/ContextMenu';
import { DragDropOverlay } from './components/DragDropOverlay';
import { listenToMergeProgress, listenToMergeComplete, listenToMergeError } from './ipc';
import { useStore } from './store';
import { getCurrentWindow } from '@tauri-apps/api/window';
import './styles/global.css';

export default function App() {
  const setIsProcessing = useStore(s => s.setIsProcessing);
  const setProcessingProgress = useStore(s => s.setProcessingProgress);
  const undo = useStore(s => s.undo);
  const redo = useStore(s => s.redo);
  const save = useStore(s => s.save);
  const pages = useStore(s => s.pages);
  const sourceFiles = useStore(s => s.sourceFiles);
  const setContextMenu = useStore(s => s.setContextMenu);

  useEffect(() => {
    const unlistenProgress = listenToMergeProgress((done, total) => {
      setProcessingProgress(done / total);
    });

    const unlistenComplete = listenToMergeComplete((outPath) => {
      setIsProcessing(false);
      alert(`Saved to ${outPath}`);
    });

    const unlistenError = listenToMergeError((message) => {
      setIsProcessing(false);
      alert(`Error saving: ${message}`);
    });

    return () => {
      unlistenProgress.then(f => f());
      unlistenComplete.then(f => f());
      unlistenError.then(f => f());
    };
  }, [setIsProcessing, setProcessingProgress]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        if (e.shiftKey) {
          e.preventDefault();
          redo();
        } else {
          e.preventDefault();
          undo();
        }
      }
      
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'o') {
        e.preventDefault();
        const btns = Array.from(document.querySelectorAll('button'));
        const openBtn = btns.find(b => b.textContent?.includes('Add PDF'));
        if (openBtn) openBtn.click();
      }
      
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        save();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo, save]);

  useEffect(() => {
    const appWindow = getCurrentWindow();
    appWindow.setTitle(`PDF Editor — ${sourceFiles.length} files, ${pages.length} pages`);
  }, [sourceFiles.length, pages.length]);

  useEffect(() => {
    const handleClose = () => setContextMenu(null);
    window.addEventListener('click', handleClose);
    return () => window.removeEventListener('click', handleClose);
  }, [setContextMenu]);

  return (
    <>
      <Toolbar />
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <Sidebar />
        <MainPreview />
      </div>
      <ContextMenu />
      <DragDropOverlay />
    </>
  );
}
