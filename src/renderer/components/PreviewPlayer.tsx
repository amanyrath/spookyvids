import React, { useRef, useEffect } from 'react';

interface TimelineClip {
  id: string;
  filePath: string;
  fileName: string;
  metadata: any;
  startTime: number;
  duration: number;
  inTime: number;
  outTime: number;
}

interface PreviewPlayerProps {
  filePath: string | null;
  metadata?: any;
  timelineClips?: TimelineClip[];
  playheadTime?: number;
  isPlaying?: boolean;
  setIsPlaying?: (playing: boolean) => void;
  onTimeUpdate?: (currentTime: number) => void;
}

function PreviewPlayer({ 
  filePath, 
  metadata, 
  timelineClips = [],
  playheadTime = 0, 
  isPlaying, 
  setIsPlaying, 
  onTimeUpdate 
}: PreviewPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  
  // Determine preview mode
  const isLibraryPreview = filePath && timelineClips.length === 0;
  const isTimelinePreview = timelineClips.length > 0;
  
  // Get current clip and source for preview
  const getCurrentClipAndSource = (): { clip: TimelineClip | null; currentFileSource: string | null; timeInClip: number } => {
    if (isLibraryPreview) {
      // Library preview mode: show selected clip
      return { clip: null, currentFileSource: filePath, timeInClip: playheadTime };
    }
    
    if (isTimelinePreview) {
      // Timeline preview mode: find clip at playhead time
      for (const clip of timelineClips) {
        const clipEndTime = clip.startTime + (clip.outTime - clip.inTime);
        console.log('Checking clip:', { 
          clipId: clip.id, 
          clipStartTime: clip.startTime, 
          clipEndTime, 
          playheadTime,
          inTime: clip.inTime,
          outTime: clip.outTime
        });
        if (playheadTime >= clip.startTime && playheadTime < clipEndTime) {
          // Playhead is within this clip
          const timeInClip = playheadTime - clip.startTime + clip.inTime;
          console.log('Found clip! timeInClip:', timeInClip);
          return { clip, currentFileSource: clip.filePath, timeInClip };
        }
      }
      // Playhead is beyond all clips
      console.log('Playhead not in any clip, using last clip');
      if (timelineClips.length > 0) {
        const lastClip = timelineClips[timelineClips.length - 1];
        return { clip: lastClip, currentFileSource: lastClip.filePath, timeInClip: lastClip.outTime };
      }
    }
    
    return { clip: null, currentFileSource: null, timeInClip: 0 };
  };

  const { clip: currentClip, currentFileSource, timeInClip } = getCurrentClipAndSource();
  
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  useEffect(() => {
    if (videoRef.current && currentFileSource) {
      // Load video when source changes
      if (videoRef.current.src !== currentFileSource) {
        videoRef.current.src = currentFileSource;
        videoRef.current.load();
      }
    }
  }, [currentFileSource]);

  // Sync video player with playhead
  useEffect(() => {
    if (videoRef.current && currentFileSource) {
      // Sync video time to timeInClip
      const currentTime = videoRef.current.currentTime;
      if (Math.abs(currentTime - timeInClip) > 0.1) {
        videoRef.current.currentTime = timeInClip;
      }
    }
  }, [timeInClip, currentFileSource]);

  // Handle play/pause
  useEffect(() => {
    if (videoRef.current) {
      if (isPlaying) {
        // Ensure video is at the correct position
        if (Math.abs(videoRef.current.currentTime - timeInClip) > 0.1) {
          videoRef.current.currentTime = timeInClip;
        }
        videoRef.current.play().catch(err => console.log('Play error:', err));
      } else {
        videoRef.current.pause();
      }
    }
  }, [isPlaying, timeInClip]);

  // Update playhead from video time (for timeline mode)
  useEffect(() => {
    if (videoRef.current && isPlaying && onTimeUpdate) {
      const handleTimeUpdate = () => {
        if (videoRef.current && videoRef.current.readyState >= 2) {
          const videoTime = videoRef.current.currentTime;
          
          if (isTimelinePreview && currentClip) {
            // Convert video time to timeline time
            const timelineTime = currentClip.startTime + (videoTime - currentClip.inTime);
            const clipEndTime = currentClip.startTime + (currentClip.outTime - currentClip.inTime);
            
            // Check if we've reached the end of the current clip
            if (videoTime >= currentClip.outTime) {
              // Find next clip
              const currentIndex = timelineClips.findIndex(c => c.id === currentClip.id);
              if (currentIndex < timelineClips.length - 1) {
                // Move to next clip
                const nextClip = timelineClips[currentIndex + 1];
                onTimeUpdate(nextClip.startTime);
              } else {
                // No more clips, pause at end
                if (videoRef.current) {
                  videoRef.current.pause();
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
      
      videoRef.current.addEventListener('timeupdate', handleTimeUpdate);
      return () => {
        videoRef.current?.removeEventListener('timeupdate', handleTimeUpdate);
      };
    }
  }, [isPlaying, onTimeUpdate, isTimelinePreview, isLibraryPreview, currentClip, timelineClips, setIsPlaying]);

  return (
    <div className="h-full flex flex-col">
      {/* Video Preview Area (16:9 aspect ratio) */}
      <div className="flex-1 flex items-center justify-center bg-black p-8">
        {/* Maintain 16:9 aspect ratio container */}
          <div className="w-full max-w-5xl aspect-video bg-[#0a0a0a] border border-[#2a2a2a] rounded overflow-hidden flex items-center justify-center relative">
          {currentFileSource ? (
            <video
              ref={videoRef}
              src={currentFileSource}
              className="w-full h-full object-contain"
              controls
            />
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
              } else if (videoRef.current) {
                // Library mode: jump back 5s in video
                videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime - 5);
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
              } else if (videoRef.current) {
                // Library mode: jump forward 5s in video
                videoRef.current.currentTime = Math.min(videoRef.current.duration, videoRef.current.currentTime + 5);
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
          {formatTime(videoRef.current?.currentTime || 0)} / {
            isTimelinePreview && timelineClips.length > 0
              ? formatTime(timelineClips[timelineClips.length - 1].startTime + 
                  (timelineClips[timelineClips.length - 1].outTime - timelineClips[timelineClips.length - 1].inTime))
              : formatTime(metadata?.duration || 0)
          }
        </div>
      </div>
    </div>
  );
}

export default PreviewPlayer;


