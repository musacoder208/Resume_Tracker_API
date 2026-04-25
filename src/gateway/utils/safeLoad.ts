import { Router } from 'express';
import type { Request, Response } from 'express';

export function safeLoad(moduleName: string): Router {
  try {
    const routes = require(`../../modules/${moduleName}/${moduleName}.routes`);
    return routes.default ?? routes;
  } catch {
    const fallback = Router();
    fallback.all('*', (_req: Request, res: Response) => {
      res.status(503).json({ error: `${moduleName} module not available` });
    });
    return fallback;
  }
}
