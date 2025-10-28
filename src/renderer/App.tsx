import React, { useState } from 'react';
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
      onFileValidated: (callback: (event: any, data: any) => void) => void;
      onFileError: (callback: (event: any, error: any) => void) => void;
    };
  }
}

function App() {
  const [currentFile, setCurrentFile] = useState<string | null>(null);
  const [fileMetadata, setFileMetadata] = useState<any>(null);

  const handleFileLoaded = (filePath: string, fileName: string, metadata?: any) => {
    console.log('File loaded in App:', filePath, fileName, metadata);
    setCurrentFile(filePath);
    setFileMetadata(metadata);
  };

  const handleClipSelect = (filePath: string, metadata?: any) => {
    console.log('Clip selected:', filePath);
    setCurrentFile(filePath);
    setFileMetadata(metadata);
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

  return (
    <div className="h-screen flex flex-col bg-[#1a1a1a] text-white overflow-hidden">
      {/* Top Toolbar */}
      <div className="h-12 bg-[#252525] border-b border-[#3a3a3a] flex items-center justify-between px-6">
        <h1 className="text-lg font-semibold">ClipForge MVP</h1>
        <div className="flex items-center gap-3">
          <button 
            onClick={handleImportVideo}
            className="px-4 py-2 bg-[#3a3a3a] hover:bg-[#4a4a4a] rounded text-sm font-medium transition-colors"
          >
            Import Video
          </button>
          <button className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded text-sm font-medium transition-colors">
            Export
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
          <PreviewPlayer filePath={currentFile} metadata={fileMetadata} />
        </div>
      </div>

      {/* Timeline */}
      <div className="h-40 bg-[#1a1a1a] border-t border-[#3a3a3a]">
        <Timeline />
      </div>
    </div>
  );
}

export default App;


