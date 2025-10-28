import React, { useState, useEffect } from 'react';

interface ImportAreaProps {
  onFileLoaded?: (filePath: string, fileName: string, metadata?: any) => void;
  onImportClick?: () => void;
  onClipSelect?: (filePath: string, metadata?: any) => void;
  selectedClipPath?: string | null;
}

interface ClipInfo {
  fileName: string;
  filePath: string;
  thumbnail?: string;
  duration?: number;
}

function ImportArea({ onFileLoaded, onImportClick, onClipSelect, selectedClipPath }: ImportAreaProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [loadedClips, setLoadedClips] = useState<ClipInfo[]>([]);

  const handleClipClick = (clip: ClipInfo) => {
    console.log('Clip clicked:', clip.fileName);
    if (onClipSelect) {
      onClipSelect(clip.filePath, {
        filePath: clip.filePath,
        duration: clip.duration,
        fileName: clip.fileName
      });
    }
  };

  const handleClick = () => {
    if (onImportClick) {
      onImportClick();
    }
  };

  const handleFileValidation = async (filePath: string) => {
    if (!filePath) return;
    
    if (window.electronAPI) {
      try {
        const result = await window.electronAPI.sendFilePath(filePath);
        console.log('File validation result:', result);
        
        if (result?.valid) {
          console.log('File is valid!');
        } else {
          console.error('File is invalid:', result?.reason);
          alert(`File rejected: ${result?.reason || 'Invalid file type'}`);
        }
      } catch (error) {
        console.error('Error sending file path:', error);
        alert('Error processing file. Please try again.');
      }
    }
  };

  useEffect(() => {
    console.log('Setting up IPC listeners, electronAPI available:', !!window.electronAPI);
    
    const handleFileValidated = (event: any, data: any) => {
      console.log('File validated event received:', data);
      if (data?.filePath) {
        const fileName = data.filePath.split(/[/\\]/).pop() || 'unknown';
        console.log('Adding clip:', fileName);
        
        // Store clip info with thumbnail
        const clipInfo: ClipInfo = {
          fileName,
          filePath: data.filePath,
          thumbnail: data.thumbnail,
          duration: data.duration
        };
        
        // Add to the array of clips
        setLoadedClips(prevClips => {
          // Check if clip already exists (avoid duplicates)
          const exists = prevClips.some(clip => clip.filePath === data.filePath);
          if (exists) return prevClips;
          return [...prevClips, clipInfo];
        });
        
        if (onFileLoaded) {
          // Pass metadata if available - pass all the data object
          onFileLoaded(data.filePath, fileName, data);
        }
      }
    };

    const handleFileError = (event: any, error: any) => {
      console.error('File error event received:', error);
      alert(error?.message || 'File error occurred');
    };

    // Set up listeners if electronAPI is available
    if (window.electronAPI) {
      const cleanupValidated = window.electronAPI.onFileValidated(handleFileValidated);
      const cleanupError = window.electronAPI.onFileError(handleFileError);
      
      return () => {
        if (cleanupValidated) cleanupValidated();
        if (cleanupError) cleanupError();
      };
    } else {
      console.warn('electronAPI not available, IPC will not work');
    }
  }, [onFileLoaded]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    console.log('Dropped files:', files.length);
    
    if (files.length > 0) {
      // Process each dropped file
      for (const file of files) {
        console.log('Processing file:', file.name);
        
        // Get file path using Electron's webUtils API
        let filePath: string | undefined;
        
        if (window.electronAPI?.getFilePath) {
          try {
            filePath = window.electronAPI.getFilePath(file);
            console.log('File path from webUtils:', filePath);
          } catch (error) {
            console.error('Error getting file path from webUtils:', error);
          }
        }
        
        if (!filePath) {
          console.warn(`Could not get path for file: ${file.name}. Trying fallback...`);
          // Fallback: Use the file name (won't work, but won't crash)
          alert('Unable to access file path. Please use the import button to select files.');
          continue;
        }
        
        // Validate and process this file
        await handleFileValidation(filePath);
      }
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Media Library Header */}
      <div className="px-4 py-3 border-b border-[#3a3a3a]">
        <h2 className="text-sm font-semibold text-white">Media Library</h2>
      </div>

      {/* Media Browser */}
      <div className="flex-1 p-3 overflow-y-auto">
        {/* Empty State - Drag and Drop */}
        <div className="space-y-2">
          {/* Display multiple clips */}
          {loadedClips.length > 0 && (
            <div className="space-y-2">
              {loadedClips.map((clip, index) => (
                <div 
                  key={index} 
                  onClick={() => handleClipClick(clip)}
                  className={`border rounded-lg bg-[#1a1a1a] overflow-hidden transition-colors cursor-pointer ${
                    selectedClipPath === clip.filePath 
                      ? 'border-purple-700 bg-[#2a1a3a]' 
                      : 'border-[#3a3a3a] hover:border-[#4a4a4a]'
                  }`}
                >
                  {clip.thumbnail ? (
                    <img 
                      src={clip.thumbnail} 
                      alt={clip.fileName}
                      className="w-full h-32 object-cover"
                    />
                  ) : (
                    <div className="w-full h-32 bg-[#0a0a0a] flex items-center justify-center">
                      <svg className="w-16 h-16 text-[#2a2a2a]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                    </div>
                  )}
                  <div className="p-3">
                    <p className="text-sm text-white font-medium truncate">{clip.fileName}</p>
                    {clip.duration && (
                      <p className="text-xs text-gray-400 mt-1">
                        {Math.floor(clip.duration)}s
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
          
          {/* Always show the drag-and-drop area for adding more clips */}
          <div
            onClick={handleClick}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-lg flex items-center justify-center bg-[#1a1a1a] transition-all cursor-pointer ${
              isDragging 
                ? 'border-purple-700 bg-[#2a1a3a]' 
                : 'border-[#3a3a3a] hover:border-[#4a4a4a]'
            }`}
          >
            <div className="text-center p-6">
              <svg className="w-12 h-12 mx-auto mb-3 text-[#4a4a4a]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              <p className="text-xs text-gray-400 mb-1">
                {loadedClips.length === 0 ? 'Drop video files here' : 'Add more videos'}
              </p>
              <p className="text-xs text-gray-500">or click to browse (multi-select)</p>
              <p className="text-xs text-gray-400 mt-2">MP4 or MOV</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ImportArea;


