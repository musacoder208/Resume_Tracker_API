import { Router } from 'express'
import { env } from '@shared/config/env'
import { safeLoad } from '@gateway/utils/safeLoad'
import { authProxy } from '@gateway/proxy/auth.proxy'
import { gatewayAuthMiddleware } from '@gateway/middleware/auth.middleware';

const router = Router();
//router.get('/access', gatewayAuthMiddleware);
router.use('/',  env.MODE === 'monolith'
    ? safeLoad('auth')
    : authProxy());

    export const authAdapter = router;

// export const authAdapter: Router =
//   env.MODE === 'monolith'
//     ? safeLoad('auth')
//     : authProxy()
