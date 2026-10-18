import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'path';
import fs from 'fs';
import swaggerUi from 'swagger-ui-express';
import { config } from './config';
import routes from './api/routes';
import { errorHandler } from './api/middleware';
import { swaggerSpec } from './config/swagger';
import { ImageStorageService } from './services/image-storage.service';
import { ALLOWED_MIMES as ALLOWED_UPLOAD_MIMES } from './utils/image-validation';

export function createApp(): express.Express {
  const app = express();

  // Trust the first reverse-proxy hop (Portainer/Nginx). The proxy sets
  // X-Forwarded-For; without this, express-rate-limit sees every client
  // as one IP and logs ERR_ERL_UNEXPECTED_X_FORWARDED_FOR. `1` (not `true`)
  // so only the single front proxy is trusted, never arbitrary clients.
  app.set('trust proxy', 1);

  // Middleware
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' }, // Allow images to be loaded
      contentSecurityPolicy: false, // Allow inline theme script and external recipe images
      strictTransportSecurity: false, // Support plain HTTP self-hosted LAN access
      crossOriginOpenerPolicy: false,
      originAgentCluster: false,
    })
  );
  app.use(cors({ origin: config.cors.origin, credentials: true }));
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // API rate limit: 100 req/min per IP (scoped to /api so static SPA assets & images aren't throttled)
  const globalLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later' },
  });

  app.use('/api', globalLimiter);

  // Serve uploaded files (from resolved upload dir, /app/uploads, and local ./uploads)
  app.use('/uploads', express.static(config.upload.dir));
  if (config.upload.dir !== '/app/uploads' && fs.existsSync('/app/uploads')) {
    app.use('/uploads', express.static('/app/uploads'));
  }
  if (config.upload.dir !== path.join(process.cwd(), 'uploads')) {
    app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));
  }

  // Fallback: if an image file is missing on disk (e.g. after container rebuild),
  // restore and serve it from PostgreSQL `stored_images`
  app.get('/uploads/:subdir/:filename', async (req, res) => {
    const { subdir, filename } = req.params;
    const restored = await ImageStorageService.getAndRestoreImage(subdir, filename);
    if (!restored) {
      res.status(404).json({ error: 'Image not found' });
      return;
    }
    // Serve only allowlisted raster MIME types. A stored `image/svg+xml` row
    // (e.g. legacy data from before content validation) would otherwise be
    // served as SVG from this origin — stored XSS. Anything else is served
    // as a generic JPEG so the bytes can never execute as script.
    const safeMime = ALLOWED_UPLOAD_MIMES.has(restored.mimeType) ? restored.mimeType : 'image/jpeg';
    res.setHeader('Content-Type', safeMime);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.send(restored.buffer);
  });

  // Health check
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  // Swagger API documentation
  app.use(
    '/api/docs',
    swaggerUi.serve,
    swaggerUi.setup(swaggerSpec, {
      customSiteTitle: 'Nommable API Documentation',
      customCss: '.swagger-ui .topbar { display: none }',
    })
  );

  // API routes
  app.use('/api', routes);

  // Serve the frontend SPA (single-container build: frontend dist is copied
  // to ./public next to the backend dist). Must come after /api routes.
  const frontendDir = path.join(__dirname, '..', 'public');
  if (fs.existsSync(frontendDir)) {
    app.use(express.static(frontendDir));
    // SPA fallback: non-API, non-upload routes serve index.html
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) {
        return next();
      }
      res.sendFile(path.join(frontendDir, 'index.html'));
    });
  }

  // Error handler (must be last)
  app.use(errorHandler);

  return app;
}
