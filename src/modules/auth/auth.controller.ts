import type { Response, NextFunction } from 'express'
import { authService } from './services/auth.service'
import { AppError } from '@shared/middleware/errorHandler'
import { sendSuccess } from '@shared/utils/response'
import { env } from '@shared/config/env'
import type { RequestWithUser } from '@shared/types/global.types'

const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000
const ACCESS_TOKEN_TTL_MS = 15 * 60 * 1000

const cookieOptions = {
  httpOnly: true,
  secure: env.COOKIE_SECURE,
  sameSite: env.COOKIE_SAME_SITE as 'strict' | 'lax' | 'none',
}

export const authController = {
  async login(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      const companyId = req.tenant?.companyId
      if (!companyId) {
        throw new AppError('Tenant not identified', 400)
      }

      const result = await authService.login(req.body, companyId)

      res.cookie('accessToken', result.accessToken, {
        ...cookieOptions,
        maxAge: ACCESS_TOKEN_TTL_MS,
      })

      res.cookie('refreshToken', result.refreshToken, {
        ...cookieOptions,
        maxAge: REFRESH_TOKEN_TTL_MS,
      })

      sendSuccess(res, {
        code: 'LOGIN_SUCCESS',
        message: 'Login successful',
        data: {
          user: result.user,
          page_access: result.page_access,
          permissions: result.permissions,
          sessionExpiresIn: result.sessionExpiresIn,
        },
        requestId: req.traceId,
      })
    } catch (error) {
      next(error)
    }
  },

  async session(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      const refreshToken = req.cookies?.refreshToken as string | undefined

      if (!refreshToken) {
        throw new AppError('No active session', 401)
      }

      const result = await authService.refreshSession(refreshToken)

      res.cookie('accessToken', result.accessToken, {
        ...cookieOptions,
        maxAge: ACCESS_TOKEN_TTL_MS,
      })

      sendSuccess(res, {
        code: 'SESSION_REFRESHED',
        message: 'Session refreshed successfully',
        data: {
          user: result.user,
          page_access: result.page_access,
          permissions: result.permissions,
          sessionExpiresIn: result.sessionExpiresIn,
        },
        requestId: req.traceId,
      })
    } catch (error) {
      next(error)
    }
  },

  async logout(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.userId
      const tenantId = req.user?.tenantId
      if (!userId || !tenantId) {
        throw new AppError('Unauthorized', 401)
      }

      const refreshToken = req.cookies?.refreshToken as string | undefined
      if (!refreshToken) {
        throw new AppError('No active session', 401)
      }

      await authService.logout(refreshToken, userId, tenantId)

      res.clearCookie('accessToken', cookieOptions)
      res.clearCookie('refreshToken', cookieOptions)

      sendSuccess(res, {
        code: 'LOGOUT_SUCCESS',
        message: 'Logout successful',
        data: {},
        requestId: req.traceId,
      })
    } catch (error) {
      next(error)
    }
  },

  async getAccess(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.userId
      const tenantId = req.user?.tenantId
      if (!userId || !tenantId) {
        throw new AppError('Unauthorized', 401)
      }
      const result = await authService.getAccess(userId, tenantId)
      res.status(200).json({
        success: true,
        message: 'Permissions fetched successfully',
        data: result,
      })
    } catch (error) {
      next(error)
    }
  },
}
