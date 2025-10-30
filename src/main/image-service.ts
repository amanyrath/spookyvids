import { app } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as https from 'https';
import * as http from 'http';
import { getSettings } from './settings';

export interface SpookyImage {
  id: string;
  url: string;
  previewURL: string;
  tags: string[];
  imageWidth: number;
  imageHeight: number;
  localPath?: string;
}

export interface ImageSearchResult {
  images: SpookyImage[];
  total: number;
}

/**
 * Image Service - Handles searching and downloading spooky images
 */
export class ImageService {
  private apiKey: string;
  private cacheDir: string; // Base assets directory in userData
  private projectAssetsDir: string | null = null; // Project assets directory (if exists)
  private downloadedImages: Map<string, string> = new Map();

  constructor() {
    // Get API key from settings or environment (env for dev, settings for packaged)
    const settings = getSettings();
    this.apiKey = settings.getSetting('pixabayApiKey') || process.env.PIXABAY_API_KEY || '';
    // Use assets folder in user data directory with organized subdirectories
    this.cacheDir = path.join(app.getPath('userData'), 'assets');
    
    // Try to find project assets folder (relative to app path or process.cwd)
    const possibleProjectDirs = [
      process.cwd(), // Development mode
      path.join(__dirname, '../..'), // Built app
      path.join(process.resourcesPath || '', 'app'), // Packaged app
    ];
    
    for (const baseDir of possibleProjectDirs) {
      const projectAssetsPath = path.join(baseDir, 'assets');
      if (fs.existsSync(projectAssetsPath)) {
        this.projectAssetsDir = projectAssetsPath;
        console.log('Found project assets directory:', projectAssetsPath);
        break;
      }
    }
    
    // Ensure base assets directory exists
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }
    
    console.log('ImageService initialized, userData assets dir:', this.cacheDir);
    if (this.projectAssetsDir) {
      console.log('ImageService will also check project assets dir:', this.projectAssetsDir);
    }
  }
  
  /**
   * Update Pixabay API key (for dynamic configuration)
   */
  updateApiKey(apiKey: string): void {
    this.apiKey = apiKey;
    getSettings().setSetting('pixabayApiKey', apiKey);
  }

  /**
   * Get the assets directory for a specific type (ghost, monster, tombstone)
   */
  private getTypeDir(type: 'ghost' | 'monster' | 'tombstone', useProjectDir: boolean = false): string {
    const baseDir = useProjectDir && this.projectAssetsDir ? this.projectAssetsDir : this.cacheDir;
    const typeDir = path.join(baseDir, type);
    
    // Ensure type directory exists
    if (!fs.existsSync(typeDir)) {
      fs.mkdirSync(typeDir, { recursive: true });
    }
    
    return typeDir;
  }

  /**
   * Search for spooky images on Pixabay
   */
  async searchSpookyImages(query: string, type?: 'ghost' | 'monster' | 'tombstone'): Promise<ImageSearchResult> {
    if (!this.apiKey) {
      console.warn('Pixabay API key not set, using fallback');
      return this.getFallbackImages(type || 'ghost');
    }

    try {
      // Add spooky keywords to the search
      const spookyQuery = `${query} halloween spooky`;
      const encodedQuery = encodeURIComponent(spookyQuery);
      
      // Pixabay API endpoint
      const url = `https://pixabay.com/api/?key=${this.apiKey}&q=${encodedQuery}&image_type=png&per_page=10&safesearch=true`;
      
      console.log('Searching Pixabay for:', spookyQuery);
      
      const response = await this.fetchJson(url);
      
      if (!response.hits || response.hits.length === 0) {
        console.log('No images found, using fallback');
        return this.getFallbackImages(type || 'ghost');
      }

      const images: SpookyImage[] = response.hits.map((hit: any) => ({
        id: hit.id.toString(),
        url: hit.largeImageURL,
        previewURL: hit.previewURL,
        tags: hit.tags.split(',').map((t: string) => t.trim()),
        imageWidth: hit.imageWidth,
        imageHeight: hit.imageHeight,
      }));

      return {
        images,
        total: response.totalHits,
      };
    } catch (error) {
      console.error('Error searching Pixabay:', error);
      return this.getFallbackImages(type || 'ghost');
    }
  }

  /**
   * Download an image to local cache
   */
  async downloadImage(imageUrl: string, filename: string, type?: 'ghost' | 'monster' | 'tombstone'): Promise<string> {
    // Check if already downloaded
    if (this.downloadedImages.has(imageUrl)) {
      const cachedPath = this.downloadedImages.get(imageUrl)!;
      if (fs.existsSync(cachedPath)) {
        console.log('Using cached image:', cachedPath);
        return cachedPath;
      }
    }

    try {
      const ext = path.extname(new URL(imageUrl).pathname) || '.png';
      const sanitizedFilename = filename.replace(/[^a-z0-9]/gi, '_').toLowerCase();
      
      // Save to organized subdirectory by type if type is provided
      const targetDir = type ? this.getTypeDir(type, false) : this.cacheDir;
      const localPath = path.join(targetDir, `${sanitizedFilename}${ext}`);

      console.log('Downloading image from:', imageUrl);
      console.log('Saving to:', localPath);

      await this.downloadFile(imageUrl, localPath);

      // Cache the path
      this.downloadedImages.set(imageUrl, localPath);

      return localPath;
    } catch (error) {
      console.error('Error downloading image:', error);
      throw new Error(`Failed to download image: ${error}`);
    }
  }

  /**
   * Get fallback images when API is unavailable
   */
  private getFallbackImages(type: 'ghost' | 'monster' | 'tombstone'): ImageSearchResult {
    // Return empty result for now - in production, you'd bundle default images
    console.log('Using fallback images for type:', type);
    return {
      images: [],
      total: 0,
    };
  }

  /**
   * Helper to fetch JSON from URL
   */
  private fetchJson(url: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const urlObj = new URL(url);
      const protocol = urlObj.protocol === 'https:' ? https : http;

      const timeout = setTimeout(() => {
        reject(new Error('Request timeout after 10 seconds'));
      }, 10000); // 10 second timeout

      const req = protocol.get(url, (res) => {
        let data = '';

        // Check for error status codes
        if (res.statusCode && res.statusCode !== 200) {
          clearTimeout(timeout);
          reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage || 'Unknown error'}`));
          return;
        }

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          clearTimeout(timeout);
          try {
            const json = JSON.parse(data);
            resolve(json);
          } catch (error: any) {
            reject(new Error(`Failed to parse JSON: ${error.message}`));
          }
        });
      });

      req.on('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });

      req.setTimeout(10000, () => {
        req.destroy();
        clearTimeout(timeout);
        reject(new Error('Request timeout'));
      });
    });
  }

  /**
   * Helper to download file from URL
   */
  private downloadFile(url: string, destPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const urlObj = new URL(url);
      const protocol = urlObj.protocol === 'https:' ? https : http;

      const file = fs.createWriteStream(destPath);

      protocol.get(url, (response) => {
        if (response.statusCode !== 200) {
          reject(new Error(`Failed to download: ${response.statusCode}`));
          return;
        }

        response.pipe(file);

        file.on('finish', () => {
          file.close();
          resolve();
        });
      }).on('error', (error) => {
        fs.unlink(destPath, () => {}); // Delete partial file
        reject(error);
      });

      file.on('error', (error) => {
        fs.unlink(destPath, () => {}); // Delete partial file
        reject(error);
      });
    });
  }

  /**
   * List all assets in the assets folder, organized by type
   */
  listAssets(type?: 'ghost' | 'monster' | 'tombstone'): Array<{ filename: string; path: string; size: number; modified: Date; type: 'ghost' | 'monster' | 'tombstone' }> {
    const assets: Array<{ filename: string; path: string; size: number; modified: Date; type: 'ghost' | 'monster' | 'tombstone' }> = [];
    
    const typesToCheck: Array<'ghost' | 'monster' | 'tombstone'> = type ? [type] : ['ghost', 'monster', 'tombstone'];
    
    for (const assetType of typesToCheck) {
      // Check project assets folder first (manually placed assets)
      if (this.projectAssetsDir) {
        const projectTypeDir = path.join(this.projectAssetsDir, assetType);
        if (fs.existsSync(projectTypeDir)) {
          try {
            const files = fs.readdirSync(projectTypeDir);
            for (const file of files) {
              const ext = path.extname(file).toLowerCase();
              if (['.png', '.jpg', '.jpeg', '.gif', '.webp'].includes(ext)) {
                const filePath = path.join(projectTypeDir, file);
                const stats = fs.statSync(filePath);
                assets.push({
                  filename: file,
                  path: filePath,
                  size: stats.size,
                  modified: stats.mtime,
                  type: assetType,
                });
              }
            }
          } catch (error) {
            console.error(`Error reading project ${assetType} directory:`, error);
          }
        }
      }
      
      // Check userData assets folder (downloaded assets)
      const userDataTypeDir = path.join(this.cacheDir, assetType);
      if (fs.existsSync(userDataTypeDir)) {
        try {
          const files = fs.readdirSync(userDataTypeDir);
          for (const file of files) {
            const ext = path.extname(file).toLowerCase();
            if (['.png', '.jpg', '.jpeg', '.gif', '.webp'].includes(ext)) {
              const filePath = path.join(userDataTypeDir, file);
              const stats = fs.statSync(filePath);
              assets.push({
                filename: file,
                path: filePath,
                size: stats.size,
                modified: stats.mtime,
                type: assetType,
              });
            }
          }
        } catch (error) {
          console.error(`Error reading userData ${assetType} directory:`, error);
        }
      }
    }
    
    // Sort by modified date (most recent first)
    return assets.sort((a, b) => b.modified.getTime() - a.modified.getTime());
  }

  /**
   * Get asset by filename and type
   */
  getAsset(filename: string, type?: 'ghost' | 'monster' | 'tombstone'): string | null {
    try {
      // If type is provided, check organized subdirectories
      if (type) {
        // Check project assets first
        if (this.projectAssetsDir) {
          const projectTypeDir = path.join(this.projectAssetsDir, type);
          const projectPath = path.join(projectTypeDir, filename);
          if (fs.existsSync(projectPath)) {
            return projectPath;
          }
        }
        
        // Check userData assets
        const userDataTypeDir = path.join(this.cacheDir, type);
        const userDataPath = path.join(userDataTypeDir, filename);
        if (fs.existsSync(userDataPath)) {
          return userDataPath;
        }
      } else {
        // Legacy: search all type directories
        // Check project assets folder
        if (this.projectAssetsDir) {
          for (const assetType of ['ghost', 'monster', 'tombstone'] as const) {
            const projectTypeDir = path.join(this.projectAssetsDir, assetType);
            const projectPath = path.join(projectTypeDir, filename);
            if (fs.existsSync(projectPath)) {
              return projectPath;
            }
          }
        }
        
        // Check userData assets folder
        for (const assetType of ['ghost', 'monster', 'tombstone'] as const) {
          const userDataTypeDir = path.join(this.cacheDir, assetType);
          const userDataPath = path.join(userDataTypeDir, filename);
          if (fs.existsSync(userDataPath)) {
            return userDataPath;
          }
        }
        
        // Fallback to flat structure (legacy)
        const flatPath = path.join(this.cacheDir, filename);
        if (fs.existsSync(flatPath)) {
          return flatPath;
        }
      }
      
      return null;
    } catch (error) {
      console.error('Error getting asset:', error);
      return null;
    }
  }

  /**
   * Clear the assets folder
   */
  clearCache(): void {
    try {
      const files = fs.readdirSync(this.cacheDir);
      for (const file of files) {
        fs.unlinkSync(path.join(this.cacheDir, file));
      }
      this.downloadedImages.clear();
      console.log('Assets folder cleared');
    } catch (error) {
      console.error('Error clearing assets:', error);
    }
  }

  /**
   * Get assets folder statistics
   */
  getCacheStats(): { count: number; sizeBytes: number } {
    try {
      const files = fs.readdirSync(this.cacheDir);
      let totalSize = 0;
      
      for (const file of files) {
        const filePath = path.join(this.cacheDir, file);
        const stats = fs.statSync(filePath);
        totalSize += stats.size;
      }

      return {
        count: files.length,
        sizeBytes: totalSize,
      };
    } catch (error) {
      console.error('Error getting assets stats:', error);
      return { count: 0, sizeBytes: 0 };
    }
  }
}

// Singleton instance
let imageServiceInstance: ImageService | null = null;

export function getImageService(): ImageService {
  if (!imageServiceInstance) {
    imageServiceInstance = new ImageService();
  }
  return imageServiceInstance;
}

