import { Router, type IRouter } from "express";
import adminRouter from "./admin";
import healthRouter from "./health";
import storefrontRouter from "./storefront";
import { requireRole } from "../middlewares/auth";
import commerceRouter from "./commerce";

const router: IRouter = Router();

router.use(healthRouter);
router.use(storefrontRouter);
router.use(commerceRouter);
router.use(requireRole("staff", "manager", "admin"), adminRouter);

export default router;
