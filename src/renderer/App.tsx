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
      exportVideo: (data: { clips: Array<{ filePath: string; inTime: number; outTime: number }>; outputPath?: string }) => Promise<any>;
      onExportProgress: (callback: (event: any, data: any) => void) => (() => void);
      onExportComplete: (callback: (event: any, data: any) => void) => (() => void);
      onExportError: (callback: (event: any, data: any) => void) => (() => void);
      saveProject: (data: { clips: TimelineClip[]; libraryClips: any[] }) => Promise<any>;
      loadProject: () => Promise<any>;
    };
  }
}

// Clip interface for timeline management
interface TimelineClip {
  id: string;
  filePath: string;
  fileName: string;
  metadata: any;
  startTime: number; // Position on timeline
  duration: number; // Clip duration (outTime - inTime)
  inTime: number; // Trim start
  outTime: number; // Trim end
}

function App() {
  // Media library clips (imported but not on timeline)
  const [libraryClips, setLibraryClips] = useState<Array<{ filePath: string; fileName: string; metadata: any }>>([]);
  
  // Timeline clips (added to timeline)
  const [timelineClips, setTimelineClips] = useState<TimelineClip[]>([]);
  
  // Selected clip in library (for preview only)
  const [selectedLibraryClip, setSelectedLibraryClip] = useState<{ filePath: string; metadata: any } | null>(null);
  
  // Focused clip on timeline (shows trim handles)
  const [focusedClipId, setFocusedClipId] = useState<string | null>(null);
  
  // Playback state
  const [playheadTime, setPlayheadTime] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  
  // Undo/Redo history for timeline operations
  const [history, setHistory] = useState<Array<{ timelineClips: TimelineClip[]; playheadTime: number }>>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  
  // Export state
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [exportProgress, setExportProgress] = useState<number>(0);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportSuccess, setExportSuccess] = useState<string | null>(null);


  // Handle file loaded from import (adds to library, not timeline)
  const handleFileLoaded = (filePath: string, fileName: string, metadata?: any) => {
    console.log('File loaded in App:', filePath, fileName, metadata);
    
    // Add to library clips
    setLibraryClips(prev => {
      // Check if already exists
      const exists = prev.some(clip => clip.filePath === filePath);
      if (exists) return prev;
      return [...prev, { filePath, fileName, metadata }];
    });
  };

  // Handle clip selected from library (loads in preview only, not timeline)
  const handleClipSelect = (filePath: string, metadata?: any) => {
    console.log('Clip selected from library:', filePath);
    setSelectedLibraryClip({ filePath, metadata });
    setFocusedClipId(null); // Deselect timeline clip
    setIsPlaying(false);
    setPlayheadTime(0);
  };
  
  // Handle clip added to timeline from library
  const handleAddClipToTimeline = (filePath: string, fileName: string, metadata: any, insertIndex?: number) => {
    console.log('Adding clip to timeline:', fileName, 'insertIndex:', insertIndex);
    
    const newClip: TimelineClip = {
      id: `clip-${Date.now()}-${Math.random()}`,
      filePath,
      fileName,
      metadata,
      startTime: 0, // Will be calculated
      duration: metadata?.duration || 0,
      inTime: 0,
      outTime: metadata?.duration || 0,
    };
    
    setTimelineClips(prev => {
      let newClips: TimelineClip[];
      
      if (insertIndex !== undefined && insertIndex >= 0 && insertIndex < prev.length) {
        // Insert at specific position
        newClips = [...prev.slice(0, insertIndex), newClip, ...prev.slice(insertIndex)];
      } else {
        // Add to end
        newClips = [...prev, newClip];
      }
      
      // Recalculate startTime for all clips
      let currentTime = 0;
      const updatedClips = newClips.map(clip => {
        const updatedClip = { ...clip, startTime: currentTime };
        currentTime += (clip.outTime - clip.inTime);
        return updatedClip;
      });
      
      console.log('Updated timeline clips:', updatedClips);
      
      // Add to history with the new clips
      setHistory(prevHistory => {
        const newHistory = prevHistory.slice(0, historyIndex + 1);
        const updatedHistory = [...newHistory, { timelineClips: updatedClips, playheadTime }];
        return updatedHistory.slice(-50);
      });
      setHistoryIndex(prev => prev + 1);
      
      return updatedClips;
    });
  };
  
  // Update clip trim points
  const handleClipTrimUpdate = (clipId: string, inTime: number, outTime: number, skipHistory?: boolean) => {
    setTimelineClips(prev => {
      // Update the trimmed clip
      const updatedClips = prev.map(clip => {
        if (clip.id === clipId) {
          const newDuration = outTime - inTime;
          return { ...clip, inTime, outTime, duration: newDuration };
        }
        return clip;
      });
      
      // Recalculate startTime for ALL clips sequentially (no gaps)
      let currentTime = 0;
      const finalClips = updatedClips.map(clip => {
        const updatedClip = { ...clip, startTime: currentTime };
        currentTime += (clip.outTime - clip.inTime);
        return updatedClip;
      });
      
      // Only add to history if not skipping (at end of drag)
      if (!skipHistory) {
        setHistory(prevHistory => {
          const newHistory = prevHistory.slice(0, historyIndex + 1);
          const updatedHistory = [...newHistory, { timelineClips: finalClips, playheadTime }];
          return updatedHistory.slice(-50);
        });
        setHistoryIndex(prev => prev + 1);
      }
      
      return finalClips;
    });
  };
  
  // Calculate total timeline duration
  const getTotalDuration = () => {
    if (timelineClips.length === 0) return 0;
    const lastClip = timelineClips[timelineClips.length - 1];
    return lastClip.startTime + (lastClip.outTime - lastClip.inTime);
  };

  // Debug: log timeline clips when they change
  useEffect(() => {
    console.log('Timeline clips updated:', timelineClips);
  }, [timelineClips]);

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

    if (timelineClips.length === 0) {
      alert('Please add clips to the timeline first');
      return;
    }

    // Prepare clips array for export
    const clips = timelineClips.map(clip => ({
      filePath: clip.filePath,
      inTime: clip.inTime,
      outTime: clip.outTime
    }));

    try {
      setIsExporting(true);
      setExportProgress(0);
      setExportError(null);

      const result = await window.electronAPI.exportVideo({
        clips: clips
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

  const handleSaveProject = async () => {
    if (!window.electronAPI) {
      console.error('electronAPI not available');
      return;
    }

    try {
      const result = await window.electronAPI.saveProject({
        clips: timelineClips,
        libraryClips: libraryClips
      });

      if (result.canceled) {
        console.log('Save canceled by user');
        return;
      }

      if (result.success) {
        console.log('Project saved to:', result.filePath);
        setExportSuccess(`Project saved to: ${result.filePath}`);
      } else {
        console.error('Save failed:', result.error);
        setExportError(result.error || 'Failed to save project');
      }
    } catch (error: any) {
      console.error('Error saving project:', error);
      setExportError(error.message || 'Failed to save project');
    }
  };

  const handleLoadProject = async () => {
    if (!window.electronAPI) {
      console.error('electronAPI not available');
      return;
    }

    try {
      const result = await window.electronAPI.loadProject();

      if (result.canceled) {
        console.log('Load canceled by user');
        return;
      }

      if (result.success) {
        const projectData = result.data;
        console.log('Project loaded:', projectData);
        
        // Restore timeline clips
        if (projectData.timelineClips) {
          setTimelineClips(projectData.timelineClips);
          // Reset playhead to start
          setPlayheadTime(0);
        }
        
        // Restore library clips
        if (projectData.libraryClips) {
          setLibraryClips(projectData.libraryClips);
        }
        
        setExportSuccess(`Project loaded from: ${result.filePath}`);
      } else {
        console.error('Load failed:', result.error);
        setExportError(result.error || 'Failed to load project');
      }
    } catch (error: any) {
      console.error('Error loading project:', error);
      setExportError(error.message || 'Failed to load project');
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
          setTimelineClips(prevState.timelineClips);
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
          setTimelineClips(nextState.timelineClips);
          setPlayheadTime(nextState.playheadTime);
          setHistoryIndex(historyIndex + 1);
          console.log('Redo to:', nextState);
        }
      }

      // Arrow keys to navigate playhead
      if (!isExporting && timelineClips.length > 0) {
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
          e.preventDefault();
          const step = e.shiftKey ? 2.5 : 0.5;
          const direction = e.key === 'ArrowRight' ? 1 : -1;
          const totalDuration = getTotalDuration();
          setPlayheadTime(prev => {
            const newTime = Math.max(0, Math.min(totalDuration, prev + (direction * step)));
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
  }, [history, historyIndex, isExporting, timelineClips, playheadTime]);

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
            onClick={handleLoadProject}
            disabled={isExporting}
            className="px-4 py-2 bg-[#3a3a3a] hover:bg-[#4a4a4a] rounded text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Load Project
          </button>
          <button 
            onClick={handleSaveProject}
            disabled={isExporting}
            className="px-4 py-2 bg-[#3a3a3a] hover:bg-[#4a4a4a] rounded text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Save Project
          </button>
          <button 
            onClick={handleExportVideo}
            disabled={isExporting || timelineClips.length === 0}
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
            onClipDragToTimeline={handleAddClipToTimeline}
            selectedClipPath={selectedLibraryClip?.filePath || null}
            libraryClips={libraryClips}
          />
        </div>

        {/* Preview Area */}
        <div className="flex-1 bg-[#0d0d0d]">
          <PreviewPlayer 
            filePath={selectedLibraryClip?.filePath || null}
            metadata={selectedLibraryClip?.metadata}
            timelineClips={timelineClips}
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
          timelineClips={timelineClips}
          focusedClipId={focusedClipId}
          playheadTime={playheadTime}
          onClipTrimUpdate={handleClipTrimUpdate}
          onClipFocus={setFocusedClipId}
          onPlayheadUpdate={setPlayheadTime}
          onClipReorder={(newClips) => setTimelineClips(newClips)}
          onClipDrop={handleAddClipToTimeline}
        />
      </div>
    </div>
  );
}

export default App;


