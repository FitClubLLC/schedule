import { Router, type IRouter } from "express";
import healthRouter from "./health";
import appointmentsRouter from "./appointments";
import adminRouter from "./admin";
import bookingRouter from "./booking";

const router: IRouter = Router();

router.use(healthRouter);
router.use(appointmentsRouter);
router.use(adminRouter);
router.use(bookingRouter);

export default router;
