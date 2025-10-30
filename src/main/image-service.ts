import { app } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as https from 'https';
import * as http from 'http';

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
  private cacheDir: string;
  private downloadedImages: Map<string, string> = new Map();

  constructor() {
    this.apiKey = process.env.PIXABAY_API_KEY || '';
    this.cacheDir = path.join(app.getPath('userData'), 'spooky-cache');
    
    // Ensure cache directory exists
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }
    
    console.log('ImageService initialized, cache dir:', this.cacheDir);
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
  async downloadImage(imageUrl: string, filename: string): Promise<string> {
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
      const localPath = path.join(this.cacheDir, `${sanitizedFilename}${ext}`);

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

      protocol.get(url, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            resolve(json);
          } catch (error) {
            reject(error);
          }
        });
      }).on('error', (error) => {
        reject(error);
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
   * Clear the image cache
   */
  clearCache(): void {
    try {
      const files = fs.readdirSync(this.cacheDir);
      for (const file of files) {
        fs.unlinkSync(path.join(this.cacheDir, file));
      }
      this.downloadedImages.clear();
      console.log('Image cache cleared');
    } catch (error) {
      console.error('Error clearing cache:', error);
    }
  }

  /**
   * Get cache statistics
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
      console.error('Error getting cache stats:', error);
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

