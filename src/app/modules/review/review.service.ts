import prisma from '../../utils/prisma.js';
import AppError from '../../utils/AppError.js';

const createReview = async (userId: string, payload: { hotelId: string; rating: number; comment: string }) => {
  const { hotelId, rating, comment } = payload;

  const user = await prisma.user.findUnique({
    where: { id: userId }
  });

  if (!user) {
    throw new AppError(404, 'User account not found.');
  }

  const hotel = await prisma.hotel.findUnique({
    where: { id: hotelId }
  });

  if (!hotel) {
    throw new AppError(404, 'Hotel property not found.');
  }

  const name = user.fullName || 'Guest Traveler';
  const avatar = name.charAt(0).toUpperCase();

  const review = await prisma.review.create({
    data: {
      hotelId,
      rating,
      comment,
      name,
      avatar
    }
  });

  return review;
};

const getReviewsByHotelId = async (hotelId: string) => {
  const reviews = await prisma.review.findMany({
    where: { hotelId },
    orderBy: { createdAt: 'desc' }
  });
  return reviews;
};

export const ReviewService = {
  createReview,
  getReviewsByHotelId
};
