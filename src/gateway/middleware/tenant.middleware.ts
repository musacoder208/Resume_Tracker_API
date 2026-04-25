import { Request, Response, NextFunction } from 'express';
import { pool } from '@shared/config/db';
import { env } from '@shared/config/env';
import { logger } from '@shared/logger/logger';

export const tenantMiddleware = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const host = req.hostname;
  const subdomain = host.split('.')[0];

  if (subdomain === 'localhost' || subdomain === 'default' || env.NODE_ENV === 'development') {
    (req as any).tenant = { companyId: env.DEFAULT_COMPANY_ID, subdomain: 'default' };
    return next();
  }

  try {
    const result = await pool.query('SELECT * FROM public.fn_get_company_by_subdomain($1)', [subdomain]);
    const company = result.rows[0]?.fn_get_company_by_subdomain ?? null;

    if (!company) {
      res.status(401).json({ success: false, message: 'Invalid tenant' });
      return;
    }

    (req as any).tenant = { companyId: company.company_id, subdomain };
    next();
  } catch (err) {
    logger.error('Tenant resolution failed', { error: err });
    res.status(500).json({ success: false, message: 'Tenant resolution failed' });
  }
};
