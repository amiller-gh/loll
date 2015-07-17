var Promise = require("bluebird");
var walk = require('walk');
var fs = require('fs');
var path = require('path');
var colour = require('colour');

var rootDir = path.dirname(require.main.filename);
var apiDir = rootDir + "/api";
var router;

// If this is not an ajax request, and request is for an asset that accepts html,
// then this must be a first time render - just send our base page down.
function renderBasePage(req, res, next){
  if(typeof req === 'object' && !req.xhr && req.accepts(['*/*', 'text/html']) === 'text/html'){
    return res.sendfile(rootDir + '/index.html', {}, function (err) {
      if (err) res.status((err) ? err.status : 500);
      else res.status(200);
    });
   }
   next();
}

// If no API endpoint takes the bait, return the properly formatted 400 error
// for the media requested. JSON for ajax, just the http status code for all others
function apiNotFound(req, res, next){
  if(typeof req !== 'object') return;
  res.status(400);
  if(req.xhr){
    console.error('✘ Error routing to API path '.red, req.path.red);
    return res.json({code: 404, status: 'error', message: 'Method Not Implemented'});
  }
  next();
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
attachLocalApi.next = function(){console.log('BLARG?!')}

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

function hasValidMethod(handler){
  return typeof handler === 'object' &&
     (  typeof handler.ALL === 'function'
        || typeof handler.GET === 'function'
        || typeof handler.POST === 'function'
        || typeof handler.PUT === 'function'
        || typeof handler.DELETE === 'function')
}

function loadAPI(router, filePath, apiPath){
  var methods = '';
  try {
     handler = require(filePath);
     // If handler is a function, register it as a get callback
     if(typeof handler === 'function' && (methods += ' GET')) router.get(apiPath, evalAPI(handler));
     // If handler is an object with any valid http method, register them
     else if(hasValidMethod(handler)){
       if(typeof handler.ALL === 'function' && (methods += ' ALL')) router.all(apiPath, evalAPI(handler.ALL));
       if(typeof handler.GET === 'function' && (methods += ' GET')) router.get(apiPath, evalAPI(handler.GET));
       if(typeof handler.POST === 'function' && (methods += ' POST')) router.post(apiPath, evalAPI(handler.POST));
       if(typeof handler.PUT === 'function' && (methods += ' PUT')) router.put(apiPath, evalAPI(handler.PUT));
       if(typeof handler.DELETE === 'function' && (methods += ' DELETE')) router.delete(apiPath, evalAPI(handler.DELETE));
     }
     // Otherwise, this is an invalid export. Error.
     else{
       return console.error('   ✘ Error in API:'.red.bold, apiPath.bold.black, (' - no valid HTTP method exported').gray);
     }
     console.log('   • Registered:'.green, (apiPath ? apiPath : '/'), ('('+methods.trim()+')').yellow);
  } catch(err) {
    // If require() failed, error
    console.error('   ✘ Error in API:'.red.bold, apiPath.bold.black, ' - error in the API file'.gray);
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
            router.all('*', apiNotFound);
          }
        }
      };
  try{
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
  var setupRouter = express();
  router = express.Router();

  // Hacky. Force the parent router to attach the locals.api interface at the begining of each request
  setupRouter.on('mount', function(parent){
    parent.use(attachLocalApi)
    parent._router.stack.splice(2, 0, parent._router.stack.pop());
  });

  // If this is not an ajax request, just send our base page
  setupRouter.use(renderBasePage);

  console.log('• Discovering API:'.green.bold);
  discoverAPI(router);
  setupRouter.use(router);
  console.log("✔ API Discovery Complete".green.bold);
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