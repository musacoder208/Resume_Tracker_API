# SYSTEM ARCHITECTURE RULES
# Resume Tracker API — Global Rule File
# Attach this file to every module generation prompt

--------------------------------------------------
## 1. OVERVIEW
--------------------------------------------------
This system follows a Modular Monolith architecture.
It is designed for scalability and easy conversion to microservices.
It enforces strict separation of concerns and reusable patterns.

--------------------------------------------------
## 2. COMPLETE REQUEST FLOW
--------------------------------------------------
```
Client
  ↓
Gateway (middleware)
  ↓
Route
  ↓
Adapter
  ↓
safeLoad / Proxy
  ↓
Module Route
  ↓
Controller
  ↓
Service
  ↓
Repository
  ↓
Database (functions)
  ↓
(Optional External API)
  ↓
Response
```

--------------------------------------------------
## 3. ENTRY POINT
--------------------------------------------------
- `server.ts` → starts application
- `app.ts` → initializes express app, middleware, routes

--------------------------------------------------
## 4. GATEWAY RULES
--------------------------------------------------
- Gateway is the entry point of the application
- All requests must pass through middleware

Middleware Execution Order:
```
trace → security → rateLimit → tenant → auth → routes → error
```

--------------------------------------------------
## 5. ADAPTER RULE
--------------------------------------------------
- Adapter decides execution mode

```typescript
if (MODE === "monolith") {
  handler = safeLoad("moduleName")
} else {
  handler = proxyHandler
}
```

--------------------------------------------------
## 6. SAFELOAD RULE
--------------------------------------------------
- Modules must be loaded dynamically
- Avoid direct imports between modules
- Use require() with dynamic path
- Wrap in try-catch
- Return fallback handler if module not found

```typescript
// Usage
safeLoad("moduleName")
```

--------------------------------------------------
## 7. MODULE STRUCTURE
--------------------------------------------------
Each module must contain exactly:

```
moduleName/
├── app.ts                        # standalone express app
├── index.ts                      # module init + export router
├── moduleName.routes.ts          # API endpoints
├── moduleName.controller.ts      # request/response handling
├── services/
│   └── moduleName.service.ts     # business logic
├── repositories/
│   └── moduleName.repository.ts  # DB interaction only
├── schemas/
│   └── moduleName.schema.ts      # Zod validation schemas
└── clients/
    └── serviceName.client.ts     # external/inter-service calls
```

--------------------------------------------------
## 8. IMPORT PATH RULES
--------------------------------------------------
ALWAYS use path aliases. Never use relative paths across layers.

```typescript
// ✅ CORRECT
import { env } from '@shared/config/env'
import { db } from '@shared/config/db'
import logger from '@shared/logger/logger'
import { AppError } from '@shared/middleware/errorHandler'
import { ApiResponse } from '@shared/types/global.types'
import { validate } from '@shared/validators/validate'

// ❌ WRONG
import { env } from '../../../shared/config/env'
import { db } from '../../../shared/config/db'
```

--------------------------------------------------
## 9. ENV CONFIG RULE
--------------------------------------------------
- ALWAYS import `env` from `@shared/config/env`
- NEVER use `process.env` directly anywhere
- NEVER hardcode values

```typescript
// ✅ CORRECT
import { env } from '@shared/config/env'
const secret = env.JWT_SECRET

// ❌ WRONG
const secret = process.env.JWT_SECRET
const secret = 'hardcoded_value'
```

--------------------------------------------------
## 10. LOGGER RULE
--------------------------------------------------
- ALWAYS import `logger` from `@shared/logger/logger`
- NEVER use `console.log`, `console.error`, `console.warn`

```typescript
// ✅ CORRECT
import logger from '@shared/logger/logger'
logger.info('User created successfully')
logger.warn('Rate limit approaching')
logger.error('Database connection failed', { error })

// ❌ WRONG
console.log('User created')
console.error('Error occurred')
```

Log levels per layer:
- Controller → `info` for request logging (optional)
- Service → `info` for important business actions
- Repository → `error` for DB errors only
- Clients → `info` for external API calls, `error` for failures

DO NOT log:
- Passwords
- Tokens
- Sensitive user data

--------------------------------------------------
## 11. DATABASE RULES
--------------------------------------------------
- ALWAYS import `db` from `@shared/config/db`
- NEVER create a new DB connection anywhere
- ALWAYS use parameterized queries (`$1`, `$2`)
- NEVER concatenate strings in SQL queries
- ALL DB calls must go through repository layer only

```typescript
// ✅ CORRECT
import { db } from '@shared/config/db'

const result = await db.query(
  'SELECT * FROM fn_get_user($1)',
  [userId]
)

// ❌ WRONG
import { Pool } from 'pg'
const pool = new Pool()

const result = await db.query(
  `SELECT * FROM users WHERE id = '${userId}'`
)
```

--------------------------------------------------
## 12. ERROR HANDLING RULE
--------------------------------------------------
- ALWAYS use `AppError` from `@shared/middleware/errorHandler`
- NEVER throw plain `new Error()`
- ALWAYS pass errors to `next(error)` in controller
- NEVER handle business errors manually in controller

```typescript
// ✅ CORRECT — in service/repository
import { AppError } from '@shared/middleware/errorHandler'

throw new AppError('User not found', 404)
throw new AppError('Unauthorized access', 401)
throw new AppError('Validation failed', 400)

// ✅ CORRECT — in controller
try {
  const result = await service.method()
  res.json({ success: true, data: result })
} catch (error) {
  next(error)
}

// ❌ WRONG
throw new Error('User not found')

res.status(404).json({ message: 'Not found' }) // manual error handling
```

AppError structure:
```typescript
new AppError(message: string, statusCode: number)
```

--------------------------------------------------
## 13. RESPONSE FORMAT RULE
--------------------------------------------------
ALWAYS return `ApiResponse` format from every controller.

```typescript
// Type definition
interface ApiResponse<T> {
  success: boolean
  message: string
  data?: T
  error?: string
}

// ✅ CORRECT — Success response
res.status(200).json({
  success: true,
  message: 'User fetched successfully',
  data: result
})

// ✅ CORRECT — Created response
res.status(201).json({
  success: true,
  message: 'User created successfully',
  data: result
})

// ✅ CORRECT — Error response (handled by errorHandler)
{
  success: false,
  message: 'User not found',
  error: 'NOT_FOUND'
}

// ❌ WRONG
res.json(result)
res.json({ data: result })
res.json({ status: 'ok' })
```

--------------------------------------------------
## 14. CONTROLLER RULES
--------------------------------------------------
Responsibilities:
- Validate request using Zod schema
- Call service method
- Return ApiResponse format
- Pass errors to next(error)

```typescript
// ✅ CORRECT pattern
export const createUser = async (
  req: RequestWithUser,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const data = req.body // already validated by middleware
    const result = await userService.create(data)
    res.status(201).json({
      success: true,
      message: 'Created successfully',
      data: result
    })
  } catch (error) {
    next(error)
  }
}
```

DO NOT:
- ❌ Write business logic in controller
- ❌ Call database directly from controller
- ❌ Call external APIs from controller
- ❌ Handle business errors manually
- ❌ Use process.env directly

--------------------------------------------------
## 15. SERVICE RULES
--------------------------------------------------
Responsibilities:
- Handle all business logic
- Call repository for DB operations
- Call external services via clients
- Process and return data
- Throw AppError for business rule violations

```typescript
// ✅ CORRECT pattern
export const userService = {
  async create(data: CreateUserDto) {
    // business logic here
    const existing = await userRepository.findByEmail(data.email)
    if (existing) {
      throw new AppError('Email already exists', 409)
    }
    const result = await userRepository.create(data)
    logger.info('User created', { userId: result.id })
    return result
  }
}
```

DO NOT:
- ❌ Call database directly (use repository)
- ❌ Handle HTTP request/response
- ❌ Call external APIs directly (use clients)

--------------------------------------------------
## 16. REPOSITORY RULES
--------------------------------------------------
Responsibilities:
- Handle ALL database interaction
- Execute SQL queries only
- Call DB functions / stored procedures
- Log DB errors only

```typescript
// ✅ CORRECT pattern
import { db } from '@shared/config/db'
import logger from '@shared/logger/logger'
import { AppError } from '@shared/middleware/errorHandler'

export const userRepository = {
  async findById(id: string) {
    try {
      const result = await db.query(
        'SELECT * FROM fn_get_user($1)',
        [id]
      )
      return result.rows[0] || null
    } catch (error) {
      logger.error('DB error in findById', { error })
      throw new AppError('Database error', 500)
    }
  }
}
```

DO NOT:
- ❌ Write business logic in repository
- ❌ Call external APIs from repository
- ❌ Use string concatenation in SQL
- ❌ Create new DB connections

--------------------------------------------------
## 17. VALIDATION RULE
--------------------------------------------------
- ALWAYS define schemas in `schemas/moduleName.schema.ts`
- ALWAYS validate in route using `validate` middleware
- NEVER validate manually inside controller
- ONLY validated data should reach service

```typescript
// ✅ CORRECT — schema definition
import { z } from 'zod'

export const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(2)
})

export type CreateUserDto = z.infer<typeof createUserSchema>

// ✅ CORRECT — route usage
import { validate } from '@shared/validators/validate'
import { createUserSchema } from './schemas/user.schema'

router.post('/', validate(createUserSchema), userController.create)
```

--------------------------------------------------
## 18. CLIENT COMMUNICATION RULE
--------------------------------------------------
- ALWAYS use `axios` inside clients layer only
- NEVER call external APIs from controller or service directly
- ALWAYS handle axios errors inside client
- ALWAYS return typed response from client

```typescript
// ✅ CORRECT — client pattern
import axios from 'axios'
import logger from '@shared/logger/logger'
import { AppError } from '@shared/middleware/errorHandler'

export const authClient = {
  async verifyToken(token: string) {
    try {
      const response = await axios.post(`${env.AUTH_SERVICE_URL}/verify`, {
        token
      })
      logger.info('Token verified via auth service')
      return response.data
    } catch (error) {
      logger.error('Auth service call failed', { error })
      throw new AppError('Auth service unavailable', 503)
    }
  }
}

// ❌ WRONG — calling axios in service
const response = await axios.post('http://auth-service/verify', { token })
```

--------------------------------------------------
## 19. AUTHENTICATION RULE
--------------------------------------------------
- JWT must be validated in middleware only
- Attach user info to `req.user`
- Use `RequestWithUser` type for typed access
- Do NOT validate user from DB on every request

```typescript
// ✅ CORRECT — accessing user in controller/service
import { RequestWithUser } from '@shared/types/global.types'

const userId = req.user?.userId
const tenantId = req.tenantId
```

--------------------------------------------------
## 20. MULTI-TENANT RULE
--------------------------------------------------
- Tenant must be extracted from request in middleware
- Attach tenant to `req.tenantId`
- Use tenant-specific schema in all DB queries

```typescript
// ✅ CORRECT — repository usage
const result = await db.query(
  `SELECT * FROM ${tenantId}.fn_get_user($1)`,
  [userId]
)
```

--------------------------------------------------
## 21. ASYNC RULE
--------------------------------------------------
- ALWAYS use `async/await`
- NEVER forget `await`
- ALWAYS wrap async code in `try/catch`
- NEVER use `.then().catch()` chains

```typescript
// ✅ CORRECT
const result = await userRepository.findById(id)

// ❌ WRONG
userRepository.findById(id).then(result => { ... })
const result = userRepository.findById(id) // missing await
```

--------------------------------------------------
## 22. NAMING CONVENTION RULE
--------------------------------------------------
Files:
```
moduleName.controller.ts
moduleName.service.ts
moduleName.repository.ts
moduleName.schema.ts
moduleName.routes.ts
serviceName.client.ts
```

Functions/Variables:
```typescript
// camelCase for functions and variables
const getUserById = async () => {}
const userId = 'abc'

// PascalCase for types and interfaces
interface CreateUserDto {}
type ApiResponse<T> = {}
```

--------------------------------------------------
## 23. SHARED LAYER RULE
--------------------------------------------------
ONE-WAY dependency only:

```
modules  →  shared  ✅ allowed
shared   →  modules ✗ never
modules  →  modules ✗ never (use clients instead)
gateway  →  shared  ✅ allowed
gateway  →  modules ✗ never (use safeLoad/proxy)
```

Shared layer contains:
- `config/` → env and db config only
- `logger/` → winston logger only
- `middleware/` → reusable middleware only
- `types/` → global TypeScript types only
- `validators/` → Zod validation helper only
- `health/` → health check only

--------------------------------------------------
## 24. WORKERS RULE
--------------------------------------------------
- Used for background jobs (email, reports)
- Must not be called directly from controller
- Must communicate via queue only

--------------------------------------------------
## 25. BEST PRACTICES
--------------------------------------------------
- No direct module-to-module imports
- Always use adapter for gateway communication
- Always use client for external service communication
- Keep controller, service, repository strictly separated
- Keep code simple and consistent
- Follow same pattern across ALL modules
- Do not duplicate logic — extract to shared layer
- Do not add unnecessary abstraction

--------------------------------------------------
## 26. STRICT RULES SUMMARY
--------------------------------------------------

| Rule | ✅ Do | ❌ Never |
|---|---|---|
| ENV | `env` from `@shared/config/env` | `process.env` directly |
| DB | `db` from `@shared/config/db` | new Pool() or new connection |
| Logger | `logger` from `@shared/logger/logger` | `console.log` |
| Error | `throw new AppError(msg, status)` | `throw new Error()` |
| SQL | Parameterized `$1, $2` | String concatenation |
| Response | `ApiResponse` format always | Custom response format |
| Validation | Zod in route middleware | Manual validation in controller |
| External API | Via `clients/` layer only | Direct axios in controller/service |
| Module import | Via `safeLoad` or `clients` | Direct cross-module import |
| Async | `async/await` always | `.then().catch()` chains |

--------------------------------------------------
## 27. IMPORTANT
--------------------------------------------------
- Follow these rules strictly in every module
- Do not add unnecessary abstraction
- Maintain clean and readable code
- Every module must follow the exact same pattern
- When in doubt — check this rule file


--------------------------------------------------
## 28. MODULE ENTRY & GATEWAY INTEGRATION RULE (CRITICAL)
--------------------------------------------------

- Every module MUST be accessed ONLY via Gateway.
- Module generation MUST always start from Gateway integration.

STRICT FLOW (MANDATORY):

Client
  ↓
Gateway (routes/index.ts)
  ↓
Adapter (moduleName.adapter.ts)
  ↓
safeLoad / Proxy
  ↓
Module Routes
  ↓
Controller
  ↓
Service

--------------------------------------------------

MANDATORY IMPLEMENTATION RULES:

1. Gateway Integration First
- While generating any module, ALWAYS:
  - Register route in gateway/routes/index.ts
  - Connect adapter in gateway/adapters
  - Ensure module is accessible via /api/<module>

2. Adapter Rule (STRICT)
- Adapter MUST follow MODE-based routing:

```ts
export const moduleAdapter: Router =
  env.MODE === "monolith"
    ? safeLoad("moduleName")
    : moduleProxy();
