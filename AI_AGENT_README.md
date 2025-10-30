# AI Agent - Ghoulish Creative Partner

The AI Agent is a chat-based creative assistant that helps users make their videos more frightful by intelligently adding spooky overlay effects, applying filters, and performing video editing operations.

## Features

### 1. Chat Interface
- Natural language interaction with the AI
- Real-time responses and status updates
- Tool execution feedback (searching, downloading, applying effects)
- Quick suggestion prompts for common tasks

### 2. Smart Overlay Placement
The AI automatically positions overlays based on their type:
- **Ghosts**: Placed in the top third of the video (y: 0-30%)
- **Tombstones**: Placed at the bottom third (y: 70-100%)
- **Monsters**: Placed in the middle or varied positions (y: 30-70%)
- **X Positions**: Spread across the video (10-90%) for aesthetic distribution
- **Size**: 15-25% of the video dimensions
- **Opacity**: 0.3-0.7 for subtle, eerie effects

### 3. Image Search and Download
- Searches Pixabay for spooky images with transparent backgrounds
- Downloads images to local cache
- Supports ghosts, monsters, tombstones, and custom queries
- Automatic fallback if API is unavailable

### 4. Video Filters
Apply creative filters to enhance the spooky atmosphere:
- **Black & White (grayscale)**: Classic horror look
- **Sepia**: Vintage, aged appearance
- **Vintage**: Old film effect
- **X-Ray**: Ghostly X-ray vision effect
- **Blur**: Soft, mysterious atmosphere
- **Bright**: Enhanced brightness
- **Dark**: Ominous, darker mood
- **High Contrast**: Dramatic, stark visuals

Filters can be applied to:
- Individual clips
- All clips at once
- All Track 1 (overlay) clips
- The first clip

### 5. Video Editing Capabilities

#### Split Clips
- Split a clip at any timestamp to create two separate clips
- Useful for creating cuts or removing unwanted sections
- Example: "Split the first clip at 5 seconds"

#### Trim Clips (In/Out Points)
- Set in points (where clip starts)
- Set out points (where clip ends)
- Remove unwanted sections from the beginning or end
- Example: "Trim the first clip from 2 to 8 seconds"

### 6. Black and White Filter for Track 1
- Applies grayscale filter to Track 1 (overlay track) clips
- Can be toggled on/off via chat commands
- Makes overlay clips more eerie and atmospheric

## Setup

### Required Environment Variables

Create a `.env` file in the project root with the following variables:

```env
# OpenAI API Key - Required for AI Agent
OPENAI_API_KEY=sk-...your_key_here...

# Pixabay API Key - Optional but recommended for image search
# Get your free API key at: https://pixabay.com/api/docs/
PIXABAY_API_KEY=your_pixabay_api_key_here
```

### Getting API Keys

1. **OpenAI API Key** (Required)
   - Sign up at https://platform.openai.com/
   - Navigate to API keys section
   - Create a new API key
   - Add credits to your account (pay-as-you-go)

2. **Pixabay API Key** (Optional)
   - Sign up at https://pixabay.com/api/docs/
   - Free tier provides 100 requests per minute
   - Used for searching and downloading spooky images

## Usage

### Basic Workflow

1. **Add clips to timeline**
   - Import video clips and add them to the timeline
   
2. **Open Agent tab**
   - Click the "Agent" tab in the left sidebar
   
3. **Chat with the agent**
   - Type your request in natural language
   - Examples:
     - "Make this video scarier with ghosts"
     - "Add tombstones at the bottom"
     - "Add spooky monsters and make it black and white"
     - "Make the overlay track black and white"

4. **Review and adjust**
   - The AI will search for images, download them, and apply overlays
   - You can manually adjust overlays in the Effects panel
   - Use the preview player to see the results

### Example Conversations

**User:** "Make this video scarier with some ghosts"

**Agent:** "I'll add some frightful ghosts to your video! Let me search for some ghostly apparitions..."
- *Searches for ghost images*
- *Downloads 3-5 ghost images*
- *Applies them to the first clip with smart positioning*
- "Done! I've added 4 ghastly ghosts to your clip, positioned at the top for maximum spookiness."

**User:** "Add tombstones at the bottom too"

**Agent:** "Excellent choice! Let me conjure up some eerie tombstones..."
- *Searches for tombstone images*
- *Downloads and positions them at the bottom*
- "Your graveyard is complete! 3 tombstones added at the bottom of the frame."

**User:** "Make the overlay track black and white"

**Agent:** "A chilling touch! Applying black and white filter to Track 1..."
- *Applies grayscale filter to all Track 1 clips*
- "The overlay track is now in haunting black and white."

## Architecture

### Backend Components

1. **ai-agent.ts**
   - OpenAI GPT-4 integration with function calling
   - Conversation management
   - Tool execution coordination
   - Smart positioning algorithms

2. **image-service.ts**
   - Pixabay API integration
   - Image download and caching
   - Cache management
   - Fallback handling

3. **ipc-handlers.ts**
   - Electron IPC handlers for agent communication
   - Message routing between renderer and main process
   - Response streaming

### Frontend Components

1. **AgentPanel.tsx**
   - Chat interface
   - Message display (user, assistant, system)
   - Input handling
   - Quick suggestions

2. **App.tsx Integration**
   - Agent state management
   - Timeline updates from agent actions
   - Response handling
   - Effect application

## Available AI Functions

The AI agent has access to the following tools:

### 1. searchSpookyImages(query, type, count)
- Searches for spooky images on Pixabay
- Parameters:
  - `query`: Search term (e.g., "ghost", "zombie")
  - `type`: Type of object ("ghost", "monster", "tombstone")
  - `count`: Number of images to retrieve (default: 3)

### 2. addOverlaysToClip(clipId, overlays)
- Adds multiple overlay effects to a clip
- Parameters:
  - `clipId`: ID of the target clip ("first", "focused", or specific ID)
  - `overlays`: Array of overlay configurations with imageUrl, type, opacity

### 3. applyBlackAndWhiteToTrack1(enable)
- Applies or removes grayscale filter from Track 1 clips
- Parameters:
  - `enable`: Boolean to enable or disable the filter

### 4. getTimelineState()
- Returns current timeline information
- No parameters
- Returns clip count, track distribution, and effects summary

## Cache Management

The AI agent caches downloaded images in the app's user data directory:
- **Location**: `~/Library/Application Support/spookyvids/spooky-cache/` (macOS)
- **Cleanup**: Images are persisted across sessions
- **Management**: Can be cleared via the agent API

## Limitations and Known Issues

1. **API Rate Limits**
   - Pixabay: 100 requests/minute (free tier)
   - OpenAI: Depends on your account tier

2. **Image Quality**
   - Depends on Pixabay search results
   - Not all images have perfect transparent backgrounds
   - Manual adjustment may be needed

3. **Processing Time**
   - Image downloads can take 5-10 seconds
   - OpenAI API calls typically take 2-5 seconds
   - Large images may take longer to process

4. **Clip Targeting**
   - Currently targets the first clip or focused clip
   - Future enhancement: specify multiple clips

## Future Enhancements

Potential improvements for future versions:

1. **Advanced Image Sources**
   - Integration with Remove.bg API for background removal
   - AI-generated images via Replicate/Stability AI
   - Custom spooky image library

2. **More Effects**
   - Glitch/VHS effects
   - Color grading presets
   - Animated overlays
   - Sound effects integration

3. **Smarter Positioning**
   - Detect faces and avoid overlapping
   - Keyframe animation
   - Motion tracking
   - Multiple placement strategies

4. **Batch Operations**
   - Apply effects to multiple clips at once
   - Template-based effects
   - Saved effect presets

5. **Enhanced AI Capabilities**
   - Video content analysis
   - Scene detection
   - Automatic timing for effects
   - Style transfer

## Troubleshooting

### Agent not responding
- Check that OPENAI_API_KEY is set in `.env`
- Verify API key is valid and has credits
- Check console for error messages

### No images found
- Check that PIXABAY_API_KEY is set (optional but recommended)
- Try different search terms
- Check internet connection

### Overlays not appearing
- Verify clip has been added to timeline
- Check Effects panel to see if overlays were added
- Ensure overlay opacity is not set to 0

### Performance issues
- Clear image cache if it becomes too large
- Reduce number of overlays per clip
- Use smaller images

## Credits

- **OpenAI GPT-4**: Powers the conversational AI
- **Pixabay**: Provides spooky images
- **Electron**: Application framework
- **React**: UI framework
- **FFmpeg**: Video processing

