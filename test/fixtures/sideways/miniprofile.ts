import * as Express from 'express';

export async function GET (_req: Express.Request, res: Express.Response) {
  const profile = await res.locals.api.get('/user');
  return {
    name: `${profile.firstName} ${profile.lastName}`,
  };
}