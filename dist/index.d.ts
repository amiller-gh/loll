import * as Express from 'express';
export interface IApiHandler {
    ALL?: Express.RequestHandler;
    GET?: Express.RequestHandler;
    POST?: Express.RequestHandler;
    PUT?: Express.RequestHandler;
    DELETE?: Express.RequestHandler;
}
export default function api(express: any, apiPath?: string): Express.Express;
