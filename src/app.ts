import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import morgan from 'morgan';
import config from './config/index.js';
import path from 'path';
import globalErrorHandler from './app/middlewares/globalErrorHandler.js';
import notFound from './app/middlewares/notFound.js';
import router from './app/routes/index.js';

const app: Application = express();

app.use(helmet());
app.use(morgan('dev'));

app.use(
  cors({
    origin: true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  })
);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// Serve PDF vouchers
app.use('/vouchers', express.static(path.join(process.cwd(), 'public', 'vouchers')));

// Server health check route
app.get('/', (req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    message: 'orbitX Travel API Server is running smoothly.',
    environment: config.node_env,
    uptime: `${process.uptime().toFixed(2)} sec`,
    timestamp: new Date().toISOString(),
  });
});

// Mounting API Router
app.use('/api/v1', router);

// Error Middlewares
app.use(globalErrorHandler);
app.use(notFound);

export default app;
