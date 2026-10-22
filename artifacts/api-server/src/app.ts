import express, { type Express, type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import {
  CLERK_PROXY_PATH,
  clerkProxyMiddleware,
  getClerkProxyHost,
} from "./middlewares/clerkProxyMiddleware";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();
app.set("trust proxy", 1);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0]?.replace(/(\/guest\/orders\/[^/]+\/)[^/]+/, "$1[redacted]"),
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());
app.use(cors({ credentials: true, origin: true }));
app.use(
  express.json({
    verify: (req, _res, buf) => {
      if (req.url?.includes("/webhooks/payments")) {
        (req as express.Request & { rawBody?: string }).rawBody = buf.toString("utf8");
      }
    },
  }),
);
app.use(express.urlencoded({ extended: true }));
app.use(
  clerkMiddleware((req) => ({
    publishableKey: publishableKeyFromHost(
      getClerkProxyHost(req) ?? "",
      process.env.CLERK_PUBLISHABLE_KEY,
    ),
  })),
);

app.use("/api", router);

app.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
  if (res.headersSent) {
    next(err);
    return;
  }
  const status = typeof (err as { status?: unknown })?.status === "number"
    ? (err as { status: number }).status
    : 500;
  logger.error({
    event: "unhandled_request_error",
    status,
    name: err instanceof Error ? err.name : undefined,
    message: err instanceof Error ? err.message.slice(0, 200) : undefined,
  }, "unhandled request error");
  res.status(status).json({
    error: status >= 500 ? "Internal server error" : ((err as { message?: string })?.message || "Request failed"),
  });
});

export default app;
