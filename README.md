# Spooky Clips

A desktop video editor for Mac and Windows built with Electron, React, and FFmpeg. Spooky Clips provides an iMovie-style timeline editor focused on multi-clip sequencing, trimming, and export.

## Status

**Current Status:** Complete with AI-Powered Effects & Overlays  
**Latest Features:** ✅ AI Agent, Image Overlays, Video Filters, Screen Recording, Webcam Overlay  
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

### AI-Powered Effects (NEW)
- **Ghoulish Creative Agent:** Chat-based AI assistant for adding spooky effects
- **Natural Language Control:** Ask the AI to add ghosts, monsters, tombstones, and more
- **Smart Image Search:** Automatic search and download of spooky images via Pixabay API
- **Intelligent Positioning:** AI automatically places overlays based on object type (ghosts top, tombstones bottom, monsters middle)

### Overlay Effects (NEW)
- **Multiple Image Overlays:** Add multiple overlay images to any clip
- **Drag & Position:** Drag overlays directly on the preview to position them
- **Adjustable Properties:** Control opacity, size (width/height), and position (X/Y)
- **Assets Management:** Automatic asset organization (ghost/monster/tombstone folders)
- **Project & User Assets:** Supports both project-level and user-downloaded assets

### Video Filters (NEW)
- **Black & White:** Grayscale effect
- **Sepia:** Vintage sepia tone
- **Vintage:** Aged film look
- **X-Ray:** Inverted colors for spooky effect
- **Blur:** Soft focus blur
- **Bright/Dark:** Exposure adjustments
- **High Contrast:** Enhanced contrast
- **TV Static:** Flicker effect

### Recording Features (NEW)
- **Screen Recording:** Record your screen with system audio
- **Webcam Overlay:** Floating webcam window for picture-in-picture
- **Dual Recording:** Record screen and webcam simultaneously
- **Microphone Audio:** Include microphone audio in recordings
- **Drag & Resize Overlay:** Position and resize webcam overlay while recording

## Tech Stack

| Component | Technology |
|-----------|------------|
| **Desktop Framework** | Electron (v39.0.0) |
| **UI Framework** | React (v19.2.0) |
| **Language** | TypeScript (v5.9.3) |
| **Styling** | Tailwind CSS (v3.4.18) |
| **Media Processing** | fluent-ffmpeg (v2.1.3) |
| **AI Integration** | OpenAI GPT-4 Turbo |
| **Image Search** | Pixabay API |
| **Build Tool** | Webpack + TypeScript |
| **Packager** | electron-builder |

## System Requirements

### Development Dependencies
- **Node.js** 16+ and npm
- **FFmpeg** (for development only - bundled in DMG)

### API Keys (Optional)
To enable AI agent and image search features, create a `.env` file in the project root:
```env
OPENAI_API_KEY=sk-...
PIXABAY_API_KEY=...
```
The app will work without these keys, but AI features and image search will be disabled.

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
├── assets/                 # Image assets (ghost, monster, tombstone folders)
├── src/
│   ├── main/               # Electron main process
│   │   ├── main.ts         # Window management
│   │   ├── ipc-handlers.ts # IPC handler setup
│   │   ├── ai-agent.ts     # AI agent with OpenAI integration
│   │   ├── image-service.ts # Image search and download service
│   │   ├── overlay.html    # Webcam overlay window HTML
│   │   └── preload.js      # Context bridge
│   └── renderer/           # React application
│       ├── App.tsx         # Main component with state
│       ├── index.tsx       # React entry point
│       ├── index.html      # HTML template
│       ├── index.css       # Tailwind styles
│       └── components/
│           ├── ImportArea.tsx      # Media library with drag-drop
│           ├── PreviewPlayer.tsx   # Video preview with playhead sync
│           ├── Timeline.tsx        # Timeline with trim handles
│           ├── AgentPanel.tsx      # AI agent chat interface
│           ├── EffectsPanel.tsx    # Video filters and overlay controls
│           └── TranscriptionPanel.tsx # Video transcription viewer
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

### Using AI Agent
1. Click the "Agent" tab in the media library sidebar
2. Type a natural language request (e.g., "Add ghosts to the first clip")
3. The AI will search for images, download them, and add overlays automatically
4. Continue the conversation to refine effects or add more
5. Quick suggestions: "Add ghosts", "Add tombstones", "Add monsters"

### Adding Overlays Manually
1. Click the "Effects" tab in the media library sidebar
2. Select a clip on the timeline to view its effects
3. Click "Add" in the Overlay Effects section
4. Choose an image file (PNG with transparency recommended)
5. Drag the overlay in the preview to position it
6. Adjust opacity, size, and position in the effects panel

### Applying Video Filters
1. Click the "Effects" tab in the media library sidebar
2. Select a clip on the timeline
3. Choose a filter from the dropdown (Black & White, Sepia, Vintage, etc.)
4. Filter is applied in real-time preview

### Recording Screen & Webcam
1. Click "Record Screen" button
2. Choose to include microphone audio
3. Optionally enable webcam overlay for picture-in-picture
4. Drag and position the webcam overlay window as needed
5. Click "Stop Recording" when done
6. Recording automatically imports to media library

### Exporting Video
1. Click the Export button
2. Choose save location in the native dialog
3. Video is exported with all overlays, filters, and effects
4. Export uses FFmpeg (no installation required - it's bundled!)

## File Format Support

- **Input:** MP4, MOV
- **Output:** MP4
- **Codec:** H.264 (libx264)
- **Quality:** Fixed CRF 23 (good quality, fast encode)

## FFmpeg Bundling

The DMG includes a bundled FFmpeg binary, so users don't need to install FFmpeg separately. The `bundle:ffmpeg` script automatically detects and copies the system FFmpeg during build.

## Known Limitations

- No undo/redo functionality
- No transitions between clips
- Limited audio controls (mute tracks, include in export)
- Limited to MP4/MOV input formats
- AI features require API keys (optional - app works without them)

## Contributing

This is a personal project. Contributions are not currently accepted.

## License

ISC

## Repository

[GitHub Repository](https://github.com/amanyrath/spookyvids)
