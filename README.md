# Spooky Clips

A desktop video editor for Mac and Windows built with Electron, React, and FFmpeg. Spooky Clips provides an iMovie-style timeline editor focused on multi-clip sequencing, trimming, and export.

## Status

**Current Status:** MVP Complete with Multi-Clip Timeline  
**Latest Features:** ✅ Multi-clip sequencing, trimming, drag-reorder, bundled FFmpeg  
**Version:** 1.0.0

## Features

### Core Features
- ✅ Native desktop application for Mac and Windows
- ✅ Three-panel layout (Media Library, Preview, Timeline)
- ✅ Drag-and-drop file import with thumbnails
- ✅ Multi-clip timeline editing
- ✅ Visual trimming with drag handles (iMovie-style)
- ✅ Drag-to-reorder clips on timeline
- ✅ Real-time video preview
- ✅ Sequential playback across all clips
- ✅ Timeline zoom and scroll
- ✅ Video export to MP4
- ✅ Bundled FFmpeg (no installation required)

### Video Editing
- **Trim from Left/Right:** Drag trim handles to adjust clip boundaries
- **Auto-sequential:** Clips automatically close gaps and position sequentially
- **Playhead Control:** Drag the red playhead to jump to any position
- **Clip Reordering:** Drag clips to reorder on timeline
- **Seamless Playback:** Play through entire sequence from start to finish

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

### Development Dependencies
- **Node.js** 16+ and npm
- **FFmpeg** (for development only - bundled in DMG)

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

# Bundle FFmpeg with the app
npm run bundle:ffmpeg

# Build native executable (current platform)
npm run package

# Build macOS DMG (includes bundled FFmpeg)
npm run package:dmg
```

## Project Structure

```
spookyvids/
├── dist/                   # Compiled output
│   ├── main.js            # Main Electron process
│   ├── ipc-handlers.js     # IPC handlers
│   ├── preload.js          # Context bridge
│   ├── renderer.js         # Bundled React app
│   └── index.html          # Built HTML
├── build/
│   ├── ffmpeg/             # Bundled FFmpeg binary
│   └── icon.icns           # App icon
├── src/
│   ├── main/               # Electron main process
│   │   ├── main.ts         # Window management
│   │   ├── ipc-handlers.ts # IPC handler setup
│   │   └── preload.js      # Context bridge
│   └── renderer/           # React application
│       ├── App.tsx         # Main component with state
│       ├── index.tsx       # React entry point
│       ├── index.html      # HTML template
│       ├── index.css       # Tailwind styles
│       └── components/
│           ├── ImportArea.tsx    # Media library with drag-drop
│           ├── PreviewPlayer.tsx # Video preview with playhead sync
│           └── Timeline.tsx      # Timeline with trim handles
├── scripts/
│   ├── bundle-ffmpeg.js    # FFmpeg bundling script
│   └── create-icon.js      # Icon generation
├── package.json
├── tsconfig.json           # Main process TS config
├── tsconfig.renderer.json  # Renderer TS config
├── webpack.config.js       # Webpack configuration
└── tailwind.config.js     # Tailwind configuration
```

## Usage

### Importing Video
1. Launch the application
2. Drag and drop MP4 or MOV files into the media library
3. Videos appear with thumbnails in the library
4. Click a video to preview it

### Building Your Timeline
1. Drag clips from the media library to the timeline
2. Clips automatically position sequentially
3. Multiple clips will play back-to-back

### Trimming Clips
1. Click a clip on the timeline to focus it (shows trim handles)
2. Drag the left handle to trim from the start
3. Drag the right handle to trim from the end
4. Release to apply trim - clips automatically close gaps and start from position 0

### Reordering Clips
1. Click and drag any clip on the timeline
2. Drop it in a new position
3. All clips automatically rearrange sequentially with no gaps

### Playback
1. Drag the red playhead to jump to any position
2. Click the play button to play through entire sequence
3. Video automatically continues to next clip when one ends

### Exporting Video
1. Click the Export button
2. Choose save location in the native dialog
3. Video is exported with FFmpeg (no installation required - it's bundled!)

## File Format Support

- **Input:** MP4, MOV
- **Output:** MP4
- **Codec:** H.264 (libx264)
- **Quality:** Fixed CRF 23 (good quality, fast encode)

## FFmpeg Bundling

The DMG includes a bundled FFmpeg binary, so users don't need to install FFmpeg separately. The `bundle:ffmpeg` script automatically detects and copies the system FFmpeg during build.

## Known Limitations

- Single video track (no layering)
- No undo/redo functionality
- No transitions or effects
- No audio controls beyond export
- Limited to MP4/MOV input formats

## Contributing

This is a personal project. Contributions are not currently accepted.

## License

ISC

## Repository

[GitHub Repository](https://github.com/amanyrath/spookyvids)
