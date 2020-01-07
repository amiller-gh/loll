import * as Express from 'express';

export function GET(req: Express.Request) {
  return req.params;
}