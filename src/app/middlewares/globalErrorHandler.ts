import { ErrorRequestHandler } from 'express';
import config from '../../config/index.js';

const globalErrorHandler: ErrorRequestHandler = (err, req, res, next) => {
  const statusCode = err.statusCode || 500;
  const message = err.message || 'Something went wrong!';

  res.status(statusCode).json({
    success: false,
    message,
    errorMessage: err.message || 'Internal Server Error',
    errorDetails: config.node_env === 'development' ? err : {},
    stack: config.node_env === 'development' ? err?.stack : null,
  });
};

export default globalErrorHandler;
