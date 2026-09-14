import { Router, type IRouter } from "express";
import adminRouter from "./admin";
import healthRouter from "./health";
import storefrontRouter from "./storefront";
import { requireRole } from "../middlewares/auth";
import commerceRouter from "./commerce";
import storageRouter from "./storage";

const router: IRouter = Router();

router.use(healthRouter);
router.use(storefrontRouter);
router.use(commerceRouter);
router.use(storageRouter);
router.use(requireRole("staff", "branch_manager", "operations_manager", "operations", "manager", "admin"), adminRouter);

export default router;
