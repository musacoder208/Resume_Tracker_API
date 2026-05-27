import type { Request } from 'express';

export interface AuthPayload {
  userId: number;
  tenantId: number;
  roleId: number;
}

export interface TenantInfo {
  companyId: number;
  schemaName?: string;
}

export interface RequestWithUser extends Request {
  user?: AuthPayload;
  userId?:number;
  tenantId?: number;
  tenant?: TenantInfo;
  roleId?:number;
  traceId?: string;
}

export interface ApiMeta {
  requestId: string;
  timestamp: string;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  code?: string;
  message: string;
  data?: T;
  meta?: ApiMeta;
}

export interface PaginationQuery {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
