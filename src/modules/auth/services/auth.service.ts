import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { v4 as uuidv4 } from 'uuid'
import { env } from '@shared/config/env'
import { AppError } from '@shared/middleware/errorHandler'
import logger from '@shared/logger/logger'
import { authRepository } from '../repositories/auth.repository'
import type { LoginDto } from '../schemas/auth.schema'
import type { AuthPayload } from '@shared/types/global.types'

const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000

export const authService = {
  async login(data: LoginDto, companyId: number) {
    const user = await authRepository.findUserByUsername(data.username, companyId)

    if (!user) {
      throw new AppError('Invalid credentials', 401)
    }

    const isPasswordValid = await bcrypt.compare(data.password, user.password as string)
    if (!isPasswordValid) {
      throw new AppError('Invalid credentials', 401)
    }

    const payload: AuthPayload = {
      userId: user.user_id as number,
      tenantId: companyId,
      roleId: user.role_id as number,
    }

    const accessToken = jwt.sign(payload, env.JWT_SECRET, {
      expiresIn: env.JWT_ACCESS_EXPIRES_IN as jwt.SignOptions['expiresIn'],
    })

    const refreshToken = uuidv4()
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS)

    await authRepository.saveRefreshToken(
      user.user_id as number,
      companyId,
      refreshToken,
      expiresAt,
      user.role_id as number
    )

    const rawPermissions = await authRepository.getUserPermissions(user.user_id as number, companyId)

    const page_access = (rawPermissions as any[]).map((module) => ({
      page_name: module.page_name,
      route: module.routelink,
      icon: module.icon ?? null,
      display_order: module.display_order,
      permissions: (module.permissions as any[])
        .filter((p) => p.is_allowed)
        .map((p) => (p.permission_code as string).toLowerCase()),
    }))

    const permissions = [...new Set(page_access.flatMap((p) => p.permissions))]

    logger.info('User logged in', { userId: user.user_id, tenantId: companyId })

    return {
      accessToken,
      refreshToken,
      user: {
        userId: user.user_id as number,
        userType: user.user_type as string,
      },
      page_access,
      permissions,
      sessionExpiresIn: expiresAt.toISOString(),
    }
  },

  async refreshSession(token: string) {
    const stored = await authRepository.getRefreshToken(token)

    if (!stored) {
      throw new AppError('Invalid session', 401)
    }

    if (new Date() > new Date(stored.expires_at as string)) {
      throw new AppError('Session expired', 401)
    }

    const payload: AuthPayload = {
      userId: stored.user_id as number,
      tenantId: stored.company_id as number,
      roleId: stored.role_id as number,
    }

    const accessToken = jwt.sign(payload, env.JWT_SECRET, {
      expiresIn: env.JWT_ACCESS_EXPIRES_IN as jwt.SignOptions['expiresIn'],
    })

    const rawPermissions = await authRepository.getUserPermissions(
      stored.user_id as number,
      stored.company_id as number
    )

    const page_access = (rawPermissions as any[]).map((module) => ({
      page_name: module.page_name,
      route: module.routelink,
      icon: module.icon ?? null,
      display_order: module.display_order,
      permissions: (module.permissions as any[])
        .filter((p) => p.is_allowed)
        .map((p) => (p.permission_code as string).toLowerCase()),
    }))

    const permissions = [...new Set(page_access.flatMap((p) => p.permissions))]

    logger.info('Session refreshed', { userId: stored.user_id })

    return {
      accessToken,
      user: {
        userId: stored.user_id as number,
        userType: stored.user_type as string,
      },
      page_access,
      permissions,
      sessionExpiresIn: new Date(stored.expires_at as string).toISOString(),
    }
  },

  async logout(refreshToken: string, userId: number, companyId: number) {
    const stored = await authRepository.getRefreshToken(refreshToken)

    if (!stored || stored.user_id !== userId || stored.company_id !== companyId) {
      throw new AppError('Invalid refresh token', 401)
    }

    await authRepository.revokeRefreshToken(refreshToken, userId, companyId)

    logger.info('User logged out', { userId, companyId })
  },

  async getAccess(userId: number, companyId: number) {
    const permissions = await authRepository.getUserPermissions(userId, companyId)
    return { permissions }
  },
}
