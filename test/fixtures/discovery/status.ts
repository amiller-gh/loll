import * as Express from 'express';

export function GET(_req: Express.Request, res: Express.Response) {
  res.status(401);
  return {
    status: 'error',
    message: 'Unauthorized.',
  };
}
