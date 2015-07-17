var Promise = require("bluebird");
var walk = require('walk');
var fs = require('fs');
var path = require('path');
var colour = require('colour');

var apiDir = path.dirname(require.main.filename) + "/api";
var router;

function beforeApiHook(router){
  try {
    var hooks = require(apiDir + '/.hooks.js');
    if(typeof hooks.BEFORE === 'function'){
      router.use(hooks.BEFORE);
      return console.log('✔ Before API hook registered'.green.bold);
    }
    console.log('• No before hook found'.yellow);
  } catch(err){ console.log('• No before hook found'.yellow)}
}

function afterApiHook(router){
  try {
    var hooks = require(apiDir + '/.hooks.js');
    if(typeof hooks.AFTER === 'function'){
      router.use(hooks.AFTER);
      return console.log('✔ After API hook registered'.green.bold);
    }
    console.log('• No after hook found'.yellow);
  } catch(err){ console.log('• No after hook found'.yellow)}
}

function renderBasePage(req, res, next){
  // If this is not an ajax request, just send our base page
  if(typeof req === 'object' && !req.xhr){
    return res.sendfile(path.dirname(require.main.filename) + '/index.html', {}, function (err) {
      if (err) res.status((err) ? err.status : 500);
      else res.status(200);
    });
   }
   next();
}

function apiNotFound(req, res){
  console.error('✘ Error routing to API path '.red, req.path.red);
  return {code: 404, status: 'error', message: 'Method Not Implemented'};
}

function attachLocalApi(req, res, next){
  res.locals.api = {
    get: function GET_factory(path, body){
      return new api_query('get', req, res, path, body);
    },
    post: function POST_factory(path, body){
      return new api_query('post', req, res, path, body);
    },
    put: function PUT_factory(path, body){
      return new api_query('put', req, res, path, body);
    },
    delete: function DELETE_factory(path, body){
      return new api_query('delete', req, res, path, body);
    }
  };
  next();
}

var evalAPI = function(func){
  return function(req, res, next){

    // Evaluate API function
    var result = func(req, res);

    // If internal API flag is present, just return the result to the next handler
    if(req._internalAPI) return next(result);

    // Otherwise, send back to the browser with the proper response
    if(result && typeof result.then === 'function'){
      return result.then(function(result){
        result || (result = {})
        res.status((result.code || 200)).json(result);
      }, function(err){
        result || (result = {})
        console.error('✘ API promise rejected and returning non 200 response:', err);
        res.status((err.code || 500)).json(err);
      });
    }
    else if(typeof result === 'object'){
      result || (result = {})
      return res.status((result.code || 200)).json(result);
    }
    console.error('✘ API endpoint returned something other than JSON or a Promise:', result, func);
    return res.status(500).json({status: 'error', message: 'Invalid Response'});
  }
 };

function loadAPI(router, filePath, apiPath){
  var methods = '';
  try {
     handler = require(filePath);
     if(typeof handler === 'function' && (methods += ' GET')) router.get(apiPath, evalAPI(handler));
     if(typeof handler === 'object'){
       if(typeof handler.ALL === 'function' && (methods += ' ALL')) router.all(apiPath, evalAPI(handler.ALL));
       if(typeof handler.GET === 'function' && (methods += ' GET')) router.get(apiPath, evalAPI(handler.GET));
       if(typeof handler.POST === 'function' && (methods += ' POST')) router.post(apiPath, evalAPI(handler.POST));
       if(typeof handler.PUT === 'function' && (methods += ' PUT')) router.put(apiPath, evalAPI(handler.PUT));
       if(typeof handler.DELETE === 'function' && (methods += ' DELETE')) router.delete(apiPath, evalAPI(handler.DELETE));
     }
     console.log('   • Registered:'.green, apiPath, ('('+methods.trim()+')').yellow);
  } catch(err) {
    console.error('   ✘ Error in API:  '.red.bold, apiPath);
    console.error('    ', filePath.underline);
    console.error('    ', err.toString().replace(/(\r\n|\r|\n)/gm, '$1     '))
  }
}

function discoverAPI(router){
  var queue = [],
      options = {
        listeners: {
          file: function (root, fileStats, next) {
            // Ignore hidden files
            if(fileStats.name[0] === '.') return next();

            // Construct both the absolute filepath, and public facing API path
            var filePath = root + '/' + fileStats.name,
                apiPath = filePath.replace(apiDir, '').replace(/\/index.js$/, '').replace(/.js$/, '');

            // Push them to our queue. This later sorted in order of route precidence.
            queue.push({apiPath: apiPath, filePath: filePath});

            // Process next file
            next();
          },

          end: function () {
            // Sort queue in reverse alphabetical order.
            // Has the nice side effect of ordering by route precidence
            queue.sort(function(file1, file2){
              return (file1.apiPath > file2.apiPath) ? 1 : -1;
            })

            // For each API item in the queue, load it into our router
            while(queue.length){
              var file = queue.pop(); // TODO: When ES6 is common in node, make let
              loadAPI(router, file.filePath, file.apiPath);
            }

            // When we have loaded all of our API endpoints, register our catchall route
            router.all('*', evalAPI(apiNotFound));

            // Success message
            console.log("✔ API Discovery Complete".green.bold);
          }
        }
      };
  try{
    console.log('… Discovering API:'.green.bold);
    walk.walkSync(apiDir, options);
  } catch(e){
    console.error('✘ Error reading API directory:  '.red.bold, e);
  }
}

// Register function must be called at the begining of your app.js file.
// Creates a new express Router using the parent application's version of express
// And adds a middleware that attaches a new instance of the api query function
// to each request's locals object.
api = function(express){
  var setupRouter = express.Router();
  router = express.Router();
  // If this is not an ajax request, just send our base page
  setupRouter.use(renderBasePage)
  setupRouter.use(attachLocalApi)
  beforeApiHook(setupRouter);
  discoverAPI(router);
  setupRouter.use(router);
  afterApiHook(setupRouter);
  return setupRouter;
}

function api_query(method, req, res, path, body){
  this.path = (typeof path === 'object') ? path.path : path;
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

api_query.prototype.then = function(callback, errCallback){

  var self = this;

  if(typeof this.path !== 'string') return console.error('✘ API call must be provided a path!');
  if(!errCallback) throw 'YOU MUST PROVIDE AN ERROR CALLBACK FOR INTERNAL API CALLS';

  // Handle
  return new Promise(function(resolve, reject){
    router.handle(self.req, self.res, function(result){
      if(typeof result.then === 'function'){
        return result.then(function(data){
          if(data && data.status === 'error') console.error('✘ Internal API promise failed:'.red.bold, data.message);
          resolve(data);
        }, function(err){
          console.error('✘ Internal API promise rejected:'.red.bold, err);
          reject(err)
        });
      }
      else if(typeof result === 'object'){
        if(result && result.status === 'error') console.error('✘ Internal API promise failed:'.red.bold, result.message);
        return resolve(result);
      }
      console.error('✘ Internal API returned with invalid response:'.red.bold, result);
      reject({status: 'error', message: 'Invalid Response'});
    });
  }).then(callback, errCallback);
}

module.exports = api;