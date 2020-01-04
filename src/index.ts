import * as path from 'path';

import * as Express from 'express';
import * as walk from 'walk';
import * as chalk from 'chalk';

const DEFAULT_API_DIR = path.join(process.cwd(), 'api');

type Method = 'ALL' | 'GET' | 'POST' | 'PUT' | 'DELETE';

export interface IApiHandler {
  ALL?: Express.RequestHandler;
  GET?: Express.RequestHandler;
  POST?: Express.RequestHandler;
  PUT?: Express.RequestHandler;
  DELETE?: Express.RequestHandler;
}

// If no API endpoint takes the bait, return the properly formatted 400 error
// for the media requested. JSON for ajax, just the http status code for all others
function apiNotFound(req: Express.Request, res: Express.Response, next: Express.NextFunction) {
  if(typeof req !== 'object') return;
  res.status(400);
  if(req.xhr){
    console.error(chalk.red('✘ Error routing to API path '), chalk.red(req.path));
    return res.json({code: 404, status: 'error', message: 'Method Not Implemented'});
  }
  return next();
}

const evalAPI = function(func: Express.RequestHandler) {
  return async function(req: Express.Request, res: Express.Response, next: Express.NextFunction) {

    // Evaluate API function
    try {
      const result = await func(req, res, next);

      // If they've returned the response object, assume we've sent the result already.
      if (result === res) { return result; }

      // If it appears to be a JSON response, send it down.
      if (typeof result === 'object') { return res.status((result.code || 200)).json(result); }

      // Otherwise, we're rather confused... alert the world.
      console.error('✘ API endpoint returned something other than JSON or a Promise:', result, func);
      return res.status(500).json({status: 'error', message: 'Invalid Response'});

    } catch(err) {
      // If internal API flag is present, just return the result to the next handler
      if((req as any)._internalAPI) throw err;

      console.error('✘ API promise rejected and returning non 200 response:', err);
      return res.status((err.code || 500)).json(err);
    }
  }
 };

function hasValidMethod(handler: IApiHandler){
  return typeof handler === 'object' &&
     (  typeof handler.ALL === 'function'
        || typeof handler.GET === 'function'
        || typeof handler.POST === 'function'
        || typeof handler.PUT === 'function'
        || typeof handler.DELETE === 'function')
}

function loadAPI(router: Express.Router, filePath: string, apiPath: string){
  let methods = '';
  try {
     const handler = require(filePath) as IApiHandler;
     // If handler is a function, register it as a get callback
     if (typeof handler === 'function' && (methods += ' GET')) router.get(apiPath, evalAPI(handler));
     // If handler is an object with any valid http method, register them
     else if (hasValidMethod(handler)) {
       if(typeof handler.ALL === 'function' && (methods += ' ALL')) router.all(apiPath, evalAPI(handler.ALL));
       if(typeof handler.GET === 'function' && (methods += ' GET')) router.get(apiPath, evalAPI(handler.GET));
       if(typeof handler.POST === 'function' && (methods += ' POST')) router.post(apiPath, evalAPI(handler.POST));
       if(typeof handler.PUT === 'function' && (methods += ' PUT')) router.put(apiPath, evalAPI(handler.PUT));
       if(typeof handler.DELETE === 'function' && (methods += ' DELETE')) router.delete(apiPath, evalAPI(handler.DELETE));
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
            if(fileStats.name[0] === '.' || !~fileStats.name.indexOf('.js')) return next();

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

class ApiQuery {

  private path: string;
  private router: Express.Router;
  private req: Express.RequestHandler;
  private res: Express.Response;

  constructor(router: Express.Router, method: Method, req: Express.Request, res: Express.Response, path: string, body: any) {
    this.router = router;
    this.path = path;
    this.req = Object.create(req, {
      url: { writable: true, configurable: true, value: this.path },
      method: { writable: true, configurable: true, value: method },
      ip: { writable: true, configurable: true, value: '127.0.0.1' },
      body: { writable: true, configurable: true, value: (body || {}) },
      query: { writable: true, configurable: true, value: {} },
      params: { writable: true, configurable: true, value: {} },
      originalUrl: { writable: true, configurable: true, value: undefined },
      _internalAPI: { writable: true, configurable: true, value: true}
    });
    this.res = res;
    return this;
  }

  async then(callback: (data: any) => any, errCallback: (err: Error, data: any) => any): Promise<any> {

    if(typeof this.path !== 'string') return console.error('✘ API call must be provided a path!');
    if(!errCallback) throw 'YOU MUST PROVIDE AN ERROR CALLBACK FOR INTERNAL API CALLS';

    // Handle
    try {
      await (this.router as any).handle(this.req, this.res, async (result: Promise<any> | any) => {

        try {
          const data = await result;
          if(typeof data === 'object') {

            // If the response is an error, call the error callback.
            if(data && data.status === 'error') {
              console.error(chalk.bold.red('✘ Internal API promise failed:'), result.message);
              callback(data);
            }

            // Otherwise, call the success response.
            return callback(data);
          }

          // If the response is not an object, panic.
          console.error(chalk.bold.red('✘ Internal API returned with invalid response:'), result);
          return errCallback(new Error('Internal API returned with invalid response'), { status: 'error', message: 'Invalid Response' });
        } catch (err) {
          console.error(chalk.bold.red('✘ Internal API promise rejected:'), err);
          return errCallback(err, { status: 'error', message: 'Server Error' })
        }
      });
    } catch(err) {
      console.error(chalk.bold.red('✘ Internal API promise rejected:'), err);
      return errCallback(err, { status: 'error', message: 'Server Error' });
    }
  }
}

// Register function must be called at the begining of your app.js file.
// Creates a new express Router using the parent application's version of express
// And adds a middleware that attaches a new instance of the api query function
// to each request's locals object.
export default function api(express: any, apiPath: string = DEFAULT_API_DIR) {
  const setupRouter = express() as Express.Express;
  const router = express.Router() as Express.Router;

  // Hacky. Force the parent router to attach the locals.api interface at the beginning of each request
  setupRouter.on('mount', function(parent){
    parent.use((req: Express.Request, res: Express.Response, next: Express.NextFunction) => {
      res.locals.api = {
        get: function GET_factory(path: string, body: any){
          return new ApiQuery(router, 'GET', req, res, path, body);
        },
        post: function POST_factory(path: string, body: any){
          return new ApiQuery(router, 'POST', req, res, path, body);
        },
        put: function PUT_factory(path: string, body: any){
          return new ApiQuery(router, 'PUT', req, res, path, body);
        },
        delete: function DELETE_factory(path: string, body: any){
          return new ApiQuery(router, 'DELETE', req, res, path, body);
        }
      };
      next();
    });

    parent._router.stack.splice(2, 0, parent._router.stack.pop());
  });

  // If this is not an ajax request, and request is for an asset that accepts html,
  // then this must be a first time render - just send our base page down.
  setupRouter.use((req: Express.Request, res: Express.Response, next: Express.NextFunction) => {
    if(typeof req === 'object' && !req.xhr && req.accepts(['*/*', 'text/html']) === 'text/html') {
      return res.sendfile(path.join(apiPath, '/index.html'), {}, function (err: any) {
        if (err) res.status((err) ? err.status : 500);
        else res.status(200);
      });
    }
    next();
  });

  console.log(chalk.bold.green('• Discovering API:'));
  discoverAPI(router, apiPath);
  console.log(router);
  setupRouter.use(router);
  console.log(chalk.bold.green('✔ API Discovery Complete'));
  return setupRouter;
}