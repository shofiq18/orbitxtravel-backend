import express from 'express';
import { HotelController } from './hotel.controller.js';
import { HotelValidation } from './hotel.validation.js';
import validateRequest from '../../middlewares/validateRequest.js';
import auth from '../../middlewares/auth.js';

const router = express.Router();

// Hotel listings CRUD
router.post(
  '/',
  auth('hotel_owner'),
  validateRequest(HotelValidation.createHotelSchema),
  HotelController.createHotel
);

router.patch(
  '/:id',
  auth('hotel_owner'),
  validateRequest(HotelValidation.updateHotelSchema),
  HotelController.updateHotel
);

router.get('/', HotelController.getHotels);
router.get('/:id', HotelController.getHotelById);

// Rooms management
router.post(
  '/:hotelId/rooms',
  auth('hotel_owner'),
  validateRequest(HotelValidation.createRoomSchema),
  HotelController.createRoom
);

router.get('/:hotelId/rooms', HotelController.getRooms);

// Calendar availability blockers
router.post(
  '/rooms/:roomId/block-dates',
  auth('hotel_owner'),
  validateRequest(HotelValidation.blockDatesSchema),
  HotelController.blockRoomDates
);

router.get('/rooms/:roomId/blocked-dates', HotelController.getBlockedRoomDates);
router.get('/rooms/:roomId/availability', HotelController.getRoomAvailability);
router.get('/rooms/:roomId/availability', HotelController.getRoomAvailability);

export const HotelRoutes = router;
