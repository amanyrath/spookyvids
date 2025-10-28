import React, { useState, useEffect } from 'react';
import ImportArea from './components/ImportArea';
import PreviewPlayer from './components/PreviewPlayer';
import Timeline from './components/Timeline';

// Declare global window type for electronAPI
declare global {
  interface Window {
    electronAPI: {
      openFileDialog: () => Promise<string[]>;
      sendFilePath: (filePath: string) => Promise<any>;
      getFilePath: (file: File) => string;
      onFileValidated: (callback: (event: any, data: any) => void) => (() => void);
      onFileError: (callback: (event: any, error: any) => void) => (() => void);
      exportVideo: (data: { inTime: number; outTime: number; outputPath?: string }) => Promise<any>;
      onExportProgress: (callback: (event: any, data: any) => void) => (() => void);
      onExportComplete: (callback: (event: any, data: any) => void) => (() => void);
      onExportError: (callback: (event: any, data: any) => void) => (() => void);
    };
  }
}

function App() {
  const [currentFile, setCurrentFile] = useState<string | null>(null);
  const [fileMetadata, setFileMetadata] = useState<any>(null);
  const [inTime, setInTime] = useState<number>(0);
  const [outTime, setOutTime] = useState<number>(0);
  const [playheadTime, setPlayheadTime] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  
  // Undo/Redo history for trimming
  const [history, setHistory] = useState<Array<{ inTime: number; outTime: number; playheadTime: number }>>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [exportProgress, setExportProgress] = useState<number>(0);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportSuccess, setExportSuccess] = useState<string | null>(null);

  const handleFileLoaded = (filePath: string, fileName: string, metadata?: any) => {
    console.log('File loaded in App:', filePath, fileName, metadata);
    setCurrentFile(filePath);
    setFileMetadata(metadata);
    // Initialize trim times when file is loaded
    if (metadata?.duration) {
      setInTime(0);
      setOutTime(metadata.duration);
      setPlayheadTime(0);
    }
  };

  const handleClipSelect = (filePath: string, metadata?: any) => {
    console.log('Clip selected:', filePath);
    setCurrentFile(filePath);
    setFileMetadata(metadata);
    // Reset trim times when switching clips
    if (metadata?.duration) {
      setInTime(0);
      setOutTime(metadata.duration);
      setPlayheadTime(0);
    }
  };
  
  const handleTimeUpdate = (inTime: number, outTime: number, playheadTime: number, skipHistory?: boolean) => {
    setInTime(inTime);
    setOutTime(outTime);
    setPlayheadTime(playheadTime);
    
    // Add to history for undo/redo (unless skipHistory is true)
    if (!skipHistory) {
      const newState = { inTime, outTime, playheadTime };
      setHistory(prev => {
        // Remove any history after current index (if we're in the middle of history)
        const newHistory = prev.slice(0, historyIndex + 1);
        // Add new state
        const updatedHistory = [...newHistory, newState];
        // Keep only last 50 states
        return updatedHistory.slice(-50);
      });
      setHistoryIndex(prev => prev + 1);
    }
  };

  const handleImportVideo = async () => {
    if (!window.electronAPI) {
      console.error('electronAPI not available');
      return;
    }

    try {
      const filePaths = await window.electronAPI.openFileDialog();
      
      if (filePaths && filePaths.length > 0) {
        console.log('Files selected:', filePaths);
        
        // Process each file
        for (const filePath of filePaths) {
          const result = await window.electronAPI.sendFilePath(filePath);
          console.log('File validation result:', result);
          
          if (!result?.valid) {
            console.warn(`File rejected: ${result?.reason || 'Invalid file type'}`);
          }
        }
      }
    } catch (error) {
      console.error('Error importing files:', error);
      alert('Error opening file dialog');
    }
  };

  const handleExportVideo = async () => {
    if (!window.electronAPI) {
      console.error('electronAPI not available');
      return;
    }

    if (!currentFile) {
      alert('Please import a video first');
      return;
    }

    if (inTime >= outTime) {
      alert('Invalid trim settings. End time must be after start time.');
      return;
    }

    try {
      setIsExporting(true);
      setExportProgress(0);
      setExportError(null);

      const result = await window.electronAPI.exportVideo({
        inTime,
        outTime
      });

      if (result.canceled) {
        console.log('Export canceled by user');
        setIsExporting(false);
        return;
      }

      if (result.success) {
        console.log('Export completed:', result.outputPath);
      } else {
        console.error('Export failed:', result.error);
        setExportError(result.error || 'Export failed');
      }
    } catch (error: any) {
      console.error('Error during export:', error);
      setExportError(error.message || 'Export failed');
    } finally {
      // Note: isExporting will be set to false by the event listener
    }
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle keyboard shortcuts when not in input fields
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      // Undo (Cmd/Ctrl + Z)
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        if (historyIndex > 0 && history.length > 0) {
          const prevState = history[historyIndex - 1];
          setInTime(prevState.inTime);
          setOutTime(prevState.outTime);
          setPlayheadTime(prevState.playheadTime);
          setHistoryIndex(historyIndex - 1);
          console.log('Undo to:', prevState);
        }
      }

      // Redo (Cmd/Ctrl + Shift + Z)
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && e.shiftKey) {
        e.preventDefault();
        if (historyIndex < history.length - 1 && history.length > 0) {
          const nextState = history[historyIndex + 1];
          setInTime(nextState.inTime);
          setOutTime(nextState.outTime);
          setPlayheadTime(nextState.playheadTime);
          setHistoryIndex(historyIndex + 1);
          console.log('Redo to:', nextState);
        }
      }

      // Arrow keys to navigate playhead
      if (!isExporting && fileMetadata?.duration) {
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
          e.preventDefault();
          const step = e.shiftKey ? 2.5 : 0.5; // Shift + arrow = 2.5s, regular arrow = 0.5s (5x bigger)
          const direction = e.key === 'ArrowRight' ? 1 : -1;
          setPlayheadTime(prev => {
            const newTime = Math.max(inTime, Math.min(outTime, prev + (direction * step)));
            return newTime;
          });
        }
        
        // Space to play/pause
        if (e.key === ' ') {
          e.preventDefault();
          setIsPlaying(prev => !prev);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [history, historyIndex, isExporting, inTime, outTime, fileMetadata, playheadTime]);

  // Set up IPC event listeners
  useEffect(() => {
    if (!window.electronAPI) return;

    const handleExportProgress = (event: any, data: any) => {
      console.log('Export progress:', data.percent);
      setExportProgress(data.percent || 0);
    };

    const handleExportComplete = (event: any, data: any) => {
      console.log('Export complete:', data);
      setIsExporting(false);
      setExportProgress(100);
      setExportSuccess(data.outputPath);
      // Clear success message after 5 seconds
      setTimeout(() => setExportSuccess(null), 5000);
      setTimeout(() => {
        setExportProgress(0);
      }, 2000);
    };

    const handleExportError = (event: any, data: any) => {
      console.error('Export error:', data);
      setIsExporting(false);
      setExportError(data.message || 'Export failed');
      setExportProgress(0);
      // Clear error after 5 seconds
      setTimeout(() => setExportError(null), 5000);
    };

    const cleanupProgress = window.electronAPI.onExportProgress(handleExportProgress);
    const cleanupComplete = window.electronAPI.onExportComplete(handleExportComplete);
    const cleanupError = window.electronAPI.onExportError(handleExportError);

    return () => {
      cleanupProgress();
      cleanupComplete();
      cleanupError();
    };
  }, []);

  return (
    <div className="h-screen flex flex-col bg-[#1a1a1a] text-white overflow-hidden">
      {/* Top Toolbar */}
      <div className="h-12 bg-[#252525] border-b border-[#3a3a3a] flex items-center justify-between px-6">
        <h1 className="text-lg font-semibold">Spooky Clips</h1>
        <div className="flex items-center gap-3">
          {exportSuccess && (
            <div className="flex items-center gap-2 px-3 py-1 bg-green-600/20 border border-green-600/40 rounded text-sm text-green-400">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              Export Complete
            </div>
          )}
          {exportError && (
            <div className="flex items-center gap-2 px-3 py-1 bg-red-600/20 border border-red-600/40 rounded text-sm text-red-400">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
              {exportError}
            </div>
          )}
          <button 
            onClick={handleImportVideo}
            disabled={isExporting}
            className="px-4 py-2 bg-[#3a3a3a] hover:bg-[#4a4a4a] rounded text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Import Video
          </button>
          <button 
            onClick={handleExportVideo}
            disabled={isExporting || !currentFile}
            className="px-4 py-2 bg-purple-900 hover:bg-purple-800 rounded text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed relative min-w-[100px]"
          >
            {isExporting ? (
              <span className="flex items-center gap-2 justify-center">
                <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                <span>{Math.round(exportProgress)}%</span>
              </span>
            ) : (
              'Export'
            )}
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Media Library */}
        <div className="w-64 bg-[#212121] border-r border-[#3a3a3a] overflow-y-auto">
          <ImportArea 
            onFileLoaded={handleFileLoaded} 
            onImportClick={handleImportVideo}
            onClipSelect={handleClipSelect}
            selectedClipPath={currentFile}
          />
        </div>

        {/* Preview Area */}
        <div className="flex-1 bg-[#0d0d0d]">
          <PreviewPlayer 
            filePath={currentFile} 
            metadata={fileMetadata} 
            playheadTime={playheadTime}
            isPlaying={isPlaying}
            setIsPlaying={setIsPlaying}
            onTimeUpdate={(time) => setPlayheadTime(time)}
          />
        </div>
      </div>

      {/* Timeline */}
      <div className="h-40 bg-[#1a1a1a] border-t border-[#3a3a3a]">
        <Timeline 
          currentFile={currentFile}
          duration={fileMetadata?.duration || 0}
          inTime={inTime}
          outTime={outTime}
          playheadTime={playheadTime}
          onTimeUpdate={handleTimeUpdate}
        />
      </div>
    </div>
  );
}

export default App;


