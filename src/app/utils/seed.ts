import bcrypt from 'bcryptjs';
import prisma from './prisma.js';

export async function seedAdmin() {
  try {
    const adminEmail = 'admin@orbitxtravel.com';
    const existingAdmin = await prisma.user.findFirst({
      where: {
        roles: {
          has: 'admin'
        }
      }
    });

    if (!existingAdmin) {
      console.log('Seeding default admin user...');
      const hashedPassword = await bcrypt.hash('admin1234', 12);
      await prisma.user.create({
        data: {
          email: adminEmail,
          password: hashedPassword,
          fullName: 'orbitX Travel Admin',
          roles: ['admin', 'traveler'],
          currentRole: 'admin',
          isEmailVerified: true,
          isVerified: true
        }
      });
      console.log('Default admin seeded: admin@orbitxtravel.com / admin1234');
    } else {
      console.log('Admin user already exists in the database.');
    }
  } catch (error) {
    console.error('Error seeding default admin:', error);
  }
}

export async function seedReviews() {
  try {
    const existingCount = await prisma.review.count();
    if (existingCount === 0) {
      console.log('Seeding initial traveler reviews...');
      
      let hotel = await prisma.hotel.findFirst();
      if (!hotel) {
        let owner = await prisma.user.findFirst({ where: { roles: { has: 'hotel_owner' } } });
        if (!owner) {
          const hashedPassword = await bcrypt.hash('owner1234', 12);
          owner = await prisma.user.create({
            data: {
              email: 'hotelowner@orbitxtravel.com',
              password: hashedPassword,
              fullName: 'OrbitX Hotel Partner',
              roles: ['hotel_owner', 'traveler'],
              currentRole: 'hotel_owner',
              isEmailVerified: true,
              isVerified: true,
            }
          });
        }
        hotel = await prisma.hotel.create({
          data: {
            ownerId: owner.id,
            name: 'Grand Sultan Tea Resort & Golf',
            address: 'Sreemangal, Sylhet',
            description: 'Luxury 5-star resort nestled in the tea gardens.',
            amenities: ['Pool', 'Spa', 'WiFi'],
            photos: ['https://images.unsplash.com/photo-1566073771259-6a8506099945?w=600&auto=format&fit=crop&q=80'],
            isVerified: true,
          }
        });
      }

      const initialReviews = [
        {
          hotelId: hotel.id,
          name: "Tahmina Akhter",
          avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&auto=format&fit=crop&q=80",
          rating: 5,
          comment: "My family was skeptical at first. But the OrbitX Travel seat lock system changed everything. It felt like a proper verified arrangement, not random chatting.",
        },
        {
          hotelId: hotel.id,
          name: "Arif Hossain",
          avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=120&auto=format&fit=crop&q=80",
          rating: 5,
          comment: "I work abroad and was worried about finding a good tour back home. OrbitX Travel made the whole process smooth. We are now happily traveled.",
        },
        {
          hotelId: hotel.id,
          name: "Sumaiya Begum",
          avatar: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=120&auto=format&fit=crop&q=80",
          rating: 5,
          comment: "No unnecessary pressure. Everything went through proper channels. It felt respectful and completely transparent in its approach. Very happy!",
        },
        {
          hotelId: hotel.id,
          name: "Abdullah Al Mamun",
          avatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=120&auto=format&fit=crop&q=80",
          rating: 5,
          comment: "A friend recommended OrbitX. The vendor verification is strict, which I liked. Found a verified stay in my city. Very thankful.",
        },
        {
          hotelId: hotel.id,
          name: "Tanvir Ahmed",
          avatar: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=120&auto=format&fit=crop&q=80",
          rating: 5,
          comment: "I am a working professional and did not have time for traditional booking hassles. OrbitX fit perfectly into my schedule with automated pre-trip alerts.",
        },
        {
          hotelId: hotel.id,
          name: "Masuma Akter",
          avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=120&auto=format&fit=crop&q=80",
          rating: 5,
          comment: "I was hesitant because I am introverted. But the voucher system let me confirm details properly before any contact. Match understood before departure.",
        },
        {
          hotelId: hotel.id,
          name: "Imran Hossain",
          avatar: "https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=120&auto=format&fit=crop&q=80",
          rating: 5,
          comment: "My parents found OrbitX Travel more trustworthy than traditional agents because every host profile has a verified NID/Trade License.",
        },
        {
          hotelId: hotel.id,
          name: "Sajjad Hossain",
          avatar: "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=120&auto=format&fit=crop&q=80",
          rating: 5,
          comment: "I live in the UK and booked a package for my parents in Bangladesh. They had the best experience in Sylhet. Our trip was unforgettable.",
        }
      ];

      for (const rev of initialReviews) {
        await prisma.review.create({ data: rev });
      }
      console.log('Seeded initial traveler reviews.');
    }
  } catch (error) {
    console.error('Error seeding reviews:', error);
  }
}
