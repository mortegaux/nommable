import { Router } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { RecipeController } from '../controllers/recipe.controller';
import { authMiddleware } from '../middleware';
import {
  recipeImageUpload,
  recipeExtractionUpload,
  validateImageContent,
} from '../middleware/upload';

const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req as any).userId ?? ipKeyGenerator(req.ip ?? '127.0.0.1'),
  message: { error: 'Too many AI requests, please try again later' },
});

// Recipe import triggers server-side fetches (scraper + image download), so it
// gets its own limiter: an authenticated user probing internal addresses via
// crafted URLs is rate-limited well below the 100/min global API cap.
const importLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req as any).userId ?? ipKeyGenerator(req.ip ?? '127.0.0.1'),
  message: { error: 'Too many import requests, please try again later' },
});

const router: Router = Router();
const controller = new RecipeController();

router.use(authMiddleware);

router.get('/', controller.findAll.bind(controller));
router.post('/', controller.create.bind(controller));
router.post('/bulk-delete', controller.bulkDelete.bind(controller));
router.post('/bulk-update', controller.bulkUpdate.bind(controller));
router.get('/categories', controller.getCategories.bind(controller));
router.get('/recent', controller.getRecentlyViewed.bind(controller));
router.get('/suggestions', controller.getSuggestions.bind(controller));
router.get('/:id', controller.findById.bind(controller));
router.put('/:id', controller.update.bind(controller));
router.delete('/:id', controller.delete.bind(controller));
router.put('/:id/rate', controller.rate.bind(controller));
router.delete('/:id/rate', controller.unrate.bind(controller));

// Special endpoints
router.post('/import', importLimiter, controller.importFromUrl.bind(controller));
router.post('/generate', aiLimiter, controller.generateWithAI.bind(controller));
router.post('/:id/enhance', aiLimiter, controller.enhanceWithAI.bind(controller));
router.post(
  '/extract-from-images',
  aiLimiter,
  recipeExtractionUpload.array('files', 5),
  validateImageContent,
  controller.extractFromImages.bind(controller)
);
router.post('/extract-from-text', aiLimiter, controller.extractFromText.bind(controller));
router.post(
  '/detect-ingredients',
  aiLimiter,
  recipeExtractionUpload.single('image'),
  validateImageContent,
  controller.detectIngredientsFromImage.bind(controller)
);

// Image upload
router.post(
  '/upload-image',
  recipeImageUpload.single('image'),
  validateImageContent,
  controller.uploadImage.bind(controller)
);
router.post(
  '/:id/upload-image',
  recipeImageUpload.single('image'),
  validateImageContent,
  controller.uploadImage.bind(controller)
);

// AI Image Generation
router.post('/generate-image', aiLimiter, controller.generateImage.bind(controller));
router.post('/:id/generate-image', aiLimiter, controller.generateImage.bind(controller));

export default router;
