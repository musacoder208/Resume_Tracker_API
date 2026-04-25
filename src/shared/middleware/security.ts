import helmet from 'helmet';
import cors from 'cors';
import { env } from '@shared/config/env';

export const helmetConfig = helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
});

export const corsConfig = cors({
  origin: env.ALLOWED_ORIGINS.split(',').map((o: string) => o.trim()),
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-tenant-id', 'x-trace-id'],
  credentials: true,
  optionsSuccessStatus: 200,
});
