import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().default(5000),
  NODE_ENV: z.enum(['development', 'production', 'test']),

  DB_HOST: z.string(),
  DB_PORT: z.coerce.number().default(5432),
  DB_NAME: z.string(),
  DB_USER: z.string(),
  DB_PASSWORD: z.string(),

  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default('7d'),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),

  MODE: z.enum(['monolith', 'microservice']).default('monolith'),

  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(900000),
  RATE_LIMIT_MAX: z.coerce.number().default(100),

  LOG_LEVEL: z.string().default('info'),

  ALLOWED_ORIGINS: z.string(),
  DEFAULT_COMPANY_ID: z.coerce.number().default(1),

  AI_SERVICE_URL: z.string().url().default('http://127.0.0.1:8001/api/org-dna'),
  PYTHON_API_URL: z.string().url().default('http://127.0.0.1:8002'),
  CANDIDATE_EXTRACT_API_URL: z.string().url().default('http://127.0.0.1:8005'),
  CANDIDATE_SCORING_API_URL: z.string().url().default('http://127.0.0.1:8006'),
});

const result = envSchema.safeParse(process.env);

if (!result.success) {
  console.error('Invalid environment variables:');
  result.error.issues.forEach((issue) => {
    console.error(`  ${issue.path.join('.')}: ${issue.message}`);
  });
  process.exit(1);
}

export const env = result.data;
