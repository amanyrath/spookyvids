import OpenAI from 'openai';
import { getImageService, SpookyImage } from './image-service';

export interface TimelineClip {
  id: string;
  filePath: string;
  fileName: string;
  metadata?: any;
  startTime: number;
  duration: number;
  inTime: number;
  outTime: number;
  track?: number;
  overlayPosition?: { x: number; y: number };
  overlaySize?: { width: number; height: number };
  overlayVisible?: boolean;
  muted?: boolean;
  videoFilter?: string;
  overlayEffects?: Array<{
    id: string;
    filePath: string;
    opacity: number;
    position: { x: number; y: number };
    size: { width: number; height: number };
  }>;
}

export interface AgentMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface AgentResponse {
  type: 'message' | 'thinking' | 'tool_call' | 'error';
  content: string;
  data?: any;
}

interface ToolCall {
  name: string;
  arguments: any;
}

/**
 * AI Agent - Ghoulish Creative Partner
 */
export class AIAgent {
  private openai: OpenAI;
  private imageService: ReturnType<typeof getImageService>;
  private conversationHistory: AgentMessage[] = [];
  private timelineClips: TimelineClip[] = [];

  constructor() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY environment variable is not set');
    }

    this.openai = new OpenAI({ apiKey });
    this.imageService = getImageService();

    // Initialize with system prompt
    this.conversationHistory.push({
      role: 'system',
      content: this.getSystemPrompt(),
    });
  }

  /**
   * Update the current timeline state
   */
  updateTimelineState(clips: TimelineClip[]): void {
    this.timelineClips = clips;
    console.log('AI Agent timeline state updated:', clips.length, 'clips');
  }

  /**
   * Process a user message and return responses
   */
  async processMessage(
    userMessage: string,
    responseCallback: (response: AgentResponse) => void
  ): Promise<void> {
    // Create a promise that rejects after 100 seconds
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error('Agent request timed out after 100 seconds. Please try again with a simpler request.'));
      }, 100000); // 100 seconds
    });

    try {
      // Race between the actual processing and the timeout
      await Promise.race([
        this.processMessageInternal(userMessage, responseCallback),
        timeoutPromise,
      ]);
    } catch (error: any) {
      console.error('Error processing message:', error);
      responseCallback({
        type: 'error',
        content: error.message || 'Failed to process message',
      });
    }
  }

  /**
   * Internal message processing (without timeout wrapper)
   */
  private async processMessageInternal(
    userMessage: string,
    responseCallback: (response: AgentResponse) => void
  ): Promise<void> {
    try {
      // Add user message to history
      this.conversationHistory.push({
        role: 'user',
        content: userMessage,
      });

      // Send thinking indicator
      responseCallback({
        type: 'thinking',
        content: 'Conjuring up some frightful ideas...',
      });

      // Call OpenAI with function calling
      const completion = await this.openai.chat.completions.create({
        model: 'gpt-4-turbo-preview',
        messages: this.conversationHistory as any,
        functions: this.getFunctions(),
        function_call: 'auto',
        temperature: 0.8,
      });

      const responseMessage = completion.choices[0].message;

      let maxIterations = 10; // Prevent infinite loops
      let iteration = 0;
      let finalFunctionResult: any = null;

      // Loop to handle multiple sequential function calls
      while (iteration < maxIterations) {
        iteration++;
        
        console.log(`[Loop] Starting iteration ${iteration} of max ${maxIterations}`);
        
        let currentCompletion;
        if (iteration === 1) {
          currentCompletion = completion;
        } else {
          try {
            console.log(`[Iteration ${iteration}] Making OpenAI API call...`);
            // Add timeout for subsequent calls to prevent hanging
            const timeoutPromise = new Promise<never>((_, reject) => 
              setTimeout(() => reject(new Error('OpenAI API call timeout after 30 seconds')), 30000)
            );
            
            currentCompletion = await Promise.race([
              this.openai.chat.completions.create({
                model: 'gpt-4-turbo-preview',
                messages: this.conversationHistory as any,
                functions: this.getFunctions(),
                function_call: 'auto',
                temperature: 0.8,
              }),
              timeoutPromise,
            ]);
            console.log(`[Iteration ${iteration}] OpenAI API call completed`);
          } catch (error: any) {
            console.error(`[Iteration ${iteration}] OpenAI call failed:`, error.message);
            // If API call fails after a function call, use the function result as final
            if (finalFunctionResult && iteration > 1) {
              const finalMessage = finalFunctionResult.success && finalFunctionResult.overlay
                ? 'The ghost has been successfully summoned to the first clip. Spooky, isn\'t it?'
                : finalFunctionResult.success && finalFunctionResult.overlays
                ? `Successfully added ${finalFunctionResult.count || finalFunctionResult.overlays.length} spooky overlay(s)!`
                : 'Operation completed.';
              
              console.log(`[Iteration ${iteration}] Using fallback completion due to API error`);
              responseCallback({
                type: 'message',
                content: finalMessage,
                data: finalFunctionResult,
              });
              return;
            }
            throw error;
          }
        }

        const currentMessage = currentCompletion.choices[0].message;
        
        console.log(`[Iteration ${iteration}] Message received:`, {
          hasFunctionCall: !!currentMessage.function_call,
          hasContent: !!currentMessage.content,
          content: currentMessage.content?.substring(0, 100),
        });

        // Handle function calls
        if (currentMessage.function_call) {
          const functionName = currentMessage.function_call!.name;
          const functionArgs = JSON.parse(currentMessage.function_call!.arguments);

          console.log(`Executing function (iteration ${iteration}): ${functionName}`, functionArgs);
          responseCallback({
            type: 'tool_call',
            content: `Executing: ${this.getToolDescription(functionName, functionArgs)}`,
          });

          // Execute the function
          const functionResult = await this.executeFunction(functionName, functionArgs);
          console.log(`Function ${functionName} result:`, JSON.stringify(functionResult, null, 2));
          finalFunctionResult = functionResult; // Keep track of last result

          // Add function call and result to conversation history (proper format for OpenAI)
          this.conversationHistory.push({
            role: 'assistant',
            content: currentMessage.content || null,
            function_call: {
              name: functionName,
              arguments: currentMessage.function_call!.arguments,
            },
          } as any);

          this.conversationHistory.push({
            role: 'function',
            name: functionName,
            content: JSON.stringify(functionResult),
          } as any);

          console.log(`[Iteration ${iteration}] Function completed, continuing to next iteration...`);
          console.log(`[Iteration ${iteration}] Conversation history length: ${this.conversationHistory.length}`);

          // Continue loop to check if AI wants to make another function call
          continue;
        } else {
          // No more function calls, return final response
          // If AI didn't provide content but we have a function result, generate a default message
          let finalMessage = currentMessage.content || '';
          
          if (!finalMessage && finalFunctionResult) {
            // Generate a helpful message based on the last function result
            if (finalFunctionResult.success && finalFunctionResult.overlay) {
              finalMessage = 'The ghost has been successfully summoned to the first clip. Spooky, isn\'t it?';
            } else if (finalFunctionResult.success && finalFunctionResult.overlays) {
              finalMessage = `Successfully added ${finalFunctionResult.count || finalFunctionResult.overlays.length} spooky overlay(s)!`;
            } else {
              finalMessage = 'Done!';
            }
          }
          
          // Add assistant response to history
          this.conversationHistory.push({
            role: 'assistant',
            content: finalMessage,
          });

          console.log(`[Final Response] After ${iteration} iteration(s):`, finalMessage);
          console.log(`[Final Response] Last function result:`, JSON.stringify(finalFunctionResult, null, 2));

          responseCallback({
            type: 'message',
            content: finalMessage,
            data: finalFunctionResult, // Include last function result in response
          });
          
          return; // Exit loop and return
        }
      }

      // If we hit max iterations, still return the last result so user can continue
      console.warn(`Reached max iterations (${maxIterations}), forcing completion`);
      const completionMessage = finalFunctionResult 
        ? `Completed ${maxIterations} function calls. ${finalFunctionResult.success ? 'Operation successful!' : 'Check results.'}`
        : 'Maximum function call iterations reached.';
      
      responseCallback({
        type: 'message',
        content: completionMessage,
        data: finalFunctionResult,
      });
    } catch (error: any) {
      console.error('Error processing message:', error);
      responseCallback({
        type: 'error',
        content: error.message || 'Failed to process message',
      });
    }
  }

  /**
   * Get the system prompt
   */
  private getSystemPrompt(): string {
    return `You are a ghoulish creative partner helping users make their videos more frightful. 
CRITICAL: When users ask you to add effects, overlays, or make edits, you MUST ACTUALLY DO IT by calling the functions immediately. 
Don't just describe what you would do - EXECUTE the actions using the available functions!

Available functions:
- searchSpookyImages(query, type, count): Search for spooky images
- addOverlaysToClip(clipId, overlays): Add overlays to the main video clip (clipId can be "first", "focused", or "all" - always targets track 0/main video)
- applyFilterToClip(clipId, filter): Apply filters (grayscale, sepia, vintage, xray, blur, bright, dark, high-contrast, or "none")
- splitClipAtTime(clipId, timestamp): Split a clip at a specific time
- trimClip(clipId, inTime, outTime): Set in/out points to trim clips
- applyBlackAndWhiteToTrack1(enable): Apply grayscale to all Track 1 clips
- getTimelineState(): Get current timeline information

WORKFLOW - When user asks for overlays (ghosts/monsters/tombstones):
1. FIRST call listAssets(type) to check for existing assets in the assets folder
2. If assets exist, use useExistingAsset() with the filename to reuse them
3. ONLY if no assets exist, THEN call searchSpookyImages (count: 1 for speed)
4. Call addOverlaysToClip with the asset (existing or newly downloaded)
5. If they mention filters, IMMEDIATELY call applyFilterToClip
6. Then respond with a brief spooky confirmation

If user asks to "use existing assets" or mentions assets folder:
- Call listAssets() first to see what's available
- Use useExistingAsset() with filenames from the results

IMPORTANT PERFORMANCE NOTE:
- Only download ONE asset per command for speed (count: 1)
- Downloaded assets are saved to the assets folder for reuse
- ALWAYS check for existing assets FIRST using listAssets() before downloading
- If ⌨user asks for ghosts/monsters/tombstones, FIRST check listAssets(type) for existing assets
- Only search and download if no existing assets are found in the folder
- Use useExistingAsset() to reuse assets from the folder instead of downloading

OVERLAY POSITIONING (handled automatically):
- Ghosts: TOP (y: 0-30%)
- Tombstones: BOTTOM (y: 70-100%)
- Monsters: MIDDLE (y: 30-70%)
- X positions: spread 10-90%
- Opacity: 0.3-0.7
- Size: 15-25%

EXAMPLES:
User: "Add ghosts" -> 
  1. Call listAssets("ghost") to check assets folder
  2. If assets found: use useExistingAsset(filename, "first", "ghost") with one of the filenames
  3. For example: useExistingAsset("ghost_girl.png", "first", "ghost")
  4. If no assets: Call searchSpookyImages("ghost", "ghost", 1) then addOverlaysToClip("first", [{"url": result.url, "type": "ghost"}])
  
User: "Use existing ghost assets" -> Call listAssets("ghost") then useExistingAsset() for each

User: "Add ghost from ghost_girl.png" -> Call useExistingAsset("ghost_girl.png", "first", "ghost") directly

User: "Make it black and white" -> Call applyFilterToClip("all", "grayscale")

Always maintain a spooky but helpful tone. Be brief in responses - don't over-explain, just confirm what you did.`;
  }

  /**
   * Get available functions for OpenAI
   */
  private getFunctions(): any[] {
    return [
      {
        name: 'searchSpookyImages',
        description: 'Search for spooky images (ghosts, monsters, tombstones) with transparent backgrounds from Pixabay',
        parameters: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Search query (e.g., "ghost", "zombie", "tombstone")',
            },
            type: {
              type: 'string',
              enum: ['ghost', 'monster', 'tombstone'],
              description: 'Type of spooky object to search for',
            },
            count: {
              type: 'number',
              description: 'Number of images to retrieve (default: 1, max: 1 for performance)',
              default: 1,
            },
          },
          required: ['query', 'type'],
        },
      },
      {
        name: 'addOverlaysToClip',
        description: 'Add multiple overlay effects to the main video clip (track 0) with smart positioning based on type. Overlays are always added to the main video track.',
        parameters: {
          type: 'object',
          properties: {
            clipId: {
              type: 'string',
              description: 'ID of the clip to add overlays to (use "first" for first main video clip, "focused" for focused clip, or "all" - always targets track 0/main video)',
            },
            overlays: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  imageUrl: {
                    type: 'string',
                    description: 'URL of the image to download and use (can use "url" field from Pixabay search results)',
                  },
                  url: {
                    type: 'string',
                    description: 'Alternative field name for imageUrl - can use the "url" field directly from Pixabay search results',
                  },
                  type: {
                    type: 'string',
                    enum: ['ghost', 'monster', 'tombstone'],
                    description: 'Type of overlay (affects positioning). If not provided, will try to infer from tags.',
                  },
                  tags: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Optional tags array from Pixabay to help infer type if type is not provided',
                  },
                  opacity: {
                    type: 'number',
                    description: 'Opacity (0-1, default: 0.5)',
                    default: 0.5,
                  },
                },
                required: ['imageUrl'],
              },
            },
          },
          required: ['clipId', 'overlays'],
        },
      },
      {
        name: 'applyFilterToClip',
        description: 'Apply a video filter to a specific clip or all clips',
        parameters: {
          type: 'object',
          properties: {
            clipId: {
              type: 'string',
              description: 'ID of clip (use "first", "focused", "all", or "track1" for Track 1 clips)',
            },
            filter: {
              type: 'string',
              enum: ['grayscale', 'sepia', 'vintage', 'xray', 'blur', 'bright', 'dark', 'high-contrast', 'none'],
              description: 'Filter type (use "none" to remove filter)',
            },
          },
          required: ['clipId', 'filter'],
        },
      },
      {
        name: 'splitClipAtTime',
        description: 'Split a clip at a specific timestamp to create two separate clips',
        parameters: {
          type: 'object',
          properties: {
            clipId: {
              type: 'string',
              description: 'ID of clip to split (use "first" or specific clip ID)',
            },
            timestamp: {
              type: 'number',
              description: 'Timestamp in seconds where to split the clip (relative to clip start)',
            },
          },
          required: ['clipId', 'timestamp'],
        },
      },
      {
        name: 'trimClip',
        description: 'Set in/out points to trim a clip (remove sections from start or end)',
        parameters: {
          type: 'object',
          properties: {
            clipId: {
              type: 'string',
              description: 'ID of clip to trim (use "first" or specific clip ID)',
            },
            inTime: {
              type: 'number',
              description: 'Start time in seconds (null to keep current)',
            },
            outTime: {
              type: 'number',
              description: 'End time in seconds (null to keep current)',
            },
          },
          required: ['clipId'],
        },
      },
      {
        name: 'applyBlackAndWhiteToTrack1',
        description: 'Apply black and white (grayscale) filter to all clips on Track 1 (overlay track)',
        parameters: {
          type: 'object',
          properties: {
            enable: {
              type: 'boolean',
              description: 'Enable or disable the black and white filter',
              default: true,
            },
          },
          required: ['enable'],
        },
      },
      {
        name: 'getTimelineState',
        description: 'Get the current state of the timeline (clips, tracks, effects)',
        parameters: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'listAssets',
        description: 'List all available spooky assets (ghosts, monsters, tombstones) in the assets folder',
        parameters: {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              enum: ['ghost', 'monster', 'tombstone', 'all'],
              description: 'Filter by type (optional, default: "all")',
            },
          },
        },
      },
      {
        name: 'useExistingAsset',
        description: 'Use an existing asset from the assets folder instead of downloading new ones',
        parameters: {
          type: 'object',
          properties: {
            filename: {
              type: 'string',
              description: 'Filename of the asset to use from the assets folder',
            },
            clipId: {
              type: 'string',
              description: 'ID of clip to add overlay to ("first", "focused", or "all")',
            },
            type: {
              type: 'string',
              enum: ['ghost', 'monster', 'tombstone'],
              description: 'Type of overlay (affects positioning)',
            },
            opacity: {
              type: 'number',
              description: 'Opacity (0-1, default: 0.5)',
            },
          },
          required: ['filename', 'clipId', 'type'],
        },
      },
    ];
  }

  /**
   * Execute a function call
   */
  private async executeFunction(name: string, args: any): Promise<any> {
    console.log(`Executing function: ${name}`, args);

    switch (name) {
      case 'searchSpookyImages':
        return await this.searchSpookyImages(args.query, args.type, args.count || 3);

      case 'addOverlaysToClip':
        return await this.addOverlaysToClip(args.clipId, args.overlays);

      case 'applyFilterToClip':
        return await this.applyFilterToClip(args.clipId, args.filter);

      case 'splitClipAtTime':
        return await this.splitClipAtTime(args.clipId, args.timestamp);

      case 'trimClip':
        return await this.trimClip(args.clipId, args.inTime, args.outTime);

      case 'applyBlackAndWhiteToTrack1':
        return await this.applyBlackAndWhiteToTrack1(args.enable !== false);

      case 'getTimelineState':
        return this.getTimelineStateInfo();

      case 'listAssets':
        return await this.listAssets(args.type || 'all');

      case 'useExistingAsset':
        return await this.useExistingAsset(args.filename, args.clipId, args.type, args.opacity);

      default:
        throw new Error(`Unknown function: ${name}`);
    }
  }

  /**
   * Search for spooky images
   */
  private async searchSpookyImages(
    query: string,
    type: 'ghost' | 'monster' | 'tombstone',
    count: number
  ): Promise<any> {
    try {
      // Limit to maximum 1 asset per command for performance
      const maxCount = Math.min(count || 1, 1);
      console.log(`Searching for ${maxCount} ${type} image(s)...`);
      
      const result = await this.imageService.searchSpookyImages(query, type);
      const limitedImages = result.images.slice(0, maxCount);

      console.log(`Found ${limitedImages.length} image(s) from Pixabay`);
      
      if (limitedImages.length === 0) {
        return {
          success: false,
          error: 'No images found. Try a different search query or check your Pixabay API key.',
          images: [],
          count: 0,
        };
      }

      return {
        success: true,
        images: limitedImages,
        count: limitedImages.length,
      };
    } catch (error: any) {
      console.error('Error searching for images:', error);
      return {
        success: false,
        error: error.message || 'Failed to search for images. Check your internet connection and Pixabay API key.',
        images: [],
        count: 0,
      };
    }
  }

  /**
   * Add overlays to a clip (limit to 1 overlay for performance)
   */
  private async addOverlaysToClip(clipId: string, overlays: any[]): Promise<any> {
    // Limit to 1 overlay per command for performance
    const limitedOverlays = overlays.slice(0, 1);
    try {
      // Resolve clip ID - always target main video track (track 0)
      let targetClip: TimelineClip | undefined;
      
      if (clipId === 'first' || clipId === 'focused') {
        // Find the first clip on track 0 (main video track)
        targetClip = this.timelineClips.find(c => (c.track || 0) === 0);
        if (!targetClip) {
          // Fallback to first clip if no track 0 clip exists
          targetClip = this.timelineClips[0];
        }
      } else if (clipId === 'all') {
        // For "all", find first clip on track 0
        targetClip = this.timelineClips.find(c => (c.track || 0) === 0);
        if (!targetClip) {
          targetClip = this.timelineClips[0];
        }
      } else {
        // Specific clip ID - ensure it's on track 0, otherwise find first track 0 clip
        targetClip = this.timelineClips.find(c => c.id === clipId);
        if (targetClip && targetClip.track !== undefined && targetClip.track !== 0) {
          // If requested clip is not on track 0, use first track 0 clip instead
          console.warn(`Clip ${clipId} is not on main track (track 0), using first main track clip instead`);
          targetClip = this.timelineClips.find(c => (c.track || 0) === 0) || this.timelineClips[0];
        }
      }

      if (!targetClip) {
        throw new Error('No main video clip (track 0) found to add overlays to');
      }
      
      // Ensure we're working with track 0
      if (targetClip.track !== undefined && targetClip.track !== 0) {
        throw new Error('Overlays can only be added to main video track (track 0)');
      }

      // Download images and create overlay effects
      const downloadedOverlays = [];

      for (const overlay of limitedOverlays) {
        try {
          // Get image URL from overlay (could be imageUrl or url from Pixabay)
          const imageUrl = overlay.imageUrl || overlay.url;
          if (!imageUrl) {
            console.error('Overlay missing imageUrl or url:', overlay);
            continue;
          }

          // Get type - if not provided, try to infer from tags or use a default
          let overlayType: 'ghost' | 'monster' | 'tombstone' = overlay.type;
          if (!overlayType) {
            // Try to infer from tags or filename
            const tags = overlay.tags || [];
            const allTags = tags.join(' ').toLowerCase();
            if (allTags.includes('ghost')) {
              overlayType = 'ghost';
            } else if (allTags.includes('tombstone') || allTags.includes('grave')) {
              overlayType = 'tombstone';
            } else if (allTags.includes('monster') || allTags.includes('zombie') || allTags.includes('creature')) {
              overlayType = 'monster';
            } else {
              // Default to ghost if can't determine
              overlayType = 'ghost';
              console.warn('Could not determine overlay type, defaulting to ghost');
            }
          }
          
          // Download the image
          const filename = `spooky_${overlayType}_${Date.now()}`;
          console.log(`Downloading image from: ${imageUrl}`);
          console.log(`Saving to assets folder as: ${filename}`);
          const localPath = await this.imageService.downloadImage(imageUrl, filename, overlayType);
          console.log(`Image downloaded successfully to: ${localPath}`);

          // Generate smart positioning based on type
          const position = this.generateSmartPosition(overlayType, downloadedOverlays.length);
          const size = this.generateSize();
          const opacity = overlay.opacity || 0.5;

          // Create overlay object matching the existing overlayEffects structure
          // (no 'type' field - that's only used internally for positioning)
          downloadedOverlays.push({
            id: `overlay-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            filePath: localPath,
            opacity,
            position,
            size,
          });
          
          console.log(`Overlay created: ${overlayType} at position (${position.x}, ${position.y}) with opacity ${opacity}`);
        } catch (error: any) {
          console.error('Error downloading overlay image:', error);
          console.error('Error details:', error.message, error.stack);
        }
      }

      if (downloadedOverlays.length === 0) {
        throw new Error('Failed to download any overlays. Check image URL and network connection.');
      }

      console.log(`Successfully prepared ${downloadedOverlays.length} overlay(s) for clip ${targetClip.id}`);
      return {
        success: true,
        clipId: targetClip.id,
        overlays: downloadedOverlays,
        count: downloadedOverlays.length,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Apply a filter to a clip or clips
   */
  private async applyFilterToClip(clipId: string, filter: string): Promise<any> {
    try {
      let affectedClips: string[] = [];
      const actualFilter = filter === 'none' ? undefined : filter;

      if (clipId === 'all') {
        affectedClips = this.timelineClips.map(c => c.id);
      } else if (clipId === 'track1') {
        affectedClips = this.timelineClips.filter(c => c.track === 1).map(c => c.id);
      } else if (clipId === 'first' || clipId === 'focused') {
        const targetClip = this.timelineClips[0];
        if (targetClip) {
          affectedClips = [targetClip.id];
        }
      } else {
        const clip = this.timelineClips.find(c => c.id === clipId);
        if (clip) {
          affectedClips = [clip.id];
        }
      }

      if (affectedClips.length === 0) {
        throw new Error('No clips found to apply filter');
      }

      return {
        success: true,
        filter: actualFilter || 'none',
        affectedClips,
        count: affectedClips.length,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Split a clip at a specific timestamp
   */
  private async splitClipAtTime(clipId: string, timestamp: number): Promise<any> {
    try {
      let targetClip: TimelineClip | undefined;

      if (clipId === 'first' || clipId === 'focused') {
        targetClip = this.timelineClips[0];
      } else {
        targetClip = this.timelineClips.find(c => c.id === clipId);
      }

      if (!targetClip) {
        throw new Error('Clip not found');
      }

      // Validate timestamp is within clip bounds
      const clipDuration = targetClip.outTime - targetClip.inTime;
      if (timestamp <= 0.1 || timestamp >= clipDuration - 0.1) {
        throw new Error('Split point must be at least 0.1s from clip edges');
      }

      // Calculate absolute timestamp within the source video
      const absoluteTimestamp = targetClip.inTime + timestamp;

      return {
        success: true,
        clipId: targetClip.id,
        splitTimestamp: absoluteTimestamp,
        relativeTimestamp: timestamp,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Trim a clip by setting in/out points
   */
  private async trimClip(
    clipId: string,
    inTime?: number,
    outTime?: number
  ): Promise<any> {
    try {
      let targetClip: TimelineClip | undefined;

      if (clipId === 'first' || clipId === 'focused') {
        targetClip = this.timelineClips[0];
      } else {
        targetClip = this.timelineClips.find(c => c.id === clipId);
      }

      if (!targetClip) {
        throw new Error('Clip not found');
      }

      // Use current values if not provided
      const newInTime = inTime !== undefined && inTime !== null ? inTime : targetClip.inTime;
      const newOutTime = outTime !== undefined && outTime !== null ? outTime : targetClip.outTime;

      // Validate
      if (newInTime < 0) {
        throw new Error('In time cannot be negative');
      }
      if (newOutTime > (targetClip.metadata?.duration || targetClip.outTime)) {
        throw new Error('Out time exceeds clip duration');
      }
      if (newOutTime - newInTime < 0.1) {
        throw new Error('Clip must be at least 0.1 seconds long');
      }

      return {
        success: true,
        clipId: targetClip.id,
        inTime: newInTime,
        outTime: newOutTime,
        newDuration: newOutTime - newInTime,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Apply black and white filter to Track 1
   */
  private async applyBlackAndWhiteToTrack1(enable: boolean): Promise<any> {
    const track1Clips = this.timelineClips.filter(c => c.track === 1);

    return {
      success: true,
      action: enable ? 'enabled' : 'disabled',
      affectedClips: track1Clips.map(c => c.id),
      count: track1Clips.length,
    };
  }

  /**
   * List available assets
   */
  private async listAssets(type: 'ghost' | 'monster' | 'tombstone' | 'all'): Promise<any> {
    try {
      // Pass type directly to listAssets (or undefined for 'all')
      const assets = type === 'all' 
        ? this.imageService.listAssets()
        : this.imageService.listAssets(type);
      console.log(`[listAssets] Found ${assets.length} asset(s) of type '${type}'`);
      
      return {
        success: true,
        assets: assets.map(asset => ({
          filename: asset.filename,
          path: asset.path,
          size: asset.size,
          modified: asset.modified.toISOString(),
          type: asset.type, // Include type in response
        })),
        count: assets.length,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Use an existing asset from the assets folder
   */
  private async useExistingAsset(
    filename: string,
    clipId: string,
    type: 'ghost' | 'monster' | 'tombstone',
    opacity?: number
  ): Promise<any> {
    try {
      // Get asset by filename and type (checks both project and userData folders)
      const assetPath = this.imageService.getAsset(filename, type);
      if (!assetPath) {
        throw new Error(`Asset "${filename}" not found in assets/${type}/ folder`);
      }
      console.log(`[useExistingAsset] Using asset from: ${assetPath}`);

      // Resolve clip ID - always target main video track (track 0)
      let targetClip: TimelineClip | undefined;
      
      if (clipId === 'first' || clipId === 'focused') {
        // Find the first clip on track 0 (main video track)
        targetClip = this.timelineClips.find(c => (c.track || 0) === 0);
        if (!targetClip) {
          // Fallback to first clip if no track 0 clip exists
          targetClip = this.timelineClips[0];
        }
      } else if (clipId === 'all') {
        // For "all", find first clip on track 0
        targetClip = this.timelineClips.find(c => (c.track || 0) === 0);
        if (!targetClip) {
          targetClip = this.timelineClips[0];
        }
      } else {
        // Specific clip ID - ensure it's on track 0, otherwise find first track 0 clip
        targetClip = this.timelineClips.find(c => c.id === clipId);
        if (targetClip && targetClip.track !== undefined && targetClip.track !== 0) {
          // If requested clip is not on track 0, use first track 0 clip instead
          console.warn(`Clip ${clipId} is not on main track (track 0), using first main track clip instead`);
          targetClip = this.timelineClips.find(c => (c.track || 0) === 0) || this.timelineClips[0];
        }
      }

      if (!targetClip) {
        throw new Error('No main video clip (track 0) found to add overlay to');
      }
      
      // Ensure we're working with track 0
      if (targetClip.track !== undefined && targetClip.track !== 0) {
        throw new Error('Overlays can only be added to main video track (track 0)');
      }

      // Generate smart positioning
      const position = this.generateSmartPosition(type, 0);
      const size = this.generateSize();
      const overlayOpacity = opacity || 0.5;

      // Create overlay object matching the existing overlayEffects structure
      // (no 'type' field - that's only used internally for positioning)
      const overlay = {
        id: `overlay-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        filePath: assetPath,
        opacity: overlayOpacity,
        position,
        size,
      };

      return {
        success: true,
        clipId: targetClip.id,
        overlay,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Get timeline state information
   */
  private getTimelineStateInfo(): any {
    return {
      clipCount: this.timelineClips.length,
      track0Count: this.timelineClips.filter(c => (c.track || 0) === 0).length,
      track1Count: this.timelineClips.filter(c => c.track === 1).length,
      clipsWithEffects: this.timelineClips.filter(c => c.videoFilter || c.overlayEffects).length,
      clips: this.timelineClips.map(c => ({
        id: c.id,
        fileName: c.fileName,
        track: c.track || 0,
        hasFilter: !!c.videoFilter,
        overlayCount: c.overlayEffects?.length || 0,
      })),
    };
  }

  /**
   * Generate smart position based on object type
   */
  private generateSmartPosition(
    type: 'ghost' | 'monster' | 'tombstone',
    index: number
  ): { x: number; y: number } {
    // Spread items horizontally (10-90%)
    const xPositions = [15, 35, 55, 75, 85];
    const x = xPositions[index % xPositions.length] + (Math.random() * 10 - 5);

    let y: number;
    switch (type) {
      case 'ghost':
        // Top third (5-30%)
        y = 5 + Math.random() * 25;
        break;
      case 'tombstone':
        // Bottom third (70-90%)
        y = 70 + Math.random() * 20;
        break;
      case 'monster':
      default:
        // Middle (30-70%)
        y = 30 + Math.random() * 40;
        break;
    }

    return {
      x: Math.max(5, Math.min(85, x)),
      y: Math.max(5, Math.min(90, y)),
    };
  }

  /**
   * Generate random size for overlay
   */
  private generateSize(): { width: number; height: number } {
    const baseSize = 15 + Math.random() * 10; // 15-25%
    return {
      width: baseSize,
      height: baseSize,
    };
  }

  /**
   * Get a human-readable description of a tool call
   */
  private getToolDescription(name: string, args: any): string {
    switch (name) {
      case 'searchSpookyImages':
        return `Searching for ${args.count || 3} ${args.type} images...`;
      case 'addOverlaysToClip':
        return `Adding ${args.overlays.length} spooky overlays to the clip...`;
      case 'applyFilterToClip':
        return `Applying ${args.filter} filter to clips...`;
      case 'splitClipAtTime':
        return `Splitting clip at ${args.timestamp} seconds...`;
      case 'trimClip':
        return `Trimming clip (in: ${args.inTime || 'unchanged'}, out: ${args.outTime || 'unchanged'})...`;
      case 'applyBlackAndWhiteToTrack1':
        return args.enable ? 'Applying black and white filter...' : 'Removing black and white filter...';
      case 'getTimelineState':
        return 'Checking timeline state...';
      default:
        return `Executing ${name}...`;
    }
  }

  /**
   * Clear conversation history
   */
  clearHistory(): void {
    this.conversationHistory = [
      {
        role: 'system',
        content: this.getSystemPrompt(),
      },
    ];
  }

  /**
   * Get conversation history
   */
  getHistory(): AgentMessage[] {
    return this.conversationHistory.filter(m => m.role !== 'system');
  }
}

// Singleton instance
let aiAgentInstance: AIAgent | null = null;

export function getAIAgent(): AIAgent {
  if (!aiAgentInstance) {
    aiAgentInstance = new AIAgent();
  }
  return aiAgentInstance;
}

