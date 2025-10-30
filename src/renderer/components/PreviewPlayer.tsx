import React, { useRef, useEffect, useState } from 'react';

interface TimelineClip {
  id: string;
  filePath: string;
  fileName: string;
  metadata: any;
  startTime: number;
  duration: number;
  inTime: number;
  outTime: number;
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

interface PreviewPlayerProps {
  filePath: string | null;
  metadata?: any;
  timelineClips?: TimelineClip[];
  playheadTime?: number;
  isPlaying?: boolean;
  setIsPlaying?: (playing: boolean) => void;
  onTimeUpdate?: (currentTime: number) => void;
  overlayVisible?: boolean; // Control overlay visibility
  isRecording?: boolean; // Hide toggle during recording
  onToggleOverlay?: () => void; // Callback to toggle overlay visibility
  track0Muted?: boolean; // Track 0 mute state
  track1Muted?: boolean; // Track 1 mute state
  onOverlayDrag?: (clipId: string, overlayId: string, position: { x: number; y: number }) => void; // Drag callback
}

function PreviewPlayer({ 
  filePath, 
  metadata, 
  timelineClips = [],
  playheadTime = 0, 
  isPlaying,
  setIsPlaying,
  onTimeUpdate,
  overlayVisible = true,
  isRecording = false,
  onToggleOverlay,
  track0Muted = false,
  track1Muted = false,
  onOverlayDrag
}: PreviewPlayerProps) {
  const mainVideoRef = useRef<HTMLVideoElement>(null);
  const overlayVideoRef = useRef<HTMLVideoElement>(null);
  const previewContainerRef = useRef<HTMLDivElement>(null);
  const [draggingOverlay, setDraggingOverlay] = useState<{ clipId: string; overlayId: string } | null>(null);
  const dragOffsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  
  // Determine preview mode
  const isLibraryPreview = filePath && timelineClips.length === 0;
  const isTimelinePreview = timelineClips.length > 0;
  
  // Get current clip and source for preview (both main and overlay tracks)
  const getCurrentClipsAndSources = (): { 
    mainClip: TimelineClip | null; 
    overlayClip: TimelineClip | null;
    mainFileSource: string | null; 
    overlayFileSource: string | null;
    timeInMainClip: number;
    timeInOverlayClip: number;
  } => {
    if (isLibraryPreview) {
      // Library preview mode: show selected clip
      return { 
        mainClip: null, 
        overlayClip: null,
        mainFileSource: filePath, 
        overlayFileSource: null,
        timeInMainClip: playheadTime,
        timeInOverlayClip: 0
      };
    }
    
    if (isTimelinePreview) {
      // Timeline preview mode: find clips at playhead time for BOTH tracks
      let mainClip: TimelineClip | null = null;
      let overlayClip: TimelineClip | null = null;
      let timeInMainClip = 0;
      let timeInOverlayClip = 0;
      
      // Find Track 0 (main) clip
      for (const clip of timelineClips.filter(c => (c.track ?? 0) === 0)) {
        const clipEndTime = clip.startTime + (clip.outTime - clip.inTime);
        if (playheadTime >= clip.startTime && playheadTime < clipEndTime) {
          mainClip = clip;
          timeInMainClip = playheadTime - clip.startTime + clip.inTime;
          break;
        }
      }
      
      // Find Track 1 (overlay) clip
      for (const clip of timelineClips.filter(c => (c.track ?? 0) === 1)) {
        const clipEndTime = clip.startTime + (clip.outTime - clip.inTime);
        if (playheadTime >= clip.startTime && playheadTime < clipEndTime) {
          overlayClip = clip;
          timeInOverlayClip = playheadTime - clip.startTime + clip.inTime;
          break;
        }
      }
      
      // Use last clip if playhead is beyond all clips
      if (!mainClip) {
        const track0Clips = timelineClips.filter(c => (c.track ?? 0) === 0);
        if (track0Clips.length > 0) {
          mainClip = track0Clips[track0Clips.length - 1];
          timeInMainClip = mainClip.outTime;
        }
      }
      
      return {
        mainClip,
        overlayClip,
        mainFileSource: mainClip?.filePath || null,
        overlayFileSource: overlayClip?.filePath || null,
        timeInMainClip,
        timeInOverlayClip
      };
    }
    
    return { 
      mainClip: null, 
      overlayClip: null,
      mainFileSource: null, 
      overlayFileSource: null,
      timeInMainClip: 0,
      timeInOverlayClip: 0
    };
  };

  const { mainClip, overlayClip, mainFileSource, overlayFileSource, timeInMainClip, timeInOverlayClip } = getCurrentClipsAndSources();
  
  // Map filter names to CSS filter strings
  const getCSSFilter = (filterName?: string): string => {
    if (!filterName) return '';
    
    switch (filterName) {
      case 'grayscale':
        // Simple grayscale - very fast
        return 'grayscale(100%)';
      case 'xray':
        // Simplified x-ray: just invert + high contrast (removed grayscale for performance)
        // This is much faster than stacking 4 filters
        return 'invert(1) contrast(150%)';
      case 'sepia':
        // Simple sepia - very fast
        return 'sepia(100%)';
      case 'vintage':
        // Simplified vintage: removed blur (expensive), kept sepia + contrast
        return 'sepia(90%) contrast(1.15)';
      case 'blur':
        // Reduced blur radius from 5px to 3px for better performance
        return 'blur(3px)';
      case 'bright':
        // Slightly reduced brightness increase
        return 'brightness(1.4)';
      case 'dark':
        // Brightness adjustment
        return 'brightness(0.7)';
      case 'high-contrast':
        // Reduced from 200% to 180% for smoother performance
        return 'contrast(180%)';
      case 'flicker':
        // Flicker effect uses CSS animation, return base desaturation
        return 'saturation(0.7)';
      default:
        return '';
    }
  };
  
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  useEffect(() => {
    // Load main video when source changes
    if (mainVideoRef.current && mainFileSource) {
      if (mainVideoRef.current.src !== mainFileSource) {
        mainVideoRef.current.src = mainFileSource;
        mainVideoRef.current.load();
      }
    }
    
    // Load overlay video when source changes
    if (overlayVideoRef.current && overlayFileSource) {
      if (overlayVideoRef.current.src !== overlayFileSource) {
        overlayVideoRef.current.src = overlayFileSource;
        overlayVideoRef.current.load();
      }
    }
  }, [mainFileSource, overlayFileSource]);

  // Sync video players with playhead
  useEffect(() => {
    // Sync main video
    if (mainVideoRef.current && mainFileSource) {
      const currentTime = mainVideoRef.current.currentTime;
      if (Math.abs(currentTime - timeInMainClip) > 0.1) {
        mainVideoRef.current.currentTime = timeInMainClip;
      }
    }
    
    // Sync overlay video
    if (overlayVideoRef.current && overlayFileSource) {
      const currentTime = overlayVideoRef.current.currentTime;
      if (Math.abs(currentTime - timeInOverlayClip) > 0.1) {
        overlayVideoRef.current.currentTime = timeInOverlayClip;
      }
    }
  }, [timeInMainClip, timeInOverlayClip, mainFileSource, overlayFileSource]);

  // Handle play/pause
  useEffect(() => {
    if (mainVideoRef.current) {
      if (isPlaying) {
        // Ensure video is at the correct position
        if (Math.abs(mainVideoRef.current.currentTime - timeInMainClip) > 0.1) {
          mainVideoRef.current.currentTime = timeInMainClip;
        }
        mainVideoRef.current.play().catch(err => console.log('Main play error:', err));
      } else {
        mainVideoRef.current.pause();
      }
    }
    
    // Play/pause overlay video
    if (overlayVideoRef.current && overlayFileSource) {
      if (isPlaying) {
        if (Math.abs(overlayVideoRef.current.currentTime - timeInOverlayClip) > 0.1) {
          overlayVideoRef.current.currentTime = timeInOverlayClip;
        }
        overlayVideoRef.current.play().catch(err => console.log('Overlay play error:', err));
      } else {
        overlayVideoRef.current.pause();
      }
    }
  }, [isPlaying, timeInMainClip, timeInOverlayClip, overlayFileSource]);

  // Update playhead from video time (for timeline mode)
  useEffect(() => {
    if (mainVideoRef.current && isPlaying && onTimeUpdate) {
      const handleTimeUpdate = () => {
        if (mainVideoRef.current && mainVideoRef.current.readyState >= 2) {
          const videoTime = mainVideoRef.current.currentTime;
          
          if (isTimelinePreview && mainClip) {
            // Convert video time to timeline time
            const timelineTime = mainClip.startTime + (videoTime - mainClip.inTime);
            const clipEndTime = mainClip.startTime + (mainClip.outTime - mainClip.inTime);
            
            // Check if we've reached the end of the current clip
            if (videoTime >= mainClip.outTime) {
              // Find next clip in Track 0
              const track0Clips = timelineClips.filter(c => (c.track ?? 0) === 0);
              const currentIndex = track0Clips.findIndex(c => c.id === mainClip.id);
              if (currentIndex < track0Clips.length - 1) {
                // Move to next clip
                const nextClip = track0Clips[currentIndex + 1];
                onTimeUpdate(nextClip.startTime);
              } else {
                // No more clips, pause at end
                if (mainVideoRef.current) {
                  mainVideoRef.current.pause();
                  setIsPlaying?.(false);
                }
                onTimeUpdate(clipEndTime);
              }
            } else if (onTimeUpdate) {
              onTimeUpdate(timelineTime);
            }
          } else if (isLibraryPreview) {
            // Library preview: just update with video time
            onTimeUpdate(videoTime);
          }
        }
      };
      
      mainVideoRef.current.addEventListener('timeupdate', handleTimeUpdate);
      return () => {
        mainVideoRef.current?.removeEventListener('timeupdate', handleTimeUpdate);
      };
    }
  }, [isPlaying, onTimeUpdate, isTimelinePreview, isLibraryPreview, mainClip, timelineClips, setIsPlaying]);

  // Handle overlay image drag
  const handleOverlayMouseDown = (e: React.MouseEvent, clipId: string, overlayId: string, currentPosition: { x: number; y: number }) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (!previewContainerRef.current) return;
    
    const container = previewContainerRef.current.getBoundingClientRect();
    const offsetX = (e.clientX - container.left) / container.width * 100 - currentPosition.x;
    const offsetY = (e.clientY - container.top) / container.height * 100 - currentPosition.y;
    
    dragOffsetRef.current = { x: offsetX, y: offsetY };
    setDraggingOverlay({ clipId, overlayId });
  };

  useEffect(() => {
    if (!draggingOverlay) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!previewContainerRef.current || !onOverlayDrag) return;
      
      const container = previewContainerRef.current.getBoundingClientRect();
      const x = ((e.clientX - container.left) / container.width * 100) - dragOffsetRef.current.x;
      const y = ((e.clientY - container.top) / container.height * 100) - dragOffsetRef.current.y;
      
      // Clamp to 0-100
      const clampedX = Math.max(0, Math.min(100, x));
      const clampedY = Math.max(0, Math.min(100, y));
      
      onOverlayDrag(draggingOverlay.clipId, draggingOverlay.overlayId, { x: clampedX, y: clampedY });
    };

    const handleMouseUp = () => {
      setDraggingOverlay(null);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [draggingOverlay, onOverlayDrag]);

  return (
    <div className="h-full flex flex-col">
      {/* CSS Keyframes for TV Flicker Effect */}
      <style>{`
        @keyframes tvFlicker {
          0%, 100% { filter: brightness(1); }
          2% { filter: brightness(0.3); }
          4% { filter: brightness(1.2); }
          5% { filter: brightness(0.4); }
          6% { filter: brightness(1); }
          8% { filter: brightness(0.2); }
          9% { filter: brightness(1.3); }
          10% { filter: brightness(1); }
          15% { filter: brightness(0.5); }
          16% { filter: brightness(1); }
          20% { filter: brightness(0.8); }
          22% { filter: brightness(1.4); }
          23% { filter: brightness(0.3); }
          24% { filter: brightness(1); }
          30% { filter: brightness(0.9); }
          32% { filter: brightness(0.2); }
          33% { filter: brightness(1.1); }
          34% { filter: brightness(1); }
          40% { filter: brightness(0.4); }
          42% { filter: brightness(1.2); }
          43% { filter: brightness(1); }
          50% { filter: brightness(0.3); }
          52% { filter: brightness(1.3); }
          53% { filter: brightness(0.6); }
          54% { filter: brightness(1); }
          60% { filter: brightness(0.7); }
          62% { filter: brightness(1.1); }
          63% { filter: brightness(1); }
          70% { filter: brightness(0.2); }
          72% { filter: brightness(1.4); }
          73% { filter: brightness(0.5); }
          74% { filter: brightness(1); }
          80% { filter: brightness(0.8); }
          82% { filter: brightness(1.2); }
          83% { filter: brightness(1); }
          90% { filter: brightness(0.4); }
          92% { filter: brightness(1.1); }
          93% { filter: brightness(1); }
          95% { filter: brightness(0.3); }
          96% { filter: brightness(1.2); }
          97% { filter: brightness(1); }
        }
        .tv-flicker {
          animation: tvFlicker 0.3s infinite;
        }
        .scan-lines {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: repeating-linear-gradient(
            0deg,
            transparent,
            transparent 2px,
            rgba(0, 0, 0, 0.12) 2px,
            rgba(0, 0, 0, 0.12) 4px
          );
          pointer-events: none;
          z-index: 1;
        }
      `}</style>
      {/* Video Preview Area (16:9 aspect ratio) */}
      <div className="flex-1 flex items-center justify-center bg-black p-8">
        {/* Maintain 16:9 aspect ratio container */}
          <div 
            ref={previewContainerRef}
            className="w-full max-w-5xl aspect-video bg-[#0a0a0a] border border-[#2a2a2a] rounded overflow-hidden flex items-center justify-center relative"
          >
          {mainFileSource || overlayFileSource ? (
            <>
              {/* Main Video (Track 0) */}
              {mainFileSource && (
                <video
                  ref={mainVideoRef}
                  src={mainFileSource}
                  className={`w-full h-full object-contain ${mainClip?.videoFilter === 'flicker' ? 'tv-flicker' : ''}`}
                  controls
                  muted={mainClip?.muted || track0Muted}
                  style={{
                    filter: getCSSFilter(mainClip?.videoFilter),
                    transform: 'translateZ(0)', // Force GPU acceleration
                    willChange: mainClip?.videoFilter ? 'filter' : 'auto' // Hint to browser for optimization
                  }}
                />
              )}
              {/* Scan Lines Overlay for Flicker Effect */}
              {mainClip?.videoFilter === 'flicker' && mainFileSource && (
                <div className="scan-lines" />
              )}
              
              {/* Overlay Video (Track 1) - Picture-in-Picture */}
              {overlayFileSource && overlayVisible && overlayClip && (
                <video
                  ref={overlayVideoRef}
                  src={overlayFileSource}
                  className={`absolute object-cover rounded border-2 border-white shadow-lg ${overlayClip?.videoFilter === 'flicker' ? 'tv-flicker' : ''}`}
                  style={{
                    width: `${overlayClip.overlaySize?.width || 25}%`,
                    height: `${overlayClip.overlaySize?.height || 25}%`,
                    right: `${100 - (overlayClip.overlayPosition?.x || 75) - (overlayClip.overlaySize?.width || 25)}%`,
                    bottom: `${100 - (overlayClip.overlayPosition?.y || 75) - (overlayClip.overlaySize?.height || 25)}%`,
                    filter: getCSSFilter(overlayClip?.videoFilter),
                    transform: 'translateZ(0)', // Force GPU acceleration
                    willChange: overlayClip?.videoFilter ? 'filter' : 'auto' // Hint to browser for optimization
                  }}
                  muted={overlayClip?.muted || track1Muted}
                />
              )}
              {/* Scan Lines Overlay for Overlay Video Flicker Effect */}
              {overlayClip?.videoFilter === 'flicker' && overlayFileSource && overlayVisible && (
                <div className="scan-lines" style={{ zIndex: 2 }} />
              )}
              
              {/* Overlay Effects (Image Overlays) - now supporting multiple */}
              {mainClip?.overlayEffects?.map((overlay) => (
                <img
                  key={overlay.id}
                  src={overlay.filePath}
                  alt="Overlay effect"
                  className={`absolute select-none ${draggingOverlay?.overlayId === overlay.id ? 'cursor-grabbing' : 'cursor-grab'}`}
                  style={{
                    left: `${overlay.position.x}%`,
                    top: `${overlay.position.y}%`,
                    width: `${overlay.size.width}%`,
                    height: `${overlay.size.height}%`,
                    opacity: overlay.opacity,
                    objectFit: 'contain',
                    pointerEvents: 'auto',
                    transform: draggingOverlay?.overlayId === overlay.id ? 'scale(1.05)' : 'scale(1)',
                    transition: draggingOverlay?.overlayId === overlay.id ? 'none' : 'transform 0.1s'
                  }}
                  onMouseDown={(e) => mainClip && handleOverlayMouseDown(e, mainClip.id, overlay.id, overlay.position)}
                  draggable={false}
                />
              ))}
              {overlayClip?.overlayEffects?.map((overlay) => overlayVisible && (
                <img
                  key={overlay.id}
                  src={overlay.filePath}
                  alt="Overlay effect"
                  className={`absolute select-none ${draggingOverlay?.overlayId === overlay.id ? 'cursor-grabbing' : 'cursor-grab'}`}
                  style={{
                    left: `${overlay.position.x}%`,
                    top: `${overlay.position.y}%`,
                    width: `${overlay.size.width}%`,
                    height: `${overlay.size.height}%`,
                    opacity: overlay.opacity,
                    objectFit: 'contain',
                    pointerEvents: 'auto',
                    transform: draggingOverlay?.overlayId === overlay.id ? 'scale(1.05)' : 'scale(1)',
                    transition: draggingOverlay?.overlayId === overlay.id ? 'none' : 'transform 0.1s'
                  }}
                  onMouseDown={(e) => overlayClip && handleOverlayMouseDown(e, overlayClip.id, overlay.id, overlay.position)}
                  draggable={false}
                />
              ))}
              
              {/* Overlay Toggle Button (Loom-style) */}
              {overlayFileSource && !isRecording && onToggleOverlay && (
                <button
                  onClick={onToggleOverlay}
                  className="absolute top-4 right-4 p-2 bg-black/50 hover:bg-black/70 rounded-full transition-colors z-10"
                  title={overlayVisible ? "Hide overlay" : "Show overlay"}
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    {overlayVisible ? (
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    ) : (
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                    )}
                  </svg>
                </button>
              )}
            </>
          ) : (
            <div className="text-center">
              <svg className="w-24 h-24 mx-auto mb-4 text-[#2a2a2a]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              <p className="text-gray-500 text-sm">
                {timelineClips.length === 0 
                  ? 'Select a clip from the library or add clips to timeline' 
                  : 'No video loaded'}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Playback Controls Bar */}
      <div className="h-16 bg-[#1a1a1a] border-t border-[#3a3a3a] flex items-center justify-between px-8">
        <div className="flex items-center gap-2">
          <button 
            onClick={() => {
              if (isTimelinePreview) {
                // Timeline mode: jump back 5s on timeline
                onTimeUpdate?.(Math.max(0, playheadTime - 5));
              } else if (mainVideoRef.current) {
                // Library mode: jump back 5s in video
                mainVideoRef.current.currentTime = Math.max(0, mainVideoRef.current.currentTime - 5);
              }
            }}
            className="p-2 hover:bg-[#2a2a2a] rounded transition-colors"
            title="Rewind 5s"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12.066 11.2a1 1 0 000 1.6l5.334 4A1 1 0 0019 16V8a1 1 0 00-1.6-.8l-5.334 4zM4.066 11.2a1 1 0 000 1.6l5.334 4A1 1 0 0011 16V8a1 1 0 00-1.6-.8l-5.334 4z" />
            </svg>
          </button>
          <button 
            onClick={() => {
              setIsPlaying?.(!isPlaying);
            }}
            className="p-2 bg-purple-900 hover:bg-purple-800 rounded transition-colors"
            title={isPlaying ? "Pause" : "Play"}
          >
            {isPlaying ? (
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 00-1 1v2a1 1 0 001 1h6a1 1 0 001-1V9a1 1 0 00-1-1H7z" clipRule="evenodd" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z"/>
              </svg>
            )}
          </button>
          <button 
            onClick={() => {
              if (isTimelinePreview) {
                // Timeline mode: jump forward 5s on timeline
                const totalDuration = timelineClips.length > 0
                  ? timelineClips[timelineClips.length - 1].startTime + 
                    (timelineClips[timelineClips.length - 1].outTime - timelineClips[timelineClips.length - 1].inTime)
                  : 0;
                onTimeUpdate?.(Math.min(totalDuration, playheadTime + 5));
              } else if (mainVideoRef.current) {
                // Library mode: jump forward 5s in video
                mainVideoRef.current.currentTime = Math.min(mainVideoRef.current.duration, mainVideoRef.current.currentTime + 5);
              }
            }}
            className="p-2 hover:bg-[#2a2a2a] rounded transition-colors"
            title="Forward 5s"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
        
        <div className="flex-1 flex items-center justify-center px-8">
          {/* Timeline scrubbing bar will go here */}
          <div className="w-full h-1 bg-[#2a2a2a] rounded-full"></div>
        </div>

        <div className="text-xs text-gray-400 font-mono">
          {formatTime(mainVideoRef.current?.currentTime || 0)} / {
            isTimelinePreview && timelineClips.length > 0
              ? formatTime(Math.max(
                  ...timelineClips.map(c => c.startTime + (c.outTime - c.inTime))
                ))
              : formatTime(metadata?.duration || 0)
          }
        </div>
      </div>
    </div>
  );
}

export default PreviewPlayer;


