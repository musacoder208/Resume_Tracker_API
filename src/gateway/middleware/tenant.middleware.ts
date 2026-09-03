import { Request, Response, NextFunction } from 'express';
import { isIP } from 'net';
import { pool } from '@shared/config/db';
import { env } from '@shared/config/env';
import { logger } from '@shared/logger/logger';

export const tenantMiddleware = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  logger.error('start1');
  const host = req.hostname;
  const subdomain = host.split('.')[0];

  if (subdomain === 'localhost' || subdomain === 'default' || env.NODE_ENV === 'development' || isIP(host)) {
    logger.error('start2');
    (req as any).tenant = { companyId: env.DEFAULT_COMPANY_ID, subdomain: 'default' };
    return next();
  }

  try {
    logger.error('start3');
    const result = await pool.query('SELECT * FROM public.fn_get_company_by_subdomain($1)', [subdomain]);
    const company = result.rows[0]?.fn_get_company_by_subdomain ?? null;

    if (!company) {
      res.status(401).json({ success: false, message: 'Invalid tenant' });
      return;
    }

    (req as any).tenant = { companyId: company.company_id, subdomain };
    next();
  } catch (err: any) {
    if (err?.code === 'P0002') {
      res.status(401).json({ success: false, message: 'Invalid tenant' });
      return;
    }
    logger.error(`Tenant resolution failed: ${err?.code ?? ''} ${err?.message ?? err}`);
    res.status(500).json({ success: false, message: 'Tenant resolution failed' });
  }
};
