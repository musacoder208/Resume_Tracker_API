import path from 'path'
import express from "express";
import cors from 'cors';
import cookieParser from 'cookie-parser';
import router from "@gateway/routes";
import { tenantMiddleware } from '@gateway/middleware/tenant.middleware';
import { env } from '@shared/config/env';

const app = express();

const allowedOrigins = env.ALLOWED_ORIGINS.split(',').map((o) => o.trim())

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true)
    } else {
      callback(new Error(`CORS: origin ${origin} not allowed`))
    }
  },
  credentials: true,
}));

app.use(express.json());
app.use(cookieParser());
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

// ✅ Health check
app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});
app.use(tenantMiddleware);
// ✅ Gateway routes
app.use("/api", router);

export default app;