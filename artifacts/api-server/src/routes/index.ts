import { Router, type IRouter } from "express";
import healthRouter from "./health";
import salonsRouter from "./salons";
import servicesRouter from "./services";
import staffRouter from "./staff";
import bookingsRouter from "./bookings";
import clientsRouter from "./clients";
import dashboardRouter from "./dashboard";

const router: IRouter = Router();

router.use(healthRouter);
router.use(salonsRouter);
router.use(servicesRouter);
router.use(staffRouter);
router.use(bookingsRouter);
router.use(clientsRouter);
router.use(dashboardRouter);

export default router;
