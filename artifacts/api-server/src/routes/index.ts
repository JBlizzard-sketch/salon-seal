import { Router, type IRouter } from "express";
import healthRouter from "./health";
import salonsRouter from "./salons";
import servicesRouter from "./services";
import staffRouter from "./staff";
import bookingsRouter from "./bookings";
import clientsRouter from "./clients";
import dashboardRouter from "./dashboard";
import remindersRouter from "./reminders";

const router: IRouter = Router();

router.use(healthRouter);
router.use(salonsRouter);
router.use(servicesRouter);
router.use(staffRouter);
router.use(bookingsRouter);
router.use(clientsRouter);
router.use(dashboardRouter);
router.use(remindersRouter);

export default router;
