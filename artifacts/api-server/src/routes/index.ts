import { Router, type IRouter } from "express";
import adminRouter from "./admin";
import healthRouter from "./health";
import storefrontRouter from "./storefront";

const router: IRouter = Router();

router.use(healthRouter);
router.use(storefrontRouter);
router.use(adminRouter);

export default router;
