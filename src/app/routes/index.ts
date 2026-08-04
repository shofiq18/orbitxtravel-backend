import { Router } from 'express';
import { UserRoutes } from '../modules/user/user.route.js';
import { HotelRoutes } from '../modules/hotel/hotel.route.js';
import { TourRoutes } from '../modules/tour/tour.route.js';
import { BookingRoutes } from '../modules/booking/booking.route.js';
import { AdminRoutes } from '../modules/admin/admin.route.js';
import { NotificationRoutes } from '../modules/notification/notification.route.js';

const router = Router();

const moduleRoutes = [
  {
    path: '/auth',
    route: UserRoutes,
  },
  {
    path: '/users',
    route: UserRoutes,
  },
  {
    path: '/hotels',
    route: HotelRoutes,
  },
  {
    path: '/tours',
    route: TourRoutes,
  },
  {
    path: '/bookings',
    route: BookingRoutes,
  },
  {
    path: '/admin',
    route: AdminRoutes,
  },
  {
    path: '/notifications',
    route: NotificationRoutes,
  },
];

moduleRoutes.forEach((route) => router.use(route.path, route.route));

export default router;
