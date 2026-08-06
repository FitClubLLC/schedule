import { Router, type IRouter } from "express";
import healthRouter from "./health";
import appointmentsRouter from "./appointments";
import adminRouter from "./admin";
import bookingRouter from "./booking";
import userRouter from "./user";

const router: IRouter = Router();

router.use(healthRouter);
router.use(appointmentsRouter);
router.use(adminRouter);
router.use(bookingRouter);
router.use(userRouter);

export default router;
