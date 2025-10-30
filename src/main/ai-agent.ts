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

      // Handle function calls
      if (responseMessage.function_call) {
        const functionName = responseMessage.function_call.name;
        const functionArgs = JSON.parse(responseMessage.function_call.arguments);

        responseCallback({
          type: 'tool_call',
          content: `Executing: ${this.getToolDescription(functionName, functionArgs)}`,
        });

        // Execute the function
        const functionResult = await this.executeFunction(functionName, functionArgs);

        // Add function result to conversation
        this.conversationHistory.push({
          role: 'assistant',
          content: responseMessage.content || '',
        });

        this.conversationHistory.push({
          role: 'system',
          content: `Function ${functionName} result: ${JSON.stringify(functionResult)}`,
        });

        // Get final response from AI
        const finalCompletion = await this.openai.chat.completions.create({
          model: 'gpt-4-turbo-preview',
          messages: this.conversationHistory as any,
          temperature: 0.8,
        });

        const finalMessage = finalCompletion.choices[0].message.content || '';
        this.conversationHistory.push({
          role: 'assistant',
          content: finalMessage,
        });

        responseCallback({
          type: 'message',
          content: finalMessage,
          data: functionResult,
        });
      } else {
        // No function call, just respond
        const content = responseMessage.content || '';
        this.conversationHistory.push({
          role: 'assistant',
          content,
        });

        responseCallback({
          type: 'message',
          content,
        });
      }
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
You can search for spooky images (ghosts, monsters, tombstones) with transparent backgrounds, 
download them, and add them as overlays to video clips with smart positioning.

When adding overlays:
- Ghosts should be placed near the TOP of the video (y: 0-30%)
- Tombstones should be placed near the BOTTOM (y: 70-100%)
- Monsters can be placed in the MIDDLE or varied positions (y: 30-70%)
- X positions should be random but aesthetically pleasing (spread across 10-90%)
- Use 3-5 overlays per clip for a good spooky effect
- Set opacity between 0.3-0.7 for a subtle, eerie appearance
- Each overlay should be 15-25% of the video size

You can also apply a black and white filter to Track 1 (overlay track) clips to make them more eerie.

Always maintain a spooky but helpful tone. Use phrases like "frightful", "ghastly", "eerie", 
"spine-chilling", etc. But remain helpful and clear in your instructions.`;
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
              description: 'Number of images to retrieve (default: 3)',
              default: 3,
            },
          },
          required: ['query', 'type'],
        },
      },
      {
        name: 'addOverlaysToClip',
        description: 'Add multiple overlay effects to a specific clip with smart positioning based on type',
        parameters: {
          type: 'object',
          properties: {
            clipId: {
              type: 'string',
              description: 'ID of the clip to add overlays to (use "first" for first clip, "focused" for focused clip, or "all" for all clips)',
            },
            overlays: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  imageUrl: {
                    type: 'string',
                    description: 'URL of the image to download and use',
                  },
                  type: {
                    type: 'string',
                    enum: ['ghost', 'monster', 'tombstone'],
                    description: 'Type of overlay (affects positioning)',
                  },
                  opacity: {
                    type: 'number',
                    description: 'Opacity (0-1, default: 0.5)',
                    default: 0.5,
                  },
                },
                required: ['imageUrl', 'type'],
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
    const result = await this.imageService.searchSpookyImages(query, type);
    const limitedImages = result.images.slice(0, count);

    return {
      success: true,
      images: limitedImages,
      count: limitedImages.length,
    };
  }

  /**
   * Add overlays to a clip
   */
  private async addOverlaysToClip(clipId: string, overlays: any[]): Promise<any> {
    try {
      // Resolve clip ID
      let targetClip: TimelineClip | undefined;
      
      if (clipId === 'first' || clipId === 'focused') {
        targetClip = this.timelineClips[0]; // For now, use first clip
      } else {
        targetClip = this.timelineClips.find(c => c.id === clipId);
      }

      if (!targetClip) {
        throw new Error('No clip found to add overlays to');
      }

      // Download images and create overlay effects
      const downloadedOverlays = [];

      for (const overlay of overlays) {
        try {
          // Download the image
          const filename = `spooky_${overlay.type}_${Date.now()}`;
          const localPath = await this.imageService.downloadImage(overlay.imageUrl, filename);

          // Generate smart positioning based on type
          const position = this.generateSmartPosition(overlay.type, downloadedOverlays.length);
          const size = this.generateSize();
          const opacity = overlay.opacity || 0.5;

          downloadedOverlays.push({
            id: `overlay-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            filePath: localPath,
            opacity,
            position,
            size,
            type: overlay.type,
          });
        } catch (error) {
          console.error('Error downloading overlay image:', error);
        }
      }

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

