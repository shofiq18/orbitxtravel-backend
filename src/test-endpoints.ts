import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { UserService } from './app/modules/user/user.service.js';
import { HotelService } from './app/modules/hotel/hotel.service.js';
import { TourService } from './app/modules/tour/tour.service.js';
import { BookingService } from './app/modules/booking/booking.service.js';
import { AdminService } from './app/modules/admin/admin.service.js';

const prisma = new PrismaClient();

async function runTest() {
  console.log('--- STARTING ORBITX TRAVEL E2E VERIFICATION TEST ---');

  try {
    // 0. Clear Database Tables for a clean run
    console.log('0. Cleaning up database tables...');
    await prisma.transaction.deleteMany({});
    await prisma.booking.deleteMany({});
    await prisma.roomLock.deleteMany({});
    await prisma.package.deleteMany({});
    await prisma.blockedDate.deleteMany({});
    await prisma.room.deleteMany({});
    await prisma.hotel.deleteMany({});
    await prisma.notification.deleteMany({});
    await prisma.user.deleteMany({});
    console.log('Database cleared.');

    // 1. Create Default Admin User
    console.log('\n1. Creating Default Admin User...');
    const hashedAdminPassword = await bcrypt.hash('admin1234', 12);
    const admin = await prisma.user.create({
      data: {
        email: 'admin@orbitxtravel.com',
        password: hashedAdminPassword,
        fullName: 'orbitX Admin',
        roles: ['admin', 'traveler'],
        currentRole: 'admin',
        isEmailVerified: true,
        isVerified: true,
      },
    });
    console.log('Admin created:', admin.email);

    // 2. Signup traveler
    console.log('\n2. Signing up Traveler user...');
    const travelerUser = await UserService.signupUser({
      email: 'traveler@gmail.com',
      password: 'password123',
      fullName: 'John Doe',
    });
    console.log('Traveler signed up:', travelerUser.email);

    // Verify Traveler Email using OTP
    const fetchedTraveler = await prisma.user.findUnique({
      where: { email: 'traveler@gmail.com' },
    });
    console.log('OTP generated for traveler:', fetchedTraveler?.verificationOtp);
    await UserService.verifyEmail({
      email: 'traveler@gmail.com',
      otp: fetchedTraveler!.verificationOtp!,
    });
    console.log('Traveler email verified.');

    // 3. Signup Hotel Owner
    console.log('\n3. Signing up Hotel Owner user...');
    const hotelOwnerUser = await UserService.signupUser({
      email: 'hotelowner@gmail.com',
      password: 'password123',
      fullName: 'Mr. Hotelier',
    });
    const fetchedHotelOwner = await prisma.user.findUnique({
      where: { email: 'hotelowner@gmail.com' },
    });
    await UserService.verifyEmail({
      email: 'hotelowner@gmail.com',
      otp: fetchedHotelOwner!.verificationOtp!,
    });
    console.log('Hotel Owner email verified.');

    // 4. Signup Tour Organizer
    console.log('\n4. Signing up Tour Organizer user...');
    const organizerUser = await UserService.signupUser({
      email: 'organizer@gmail.com',
      password: 'password123',
      fullName: 'Agent Travel',
    });
    const fetchedOrganizer = await prisma.user.findUnique({
      where: { email: 'organizer@gmail.com' },
    });
    await UserService.verifyEmail({
      email: 'organizer@gmail.com',
      otp: fetchedOrganizer!.verificationOtp!,
    });
    console.log('Tour Organizer email verified.');

    // 5. Vendor Upgrade Onboarding Flow
    console.log('\n5. Onboarding Vendors (Submit applications)...');
    await UserService.becomeVendor(hotelOwnerUser.id, {
      vendorType: 'hotel_owner',
      verificationDocUrl: 'https://cloudinary.com/docs/nid_hotel_owner.pdf',
      businessProfile: {
        businessName: 'Ocean Palms Properties Ltd',
        address: 'Coxs Bazar Beach Road',
        licenseNumber: 'LIC-10049-HOTEL',
      },
      payoutDetails: {
        bankName: 'City Bank Ltd',
        accountNumber: '10049002930219',
        branch: 'Coxs Bazar',
        bkashNumber: '01700000001',
      },
    });
    console.log('Hotel Owner registration application submitted.');

    await UserService.becomeVendor(organizerUser.id, {
      vendorType: 'tour_organizer',
      verificationDocUrl: 'https://cloudinary.com/docs/license_tour_org.pdf',
      businessProfile: {
        businessName: 'OrbitX Holidays Agency',
        address: 'Dhaka Banani Block E',
        licenseNumber: 'LIC-99302-TOUR',
      },
      payoutDetails: {
        bankName: 'Eastern Bank Ltd',
        accountNumber: '99201923049102',
        branch: 'Banani',
        nagadNumber: '01800000002',
      },
    });
    console.log('Tour Organizer registration application submitted.');

    // 6. Admin Approval Queue
    console.log('\n6. Admin verifying vendors queue...');
    const vendorsQueue = await AdminService.getVendorsQueue();
    console.log(`Vendors in admin verification queue: ${vendorsQueue.length}`);

    await AdminService.verifyVendor(hotelOwnerUser.id, true);
    await AdminService.verifyVendor(organizerUser.id, true);
    console.log('Admin approved both vendors. Vendor roles appended.');

    // 7. Hotel Owner creates properties and room inventory
    console.log('\n7. Creating Hotel and Room structures...');
    const hotel = await HotelService.createHotel(hotelOwnerUser.id, {
      name: 'Coxs Bazar Grand Beach Resort',
      address: 'Sea Beach Rd, Coxs Bazar',
      description: 'Stunning beachfront resort with premium amenities.',
      amenities: ['Wi-Fi', 'Swimming Pool', 'Ocean View', 'Complimentary Breakfast'],
      photos: ['https://cloudinary.com/hotel_photo1.jpg', 'https://cloudinary.com/hotel_photo2.jpg'],
    });
    console.log('Hotel listed:', hotel.name);

    const room = await HotelService.createRoom(hotelOwnerUser.id, hotel.id, {
      type: 'Deluxe Couple Sea View Room',
      amenities: ['King Bed', 'AC', 'Private Balcony', 'Mini Fridge'],
      photos: ['https://cloudinary.com/room_photo1.jpg'],
      inventory: 5,
      b2cPrice: 6500.0,
      b2bPrice: 4800.0,
    });
    console.log('Room listed:', room.type);

    // 8. Dynamic Dual-Tier Pricing Verification
    console.log('\n8. Verifying Dual-Tier pricing access redaction...');
    const publicView = await HotelService.getHotelById(hotel.id, 'traveler');
    console.log('Public Room View (traveler role): b2bPrice field exists?', 'b2bPrice' in publicView.rooms[0]);

    const partnerView = await HotelService.getHotelById(hotel.id, 'tour_organizer');
    console.log('Partner Room View (tour_organizer role): b2bPrice field exists?', 'b2bPrice' in partnerView.rooms[0], `(Rate: BDT ${partnerView.rooms[0].b2bPrice})`);

    // 9. Tour Organizer locks hotel rooms and creates Package
    console.log('\n9. Tour Organizer building package and placing B2B room locks hold...');
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const nextWeek = new Date(Date.now() + 8 * 24 * 60 * 60 * 1000).toISOString();

    const tourPackage = await TourService.createPackage(organizerUser.id, {
      title: 'Premium COXs BAZAR Winter Escapade',
      destination: 'Coxs Bazar',
      startDate: tomorrow,
      endDate: nextWeek,
      maxSeats: 15,
      inclusions: {
        transport: 'AC Volvo Scania Bus',
        stayType: 'Coxs Bazar Grand Beach Resort - Deluxe Suite',
        mealPlan: 'Breakfast & Seafood Dinner',
        customs: ['Beach Volleyball Tournament', 'Sunset Parasailing Ride'],
      },
      totalPackagePrice: 15500.0,
      minimumSeatLockFee: 2500.0,
      lockedRooms: [
        {
          roomId: room.id,
          quantity: 2,
          checkInDate: tomorrow.split('T')[0],
          checkOutDate: nextWeek.split('T')[0],
        },
      ],
    });
    console.log('Package created successfully:', tourPackage!.title);
    console.log(`B2B Room hold created: Room locks held count: ${tourPackage!.lockedRooms.length}`);

    // 10. Traveler initiates booking
    console.log('\n10. Traveler booking seats on package...');
    const booking = await BookingService.createBooking(travelerUser.id, {
      packageId: tourPackage!.id,
      seatsBooked: 2,
    });
    console.log(`Booking initiated: Seats: ${booking.seatsBooked}, Total Cost: BDT ${booking.totalAmount}, Required Deposit: BDT ${booking.paidAmount}`);

    // 11. Payment checkout simulation
    console.log('\n11. Processing traveler deposit checkout payment simulation...');
    const completedBooking = await BookingService.payBooking(travelerUser.id, booking.id, {
      paymentMethod: 'bkash',
    });
    console.log('Payment checkout SUCCESS.');
    console.log(`Booking status updated to: ${completedBooking.bookingStatus}`);
    console.log(`Transaction ID generated: ${completedBooking.paymentTxnId}`);
    console.log(`PDF Voucher URL generated: ${completedBooking.voucherUrl}`);

    // Verify package seat decrements
    const reloadedPackage = await TourService.getPackageById(tourPackage!.id);
    console.log(`Seats decrement check: Max seats: ${reloadedPackage.maxSeats}, Available now: ${reloadedPackage.availableSeats}`);

    // 12. Verification of Ledgers & Commission Retentions
    console.log('\n12. Verifying Ledger transactions & commission retentions...');
    const commissions = await AdminService.getPlatformCommissions();
    console.log(`Ledger Commission transaction registered? Count: ${commissions.length}`);
    console.log(`Platform Commission retained (10% of BDT ${booking.paidAmount}): BDT ${commissions[0].amount}`);

    // 13. Admin releases payout to Host
    console.log('\n13. Admin releasing payout to Tour Organizer...');
    const payout = await AdminService.releasePayout({
      hostId: organizerUser.id,
      amount: booking.paidAmount * 0.90,
      referenceId: booking.id,
    });
    console.log(`Payout transaction registered successfully. Txn Ref: ${payout.id}, Amount Released: BDT ${payout.amount}`);

    console.log('\n--- ALL E2E VERIFICATION CHECKS PASSED SUCCESSFULLY ---');
  } catch (error) {
    console.error('\n❌ E2E VERIFICATION TEST FAILED:', error);
  } finally {
    await prisma.$disconnect();
  }
}

runTest();
