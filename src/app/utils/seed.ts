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
