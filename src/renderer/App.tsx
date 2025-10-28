import React from 'react';
import ImportArea from './components/ImportArea';
import PreviewPlayer from './components/PreviewPlayer';
import Timeline from './components/Timeline';

function App() {
  return (
    <div className="h-screen flex flex-col bg-[#1a1a1a] text-white overflow-hidden">
      {/* Top Toolbar */}
      <div className="h-12 bg-[#252525] border-b border-[#3a3a3a] flex items-center justify-between px-6">
        <h1 className="text-lg font-semibold">ClipForge MVP</h1>
        <div className="flex items-center gap-3">
          <button className="px-4 py-2 bg-[#3a3a3a] hover:bg-[#4a4a4a] rounded text-sm font-medium transition-colors">
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
          <ImportArea />
        </div>

        {/* Preview Area */}
        <div className="flex-1 bg-[#0d0d0d]">
          <PreviewPlayer />
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


