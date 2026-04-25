import express from "express";
import router from "@gateway/routes";
import { tenantMiddleware } from '@gateway/middleware/tenant.middleware';

const app = express();

app.use(express.json());

// ✅ Health check
app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});
app.use(tenantMiddleware);
// ✅ Gateway routes
app.use("/api", router);

export default app;