import { Server } from 'http';
import app from './app.js';
import config from './config/index.js';
import { seedAdmin } from './app/utils/seed.js';

async function bootstrap() {
  let server: Server;

  try {
    // Seed default Admin on startup
    await seedAdmin();

    // Start Express Server
    server = app.listen(config.port, () => {
      console.log(`🚀 orbitX Travel Server is running on http://localhost:${config.port}`);
    });

    const exitHandler = () => {
      if (server) {
        server.close(() => {
          console.log('Server closed gracefully.');
          process.exit(0);
        });
      } else {
        process.exit(0);
      }
    };

    process.on('SIGTERM', () => {
      console.log('SIGTERM signal received.');
      exitHandler();
    });

    process.on('SIGINT', () => {
      console.log('SIGINT signal received.');
      exitHandler();
    });

    process.on('unhandledRejection', (error) => {
      console.log('Unhandled Rejection detected, closing server...');
      console.error(error);
      if (server) {
        server.close(() => {
          process.exit(1);
        });
      } else {
        process.exit(1);
      }
    });

    process.on('uncaughtException', (error) => {
      console.log('Uncaught Exception detected, closing server...');
      console.error(error);
      process.exit(1);
    });

  } catch (error) {
    console.error('Error starting server bootstrap:', error);
    process.exit(1);
  }
}

bootstrap();
