import React, { useState, useEffect, useRef } from 'react';
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
      exportVideo: (data: { clips: Array<{ filePath: string; inTime: number; outTime: number; track?: number; overlayPosition?: any; overlaySize?: any; overlayVisible?: boolean; muted?: boolean }>; outputPath?: string; overlayVisible?: boolean; track0Muted?: boolean; track1Muted?: boolean }) => Promise<any>;
      onExportProgress: (callback: (event: any, data: any) => void) => (() => void);
      onExportComplete: (callback: (event: any, data: any) => void) => (() => void);
      onExportError: (callback: (event: any, data: any) => void) => (() => void);
      saveProject: (data: { clips: TimelineClip[]; libraryClips: any[] }) => Promise<any>;
      loadProject: () => Promise<any>;
      getScreenSources: () => Promise<Array<{ id: string; name: string; thumbnail: string }>>;
      createRecordingPreview: () => Promise<any>;
      closeRecordingPreview: () => Promise<any>;
      saveRecordingBlob: (arrayBuffer: ArrayBuffer) => Promise<any>;
      convertRecording: (webmPath: string) => Promise<any>;
      getDesktopStream?: (sourceId: string) => Promise<MediaStream>;
      createWebcamOverlay: (config: { x: number; y: number; width: number; height: number; deviceId: string }) => Promise<any>;
      updateWebcamOverlayPosition: (x: number, y: number) => Promise<any>;
      closeWebcamOverlay: () => Promise<any>;
      importOverlayImage: () => Promise<{ success: boolean; filePath?: string; error?: string; canceled?: boolean }>;
      transcribeVideo: (filePath: string) => Promise<any>;
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
  track?: number; // Track number: 0 = Main track, 1 = Overlay track (optional for backward compatibility)
  overlayPosition?: { x: number; y: number }; // Position of overlay (default: bottom-right)
  overlaySize?: { width: number; height: number }; // Size as percentage (default: 25%)
  overlayVisible?: boolean; // Visibility toggle (default: true)
  muted?: boolean; // Audio mute state for this clip
  videoFilter?: string; // Video filter type (e.g., "grayscale", "xray", "sepia", "vintage", "blur")
  overlayEffects?: Array<{ // Multiple image overlay effects
    id: string;
    filePath: string;
    opacity: number; // 0-1
    position: { x: number; y: number }; // Percentage from left/top
    size: { width: number; height: number }; // Percentage
  }>;
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
  
  // Overlay visibility state
  const [overlayVisible, setOverlayVisible] = useState<boolean>(true);
  
  // Track-level mute state
  const [track0Muted, setTrack0Muted] = useState<boolean>(false);
  const [track1Muted, setTrack1Muted] = useState<boolean>(false);
  
  // Overlay track enabled state
  const [overlayTrackEnabled, setOverlayTrackEnabled] = useState<boolean>(false);
  
  // Undo/Redo history for timeline operations
  const [history, setHistory] = useState<Array<{ timelineClips: TimelineClip[]; playheadTime: number }>>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  
  // Export state
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [exportProgress, setExportProgress] = useState<number>(0);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportSuccess, setExportSuccess] = useState<string | null>(null);

  // Recording state
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [recordingTime, setRecordingTime] = useState<number>(0);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [recordedChunks, setRecordedChunks] = useState<Blob[]>([]);
  const [showSourceSelector, setShowSourceSelector] = useState<boolean>(false);
  const [screenSources, setScreenSources] = useState<Array<{ id: string; name: string; thumbnail: string }>>([]);
  const [includeMicrophone, setIncludeMicrophone] = useState<boolean>(false);
  const [microphoneStream, setMicrophoneStream] = useState<MediaStream | null>(null);
  const [showRecordingMenu, setShowRecordingMenu] = useState<boolean>(false);
  const [recordingType, setRecordingType] = useState<'desktop' | 'webcam' | 'desktop+webcam' | null>(null);
  const [webcamStream, setWebcamStream] = useState<MediaStream | null>(null);
  const [showWebcamPreview, setShowWebcamPreview] = useState<boolean>(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const webcamVideoRef = useRef<HTMLVideoElement>(null);
  const webcamVideoCountdownRef = useRef<HTMLVideoElement>(null);

  // Transcription state
  const [activeMediaLibraryTab, setActiveMediaLibraryTab] = useState<'library' | 'transcript' | 'effects' | 'agent'>('library');
  const [transcripts, setTranscripts] = useState<Map<string, any>>(new Map());
  const [transcriptionStatus, setTranscriptionStatus] = useState<Map<string, 'idle' | 'generating' | 'complete' | 'error'>>(new Map());
  const [transcriptionError, setTranscriptionError] = useState<string | null>(null);

  // AI Agent state
  const [isAgentProcessing, setIsAgentProcessing] = useState<boolean>(false);

  // Desktop + Webcam recording state
  const [showDesktopWebcamPreview, setShowDesktopWebcamPreview] = useState<boolean>(false);
  const [desktopStream, setDesktopStream] = useState<MediaStream | null>(null);
  const [webcamPreviewStream, setWebcamPreviewStream] = useState<MediaStream | null>(null);
  const [webcamOverlayPosition, setWebcamOverlayPosition] = useState<{ x: number; y: number }>({ x: 75, y: 75 });
  const [webcamOverlaySize, setWebcamOverlaySize] = useState<{ width: number; height: number }>({ width: 25, height: 25 });
  const [isDraggingOverlay, setIsDraggingOverlay] = useState<boolean>(false);
  const [isResizingOverlay, setIsResizingOverlay] = useState<boolean>(false);
  const [desktopRecorder, setDesktopRecorder] = useState<MediaRecorder | null>(null);
  const [webcamRecorder, setWebcamRecorder] = useState<MediaRecorder | null>(null);
  const [desktopChunks, setDesktopChunks] = useState<Blob[]>([]);
  const [webcamChunks, setWebcamChunks] = useState<Blob[]>([]);
  const [webcamRecordingStream, setWebcamRecordingStream] = useState<MediaStream | null>(null);
  const [isDualRecording, setIsDualRecording] = useState<boolean>(false);
  const [dualCountdown, setDualCountdown] = useState<number | null>(null);
  const [desktopCountdown, setDesktopCountdown] = useState<number | null>(null);
  const desktopVideoRef = useRef<HTMLVideoElement>(null);
  const webcamOverlayVideoRef = useRef<HTMLVideoElement>(null);
  const webcamRecordingVideoRef = useRef<HTMLVideoElement>(null);
  const overlayDragStartRef = useRef<{ x: number; y: number } | null>(null);
  const resizeStartRef = useRef<{ width: number; height: number; x: number; y: number } | null>(null);


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
  const handleAddClipToTimeline = (filePath: string, fileName: string, metadata: any, dropTime?: number, track: number = 0) => {
    console.log('Adding clip to timeline:', fileName, 'dropTime:', dropTime, 'track:', track);
    
    const clipDuration = metadata?.duration || 0;
    
    // Calculate startTime based ONLY on clips in the same track
    const trackClips = timelineClips.filter(c => (c.track ?? 0) === track);
    let startTime: number;
    
    if (dropTime !== undefined && trackClips.length > 0) {
      // Find where to insert based on drop time within this track
      let insertIndex = trackClips.length;
      for (let i = 0; i < trackClips.length; i++) {
        if (dropTime < trackClips[i].startTime) {
          insertIndex = i;
          break;
        }
      }
      
      // Calculate sequential position within this track
      startTime = 0;
      for (let i = 0; i < insertIndex; i++) {
        startTime += (trackClips[i].outTime - trackClips[i].inTime);
      }
    } else {
      // Place at end of this track
      if (trackClips.length === 0) {
        startTime = 0;
      } else {
        const lastClip = trackClips[trackClips.length - 1];
        startTime = lastClip.startTime + (lastClip.outTime - lastClip.inTime);
      }
    }
    
    const newClip: TimelineClip = {
      id: `clip-${Date.now()}-${Math.random()}`,
      filePath,
      fileName,
      metadata,
      startTime: startTime,
      duration: clipDuration,
      inTime: 0,
      outTime: clipDuration,
      track: track,
      overlayPosition: track === 1 ? { x: 75, y: 75 } : undefined,
      overlaySize: track === 1 ? { width: 25, height: 25 } : undefined,
      overlayVisible: track === 1 ? true : undefined,
    };
    
    setTimelineClips(prev => {
      const newClips = [...prev, newClip];
      
      // Recalculate startTime for clips in the SAME track that come after the insertion
      const finalClips = newClips.map(clip => {
        if ((clip.track ?? 0) !== track) return clip; // Other tracks unchanged
        
        // Recalculate for this track
        const sameTrackClips = newClips.filter(c => (c.track ?? 0) === track);
        const clipIndex = sameTrackClips.findIndex(c => c.id === clip.id);
        
        let calculatedStart = 0;
        for (let i = 0; i < clipIndex; i++) {
          calculatedStart += (sameTrackClips[i].outTime - sameTrackClips[i].inTime);
        }
        
        return { ...clip, startTime: calculatedStart, track: clip.track ?? 0 };
      });
      
      console.log('Updated timeline clips:', finalClips);
      
      // Add to history
      setHistory(prevHistory => {
        const newHistory = prevHistory.slice(0, historyIndex + 1);
        const updatedHistory = [...newHistory, { timelineClips: finalClips, playheadTime }];
        return updatedHistory.slice(-50);
      });
      setHistoryIndex(prev => prev + 1);
      
      return finalClips;
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
      
      // Find the trimmed clip's track
      const trimmedClip = updatedClips.find(c => c.id === clipId);
      if (!trimmedClip) return prev;
      
      const clipTrack = trimmedClip.track ?? 0;
      
      // Recalculate startTime for ALL clips in the SAME track
      const finalClips = updatedClips.map(clip => {
        if ((clip.track ?? 0) !== clipTrack) {
          return { ...clip, track: clip.track ?? 0 }; // Other tracks unchanged
        }
        
        // Recalculate for this track
        const sameTrackClips = updatedClips.filter(c => (c.track ?? 0) === clipTrack);
        const clipIndex = sameTrackClips.findIndex(c => c.id === clip.id);
        
        let calculatedStart = 0;
        for (let i = 0; i < clipIndex; i++) {
          calculatedStart += (sameTrackClips[i].outTime - sameTrackClips[i].inTime);
        }
        
        return { ...clip, startTime: calculatedStart, track: clip.track ?? 0 };
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

  // Delete focused clip from timeline
  const handleDeleteFocusedClip = () => {
    if (!focusedClipId) return;
    
    setTimelineClips(prev => {
      const deletedClip = prev.find(c => c.id === focusedClipId);
      if (!deletedClip) return prev;
      
      const deletedTrack = deletedClip.track ?? 0;
      
      // Remove the focused clip
      const filteredClips = prev.filter(clip => clip.id !== focusedClipId);
      
      // Recalculate startTime for clips in the SAME track only
      const updatedClips = filteredClips.map(clip => {
        if ((clip.track ?? 0) !== deletedTrack) {
          return { ...clip, track: clip.track ?? 0 }; // Other tracks unchanged
        }
        
        // Recalculate for the affected track
        const sameTrackClips = filteredClips.filter(c => (c.track ?? 0) === deletedTrack);
        const clipIndex = sameTrackClips.findIndex(c => c.id === clip.id);
        
        let calculatedStart = 0;
        for (let i = 0; i < clipIndex; i++) {
          calculatedStart += (sameTrackClips[i].outTime - sameTrackClips[i].inTime);
        }
        
        return { ...clip, startTime: calculatedStart, track: clip.track ?? 0 };
      });
      
      // Add to history
      setHistory(prevHistory => {
        const newHistory = prevHistory.slice(0, historyIndex + 1);
        const updatedHistory = [...newHistory, { timelineClips: updatedClips, playheadTime }];
        return updatedHistory.slice(-50);
      });
      setHistoryIndex(prev => prev + 1);
      
      // Clear focus
      setFocusedClipId(null);
      
      return updatedClips;
    });
  };

  // Toggle mute for a specific clip
  const handleClipMuteToggle = (clipId: string) => {
    setTimelineClips(prev => prev.map(clip => 
      clip.id === clipId ? { ...clip, muted: !clip.muted } : clip
    ));
  };

  // Toggle mute for Track 0 (Main Track)
  const handleTrack0MuteToggle = () => {
    setTrack0Muted(!track0Muted);
  };

  // Toggle mute for Track 1 (Overlay Track)
  const handleTrack1MuteToggle = () => {
    setTrack1Muted(!track1Muted);
  };

  // Update video filter for a clip
  const handleClipFilterUpdate = (clipId: string, filter: string | undefined) => {
    setTimelineClips(prev => {
      const updatedClips = prev.map(clip => 
        clip.id === clipId ? { ...clip, videoFilter: filter } : clip
      );
      
      // Add to history
      setHistory(prevHistory => {
        const newHistory = prevHistory.slice(0, historyIndex + 1);
        const updatedHistory = [...newHistory, { timelineClips: updatedClips, playheadTime }];
        return updatedHistory.slice(-50);
      });
      setHistoryIndex(prev => prev + 1);
      
      return updatedClips;
    });
  };

  // Update overlay effects for a clip (supports multiple overlays)
  const handleClipOverlayEffectsUpdate = (clipId: string, overlays: Array<{ id: string; filePath: string; opacity: number; position: { x: number; y: number }; size: { width: number; height: number } }> | undefined) => {
    setTimelineClips(prev => {
      const updatedClips = prev.map(clip => 
        clip.id === clipId ? { ...clip, overlayEffects: overlays } : clip
      );
      
      // Add to history
      setHistory(prevHistory => {
        const newHistory = prevHistory.slice(0, historyIndex + 1);
        const updatedHistory = [...newHistory, { timelineClips: updatedClips, playheadTime }];
        return updatedHistory.slice(-50);
      });
      setHistoryIndex(prev => prev + 1);
      
      return updatedClips;
    });
  };

  // Update a specific overlay's position (for drag functionality)
  const handleOverlayPositionUpdate = (clipId: string, overlayId: string, position: { x: number; y: number }) => {
    setTimelineClips(prev => 
      prev.map(clip => {
        if (clip.id === clipId && clip.overlayEffects) {
          return {
            ...clip,
            overlayEffects: clip.overlayEffects.map(overlay =>
              overlay.id === overlayId ? { ...overlay, position } : overlay
            )
          };
        }
        return clip;
      })
    );
  };

  // Toggle overlay track enabled/disabled
  const handleToggleOverlayTrack = () => {
    if (overlayTrackEnabled) {
      // When disabling, check if track 1 has any clips
      const hasTrack1Clips = timelineClips.some(clip => (clip.track ?? 0) === 1);
      if (hasTrack1Clips) {
        alert('Cannot remove overlay track while it contains clips. Remove all clips from the overlay track first.');
        return;
      }
    }
    setOverlayTrackEnabled(!overlayTrackEnabled);
  };

  // Split clip at playhead position
  const handleSplitClipAtPlayhead = () => {
    if (timelineClips.length === 0) return;
    
    // Find which clip the playhead is currently over
    let splitClipIndex = -1;
    let splitTime = 0; // Time within the source clip
    
    for (let i = 0; i < timelineClips.length; i++) {
      const clip = timelineClips[i];
      const clipStart = clip.startTime;
      const clipEnd = clip.startTime + (clip.outTime - clip.inTime);
      
      if (playheadTime >= clipStart && playheadTime < clipEnd) {
        splitClipIndex = i;
        // Calculate the time within the source video at this position
        const offsetFromClipStart = playheadTime - clipStart;
        splitTime = clip.inTime + offsetFromClipStart;
        break;
      }
    }
    
    // Only split if playhead is over a clip
    if (splitClipIndex === -1) {
      console.log('Playhead is not over any clip');
      return;
    }
    
    const clipToSplit = timelineClips[splitClipIndex];
    
    // Don't split if at the edges (would create 0-length clip)
    const minClipDuration = 0.1;
    if (splitTime <= clipToSplit.inTime + minClipDuration || 
        splitTime >= clipToSplit.outTime - minClipDuration) {
      console.log('Split point too close to clip edge');
      return;
    }
    
    console.log('Splitting clip:', clipToSplit.fileName, 'at:', splitTime);
    
    // Create two new clips (preserve track from original)
    const firstClip: TimelineClip = {
      id: `clip-${Date.now()}-${Math.random()}`,
      filePath: clipToSplit.filePath,
      fileName: clipToSplit.fileName,
      metadata: clipToSplit.metadata,
      startTime: 0, // Will be recalculated
      duration: splitTime - clipToSplit.inTime,
      inTime: clipToSplit.inTime,
      outTime: splitTime,
      track: clipToSplit.track, // Preserve track from original
    };
    
    const secondClip: TimelineClip = {
      id: `clip-${Date.now() + 1}-${Math.random()}`,
      filePath: clipToSplit.filePath,
      fileName: clipToSplit.fileName,
      metadata: clipToSplit.metadata,
      startTime: 0, // Will be recalculated
      duration: clipToSplit.outTime - splitTime,
      inTime: splitTime,
      outTime: clipToSplit.outTime,
      track: clipToSplit.track, // Preserve track from original
    };
    
    // Remove the original clip and insert the two new ones
    setTimelineClips(prev => {
      const newClips = [
        ...prev.slice(0, splitClipIndex),
        firstClip,
        secondClip,
        ...prev.slice(splitClipIndex + 1)
      ];
      
      // Recalculate startTime for all clips INDEPENDENTLY PER TRACK
      const track0Clips = newClips.filter(c => (c.track ?? 0) === 0).sort((a, b) => {
        const aIndex = newClips.indexOf(a);
        const bIndex = newClips.indexOf(b);
        return aIndex - bIndex;
      });
      
      const track1Clips = newClips.filter(c => (c.track ?? 0) === 1).sort((a, b) => {
        const aIndex = newClips.indexOf(a);
        const bIndex = newClips.indexOf(b);
        return aIndex - bIndex;
      });
      
      // Calculate startTime for Track 0
      let track0Time = 0;
      track0Clips.forEach(clip => {
        clip.startTime = track0Time;
        track0Time += (clip.outTime - clip.inTime);
      });
      
      // Calculate startTime for Track 1
      let track1Time = 0;
      track1Clips.forEach(clip => {
        clip.startTime = track1Time;
        track1Time += (clip.outTime - clip.inTime);
      });
      
      const updatedClips = newClips.map(clip => ({
        ...clip,
        track: clip.track ?? 0
      }));
      
      console.log('Split complete, new clips:', updatedClips);
      
      // Add to history
      setHistory(prevHistory => {
        const newHistory = prevHistory.slice(0, historyIndex + 1);
        const updatedHistory = [...newHistory, { timelineClips: updatedClips, playheadTime }];
        return updatedHistory.slice(-50);
      });
      setHistoryIndex(prev => prev + 1);
      
      return updatedClips;
    });
  };

  // Recording Functions
  const handleRecordDesktop = async () => {
    if (!window.electronAPI) return;
    
    setShowRecordingMenu(false);
    setRecordingType('desktop');
    
    try {
      // Get screen sources
      const sources = await window.electronAPI.getScreenSources();
      setScreenSources(sources);
      setShowSourceSelector(true);
    } catch (error) {
      console.error('Error getting screen sources:', error);
      setExportError('Failed to get screen sources');
      setRecordingType(null);
    }
  };

  const handleRecordWebcam = async () => {
    if (!window.electronAPI) return;
    
    setShowRecordingMenu(false);
    setRecordingType('webcam');
    
    try {
      // Get webcam stream with audio from microphone
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user'
        },
        audio: true
      });
      
      setWebcamStream(stream);
      setShowWebcamPreview(true);
      
      // Start 3-second countdown
      setCountdown(3);
      
      // Countdown loop
      await new Promise<void>((resolve) => {
        let count = 3;
        const interval = setInterval(() => {
          count--;
          setCountdown(count);
          
          if (count === 0) {
            clearInterval(interval);
            setCountdown(null);
            resolve();
          }
        }, 1000);
      });
      
      // Start recording after countdown
      await startWebcamRecording(stream);
    } catch (error: any) {
      console.error('Error accessing webcam:', error);
      setExportError('Failed to access webcam: ' + error.message);
      setRecordingType(null);
      setTimeout(() => setExportError(null), 5000);
    }
  };

  const handleRecordDesktopWithWebcam = async () => {
    if (!window.electronAPI) return;
    
    setShowRecordingMenu(false);
    setRecordingType('desktop+webcam');
    
    try {
      // Get screen sources first
      const sources = await window.electronAPI.getScreenSources();
      setScreenSources(sources);
      setShowSourceSelector(true);
    } catch (error) {
      console.error('Error getting screen sources:', error);
      setExportError('Failed to get screen sources');
      setRecordingType(null);
    }
  };

  const startWebcamRecording = async (stream: MediaStream) => {
    try {
      // Create MediaRecorder with supported codecs
      const mimeTypes = [
        'video/webm;codecs=vp9,opus',
        'video/webm;codecs=vp8,opus',
        'video/webm;codecs=h264,opus',
        'video/webm'
      ];
      
      let selectedMimeType = 'video/webm';
      for (const mimeType of mimeTypes) {
        if (MediaRecorder.isTypeSupported(mimeType)) {
          selectedMimeType = mimeType;
          break;
        }
      }
      
      const recorder = new MediaRecorder(stream, {
        mimeType: selectedMimeType,
        videoBitsPerSecond: 8000000 // 8 Mbps
      });
      
      console.log('Using MediaRecorder MIME type for webcam:', selectedMimeType);

      const chunks: Blob[] = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunks.push(e.data);
        }
      };

      recorder.onstop = async () => {
        console.log('Webcam recording stopped, processing...');
        
        // Stop all tracks
        stream.getTracks().forEach((track: MediaStreamTrack) => track.stop());
        setWebcamStream(null);
        setShowWebcamPreview(false);
        
        // Create blob and save
        const blob = new Blob(chunks, { type: 'video/webm' });
        const arrayBuffer = await blob.arrayBuffer();
        
        // Save to temp file
        const saveResult = await window.electronAPI.saveRecordingBlob(arrayBuffer);
        
        if (saveResult.success) {
          console.log('Webcam recording saved to:', saveResult.tempPath);
          
          // Convert to MP4
          const convertResult = await window.electronAPI.convertRecording(saveResult.tempPath);
          
          if (convertResult.success) {
            console.log('Webcam recording converted:', convertResult.filePath);
            
            // Auto-add to library with thumbnail
            const metadata = {
              duration: convertResult.duration,
              width: convertResult.width,
              height: convertResult.height,
              codec: convertResult.codec,
              thumbnail: convertResult.thumbnail
            };
            
            handleFileLoaded(convertResult.filePath, convertResult.fileName, metadata);
            
            // Show success notification
            setExportSuccess(`Webcam recording saved to library`);
            setTimeout(() => setExportSuccess(null), 5000);
          } else {
            setExportError('Failed to convert webcam recording');
            setTimeout(() => setExportError(null), 5000);
          }
        }
        
        setIsRecording(false);
        setRecordingTime(0);
        setRecordingType(null);
      };

      recorder.start(1000);
      setMediaRecorder(recorder);
      setIsRecording(true);
      setRecordingTime(0);
      
      console.log('Webcam recording started');
    } catch (error: any) {
      console.error('Error starting webcam recording:', error);
      setExportError('Failed to start webcam recording: ' + error.message);
      setTimeout(() => setExportError(null), 5000);
      setIsRecording(false);
      setRecordingType(null);
      stream.getTracks().forEach((track: MediaStreamTrack) => track.stop());
      setWebcamStream(null);
      setShowWebcamPreview(false);
    }
  };

  const handleSourceSelected = async (sourceId: string) => {
    if (!window.electronAPI) return;
    
    setShowSourceSelector(false);
    
    // Check if this is for dual recording
    if (recordingType === 'desktop+webcam') {
      await handleSourceSelectedForDualRecording(sourceId);
      return;
    }
    
    setRecordingType('desktop');
    
    try {
      // Create stream from desktop capturer
      // Use Electron's desktop capture API with proper constraints
      const desktopStream = await navigator.mediaDevices.getUserMedia({
        audio: false, // System audio capture requires additional setup
        video: {
          // @ts-ignore - Electron-specific constraints for desktop capture
          mandatory: {
            chromeMediaSource: 'desktop',
            chromeMediaSourceId: sourceId,
            minWidth: 1280,
            maxWidth: 3840,
            minHeight: 720,
            maxHeight: 2160
          }
        } as any
      });

      let stream = desktopStream;
      let micStream: MediaStream | null = null;

      // If microphone is enabled, get microphone audio and combine with desktop stream
      if (includeMicrophone) {
        try {
          micStream = await navigator.mediaDevices.getUserMedia({
            audio: true,
            video: false
          });
          
          setMicrophoneStream(micStream);
          
          // Add microphone audio track to desktop stream
          const audioTrack = micStream.getAudioTracks()[0];
          if (audioTrack) {
            desktopStream.addTrack(audioTrack);
          }
        } catch (micError: any) {
          console.error('Error getting microphone:', micError);
          setExportError('Failed to access microphone: ' + micError.message);
          setTimeout(() => setExportError(null), 5000);
          // Continue recording without microphone
        }
      }

      // Create MediaRecorder with supported codecs
      // Check for supported MIME types (fallback if vp9 not supported)
      const mimeTypes = [
        'video/webm;codecs=vp9,opus',
        'video/webm;codecs=vp8,opus',
        'video/webm;codecs=h264,opus',
        'video/webm'
      ];
      
      let selectedMimeType = 'video/webm';
      for (const mimeType of mimeTypes) {
        if (MediaRecorder.isTypeSupported(mimeType)) {
          selectedMimeType = mimeType;
          break;
        }
      }
      
      const recorder = new MediaRecorder(stream, {
        mimeType: selectedMimeType,
        videoBitsPerSecond: 8000000 // 8 Mbps
      });
      
      console.log('Using MediaRecorder MIME type:', selectedMimeType);

      const chunks: Blob[] = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunks.push(e.data);
        }
      };

      recorder.onstop = async () => {
        console.log('Recording stopped, processing...');
        
        // Stop all tracks
        stream.getTracks().forEach((track: MediaStreamTrack) => track.stop());
        
        // Close preview window
        await window.electronAPI.closeRecordingPreview();
        
        // Stop microphone stream if it exists (use local variable for closure)
        if (micStream) {
          micStream.getTracks().forEach((track: MediaStreamTrack) => track.stop());
          setMicrophoneStream(null);
        }
        
        // Create blob and save
        const blob = new Blob(chunks, { type: 'video/webm' });
        const arrayBuffer = await blob.arrayBuffer();
        
        // Save to temp file
        const saveResult = await window.electronAPI.saveRecordingBlob(arrayBuffer);
        
        if (saveResult.success) {
          console.log('Recording saved to:', saveResult.tempPath);
          
          // Convert to MP4
          const convertResult = await window.electronAPI.convertRecording(saveResult.tempPath);
          
          if (convertResult.success) {
            console.log('Recording converted:', convertResult.filePath);
            
            // Auto-add to library with thumbnail
            const metadata = {
              duration: convertResult.duration,
              width: convertResult.width,
              height: convertResult.height,
              codec: convertResult.codec,
              thumbnail: convertResult.thumbnail // Include thumbnail in metadata
            };
            
            handleFileLoaded(convertResult.filePath, convertResult.fileName, metadata);
            
            // Show success notification
            setExportSuccess(`Recording saved to library`);
            setTimeout(() => setExportSuccess(null), 5000);
          } else {
            setExportError('Failed to convert recording');
            setTimeout(() => setExportError(null), 5000);
          }
        }
        
        setIsRecording(false);
        setRecordingTime(0);
      };

      // Start 3-second countdown before recording
      setDesktopCountdown(3);
      
      // Countdown loop
      await new Promise<void>((resolve) => {
        let count = 3;
        const interval = setInterval(() => {
          count--;
          setDesktopCountdown(count);
          
          if (count === 0) {
            clearInterval(interval);
            setDesktopCountdown(null);
            resolve();
          }
        }, 1000);
      });
      
      recorder.start(1000);
      setMediaRecorder(recorder);
      setIsRecording(true);
      setRecordingTime(0);
      
      // Don't create preview window - user doesn't want preview while recording
      
      console.log('Recording started');
    } catch (error: any) {
      console.error('Error starting recording:', error);
      setExportError('Failed to start recording: ' + error.message);
      setTimeout(() => setExportError(null), 5000);
    }
  };

  // Handle source selected for dual recording (opens preview modal)
  const handleSourceSelectedForDualRecording = async (sourceId: string) => {
    try {
      // Get desktop stream (video only)
      const desktop = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          // @ts-ignore - Electron-specific constraints
          mandatory: {
            chromeMediaSource: 'desktop',
            chromeMediaSourceId: sourceId,
            minWidth: 1280,
            maxWidth: 3840,
            minHeight: 720,
            maxHeight: 2160
          }
        } as any
      });

      // Get webcam stream (video only) for preview
      const webcam = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user'
        },
        audio: false // Webcam stream is now video-only
      });

      // Get microphone audio stream
      let micStream: MediaStream | null = null;
      try {
        micStream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: false
        });
        setMicrophoneStream(micStream);
      } catch (micError: any) {
        console.error('Error getting microphone:', micError);
        setExportError('Failed to access microphone: ' + micError.message);
        setTimeout(() => setExportError(null), 5000);
        // Continue recording without microphone
      }

      // Get the webcam device ID for the overlay window
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter(device => device.kind === 'videoinput');
      // Get the device ID from the webcam stream's video track
      const webcamTrack = webcam.getVideoTracks()[0];
      const webcamDeviceId = webcamTrack.getSettings().deviceId || (videoDevices.length > 0 ? videoDevices[0].deviceId : '');
      
      // Store device ID for later use
      (window as any).__webcamDeviceId = webcamDeviceId;

      setDesktopStream(desktop);
      setWebcamPreviewStream(webcam);
      setShowDesktopWebcamPreview(true);
    } catch (error: any) {
      console.error('Error setting up dual recording preview:', error);
      setExportError('Failed to access screen/webcam: ' + error.message);
      setRecordingType(null);
      setTimeout(() => setExportError(null), 5000);
      
      // Cleanup on error
      if (desktopStream) {
        desktopStream.getTracks().forEach(track => track.stop());
        setDesktopStream(null);
      }
      if (webcamPreviewStream) {
        webcamPreviewStream.getTracks().forEach(track => track.stop());
        setWebcamPreviewStream(null);
      }
    }
  };

  // Start dual recording (called from preview modal)
  const startDesktopWebcamRecording = async () => {
    if (!desktopStream || !webcamPreviewStream) return;

    try {
      // Get webcam device ID before stopping the stream
      const webcamDeviceId = (window as any).__webcamDeviceId || '';
      
      // Calculate overlay window position and size based on preview position
      const screenWidth = window.screen.width;
      const screenHeight = window.screen.height;
      const overlayWidth = 240;
      const overlayHeight = 135;
      const overlayX = Math.floor((webcamOverlayPosition.x / 100) * screenWidth);
      const overlayY = Math.floor((webcamOverlayPosition.y / 100) * screenHeight);

      // Stop the preview webcam stream FIRST to release the camera
      if (webcamPreviewStream) {
        webcamPreviewStream.getTracks().forEach(track => track.stop());
        setWebcamPreviewStream(null);
      }

      // Start 3-second countdown - gives time for webcam to be released
      setDualCountdown(3);
      
      // Countdown loop
      await new Promise<void>((resolve) => {
        let count = 3;
        const interval = setInterval(() => {
          count--;
          setDualCountdown(count);
          
          if (count === 0) {
            clearInterval(interval);
            setDualCountdown(null);
            resolve();
          }
        }, 1000);
      });

      // Hide preview modal - we'll show overlay window instead
      setShowDesktopWebcamPreview(false);
      setIsDualRecording(true);

      // Create the floating webcam overlay window (webcam should be free now)
      const overlayResult = await window.electronAPI.createWebcamOverlay({
        x: overlayX,
        y: overlayY,
        width: overlayWidth,
        height: overlayHeight,
        deviceId: webcamDeviceId
      });

      if (!overlayResult.success) {
        throw new Error('Failed to create webcam overlay window');
      }

      // Get microphone audio stream (if not already obtained)
      if (!microphoneStream) {
        try {
          const micStream = await navigator.mediaDevices.getUserMedia({
            audio: true,
            video: false
          });
          setMicrophoneStream(micStream);
        } catch (micError: any) {
          console.error('Error getting microphone:', micError);
          setExportError('Failed to access microphone: ' + micError.message);
          setTimeout(() => setExportError(null), 5000);
          // Continue recording without microphone
        }
      }

      // Create MediaRecorder MIME type selection
      const mimeTypes = [
        'video/webm;codecs=vp9,opus',
        'video/webm;codecs=vp8,opus',
        'video/webm;codecs=h264,opus',
        'video/webm'
      ];
      
      let selectedMimeType = 'video/webm';
      for (const mimeType of mimeTypes) {
        if (MediaRecorder.isTypeSupported(mimeType)) {
          selectedMimeType = mimeType;
          break;
        }
      }

      // Create a combined stream: desktop video + microphone audio
      // The desktop stream already captures the webcam overlay visually on screen
      const combinedStream = new MediaStream();
      
      // Add desktop video tracks
      desktopStream.getVideoTracks().forEach(track => {
        combinedStream.addTrack(track);
      });
      
      // Add microphone audio tracks
      if (microphoneStream) {
        microphoneStream.getAudioTracks().forEach(track => {
          combinedStream.addTrack(track);
        });
      }

      // Store micStream reference for cleanup in onstop handler
      const micStreamRef = microphoneStream;

      // Record the combined stream (desktop video + microphone audio)
      // The desktop video already includes the webcam overlay visually
      const desktopRec = new MediaRecorder(combinedStream, {
        mimeType: selectedMimeType,
        videoBitsPerSecond: 8000000
      });

      const desktopChunksArray: Blob[] = [];

      desktopRec.ondataavailable = (e) => {
        if (e.data.size > 0) {
          desktopChunksArray.push(e.data);
        }
      };


      desktopRec.onstop = async () => {
        console.log('Desktop recording stopped');
        const blob = new Blob(desktopChunksArray, { type: 'video/webm' });
        const arrayBuffer = await blob.arrayBuffer();
        
        const saveResult = await window.electronAPI.saveRecordingBlob(arrayBuffer);
        if (saveResult.success) {
          const convertResult = await window.electronAPI.convertRecording(saveResult.tempPath);
          if (convertResult.success) {
            const metadata = {
              duration: convertResult.duration,
              width: convertResult.width,
              height: convertResult.height,
              codec: convertResult.codec,
              thumbnail: convertResult.thumbnail
            };
            
            // Auto-add to Track 0 (Main) - includes both desktop and webcam overlay
            handleAddClipToTimeline(convertResult.filePath, convertResult.fileName, metadata, undefined, 0);
          }
        }
        
        // Close webcam overlay window
        await window.electronAPI.closeWebcamOverlay();
        
        // Stop all streams
        desktopStream.getTracks().forEach(track => track.stop());
        if (micStreamRef) {
          micStreamRef.getTracks().forEach(track => track.stop());
          setMicrophoneStream(null);
        }
        setDesktopStream(null);
        setWebcamRecordingStream(null);
        setIsDualRecording(false);
        setShowDesktopWebcamPreview(false);
        
        setIsRecording(false);
        setRecordingTime(0);
        setRecordingType(null);
        
        // Show success
        setExportSuccess('Recording saved to timeline');
        setTimeout(() => setExportSuccess(null), 5000);
      };

      // Removed webcamRec.onstop - webcam is already included in desktop recording

      desktopRec.start(1000);
      
      setDesktopRecorder(desktopRec);
      setWebcamRecorder(null); // No separate webcam recorder needed
      setIsRecording(true);
      setRecordingTime(0);
      
      console.log('Dual recording started');
    } catch (error: any) {
      console.error('Error starting dual recording:', error);
        setExportError('Failed to start recording: ' + error.message);
        setTimeout(() => setExportError(null), 5000);
        setIsRecording(false);
        setIsDualRecording(false);
        setRecordingType(null);
        setDesktopCountdown(null);
        setDualCountdown(null);
        
        // Close overlay window if it was created
        await window.electronAPI.closeWebcamOverlay();
    }
  };

  const handleStopRecording = async () => {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      mediaRecorder.stop();
    }
    
    // Stop dual recorders if active
    if (desktopRecorder && desktopRecorder.state === 'recording') {
      desktopRecorder.stop();
    }
    // webcamRecorder is no longer used in dual recording mode
    
    // Close webcam overlay window if active
    if (isDualRecording) {
      await window.electronAPI.closeWebcamOverlay();
    }
    
    // Stop webcam stream if active
    if (webcamStream) {
      webcamStream.getTracks().forEach((track: MediaStreamTrack) => track.stop());
      setWebcamStream(null);
      setShowWebcamPreview(false);
    }
    
    // Stop microphone stream if active
    if (microphoneStream) {
      microphoneStream.getTracks().forEach((track: MediaStreamTrack) => track.stop());
      setMicrophoneStream(null);
    }
    
    // Stop desktop/webcam preview streams
    if (desktopStream) {
      desktopStream.getTracks().forEach((track: MediaStreamTrack) => track.stop());
      setDesktopStream(null);
    }
    if (webcamPreviewStream) {
      webcamPreviewStream.getTracks().forEach((track: MediaStreamTrack) => track.stop());
      setWebcamPreviewStream(null);
    }
    if (webcamRecordingStream) {
      webcamRecordingStream.getTracks().forEach((track: MediaStreamTrack) => track.stop());
      setWebcamRecordingStream(null);
    }
    setShowDesktopWebcamPreview(false);
    setIsDualRecording(false);
    setDesktopCountdown(null);
    setDualCountdown(null);
  };

  // Recording timer effect
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isRecording) {
      interval = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isRecording]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showRecordingMenu) {
        const target = event.target as HTMLElement;
        if (!target.closest('.relative')) {
          setShowRecordingMenu(false);
        }
      }
    };

    if (showRecordingMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [showRecordingMenu]);

  // Set up webcam video stream for main preview
  useEffect(() => {
    if (webcamVideoRef.current && webcamStream && countdown === null) {
      webcamVideoRef.current.srcObject = webcamStream;
      webcamVideoRef.current.play().catch(err => console.log('Play error:', err));
    }
    
    return () => {
      if (webcamVideoRef.current) {
        webcamVideoRef.current.srcObject = null;
      }
    };
  }, [webcamStream, countdown]);

  // Set up webcam video stream for countdown preview
  useEffect(() => {
    if (webcamVideoCountdownRef.current && webcamStream) {
      webcamVideoCountdownRef.current.srcObject = webcamStream;
      webcamVideoCountdownRef.current.play().catch(err => console.log('Play error:', err));
    }
    
    return () => {
      if (webcamVideoCountdownRef.current) {
        webcamVideoCountdownRef.current.srcObject = null;
      }
    };
  }, [webcamStream]);

  // Set up desktop video stream for preview
  useEffect(() => {
    if (desktopVideoRef.current && desktopStream) {
      desktopVideoRef.current.srcObject = desktopStream;
      desktopVideoRef.current.play().catch(err => console.log('Play error:', err));
    }
    
    return () => {
      if (desktopVideoRef.current) {
        desktopVideoRef.current.srcObject = null;
      }
    };
  }, [desktopStream]);

  // Set up webcam overlay video stream for preview
  useEffect(() => {
    if (webcamOverlayVideoRef.current && webcamPreviewStream && !isDualRecording) {
      webcamOverlayVideoRef.current.srcObject = webcamPreviewStream;
      webcamOverlayVideoRef.current.play().catch(err => console.log('Play error:', err));
    }
    
    return () => {
      if (webcamOverlayVideoRef.current) {
        webcamOverlayVideoRef.current.srcObject = null;
      }
    };
  }, [webcamPreviewStream, isDualRecording]);

  // Set up webcam recording video stream (shown during recording)
  useEffect(() => {
    if (webcamRecordingVideoRef.current && webcamRecordingStream && isDualRecording) {
      webcamRecordingVideoRef.current.srcObject = webcamRecordingStream;
      webcamRecordingVideoRef.current.play().catch(err => console.log('Play error:', err));
    }
    
    return () => {
      if (webcamRecordingVideoRef.current) {
        webcamRecordingVideoRef.current.srcObject = null;
      }
    };
  }, [webcamRecordingStream, isDualRecording]);

  // Handle overlay drag
  useEffect(() => {
    if (!isDraggingOverlay) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!overlayDragStartRef.current) return;

      // If recording with dual mode, use viewport coordinates
      if (isDualRecording) {
        const overlayWidth = 240; // Fixed width in pixels
        const overlayHeight = 135; // Fixed height in pixels
        
        // Calculate position accounting for drag offset
        const currentX = (e.clientX / window.innerWidth * 100);
        const currentY = (e.clientY / window.innerHeight * 100);
        
        // Account for the offset from where the drag started
        const offsetXPercent = (overlayDragStartRef.current.x / overlayWidth) * (overlayWidth / window.innerWidth * 100);
        const offsetYPercent = (overlayDragStartRef.current.y / overlayHeight) * (overlayHeight / window.innerHeight * 100);
        
        const newX = Math.max(0, Math.min(100 - (overlayWidth / window.innerWidth * 100), currentX - offsetXPercent));
        const newY = Math.max(0, Math.min(100 - (overlayHeight / window.innerHeight * 100), currentY - offsetYPercent));
        
        setWebcamOverlayPosition({ x: newX, y: newY });
      } else {
        // Use percentage-based positioning relative to desktop video (preview mode)
        if (!desktopVideoRef.current) return;
        
        const desktopRect = desktopVideoRef.current.getBoundingClientRect();
        const mouseX = e.clientX - desktopRect.left;
        const mouseY = e.clientY - desktopRect.top;

        const newX = Math.max(0, Math.min(100 - webcamOverlaySize.width, (mouseX / desktopRect.width) * 100));
        const newY = Math.max(0, Math.min(100 - webcamOverlaySize.height, (mouseY / desktopRect.height) * 100));

        setWebcamOverlayPosition({ x: newX, y: newY });
      }
    };

    const handleMouseUp = () => {
      setIsDraggingOverlay(false);
      overlayDragStartRef.current = null;
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDraggingOverlay, webcamOverlaySize, isDualRecording]);

  // Handle overlay resize
  useEffect(() => {
    if (!isResizingOverlay) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!desktopVideoRef.current || !resizeStartRef.current) return;

      const desktopRect = desktopVideoRef.current.getBoundingClientRect();
      const mouseX = e.clientX - desktopRect.left;
      const mouseY = e.clientY - desktopRect.top;

      const deltaX = ((mouseX - resizeStartRef.current.x) / desktopRect.width) * 100;
      const deltaY = ((mouseY - resizeStartRef.current.y) / desktopRect.height) * 100;

      const newWidth = Math.max(10, Math.min(50, resizeStartRef.current.width + deltaX));
      const newHeight = Math.max(10, Math.min(50, resizeStartRef.current.height + deltaY));

      // Maintain aspect ratio
      const aspectRatio = resizeStartRef.current.height / resizeStartRef.current.width;
      const adjustedWidth = newWidth;
      const adjustedHeight = adjustedWidth * aspectRatio;

      // Adjust position if resizing would go out of bounds
      let newX = webcamOverlayPosition.x;
      let newY = webcamOverlayPosition.y;

      if (newX + adjustedWidth > 100) {
        newX = 100 - adjustedWidth;
      }
      if (newY + adjustedHeight > 100) {
        newY = 100 - adjustedHeight;
      }

      setWebcamOverlaySize({ width: adjustedWidth, height: adjustedHeight });
      setWebcamOverlayPosition({ x: newX, y: newY });
    };

    const handleMouseUp = () => {
      setIsResizingOverlay(false);
      resizeStartRef.current = null;
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizingOverlay, webcamOverlayPosition]);

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

    // Prepare clips array for export - separate by track
    const clips = timelineClips.map(clip => ({
      filePath: clip.filePath,
      inTime: clip.inTime,
      outTime: clip.outTime,
      track: clip.track ?? 0,
      overlayPosition: clip.overlayPosition,
      overlaySize: clip.overlaySize,
      overlayVisible: clip.overlayVisible ?? true,
      muted: clip.muted ?? false,
      videoFilter: clip.videoFilter,
      overlayEffects: clip.overlayEffects
    }));

    try {
      setIsExporting(true);
      setExportProgress(0);
      setExportError(null);

      const result = await window.electronAPI.exportVideo({
        clips: clips,
        overlayVisible: overlayVisible,
        track0Muted: track0Muted,
        track1Muted: track1Muted
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

  // Transcription handlers
  const handleTabChange = (tab: 'library' | 'transcript' | 'effects' | 'agent') => {
    setActiveMediaLibraryTab(tab);
    
    // Switch to 'effects' tab automatically when a clip is focused
    if (tab === 'effects' && !focusedClipId) {
      // Optionally, show a message or stay on the current tab
    }
  };

  const handleGenerateTranscript = async () => {
    if (!window.electronAPI) {
      console.error('electronAPI not available');
      setExportError('System error: electronAPI not available');
      setTimeout(() => setExportError(null), 3000);
      return;
    }
    
    // Use timeline clips if available, otherwise fall back to selected library clip
    let filePath: string;
    let transcriptKey: string;
    
    if (timelineClips.length > 0) {
      // Transcribe the first clip on the timeline (or we could transcribe all clips)
      // For now, let's transcribe the first clip as a simple implementation
      filePath = timelineClips[0].filePath;
      transcriptKey = 'timeline'; // Use a special key for timeline transcription
      console.log('Generating transcript for timeline (first clip):', filePath);
    } else if (selectedLibraryClip) {
      filePath = selectedLibraryClip.filePath;
      transcriptKey = filePath;
      console.log('Generating transcript for library clip:', filePath);
    } else {
      console.error('No clips on timeline or in selection');
      setExportError('Please add clips to the timeline or select a video from the library');
      setTimeout(() => setExportError(null), 3000);
      return;
    }
    
    try {
      // Update status
      setTranscriptionStatus(prev => new Map(prev).set(transcriptKey, 'generating'));
      setTranscriptionError(null);
      
      // Call transcription API
      const result = await window.electronAPI.transcribeVideo(filePath);
      
      if (result.success) {
        console.log('Transcription successful');
        
        // Store transcript
        setTranscripts(prev => new Map(prev).set(transcriptKey, result.transcript));
        setTranscriptionStatus(prev => new Map(prev).set(transcriptKey, 'complete'));
        
        // Switch to transcript tab
        setActiveMediaLibraryTab('transcript');
      } else {
        console.error('Transcription failed:', result.error);
        setTranscriptionStatus(prev => new Map(prev).set(transcriptKey, 'error'));
        setTranscriptionError(result.error || 'Transcription failed');
      }
    } catch (error: any) {
      console.error('Error during transcription:', error);
      setTranscriptionStatus(prev => new Map(prev).set(transcriptKey, 'error'));
      setTranscriptionError(error.message || 'Transcription failed');
    }
  };

  const handleTranscriptWordClick = (timestamp: number) => {
    // Jump to timestamp in video
    setPlayheadTime(timestamp);
    setIsPlaying(false);
  };

  // AI Agent handlers
  const handleAgentSendMessage = async (message: string) => {
    if (!window.electronAPI || !(window.electronAPI as any).aiAgent) {
      console.error('AI Agent API not available');
      setExportError('AI Agent not available');
      setTimeout(() => setExportError(null), 3000);
      return;
    }

    try {
      setIsAgentProcessing(true);
      
      // Send message with current timeline state
      const result = await (window.electronAPI as any).aiAgent.sendMessage(message, timelineClips);
      
      if (!result.success) {
        setExportError(result.error || 'Failed to send message to AI agent');
        setTimeout(() => setExportError(null), 5000);
      }
      
      // Processing state will be cleared when we receive the final response
    } catch (error: any) {
      console.error('Error sending message to AI agent:', error);
      setExportError('Failed to communicate with AI agent');
      setTimeout(() => setExportError(null), 5000);
      setIsAgentProcessing(false);
    }
  };

  // Listen for AI agent actions and apply them to timeline
  useEffect(() => {
    if (!window.electronAPI || !(window.electronAPI as any).onAgentResponse) return;

    const handleAgentResponse = (event: any, response: any) => {
      console.log('Agent response:', response);
      
      if (response.type === 'message') {
        // Final message received, stop processing
        setIsAgentProcessing(false);
        
        // Check if there are actions to apply
        if (response.data) {
          // Handle overlay additions
          if (response.data.overlays && response.data.clipId) {
            const clipId = response.data.clipId;
            const newOverlays = response.data.overlays;
            
            // Apply overlays to the clip
            setTimelineClips(prev => {
              return prev.map(clip => {
                if (clip.id === clipId) {
                  const existingOverlays = clip.overlayEffects || [];
                  return {
                    ...clip,
                    overlayEffects: [...existingOverlays, ...newOverlays],
                  };
                }
                return clip;
              });
            });
            
            console.log(`Added ${newOverlays.length} overlays to clip ${clipId}`);
          }
          
          // Handle filter application
          if (response.data.filter !== undefined && response.data.affectedClips) {
            const filter = response.data.filter === 'none' ? undefined : response.data.filter;
            const affectedClips = response.data.affectedClips;
            
            setTimelineClips(prev => {
              return prev.map(clip => {
                if (affectedClips.includes(clip.id)) {
                  return {
                    ...clip,
                    videoFilter: filter,
                  };
                }
                return clip;
              });
            });
            
            console.log(`Applied filter "${filter || 'none'}" to ${affectedClips.length} clips`);
          }
          
          // Handle clip splitting
          if (response.data.splitTimestamp !== undefined && response.data.clipId) {
            const clipId = response.data.clipId;
            const splitTimestamp = response.data.splitTimestamp;
            
            // Find the clip and split it
            setTimelineClips(prev => {
              const clipIndex = prev.findIndex(c => c.id === clipId);
              if (clipIndex === -1) return prev;
              
              const clipToSplit = prev[clipIndex];
              
              // Create two new clips
              const firstClip: TimelineClip = {
                id: `clip-${Date.now()}-${Math.random()}`,
                filePath: clipToSplit.filePath,
                fileName: clipToSplit.fileName,
                metadata: clipToSplit.metadata,
                startTime: 0, // Will be recalculated
                duration: splitTimestamp - clipToSplit.inTime,
                inTime: clipToSplit.inTime,
                outTime: splitTimestamp,
                track: clipToSplit.track,
              };
              
              const secondClip: TimelineClip = {
                id: `clip-${Date.now() + 1}-${Math.random()}`,
                filePath: clipToSplit.filePath,
                fileName: clipToSplit.fileName,
                metadata: clipToSplit.metadata,
                startTime: 0, // Will be recalculated
                duration: clipToSplit.outTime - splitTimestamp,
                inTime: splitTimestamp,
                outTime: clipToSplit.outTime,
                track: clipToSplit.track,
              };
              
              // Replace original with two new clips
              const newClips = [
                ...prev.slice(0, clipIndex),
                firstClip,
                secondClip,
                ...prev.slice(clipIndex + 1)
              ];
              
              // Recalculate startTimes per track
              const track0Clips = newClips.filter(c => (c.track ?? 0) === 0);
              const track1Clips = newClips.filter(c => c.track === 1);
              
              let track0Time = 0;
              track0Clips.forEach(clip => {
                clip.startTime = track0Time;
                track0Time += (clip.outTime - clip.inTime);
              });
              
              let track1Time = 0;
              track1Clips.forEach(clip => {
                clip.startTime = track1Time;
                track1Time += (clip.outTime - clip.inTime);
              });
              
              return newClips;
            });
            
            console.log(`Split clip ${clipId} at ${splitTimestamp}s`);
          }
          
          // Handle clip trimming
          if (response.data.inTime !== undefined || response.data.outTime !== undefined) {
            const clipId = response.data.clipId;
            const newInTime = response.data.inTime;
            const newOutTime = response.data.outTime;
            
            setTimelineClips(prev => {
              return prev.map(clip => {
                if (clip.id === clipId) {
                  const inTime = newInTime !== undefined ? newInTime : clip.inTime;
                  const outTime = newOutTime !== undefined ? newOutTime : clip.outTime;
                  return {
                    ...clip,
                    inTime,
                    outTime,
                    duration: outTime - inTime,
                  };
                }
                return clip;
              });
            });
            
            console.log(`Trimmed clip ${clipId} to ${newInTime}-${newOutTime}s`);
          }
          
          // Handle black and white filter for Track 1
          if (response.data.action === 'enabled' && response.data.affectedClips) {
            setTimelineClips(prev => {
              return prev.map(clip => {
                if (clip.track === 1) {
                  return {
                    ...clip,
                    videoFilter: 'grayscale',
                  };
                }
                return clip;
              });
            });
            
            console.log('Applied black and white filter to Track 1 clips');
          } else if (response.data.action === 'disabled' && response.data.affectedClips) {
            setTimelineClips(prev => {
              return prev.map(clip => {
                if (clip.track === 1 && clip.videoFilter === 'grayscale') {
                  return {
                    ...clip,
                    videoFilter: undefined,
                  };
                }
                return clip;
              });
            });
            
            console.log('Removed black and white filter from Track 1 clips');
          }
        }
      }
    };

    const cleanup = (window.electronAPI as any).onAgentResponse(handleAgentResponse);
    
    return () => {
      if (cleanup) cleanup();
    };
  }, [timelineClips]);


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

      // Split clip at playhead (Cmd/Ctrl + T)
      if ((e.metaKey || e.ctrlKey) && e.key === 't') {
        e.preventDefault();
        handleSplitClipAtPlayhead();
      }

      // Delete/Backspace: Delete focused clip
      if ((e.key === 'Delete' || e.key === 'Backspace') && focusedClipId && !isExporting) {
        e.preventDefault();
        handleDeleteFocusedClip();
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
  }, [history, historyIndex, isExporting, timelineClips, playheadTime, focusedClipId, handleSplitClipAtPlayhead, handleDeleteFocusedClip, getTotalDuration]);

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
            disabled={isExporting || isRecording}
            className="px-4 py-2 bg-[#3a3a3a] hover:bg-[#4a4a4a] rounded text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Import Video
          </button>
          <button 
            onClick={handleGenerateTranscript}
            disabled={isExporting || isRecording || (timelineClips.length === 0 && !selectedLibraryClip)}
            className="px-4 py-2 bg-[#3a3a3a] hover:bg-[#4a4a4a] rounded text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title={timelineClips.length === 0 && !selectedLibraryClip ? 'Add clips to timeline or select a video to transcribe' : 'Generate transcript'}
          >
            Transcribe
          </button>
          <button 
            onClick={handleLoadProject}
            disabled={isExporting || isRecording}
            className="px-4 py-2 bg-[#3a3a3a] hover:bg-[#4a4a4a] rounded text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Load Project
          </button>
          <button 
            onClick={handleSaveProject}
            disabled={isExporting || isRecording}
            className="px-4 py-2 bg-[#3a3a3a] hover:bg-[#4a4a4a] rounded text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Save Project
          </button>
          {/* Record Button with Dropdown */}
          <div className="relative">
            <button 
              onClick={isRecording ? handleStopRecording : () => setShowRecordingMenu(!showRecordingMenu)}
              disabled={isExporting}
              className={`p-2 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1 ${
                isRecording 
                  ? 'bg-red-600 hover:bg-red-700' 
                  : 'bg-[#3a3a3a] hover:bg-[#4a4a4a]'
              }`}
            >
              {isRecording ? (
                <span className="flex items-center gap-1.5">
                  <span className="inline-block w-2 h-2 bg-white rounded-full animate-pulse"></span>
                  <span className="text-xs">{Math.floor(recordingTime / 60)}:{String(recordingTime % 60).padStart(2, '0')}</span>
                </span>
              ) : (
                <>
                  {/* Record Icon - Filled circle (record symbol) */}
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="10" fill="currentColor"/>
                  </svg>
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </>
              )}
            </button>
          
          {/* Dropdown Menu */}
          {showRecordingMenu && !isRecording && (
            <div className="absolute right-0 mt-2 w-48 bg-[#2a2a2a] border border-[#3a3a3a] rounded-lg shadow-lg z-50">
              <button
                onClick={handleRecordDesktop}
                className="w-full px-4 py-3 text-left hover:bg-[#3a3a3a] transition-colors flex items-center gap-3 rounded-t-lg"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                <span>Record Desktop</span>
              </button>
              <button
                onClick={handleRecordWebcam}
                className="w-full px-4 py-3 text-left hover:bg-[#3a3a3a] transition-colors flex items-center gap-3"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <span>Use Webcam</span>
              </button>
              <button
                onClick={handleRecordDesktopWithWebcam}
                className="w-full px-4 py-3 text-left hover:bg-[#3a3a3a] transition-colors flex items-center gap-3 rounded-b-lg"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                <span>Record Desktop + Webcam</span>
              </button>
            </div>
          )}
        </div>
          <button 
            onClick={handleExportVideo}
            disabled={isExporting || isRecording || timelineClips.length === 0}
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

      {/* Source Selector Modal */}
      {showSourceSelector && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-[#2a2a2a] rounded-lg p-6 max-w-4xl w-full mx-4 max-h-[80vh] overflow-y-auto">
            <h2 className="text-xl font-semibold mb-4">Select Screen or Window</h2>
            
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {screenSources.map((source) => (
                <button
                  key={source.id}
                  onClick={() => handleSourceSelected(source.id)}
                  className="bg-[#3a3a3a] hover:bg-[#4a4a4a] rounded-lg p-3 transition-colors text-left"
                >
                  <img 
                    src={source.thumbnail} 
                    alt={source.name}
                    className="w-full h-32 object-cover rounded mb-2"
                  />
                  <p className="text-sm truncate">{source.name}</p>
                </button>
              ))}
            </div>
            <div className="mt-4 flex justify-end">
              <button
                onClick={() => setShowSourceSelector(false)}
                className="px-4 py-2 bg-[#3a3a3a] hover:bg-[#4a4a4a] rounded text-sm"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Webcam Preview Modal */}
      {showWebcamPreview && webcamStream && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
          <div className="bg-[#1a1a1a] rounded-lg p-6 max-w-5xl w-full mx-4">
            {countdown !== null ? (
              // Countdown Display
              <div className="flex flex-col items-center justify-center" style={{ minHeight: '600px' }}>
                <div className="text-center">
                  <div className="text-9xl font-bold text-white mb-4">
                    {countdown === 0 ? 'GO!' : countdown}
                  </div>
                  <p className="text-xl text-gray-400">
                    {countdown === 0 ? 'Recording starting...' : 'Get ready...'}
                  </p>
                </div>
                
                {/* Small preview during countdown */}
                <div className="mt-8 relative bg-black rounded-lg overflow-hidden" style={{ width: '400px', aspectRatio: '16/9' }}>
                  <video
                    ref={webcamVideoCountdownRef}
                    autoPlay
                    muted
                    playsInline
                    className="w-full h-full object-contain"
                  />
                </div>
              </div>
            ) : (
              // Recording View
              <>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                      <span className="inline-block w-3 h-3 bg-red-600 rounded-full animate-pulse"></span>
                      <span className="text-lg font-semibold">Recording Webcam</span>
                    </div>
                    <span className="text-gray-400">
                      {Math.floor(recordingTime / 60)}:{String(recordingTime % 60).padStart(2, '0')}
                    </span>
                  </div>
                  <button
                    onClick={handleStopRecording}
                    className="px-6 py-2 bg-red-600 hover:bg-red-700 rounded text-sm font-medium transition-colors"
                  >
                    Stop Recording
                  </button>
                </div>
                
                {/* Video Preview */}
                <div className="relative bg-black rounded-lg overflow-hidden" style={{ aspectRatio: '16/9' }}>
                  <video
                    ref={webcamVideoRef}
                    autoPlay
                    muted
                    playsInline
                    className="w-full h-full object-contain"
                  />
                </div>
                
                <p className="text-sm text-gray-400 mt-3 text-center">
                  Your webcam is being recorded. Click "Stop Recording" when finished.
                </p>
              </>
            )}
          </div>
        </div>
      )}

      {/* Desktop Countdown Modal */}
      {desktopCountdown !== null && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
          <div className="bg-[#1a1a1a] rounded-lg p-6 max-w-5xl w-full mx-4">
            <div className="flex flex-col items-center justify-center" style={{ minHeight: '600px' }}>
              <div className="text-center">
                <div className="text-9xl font-bold text-white mb-4">
                  {desktopCountdown === 0 ? 'GO!' : desktopCountdown}
                </div>
                <p className="text-xl text-gray-400">
                  {desktopCountdown === 0 ? 'Recording starting...' : 'Get ready...'}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Desktop + Webcam Preview Modal (Loom-style) - Only show before recording starts */}
      {showDesktopWebcamPreview && desktopStream && !isDualRecording && webcamPreviewStream && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
          <div className="bg-[#1a1a1a] rounded-lg p-6 max-w-6xl w-full mx-4">
            {dualCountdown !== null ? (
              // Countdown Display
              <div className="flex flex-col items-center justify-center" style={{ minHeight: '600px' }}>
                <div className="text-center">
                  <div className="text-9xl font-bold text-white mb-4">
                    {dualCountdown === 0 ? 'GO!' : dualCountdown}
                  </div>
                  <p className="text-xl text-gray-400">
                    {dualCountdown === 0 ? 'Recording starting...' : 'Get ready...'}
                  </p>
                </div>
                
                {/* Preview during countdown */}
                <div className="mt-8 relative bg-black rounded-lg overflow-hidden" style={{ width: '600px', aspectRatio: '16/9' }}>
                  <video
                    ref={desktopVideoRef}
                    autoPlay
                    muted
                    playsInline
                    className="w-full h-full object-contain"
                  />
                  <div
                    className="absolute border-2 border-white rounded-lg overflow-hidden"
                    style={{
                      left: `${webcamOverlayPosition.x}%`,
                      top: `${webcamOverlayPosition.y}%`,
                      width: `${webcamOverlaySize.width}%`,
                      height: `${webcamOverlaySize.height}%`,
                    }}
                  >
                    <video
                      ref={webcamOverlayVideoRef}
                      autoPlay
                      muted
                      playsInline
                      className="w-full h-full object-cover"
                    />
                  </div>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-semibold">
                    {isDualRecording ? 'Recording Screen + Webcam' : 'Position Webcam Overlay'}
                  </h2>
              <div className="flex items-center gap-4">
                {isDualRecording && (
                  <div className="flex items-center gap-2">
                    <span className="inline-block w-3 h-3 bg-red-600 rounded-full animate-pulse"></span>
                    <span className="text-gray-400">
                      {Math.floor(recordingTime / 60)}:{String(recordingTime % 60).padStart(2, '0')}
                    </span>
                  </div>
                )}
                {!isDualRecording ? (
                  <button
                    onClick={() => {
                      desktopStream.getTracks().forEach(track => track.stop());
                      if (webcamPreviewStream) {
                        webcamPreviewStream.getTracks().forEach(track => track.stop());
                      }
                      setDesktopStream(null);
                      setWebcamPreviewStream(null);
                      setShowDesktopWebcamPreview(false);
                      setRecordingType(null);
                    }}
                    className="px-4 py-2 bg-[#3a3a3a] hover:bg-[#4a4a4a] rounded text-sm"
                  >
                    Cancel
                  </button>
                ) : (
                  <button
                    onClick={handleStopRecording}
                    className="px-6 py-2 bg-red-600 hover:bg-red-700 rounded text-sm font-medium transition-colors"
                  >
                    Stop Recording
                  </button>
                )}
              </div>
            </div>
            
            {/* Desktop Preview with Webcam Overlay */}
            <div className="relative bg-black rounded-lg overflow-hidden" style={{ aspectRatio: '16/9' }}>
              {/* Desktop Preview */}
              <video
                ref={desktopVideoRef}
                autoPlay
                muted
                playsInline
                className="w-full h-full object-contain"
              />
              
              {/* Webcam Overlay (draggable during recording, resizable when not recording) */}
              <div
                className={`absolute border-2 ${isDraggingOverlay || isResizingOverlay ? 'border-blue-400' : 'border-white'} rounded-lg cursor-move overflow-hidden`}
                style={{
                  left: `${webcamOverlayPosition.x}%`,
                  top: `${webcamOverlayPosition.y}%`,
                  width: `${webcamOverlaySize.width}%`,
                  height: `${webcamOverlaySize.height}%`,
                  pointerEvents: 'auto'
                }}
                onMouseDown={(e) => {
                  if ((e.target as HTMLElement).classList.contains('resize-handle')) return;
                  e.preventDefault();
                  setIsDraggingOverlay(true);
                  const rect = desktopVideoRef.current?.getBoundingClientRect();
                  if (rect) {
                    overlayDragStartRef.current = {
                      x: e.clientX - rect.left,
                      y: e.clientY - rect.top
                    };
                  }
                }}
              >
                {/* Use recording stream if recording, otherwise use preview stream */}
                {isDualRecording && webcamRecordingStream ? (
                  <video
                    ref={webcamRecordingVideoRef}
                    autoPlay
                    muted
                    playsInline
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <video
                    ref={webcamOverlayVideoRef}
                    autoPlay
                    muted
                    playsInline
                    className="w-full h-full object-cover"
                  />
                )}
                
                {/* Resize Handle (only visible when not recording) */}
                {!isDualRecording && (
                  <div
                    className="absolute bottom-0 right-0 w-4 h-4 bg-blue-500 cursor-se-resize resize-handle"
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      setIsResizingOverlay(true);
                      const rect = desktopVideoRef.current?.getBoundingClientRect();
                      if (rect) {
                        resizeStartRef.current = {
                          width: webcamOverlaySize.width,
                          height: webcamOverlaySize.height,
                          x: e.clientX - rect.left,
                          y: e.clientY - rect.top
                        };
                      }
                    }}
                  />
                )}
              </div>
            </div>
            
            {!isDualRecording && (
              <>
                <p className="text-sm text-gray-400 mt-3 text-center">
                  Drag to move the webcam overlay. Drag the corner to resize.
                </p>
                
                <div className="mt-6 flex justify-end gap-3">
                  <button
                    onClick={startDesktopWebcamRecording}
                    className="px-6 py-2 bg-red-600 hover:bg-red-700 rounded text-sm font-medium transition-colors"
                  >
                    Start Recording
                  </button>
                </div>
              </>
            )}
            {isDualRecording && (
              <p className="text-sm text-gray-400 mt-3 text-center">
                Recording in progress. Your screen and webcam are being recorded. You can drag the overlay to reposition it.
              </p>
            )}
              </>
            )}
          </div>
        </div>
      )}

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
            activeTab={activeMediaLibraryTab}
            onTabChange={setActiveMediaLibraryTab}
            transcript={timelineClips.length > 0 ? transcripts.get('timeline') : (selectedLibraryClip ? transcripts.get(selectedLibraryClip.filePath) : null)}
            transcriptionStatus={timelineClips.length > 0 ? (transcriptionStatus.get('timeline') || 'idle') : (selectedLibraryClip ? (transcriptionStatus.get(selectedLibraryClip.filePath) || 'idle') : 'idle')}
            transcriptionError={transcriptionError}
            onGenerateTranscript={handleGenerateTranscript}
            onTranscriptWordClick={handleTranscriptWordClick}
            // Effects panel props
            focusedClipId={focusedClipId}
            focusedClipFilter={timelineClips.find(c => c.id === focusedClipId)?.videoFilter}
            focusedClipOverlays={timelineClips.find(c => c.id === focusedClipId)?.overlayEffects}
            onFilterChange={(filter) => focusedClipId && handleClipFilterUpdate(focusedClipId, filter)}
            onOverlaysChange={(overlays) => focusedClipId && handleClipOverlayEffectsUpdate(focusedClipId, overlays)}
            onImportOverlay={async () => {
              if (!window.electronAPI) return null;
              try {
                const result = await window.electronAPI.importOverlayImage();
                if (result.success && result.filePath) {
                  return result.filePath;
                }
                return null;
              } catch (error) {
                console.error('Error importing overlay:', error);
                return null;
              }
            }}
            // Agent panel props
            onAgentSendMessage={handleAgentSendMessage}
            isAgentProcessing={isAgentProcessing}
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
            overlayVisible={overlayVisible}
            isRecording={isRecording}
            onToggleOverlay={() => setOverlayVisible(!overlayVisible)}
            track0Muted={track0Muted}
            track1Muted={track1Muted}
            onOverlayDrag={handleOverlayPositionUpdate}
          />
        </div>
      </div>

      {/* Timeline */}
      <div className={`${overlayTrackEnabled ? 'h-56' : 'h-40'} bg-[#1a1a1a] border-t border-[#3a3a3a]`}>
        <Timeline 
          timelineClips={timelineClips}
          focusedClipId={focusedClipId}
          playheadTime={playheadTime}
          isPlaying={isPlaying}
          onClipTrimUpdate={handleClipTrimUpdate}
          onClipFocus={setFocusedClipId}
          onPlayheadUpdate={setPlayheadTime}
          onClipReorder={(newClips) => setTimelineClips(newClips)}
          onClipDrop={handleAddClipToTimeline}
          onSplitClip={handleSplitClipAtPlayhead}
          track0Muted={track0Muted}
          track1Muted={track1Muted}
          onTrack0MuteToggle={handleTrack0MuteToggle}
          onTrack1MuteToggle={handleTrack1MuteToggle}
          onClipMuteToggle={handleClipMuteToggle}
          overlayTrackEnabled={overlayTrackEnabled}
          onToggleOverlayTrack={handleToggleOverlayTrack}
        />
      </div>
    </div>
  );
}

export default App;


