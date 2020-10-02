import * as path from 'path';

import * as Express from 'express';
import * as walk from 'walk';
import * as chalk from 'chalk';

const DEFAULT_API_ROOT = path.join(process.cwd(), 'api');

const enum Method {
  ALL = 'ALL',
  GET = 'GET',
  POST = 'POST',
  PUT = 'PUT',
  DELETE = 'DELETE',
}

export interface IApiHandler {
  ALL?: Express.RequestHandler;
  GET?: Express.RequestHandler;
  POST?: Express.RequestHandler;
  PUT?: Express.RequestHandler;
  DELETE?: Express.RequestHandler;
}

export interface IApiConstructor {
  new(e?: Express.Router): IApiHandler;
}

export interface LollOptions {
  root?: string;
}

// If no API endpoint takes the bait, return the properly formatted 400 error
// for the media requested. JSON for ajax, just the http status code for all others
function apiNotFound(req: Express.Request, res: Express.Response, _next: Express.NextFunction) {
  console.error(chalk.red('✘ Error routing to API path '), chalk.red(req.path));
  return res.status(400).json({ code: 400, status: 'error', message: 'Method Not Implemented' });
}

const evalAPI = function(ctx: any, func: Express.RequestHandler) {
  return async function(req: Express.Request, res: Express.Response, next: Express.NextFunction) {
    // Evaluate API function
    try {
      const result = await func.call(ctx, req, res, () => {});

      // If internal API flag is present, just return the result to the internal handler
      if((req as any)._internalAPI) { return next(result) }

      // If the middleware has returned the response object, assume they've sent the result already.
      if (result === res) { return result; }

      // If it appears to be a JSON response, send it down.
      if (typeof result === 'object') {
        if (!res.statusCode) { res.status(200); }
        return res.json(result);
      }

      // Otherwise, we're rather confused... alert the world.
      console.error('✘ API endpoint returned something other than JSON or a Promise:', result, func);
      return res.status(500).json({status: 'error', message: 'Invalid Response'});
    } catch(err) {
      // If internal API flag is present, just go ahead and throw, it is up to the user to handle the failed promise.
      if((req as any)._internalAPI) throw err;

      console.error('✘ API promise rejected, returning non 500 response:', err);
      return res.status((err.code || 500)).json({ status: 'error', message: err.message });
    }
  }
 };

 // My own custom "interop default" function. Fancy.
function getHandler(filePath: string): IApiHandler | IApiConstructor {
  const obj = require(filePath);
  return typeof obj === 'object' && obj.default ? obj.default : obj;
}

function isApiConstructor(value: any): value is IApiConstructor {
  return typeof value === 'function';
}

function hasValidMethod(handler: IApiHandler){
  return typeof handler === 'object' &&
     (  typeof handler.ALL === 'function'
        || typeof handler.GET === 'function'
        || typeof handler.POST === 'function'
        || typeof handler.PUT === 'function'
        || typeof handler.DELETE === 'function'
      )
}

function loadAPI(router: Express.Router, filePath: string, apiPath: string){
  let methods = '';
  try {
    let handler = getHandler(filePath);

    // If handler is a function, lets assume its a class constructor.
    if (isApiConstructor(handler)) { handler = new handler(router); }

    // If handler is an object with any valid http method, register them
    if (hasValidMethod(handler)) {
      if(typeof handler.ALL === 'function' && (methods += ' ALL')) router.all(apiPath, evalAPI(handler, handler.ALL));
      if(typeof handler.GET === 'function' && (methods += ' GET')) router.get(apiPath, evalAPI(handler, handler.GET));
      if(typeof handler.POST === 'function' && (methods += ' POST')) router.post(apiPath, evalAPI(handler, handler.POST));
      if(typeof handler.PUT === 'function' && (methods += ' PUT')) router.put(apiPath, evalAPI(handler, handler.PUT));
      if(typeof handler.DELETE === 'function' && (methods += ' DELETE')) router.delete(apiPath, evalAPI(handler, handler.DELETE));
    }
    // Otherwise, this is an invalid export. Error.
    else {
      return console.error(chalk.bold.red('   ✘ Error in API:'), chalk.bold(apiPath), chalk.gray(' - no valid HTTP method exported'));
    }
    console.log(chalk.green('   • Registered:'), (apiPath ? apiPath : '/'), chalk.yellow('('+methods.trim()+')'));
  } catch(err) {
    // If require() failed, error
    console.error(chalk.bold.red('   ✘ Error in API:'), chalk.bold(apiPath), chalk.gray(' - error in the API file'));
    console.error('    ', chalk.underline(filePath));
    console.error('    ', err.toString().replace(/(\r\n|\r|\n)/gm, '$1     '))
  }
}

interface QueueItem {
  apiPath: string;
  filePath: string;
}

function discoverAPI(router: Express.Router, apiDir: string){
  var queue: QueueItem[] = [],
      options = {
        listeners: {
          file: function (root: string, fileStats: walk.WalkStats, next: walk.WalkNext) {
            // Ignore hidden files
            if(fileStats.name[0] === '.' || fileStats.name[0] === '_' || !fileStats.name.endsWith('.js')) return next();

            // Construct both the absolute file path, and public facing API path
            var filePath = path.join(root, fileStats.name),
                apiPath = filePath.replace(apiDir, '').replace(/\/index.js$/, '').replace(/.js$/, '');

            // Push them to our queue. This later sorted in order of route precedence.
            queue.push({ apiPath, filePath });

            // Process next file
            next();
          },

          end: function () {
            // Sort queue in reverse alphabetical order.
            // Has the nice side effect of ordering by route precedence
            queue.sort(function(file1, file2){
              return (file1.apiPath > file2.apiPath) ? 1 : -1;
            })

            // For each API item in the queue, load it into our router
            while(queue.length){
              const file = queue.pop()!; // TODO: When ES6 is common in node, make let
              loadAPI(router, file.filePath, file.apiPath);
            }

            // When we have loaded all of our API endpoints, register our catchall route
            router.all('*', apiNotFound);
          }
        }
      };
  try{
    walk.walkSync(apiDir, options);
  } catch(e){
    console.error(chalk.bold.red('✘ Error reading API directory:  '), e);
  }
}

async function ApiQuery(router: Express.Router, method: Method, req: Express.Request, res: Express.Response, path: string, body: any): Promise<any> {

  if(typeof path !== 'string') throw new Error('Internal API calls must be provided a path');

  const newReq = Object.create(req, {
    method: { writable: true, configurable: true, value: method },
    route: { writable: true, configurable: true, value: undefined },
    url: { writable: true, configurable: true, value: path },
    originalUrl: { writable: true, configurable: true, value: undefined },
    ip: { writable: true, configurable: true, value: '127.0.0.1' },
    body: { writable: true, configurable: true, value: body },
    query: { writable: true, configurable: true, value: {} },
    params: { writable: true, configurable: true, value: {} },
    _internalAPI: { writable: true, configurable: true, value: true}
  });

  return new Promise((resolve, reject) => {
    // Handle
    try {
      // TODO: The @types/express typescript definitions don't have `Router.handle()`. Add this?
      (router as any).handle(newReq, res, async (result: any) => {
        try {
          const data = result;
          if(typeof data === 'object') { return resolve(data); }
          console.error(chalk.bold.red('✘ Internal API returned with invalid response:'), data);
          reject(new Error('Internal API returned with invalid response'));
        } catch (err) {
          console.error(chalk.bold.red('✘ Internal API promise rejected:'), err);
          return reject(err)
        }
      });
    } catch(err) {
      console.error(chalk.bold.red('✘ Internal API promise rejected:'), err);
      return reject(err);
    }
  });
}

// Register function must be called at the beginning of your app.js file.
// Creates a new express Router using the parent application's version of express
// And adds a middleware that attaches a new instance of the api query function
// to each request's locals object.
export default function loll(express: any, options: LollOptions = {}) {
  const app = express() as Express.Express;
  const router = express.Router() as Express.Router;

  // Hacky. Force the parent router to attach the locals.api interface at the beginning of each request
  app.use((req: Express.Request, res: Express.Response, next: Express.NextFunction) => {
    res.locals.api = {
      get: function GET_factory(path: string, body: any){
        return ApiQuery(router, Method.GET, req, res, path, body);
      },
      post: function POST_factory(path: string, body: any){
        return ApiQuery(router, Method.POST, req, res, path, body);
      },
      put: function PUT_factory(path: string, body: any){
        return ApiQuery(router, Method.PUT, req, res, path, body);
      },
      delete: function DELETE_factory(path: string, body: any){
        return ApiQuery(router, Method.DELETE, req, res, path, body);
      }
    };
    next();
  });

  console.log(chalk.bold.green('• Discovering API:'));
  discoverAPI(router, options.root || DEFAULT_API_ROOT);
  app.use(router);
  console.log(chalk.bold.green('✔ API Discovery Complete'));
  return app;
}
