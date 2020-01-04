import * as Express from 'express';

export default function dynamicPart(req: Express.Request) {
  return req.params;
}