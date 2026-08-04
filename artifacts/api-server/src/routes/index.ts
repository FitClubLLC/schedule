import { Router, type IRouter } from "express";
import healthRouter from "./health";
import appointmentsRouter from "./appointments";
import adminRouter from "./admin";

const router: IRouter = Router();

router.use(healthRouter);
router.use(appointmentsRouter);
router.use(adminRouter);

export default router;
