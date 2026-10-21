import { Response } from 'express';
import { PantryService } from '../../services/pantry/pantry.service';
import { AuthRequest } from '../middleware/auth';
import { AIService, sendAIUnavailable, providerError } from '../../services/ai/ai.service';
import { processImage } from '../../utils/image-processor';
import type { ImageInput } from '../../services/ai/types';

const pantryService = new PantryService();

export const pantryController = {
  async getAll(req: AuthRequest, res: Response) {
    try {
      const items = await pantryService.getAllItems(req.userId!);
      res.json(items);
    } catch (error: any) {
      // Match the standard error shape used by the other AI endpoints
      // instead of leaking the raw provider message.
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  async getById(req: AuthRequest, res: Response) {
    try {
      const item = await pantryService.getItemById(req.params.id, req.userId!);
      if (!item) {
        return res.status(404).json({ error: 'Pantry item not found' });
      }
      res.json(item);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  },

  async create(req: AuthRequest, res: Response) {
    try {
      const item = await pantryService.createItem(req.userId!, req.body);
      res.status(201).json(item);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  },

  async update(req: AuthRequest, res: Response) {
    try {
      const item = await pantryService.updateItem(req.params.id, req.userId!, req.body);
      res.json(item);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  },

  async delete(req: AuthRequest, res: Response) {
    try {
      await pantryService.deleteItem(req.params.id, req.userId!);
      res.status(204).send();
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  },

  async getExpiring(req: AuthRequest, res: Response) {
    try {
      const daysAhead = parseInt(req.query.days as string) || 7;
      const items = await pantryService.getExpiringItems(req.userId!, daysAhead);
      res.json(items);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  },

  async getLowStock(req: AuthRequest, res: Response) {
    try {
      const items = await pantryService.getLowStockItems(req.userId!);
      res.json(items);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  },

  async updateQuantity(req: AuthRequest, res: Response) {
    try {
      const { quantityChange } = req.body;
      const item = await pantryService.updateQuantity(req.params.id, req.userId!, quantityChange);
      res.json(item);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  },

  async toggleLowStock(req: AuthRequest, res: Response) {
    try {
      const item = await pantryService.toggleLowStock(req.params.id, req.userId!);
      res.json(item);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  },

  async getLocations(req: AuthRequest, res: Response) {
    try {
      const locations = await pantryService.getLocations(req.userId!);
      res.json(locations);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  },

  async createLocation(req: AuthRequest, res: Response) {
    try {
      const { name } = req.body ?? {};
      const location = await pantryService.createLocation(req.userId!, name);
      res.status(201).json(location);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  },

  async updateLocation(req: AuthRequest, res: Response) {
    try {
      const { name } = req.body ?? {};
      const result = await pantryService.updateLocation(req.userId!, req.params.name, name);
      res.json(result);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  },

  async deleteLocation(req: AuthRequest, res: Response) {
    try {
      const transferTo = req.query.transferTo as string | undefined;
      const result = await pantryService.deleteLocation(req.userId!, req.params.name, transferTo);
      res.json(result);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  },

  /**
   * AI vision scan of pantry/fridge photos.
   * Accepts up to 5 wide photos (multipart `files`) plus an optional
   * `location` hint (where the photos were taken).
   * Returns detected candidates for user review — nothing is written
   * to the pantry here; the frontend confirms/edits first.
   */
  async scanImages(req: AuthRequest, res: Response) {
    try {
      const resolution = await AIService.resolveProvider(req.userId);

      if (!resolution.ok) {
        return sendAIUnavailable(res, resolution);
      }

      const provider = resolution.provider;

      if (!req.files || (req.files as Express.Multer.File[]).length === 0) {
        return res.status(400).json({ error: 'No files provided' });
      }

      const files = req.files as Express.Multer.File[];
      if (files.length > 5) {
        return res.status(400).json({ error: 'Maximum 5 files allowed' });
      }

      const locationHint =
        typeof req.body?.location === 'string' && req.body.location.trim()
          ? req.body.location.trim()
          : undefined;

      const images: ImageInput[] = [];
      for (const file of files) {
        const mimeType = file.mimetype;
        if (!mimeType.startsWith('image/')) {
          return res.status(400).json({
            error: `Unsupported file type: ${mimeType}. Only image files are supported.`,
          });
        }
        // Skip canvas validation for HEIC/HEIF — AI providers handle them directly.
        if (
          mimeType === 'image/heic' ||
          mimeType === 'image/heif' ||
          mimeType === 'image/heic-sequence' ||
          mimeType === 'image/heif-sequence'
        ) {
          images.push({ data: file.buffer, mimeType: 'image/jpeg' });
        } else {
          const processedImage = await processImage(file.buffer, mimeType);
          images.push({ data: processedImage.data, mimeType: processedImage.mimeType });
        }
      }

      const items = await provider
        .scanPantryFromImages(images, locationHint)
        .catch((err) => {
          throw providerError(err);
        });
      await AIService.consumeManagedCredit(req.userId);
      res.json({ items });
    } catch (error: any) {
      // Wrapped provider errors (and other AppErrors) keep their status,
      // message, and code instead of collapsing into a generic 500.
      if (error.statusCode) {
        return res
          .status(error.statusCode)
          .json({ error: error.message, ...(error.code ? { code: error.code } : {}) });
      }
      if (error.message?.includes('not supported with Ollama') || error.message?.includes('Ollama does not support vision')) {
        return res.status(400).json({
          error: 'Pantry photo scanning requires OpenAI (GPT-4 Vision), Anthropic (Claude 3+), or Google (Gemini). Ollama does not support vision capabilities.',
        });
      }
      res.status(500).json({ error: error.message });
    }
  },
};
