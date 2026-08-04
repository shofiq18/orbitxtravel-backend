import { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import catchAsync from '../utils/catchAsync.js';

const validateRequest = (schema: z.ZodTypeAny) => {
  return catchAsync(async (req: Request, res: Response, next: NextFunction) => {
    await schema.parseAsync({
      body: req.body,
      query: req.query,
      params: req.params,
      cookies: req.cookies,
    });
    next();
  });
};

export default validateRequest;
