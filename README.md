# ClipForge

A desktop video editor for Mac and Windows built with Electron, React, and FFmpeg. ClipForge provides a minimal viable media processing pipeline focused on video trimming and export.

## Status

**Current Phase:** PR 2 (Drag-and-Drop Implementation) - In Progress  
**Foundation:** ✅ PR 1 Complete  
**Overall Progress:** 1 of 6 PRs Complete (17%)

## Features

### Current MVP Features
- ✅ Native desktop application for Mac and Windows
- ✅ Three-panel layout (Import, Preview, Timeline)
- ✅ Drag-and-drop file import
- 🚧 Video metadata extraction
- 🚧 Real-time video preview
- 🚧 Visual timeline with trim handles
- 🚧 Video export to MP4

### Planned Features
- Video trimming with visual drag handles
- Playhead synchronization with video preview
- Progress tracking for exports
- Native file save dialogs

## Tech Stack

| Component | Technology |
|-----------|------------|
| **Desktop Framework** | Electron (v39.0.0) |
| **UI Framework** | React (v19.2.0) |
| **Language** | TypeScript (v5.9.3) |
| **Styling** | Tailwind CSS (v3.4.18) |
| **Media Processing** | fluent-ffmpeg (v2.1.3) |
| **Build Tool** | Webpack + TypeScript |
| **Packager** | electron-builder |

## System Requirements

### Required Dependencies
- **Node.js** 16+ and npm
- **FFmpeg** - Must be installed and available in system PATH
  - Mac: `brew install ffmpeg`
  - Windows: Download from [ffmpeg.org](https://ffmpeg.org/download.html) and add to PATH

### Supported Platforms
- macOS 10.13+ (High Sierra or later)
- Windows 10+

## Installation

### Clone and Install

```bash
git clone https://github.com/amanyrath/spookyvids.git
cd spookyvids
npm install
```

### Development

```bash
# Start the application in development mode
npm start

# Build only (compile TypeScript and bundle)
npm run build

# Build native executable (current platform)
npm run package

# Build macOS DMG
npm run package:dmg
```

## Project Structure

```
spookyvids/
├── dist/                   # Compiled output
│   ├── main.js            # Main Electron process
│   ├── ipc-handlers.js     # IPC handlers
│   ├── preload.js          # Context bridge
│   └── index.html          # Built HTML
├── src/
│   ├── main/               # Electron main process
│   │   ├── main.ts         # Window management
│   │   ├── ipc-handlers.ts # IPC handler setup
│   │   └── preload.js      # Context bridge
│   └── renderer/           # React application
│       ├── App.tsx         # Main component
│       ├── index.tsx       # React entry point
│       ├── index.html      # HTML template
│       ├── index.css       # Tailwind styles
│       └── components/
│           ├── ImportArea.tsx    # File import area
│           ├── PreviewPlayer.tsx  # Video preview
│           └── Timeline.tsx        # Timeline UI
├── package.json
├── tsconfig.json           # Main process TS config
├── tsconfig.renderer.json  # Renderer TS config
├── webpack.config.js       # Webpack configuration
├── tailwind.config.js     # Tailwind configuration
└── ClipForge PRD.md       # Product requirements
```

## Development Workflow

The project follows a sequential PR-based development approach with 6 planned milestones:

### Completed
- ✅ **PR 1:** Foundation & Project Scaffolding
  - Electron setup with main process
  - React + TypeScript + Tailwind configured
  - Three-panel layout implemented
  - IPC infrastructure ready

### In Progress
- 🚧 **PR 2:** Drag-and-Drop & File Handling
  - D&D event listeners
  - File validation (.mp4/.mov)
  - IPC file transfer

### Planned
- ⏳ **PR 3:** Media Preview & Metadata Extraction
- ⏳ **PR 4:** Timeline & Trimming UI/Logic
- ⏳ **PR 5:** FFmpeg Export Logic
- ⏳ **PR 6:** Polish, Progress & Final Build

## Usage

### Importing Video
1. Launch the application
2. Drag and drop an MP4 or MOV file into the import area
3. Video loads with metadata extracted automatically

### Trimming Video
1. Drag the start handle on the timeline to set the in point
2. Drag the end handle to set the out point
3. Use the playhead to preview different positions
4. Video preview updates in real-time

### Exporting Video
1. Set your desired trim points
2. Click the Export button
3. Choose save location in the native dialog
4. Monitor progress during export
5. New MP4 file is created with trimmed content

## File Format Support

- **Input:** MP4, MOV only
- **Output:** MP4 only
- **Codec:** H.264 (libx264)
- **Quality:** Fixed CRF 23 (good quality, fast encode)

## Features NOT Included (MVP Scope)

The following are explicitly out of scope for the MVP to meet the 24-hour deadline:

- Recording features (screen, webcam, microphone)
- Multiple tracks or split/delete operations
- Timeline zooming or snap-to-clip
- Undo/redo functionality
- Text overlays, transitions, or filters
- Audio controls beyond basic export
- Media library or auto-generated thumbnails
- File picker interface
- Cloud storage or auto-save

## Contributing

This is a personal project following a specific development roadmap. Contributions are not currently accepted.

## License

ISC

## Repository

[GitHub Repository](https://github.com/amanyrath/spookyvids)
