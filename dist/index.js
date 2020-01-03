"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const path = require("path");
const walk = require("walk");
const chalk = require("chalk");
const DEFAULT_API_DIR = path.join(process.cwd(), 'api');
// If no API endpoint takes the bait, return the properly formatted 400 error
// for the media requested. JSON for ajax, just the http status code for all others
function apiNotFound(req, res, next) {
    if (typeof req !== 'object')
        return;
    res.status(400);
    if (req.xhr) {
        console.error(chalk.red('✘ Error routing to API path '), chalk.red(req.path));
        return res.json({ code: 404, status: 'error', message: 'Method Not Implemented' });
    }
    return next();
}
const evalAPI = function (func) {
    return function (req, res, next) {
        return __awaiter(this, void 0, void 0, function* () {
            // Evaluate API function
            try {
                const result = yield func(req, res, next);
                if (typeof result === 'object') {
                    return res.status((result.code || 200)).json(result);
                }
                console.error('✘ API endpoint returned something other than JSON or a Promise:', result, func);
                return res.status(500).json({ status: 'error', message: 'Invalid Response' });
            }
            catch (err) {
                // If internal API flag is present, just return the result to the next handler
                if (req._internalAPI)
                    throw err;
                console.error('✘ API promise rejected and returning non 200 response:', err);
                return res.status((err.code || 500)).json(err);
            }
        });
    };
};
function hasValidMethod(handler) {
    return typeof handler === 'object' &&
        (typeof handler.ALL === 'function'
            || typeof handler.GET === 'function'
            || typeof handler.POST === 'function'
            || typeof handler.PUT === 'function'
            || typeof handler.DELETE === 'function');
}
function loadAPI(router, filePath, apiPath) {
    let methods = '';
    try {
        const handler = require(filePath);
        // If handler is a function, register it as a get callback
        if (typeof handler === 'function' && (methods += ' GET'))
            router.get(apiPath, evalAPI(handler));
        // If handler is an object with any valid http method, register them
        else if (hasValidMethod(handler)) {
            if (typeof handler.ALL === 'function' && (methods += ' ALL'))
                router.all(apiPath, evalAPI(handler.ALL));
            if (typeof handler.GET === 'function' && (methods += ' GET'))
                router.get(apiPath, evalAPI(handler.GET));
            if (typeof handler.POST === 'function' && (methods += ' POST'))
                router.post(apiPath, evalAPI(handler.POST));
            if (typeof handler.PUT === 'function' && (methods += ' PUT'))
                router.put(apiPath, evalAPI(handler.PUT));
            if (typeof handler.DELETE === 'function' && (methods += ' DELETE'))
                router.delete(apiPath, evalAPI(handler.DELETE));
        }
        // Otherwise, this is an invalid export. Error.
        else {
            return console.error(chalk.bold.red('   ✘ Error in API:'), chalk.bold.black(apiPath), chalk.gray(' - no valid HTTP method exported'));
        }
        console.log(chalk.green('   • Registered:'), (apiPath ? apiPath : '/'), chalk.yellow('(' + methods.trim() + ')'));
    }
    catch (err) {
        // If require() failed, error
        console.error(chalk.bold.red('   ✘ Error in API:'), chalk.bold.black(apiPath), chalk.gray(' - error in the API file'));
        console.error('    ', chalk.underline(filePath));
        console.error('    ', err.toString().replace(/(\r\n|\r|\n)/gm, '$1     '));
    }
}
function discoverAPI(router, apiDir) {
    var queue = [], options = {
        listeners: {
            file: function (root, fileStats, next) {
                // Ignore hidden files
                if (fileStats.name[0] === '.')
                    return next();
                // Construct both the absolute file path, and public facing API path
                var filePath = path.join(root, fileStats.name), apiPath = filePath.replace(apiDir, '').replace(/\/index.js$/, '').replace(/.js$/, '');
                // Push them to our queue. This later sorted in order of route precedence.
                queue.push({ apiPath, filePath });
                // Process next file
                next();
            },
            end: function () {
                // Sort queue in reverse alphabetical order.
                // Has the nice side effect of ordering by route precedence
                queue.sort(function (file1, file2) {
                    return (file1.apiPath > file2.apiPath) ? 1 : -1;
                });
                // For each API item in the queue, load it into our router
                while (queue.length) {
                    const file = queue.pop(); // TODO: When ES6 is common in node, make let
                    loadAPI(router, file.filePath, file.apiPath);
                }
                // When we have loaded all of our API endpoints, register our catchall route
                router.all('*', apiNotFound);
            }
        }
    };
    try {
        walk.walkSync(apiDir, options);
    }
    catch (e) {
        console.error(chalk.bold.red('✘ Error reading API directory:  '), e);
    }
}
class ApiQuery {
    constructor(router, method, req, res, path, body) {
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
            _internalAPI: { writable: true, configurable: true, value: true }
        });
        this.res = res;
        return this;
    }
    then(callback, errCallback) {
        return __awaiter(this, void 0, void 0, function* () {
            if (typeof this.path !== 'string')
                return console.error('✘ API call must be provided a path!');
            if (!errCallback)
                throw 'YOU MUST PROVIDE AN ERROR CALLBACK FOR INTERNAL API CALLS';
            // Handle
            try {
                yield this.router.handle(this.req, this.res, (result) => __awaiter(this, void 0, void 0, function* () {
                    try {
                        const data = yield result;
                        if (typeof data === 'object') {
                            // If the response is an error, call the error callback.
                            if (data && data.status === 'error') {
                                console.error(chalk.bold.red('✘ Internal API promise failed:'), result.message);
                                callback(data);
                            }
                            // Otherwise, call the success response.
                            return callback(data);
                        }
                        // If the response is not an object, panic.
                        console.error(chalk.bold.red('✘ Internal API returned with invalid response:'), result);
                        return errCallback(new Error('Internal API returned with invalid response'), { status: 'error', message: 'Invalid Response' });
                    }
                    catch (err) {
                        console.error(chalk.bold.red('✘ Internal API promise rejected:'), err);
                        return errCallback(err, { status: 'error', message: 'Server Error' });
                    }
                }));
            }
            catch (err) {
                console.error(chalk.bold.red('✘ Internal API promise rejected:'), err);
                return errCallback(err, { status: 'error', message: 'Server Error' });
            }
        });
    }
}
// Register function must be called at the begining of your app.js file.
// Creates a new express Router using the parent application's version of express
// And adds a middleware that attaches a new instance of the api query function
// to each request's locals object.
function api(express, apiPath = DEFAULT_API_DIR) {
    const setupRouter = express();
    const router = express.Router();
    // Hacky. Force the parent router to attach the locals.api interface at the begining of each request
    setupRouter.on('mount', function (parent) {
        parent.use((req, res, next) => {
            res.locals.api = {
                get: function GET_factory(path, body) {
                    return new ApiQuery(router, 'GET', req, res, path, body);
                },
                post: function POST_factory(path, body) {
                    return new ApiQuery(router, 'POST', req, res, path, body);
                },
                put: function PUT_factory(path, body) {
                    return new ApiQuery(router, 'PUT', req, res, path, body);
                },
                delete: function DELETE_factory(path, body) {
                    return new ApiQuery(router, 'DELETE', req, res, path, body);
                }
            };
            next();
        });
        parent._router.stack.splice(2, 0, parent._router.stack.pop());
    });
    // If this is not an ajax request, and request is for an asset that accepts html,
    // then this must be a first time render - just send our base page down.
    setupRouter.use((req, res, next) => {
        if (typeof req === 'object' && !req.xhr && req.accepts(['*/*', 'text/html']) === 'text/html') {
            return res.sendfile(path.join(apiPath, '/index.html'), {}, function (err) {
                if (err)
                    res.status((err) ? err.status : 500);
                else
                    res.status(200);
            });
        }
        next();
    });
    console.log(chalk.bold.green('• Discovering API:'));
    discoverAPI(router, apiPath);
    setupRouter.use(router);
    console.log(chalk.bold.green('✔ API Discovery Complete'));
    return setupRouter;
}
exports.default = api;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9zcmMvaW5kZXgudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7QUFBQSw2QkFBNkI7QUFHN0IsNkJBQTZCO0FBQzdCLCtCQUErQjtBQUUvQixNQUFNLGVBQWUsR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxHQUFHLEVBQUUsRUFBRSxLQUFLLENBQUMsQ0FBQztBQVl4RCw2RUFBNkU7QUFDN0UsbUZBQW1GO0FBQ25GLFNBQVMsV0FBVyxDQUFDLEdBQW9CLEVBQUUsR0FBcUIsRUFBRSxJQUEwQjtJQUMxRixJQUFHLE9BQU8sR0FBRyxLQUFLLFFBQVE7UUFBRSxPQUFPO0lBQ25DLEdBQUcsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUM7SUFDaEIsSUFBRyxHQUFHLENBQUMsR0FBRyxFQUFDO1FBQ1QsT0FBTyxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLDhCQUE4QixDQUFDLEVBQUUsS0FBSyxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztRQUM5RSxPQUFPLEdBQUcsQ0FBQyxJQUFJLENBQUMsRUFBQyxJQUFJLEVBQUUsR0FBRyxFQUFFLE1BQU0sRUFBRSxPQUFPLEVBQUUsT0FBTyxFQUFFLHdCQUF3QixFQUFDLENBQUMsQ0FBQztLQUNsRjtJQUNELE9BQU8sSUFBSSxFQUFFLENBQUM7QUFDaEIsQ0FBQztBQUVELE1BQU0sT0FBTyxHQUFHLFVBQVMsSUFBNEI7SUFDbkQsT0FBTyxVQUFlLEdBQW9CLEVBQUUsR0FBcUIsRUFBRSxJQUEwQjs7WUFFM0Ysd0JBQXdCO1lBQ3hCLElBQUk7Z0JBQ0YsTUFBTSxNQUFNLEdBQUcsTUFBTSxJQUFJLENBQUMsR0FBRyxFQUFFLEdBQUcsRUFBRSxJQUFJLENBQUMsQ0FBQztnQkFDMUMsSUFBRyxPQUFPLE1BQU0sS0FBSyxRQUFRLEVBQUM7b0JBQzVCLE9BQU8s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QUFDO0lBQzFELE9BQU8sV0FBVyxDQUFDO0FBQ3JCLENBQUM7QUEzQ0Qsc0JBMkNDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgcGF0aCBmcm9tICdwYXRoJztcblxuaW1wb3J0ICogYXMgRXhwcmVzcyBmcm9tICdleHByZXNzJztcbmltcG9ydCAqIGFzIHdhbGsgZnJvbSAnd2Fsayc7XG5pbXBvcnQgKiBhcyBjaGFsayBmcm9tICdjaGFsayc7XG5cbmNvbnN0IERFRkFVTFRfQVBJX0RJUiA9IHBhdGguam9pbihwcm9jZXNzLmN3ZCgpLCAnYXBpJyk7XG5cbnR5cGUgTWV0aG9kID0gJ0FMTCcgfCAnR0VUJyB8ICdQT1NUJyB8ICdQVVQnIHwgJ0RFTEVURSc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUFwaUhhbmRsZXIge1xuICBBTEw/OiBFeHByZXNzLlJlcXVlc3RIYW5kbGVyO1xuICBHRVQ/OiBFeHByZXNzLlJlcXVlc3RIYW5kbGVyO1xuICBQT1NUPzogRXhwcmVzcy5SZXF1ZXN0SGFuZGxlcjtcbiAgUFVUPzogRXhwcmVzcy5SZXF1ZXN0SGFuZGxlcjtcbiAgREVMRVRFPzogRXhwcmVzcy5SZXF1ZXN0SGFuZGxlcjtcbn1cblxuLy8gSWYgbm8gQVBJIGVuZHBvaW50IHRha2VzIHRoZSBiYWl0LCByZXR1cm4gdGhlIHByb3Blcmx5IGZvcm1hdHRlZCA0MDAgZXJyb3Jcbi8vIGZvciB0aGUgbWVkaWEgcmVxdWVzdGVkLiBKU09OIGZvciBhamF4LCBqdXN0IHRoZSBodHRwIHN0YXR1cyBjb2RlIGZvciBhbGwgb3RoZXJzXG5mdW5jdGlvbiBhcGlOb3RGb3VuZChyZXE6IEV4cHJlc3MuUmVxdWVzdCwgcmVzOiBFeHByZXNzLlJlc3BvbnNlLCBuZXh0OiBFeHByZXNzLk5leHRGdW5jdGlvbikge1xuICBpZih0eXBlb2YgcmVxICE9PSAnb2JqZWN0JykgcmV0dXJuO1xuICByZXMuc3RhdHVzKDQwMCk7XG4gIGlmKHJlcS54aHIpe1xuICAgIGNvbnNvbGUuZXJyb3IoY2hhbGsucmVkKCfinJggRXJyb3Igcm91dGluZyB0byBBUEkgcGF0aCAnKSwgY2hhbGsucmVkKHJlcS5wYXRoKSk7XG4gICAgcmV0dXJuIHJlcy5qc29uKHtjb2RlOiA0MDQsIHN0YXR1czogJ2Vycm9yJywgbWVzc2FnZTogJ01ldGhvZCBOb3QgSW1wbGVtZW50ZWQnfSk7XG4gIH1cbiAgcmV0dXJuIG5leHQoKTtcbn1cblxuY29uc3QgZXZhbEFQSSA9IGZ1bmN0aW9uKGZ1bmM6IEV4cHJlc3MuUmVxdWVzdEhhbmRsZXIpIHtcbiAgcmV0dXJuIGFzeW5jIGZ1bmN0aW9uKHJlcTogRXhwcmVzcy5SZXF1ZXN0LCByZXM6IEV4cHJlc3MuUmVzcG9uc2UsIG5leHQ6IEV4cHJlc3MuTmV4dEZ1bmN0aW9uKSB7XG5cbiAgICAvLyBFdmFsdWF0ZSBBUEkgZnVuY3Rpb25cbiAgICB0cnkge1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgZnVuYyhyZXEsIHJlcywgbmV4dCk7XG4gICAgICBpZih0eXBlb2YgcmVzdWx0ID09PSAnb2JqZWN0Jyl7XG4gICAgICAgIHJldHVybiByZXMuc3RhdHVzKChyZXN1bHQuY29kZSB8fCAyMDApKS5qc29uKHJlc3VsdCk7XG4gICAgICB9XG5cbiAgICAgIGNvbnNvbGUuZXJyb3IoJ+KcmCBBUEkgZW5kcG9pbnQgcmV0dXJuZWQgc29tZXRoaW5nIG90aGVyIHRoYW4gSlNPTiBvciBhIFByb21pc2U6JywgcmVzdWx0LCBmdW5jKTtcbiAgICAgIHJldHVybiByZXMuc3RhdHVzKDUwMCkuanNvbih7c3RhdHVzOiAnZXJyb3InLCBtZXNzYWdlOiAnSW52YWxpZCBSZXNwb25zZSd9KTtcblxuICAgIH0gY2F0Y2goZXJyKSB7XG4gICAgICAvLyBJZiBpbnRlcm5hbCBBUEkgZmxhZyBpcyBwcmVzZW50LCBqdXN0IHJldHVybiB0aGUgcmVzdWx0IHRvIHRoZSBuZXh0IGhhbmRsZXJcbiAgICAgIGlmKChyZXEgYXMgYW55KS5faW50ZXJuYWxBUEkpIHRocm93IGVycjtcblxuICAgICAgY29uc29sZS5lcnJvcign4pyYIEFQSSBwcm9taXNlIHJlamVjdGVkIGFuZCByZXR1cm5pbmcgbm9uIDIwMCByZXNwb25zZTonLCBlcnIpO1xuICAgICAgcmV0dXJuIHJlcy5zdGF0dXMoKGVyci5jb2RlIHx8IDUwMCkpLmpzb24oZXJyKTtcbiAgICB9XG4gIH1cbiB9O1xuXG5mdW5jdGlvbiBoYXNWYWxpZE1ldGhvZChoYW5kbGVyOiBJQXBpSGFuZGxlcil7XG4gIHJldHVybiB0eXBlb2YgaGFuZGxlciA9PT0gJ29iamVjdCcgJiZcbiAgICAgKCAgdHlwZW9mIGhhbmRsZXIuQUxMID09PSAnZnVuY3Rpb24nXG4gICAgICAgIHx8IHR5cGVvZiBoYW5kbGVyLkdFVCA9PT0gJ2Z1bmN0aW9uJ1xuICAgICAgICB8fCB0eXBlb2YgaGFuZGxlci5QT1NUID09PSAnZnVuY3Rpb24nXG4gICAgICAgIHx8IHR5cGVvZiBoYW5kbGVyLlBVVCA9PT0gJ2Z1bmN0aW9uJ1xuICAgICAgICB8fCB0eXBlb2YgaGFuZGxlci5ERUxFVEUgPT09ICdmdW5jdGlvbicpXG59XG5cbmZ1bmN0aW9uIGxvYWRBUEkocm91dGVyOiBFeHByZXNzLlJvdXRlciwgZmlsZVBhdGg6IHN0cmluZywgYXBpUGF0aDogc3RyaW5nKXtcbiAgbGV0IG1ldGhvZHMgPSAnJztcbiAgdHJ5IHtcbiAgICAgY29uc3QgaGFuZGxlciA9IHJlcXVpcmUoZmlsZVBhdGgpIGFzIElBcGlIYW5kbGVyO1xuICAgICAvLyBJZiBoYW5kbGVyIGlzIGEgZnVuY3Rpb24sIHJlZ2lzdGVyIGl0IGFzIGEgZ2V0IGNhbGxiYWNrXG4gICAgIGlmKHR5cGVvZiBoYW5kbGVyID09PSAnZnVuY3Rpb24nICYmIChtZXRob2RzICs9ICcgR0VUJykpIHJvdXRlci5nZXQoYXBpUGF0aCwgZXZhbEFQSShoYW5kbGVyKSk7XG4gICAgIC8vIElmIGhhbmRsZXIgaXMgYW4gb2JqZWN0IHdpdGggYW55IHZhbGlkIGh0dHAgbWV0aG9kLCByZWdpc3RlciB0aGVtXG4gICAgIGVsc2UgaWYoaGFzVmFsaWRNZXRob2QoaGFuZGxlcikpe1xuICAgICAgIGlmKHR5cGVvZiBoYW5kbGVyLkFMTCA9PT0gJ2Z1bmN0aW9uJyAmJiAobWV0aG9kcyArPSAnIEFMTCcpKSByb3V0ZXIuYWxsKGFwaVBhdGgsIGV2YWxBUEkoaGFuZGxlci5BTEwpKTtcbiAgICAgICBpZih0eXBlb2YgaGFuZGxlci5HRVQgPT09ICdmdW5jdGlvbicgJiYgKG1ldGhvZHMgKz0gJyBHRVQnKSkgcm91dGVyLmdldChhcGlQYXRoLCBldmFsQVBJKGhhbmRsZXIuR0VUKSk7XG4gICAgICAgaWYodHlwZW9mIGhhbmRsZXIuUE9TVCA9PT0gJ2Z1bmN0aW9uJyAmJiAobWV0aG9kcyArPSAnIFBPU1QnKSkgcm91dGVyLnBvc3QoYXBpUGF0aCwgZXZhbEFQSShoYW5kbGVyLlBPU1QpKTtcbiAgICAgICBpZih0eXBlb2YgaGFuZGxlci5QVVQgPT09ICdmdW5jdGlvbicgJiYgKG1ldGhvZHMgKz0gJyBQVVQnKSkgcm91dGVyLnB1dChhcGlQYXRoLCBldmFsQVBJKGhhbmRsZXIuUFVUKSk7XG4gICAgICAgaWYodHlwZW9mIGhhbmRsZXIuREVMRVRFID09PSAnZnVuY3Rpb24nICYmIChtZXRob2RzICs9ICcgREVMRVRFJykpIHJvdXRlci5kZWxldGUoYXBpUGF0aCwgZXZhbEFQSShoYW5kbGVyLkRFTEVURSkpO1xuICAgICB9XG4gICAgIC8vIE90aGVyd2lzZSwgdGhpcyBpcyBhbiBpbnZhbGlkIGV4cG9ydC4gRXJyb3IuXG4gICAgIGVsc2V7XG4gICAgICAgcmV0dXJuIGNvbnNvbGUuZXJyb3IoY2hhbGsuYm9sZC5yZWQoJyAgIOKcmCBFcnJvciBpbiBBUEk6JyksIGNoYWxrLmJvbGQuYmxhY2soYXBpUGF0aCksIGNoYWxrLmdyYXkoJyAtIG5vIHZhbGlkIEhUVFAgbWV0aG9kIGV4cG9ydGVkJykpO1xuICAgICB9XG4gICAgIGNvbnNvbGUubG9nKGNoYWxrLmdyZWVuKCcgICDigKIgUmVnaXN0ZXJlZDonKSwgKGFwaVBhdGggPyBhcGlQYXRoIDogJy8nKSwgY2hhbGsueWVsbG93KCcoJyttZXRob2RzLnRyaW0oKSsnKScpKTtcbiAgfSBjYXRjaChlcnIpIHtcbiAgICAvLyBJZiByZXF1aXJlKCkgZmFpbGVkLCBlcnJvclxuICAgIGNvbnNvbGUuZXJyb3IoY2hhbGsuYm9sZC5yZWQoJyAgIOKcmCBFcnJvciBpbiBBUEk6JyksIGNoYWxrLmJvbGQuYmxhY2soYXBpUGF0aCksIGNoYWxrLmdyYXkoJyAtIGVycm9yIGluIHRoZSBBUEkgZmlsZScpKTtcbiAgICBjb25zb2xlLmVycm9yKCcgICAgJywgY2hhbGsudW5kZXJsaW5lKGZpbGVQYXRoKSk7XG4gICAgY29uc29sZS5lcnJvcignICAgICcsIGVyci50b1N0cmluZygpLnJlcGxhY2UoLyhcXHJcXG58XFxyfFxcbikvZ20sICckMSAgICAgJykpXG4gIH1cbn1cblxuaW50ZXJmYWNlIFF1ZXVlSXRlbSB7XG4gIGFwaVBhdGg6IHN0cmluZztcbiAgZmlsZVBhdGg6IHN0cmluZztcbn1cblxuZnVuY3Rpb24gZGlzY292ZXJBUEkocm91dGVyOiBFeHByZXNzLlJvdXRlciwgYXBpRGlyOiBzdHJpbmcpe1xuICB2YXIgcXVldWU6IFF1ZXVlSXRlbVtdID0gW10sXG4gICAgICBvcHRpb25zID0ge1xuICAgICAgICBsaXN0ZW5lcnM6IHtcbiAgICAgICAgICBmaWxlOiBmdW5jdGlvbiAocm9vdDogc3RyaW5nLCBmaWxlU3RhdHM6IHdhbGsuV2Fsa1N0YXRzLCBuZXh0OiB3YWxrLldhbGtOZXh0KSB7XG4gICAgICAgICAgICAvLyBJZ25vcmUgaGlkZGVuIGZpbGVzXG4gICAgICAgICAgICBpZihmaWxlU3RhdHMubmFtZVswXSA9PT0gJy4nKSByZXR1cm4gbmV4dCgpO1xuXG4gICAgICAgICAgICAvLyBDb25zdHJ1Y3QgYm90aCB0aGUgYWJzb2x1dGUgZmlsZSBwYXRoLCBhbmQgcHVibGljIGZhY2luZyBBUEkgcGF0aFxuICAgICAgICAgICAgdmFyIGZpbGVQYXRoID0gcGF0aC5qb2luKHJvb3QsIGZpbGVTdGF0cy5uYW1lKSxcbiAgICAgICAgICAgICAgICBhcGlQYXRoID0gZmlsZVBhdGgucmVwbGFjZShhcGlEaXIsICcnKS5yZXBsYWNlKC9cXC9pbmRleC5qcyQvLCAnJykucmVwbGFjZSgvLmpzJC8sICcnKTtcblxuICAgICAgICAgICAgLy8gUHVzaCB0aGVtIHRvIG91ciBxdWV1ZS4gVGhpcyBsYXRlciBzb3J0ZWQgaW4gb3JkZXIgb2Ygcm91dGUgcHJlY2VkZW5jZS5cbiAgICAgICAgICAgIHF1ZXVlLnB1c2goeyBhcGlQYXRoLCBmaWxlUGF0aCB9KTtcblxuICAgICAgICAgICAgLy8gUHJvY2VzcyBuZXh0IGZpbGVcbiAgICAgICAgICAgIG5leHQoKTtcbiAgICAgICAgICB9LFxuXG4gICAgICAgICAgZW5kOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAvLyBTb3J0IHF1ZXVlIGluIHJldmVyc2UgYWxwaGFiZXRpY2FsIG9yZGVyLlxuICAgICAgICAgICAgLy8gSGFzIHRoZSBuaWNlIHNpZGUgZWZmZWN0IG9mIG9yZGVyaW5nIGJ5IHJvdXRlIHByZWNlZGVuY2VcbiAgICAgICAgICAgIHF1ZXVlLnNvcnQoZnVuY3Rpb24oZmlsZTEsIGZpbGUyKXtcbiAgICAgICAgICAgICAgcmV0dXJuIChmaWxlMS5hcGlQYXRoID4gZmlsZTIuYXBpUGF0aCkgPyAxIDogLTE7XG4gICAgICAgICAgICB9KVxuXG4gICAgICAgICAgICAvLyBGb3IgZWFjaCBBUEkgaXRlbSBpbiB0aGUgcXVldWUsIGxvYWQgaXQgaW50byBvdXIgcm91dGVyXG4gICAgICAgICAgICB3aGlsZShxdWV1ZS5sZW5ndGgpe1xuICAgICAgICAgICAgICBjb25zdCBmaWxlID0gcXVldWUucG9wKCkhOyAvLyBUT0RPOiBXaGVuIEVTNiBpcyBjb21tb24gaW4gbm9kZSwgbWFrZSBsZXRcbiAgICAgICAgICAgICAgbG9hZEFQSShyb3V0ZXIsIGZpbGUuZmlsZVBhdGgsIGZpbGUuYXBpUGF0aCk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIFdoZW4gd2UgaGF2ZSBsb2FkZWQgYWxsIG9mIG91ciBBUEkgZW5kcG9pbnRzLCByZWdpc3RlciBvdXIgY2F0Y2hhbGwgcm91dGVcbiAgICAgICAgICAgIHJvdXRlci5hbGwoJyonLCBhcGlOb3RGb3VuZCk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9O1xuICB0cnl7XG4gICAgd2Fsay53YWxrU3luYyhhcGlEaXIsIG9wdGlvbnMpO1xuICB9IGNhdGNoKGUpe1xuICAgIGNvbnNvbGUuZXJyb3IoY2hhbGsuYm9sZC5yZWQoJ+KcmCBFcnJvciByZWFkaW5nIEFQSSBkaXJlY3Rvcnk6ICAnKSwgZSk7XG4gIH1cbn1cblxuY2xhc3MgQXBpUXVlcnkge1xuXG4gIHByaXZhdGUgcGF0aDogc3RyaW5nO1xuICBwcml2YXRlIHJvdXRlcjogRXhwcmVzcy5Sb3V0ZXI7XG4gIHByaXZhdGUgcmVxOiBFeHByZXNzLlJlcXVlc3RIYW5kbGVyO1xuICBwcml2YXRlIHJlczogRXhwcmVzcy5SZXNwb25zZTtcblxuICBjb25zdHJ1Y3Rvcihyb3V0ZXI6IEV4cHJlc3MuUm91dGVyLCBtZXRob2Q6IE1ldGhvZCwgcmVxOiBFeHByZXNzLlJlcXVlc3QsIHJlczogRXhwcmVzcy5SZXNwb25zZSwgcGF0aDogc3RyaW5nLCBib2R5OiBhbnkpIHtcbiAgICB0aGlzLnJvdXRlciA9IHJvdXRlcjtcbiAgICB0aGlzLnBhdGggPSBwYXRoO1xuICAgIHRoaXMucmVxID0gT2JqZWN0LmNyZWF0ZShyZXEsIHtcbiAgICAgIHVybDogeyB3cml0YWJsZTogdHJ1ZSwgY29uZmlndXJhYmxlOiB0cnVlLCB2YWx1ZTogdGhpcy5wYXRoIH0sXG4gICAgICBtZXRob2Q6IHsgd3JpdGFibGU6IHRydWUsIGNvbmZpZ3VyYWJsZTogdHJ1ZSwgdmFsdWU6IG1ldGhvZCB9LFxuICAgICAgaXA6IHsgd3JpdGFibGU6IHRydWUsIGNvbmZpZ3VyYWJsZTogdHJ1ZSwgdmFsdWU6ICcxMjcuMC4wLjEnIH0sXG4gICAgICBib2R5OiB7IHdyaXRhYmxlOiB0cnVlLCBjb25maWd1cmFibGU6IHRydWUsIHZhbHVlOiAoYm9keSB8fCB7fSkgfSxcbiAgICAgIHF1ZXJ5OiB7IHdyaXRhYmxlOiB0cnVlLCBjb25maWd1cmFibGU6IHRydWUsIHZhbHVlOiB7fSB9LFxuICAgICAgcGFyYW1zOiB7IHdyaXRhYmxlOiB0cnVlLCBjb25maWd1cmFibGU6IHRydWUsIHZhbHVlOiB7fSB9LFxuICAgICAgb3JpZ2luYWxVcmw6IHsgd3JpdGFibGU6IHRydWUsIGNvbmZpZ3VyYWJsZTogdHJ1ZSwgdmFsdWU6IHVuZGVmaW5lZCB9LFxuICAgICAgX2ludGVybmFsQVBJOiB7IHdyaXRhYmxlOiB0cnVlLCBjb25maWd1cmFibGU6IHRydWUsIHZhbHVlOiB0cnVlfVxuICAgIH0pO1xuICAgIHRoaXMucmVzID0gcmVzO1xuICAgIHJldHVybiB0aGlzO1xuICB9XG5cbiAgYXN5bmMgdGhlbihjYWxsYmFjazogKGRhdGE6IGFueSkgPT4gYW55LCBlcnJDYWxsYmFjazogKGVycjogRXJyb3IsIGRhdGE6IGFueSkgPT4gYW55KTogUHJvbWlzZTxhbnk+IHtcblxuICAgIGlmKHR5cGVvZiB0aGlzLnBhdGggIT09ICdzdHJpbmcnKSByZXR1cm4gY29uc29sZS5lcnJvcign4pyYIEFQSSBjYWxsIG11c3QgYmUgcHJvdmlkZWQgYSBwYXRoIScpO1xuICAgIGlmKCFlcnJDYWxsYmFjaykgdGhyb3cgJ1lPVSBNVVNUIFBST1ZJREUgQU4gRVJST1IgQ0FMTEJBQ0sgRk9SIElOVEVSTkFMIEFQSSBDQUxMUyc7XG5cbiAgICAvLyBIYW5kbGVcbiAgICB0cnkge1xuICAgICAgYXdhaXQgKHRoaXMucm91dGVyIGFzIGFueSkuaGFuZGxlKHRoaXMucmVxLCB0aGlzLnJlcywgYXN5bmMgKHJlc3VsdDogUHJvbWlzZTxhbnk+IHwgYW55KSA9PiB7XG5cbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICBjb25zdCBkYXRhID0gYXdhaXQgcmVzdWx0O1xuICAgICAgICAgIGlmKHR5cGVvZiBkYXRhID09PSAnb2JqZWN0Jykge1xuXG4gICAgICAgICAgICAvLyBJZiB0aGUgcmVzcG9uc2UgaXMgYW4gZXJyb3IsIGNhbGwgdGhlIGVycm9yIGNhbGxiYWNrLlxuICAgICAgICAgICAgaWYoZGF0YSAmJiBkYXRhLnN0YXR1cyA9PT0gJ2Vycm9yJykge1xuICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKGNoYWxrLmJvbGQucmVkKCfinJggSW50ZXJuYWwgQVBJIHByb21pc2UgZmFpbGVkOicpLCByZXN1bHQubWVzc2FnZSk7XG4gICAgICAgICAgICAgIGNhbGxiYWNrKGRhdGEpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBPdGhlcndpc2UsIGNhbGwgdGhlIHN1Y2Nlc3MgcmVzcG9uc2UuXG4gICAgICAgICAgICByZXR1cm4gY2FsbGJhY2soZGF0YSk7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgLy8gSWYgdGhlIHJlc3BvbnNlIGlzIG5vdCBhbiBvYmplY3QsIHBhbmljLlxuICAgICAgICAgIGNvbnNvbGUuZXJyb3IoY2hhbGsuYm9sZC5yZWQoJ+KcmCBJbnRlcm5hbCBBUEkgcmV0dXJuZWQgd2l0aCBpbnZhbGlkIHJlc3BvbnNlOicpLCByZXN1bHQpO1xuICAgICAgICAgIHJldHVybiBlcnJDYWxsYmFjayhuZXcgRXJyb3IoJ0ludGVybmFsIEFQSSByZXR1cm5lZCB3aXRoIGludmFsaWQgcmVzcG9uc2UnKSwgeyBzdGF0dXM6ICdlcnJvcicsIG1lc3NhZ2U6ICdJbnZhbGlkIFJlc3BvbnNlJyB9KTtcbiAgICAgICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICAgICAgY29uc29sZS5lcnJvcihjaGFsay5ib2xkLnJlZCgn4pyYIEludGVybmFsIEFQSSBwcm9taXNlIHJlamVjdGVkOicpLCBlcnIpO1xuICAgICAgICAgIHJldHVybiBlcnJDYWxsYmFjayhlcnIsIHsgc3RhdHVzOiAnZXJyb3InLCBtZXNzYWdlOiAnU2VydmVyIEVycm9yJyB9KVxuICAgICAgICB9XG4gICAgICB9KTtcbiAgICB9IGNhdGNoKGVycikge1xuICAgICAgY29uc29sZS5lcnJvcihjaGFsay5ib2xkLnJlZCgn4pyYIEludGVybmFsIEFQSSBwcm9taXNlIHJlamVjdGVkOicpLCBlcnIpO1xuICAgICAgcmV0dXJuIGVyckNhbGxiYWNrKGVyciwgeyBzdGF0dXM6ICdlcnJvcicsIG1lc3NhZ2U6ICdTZXJ2ZXIgRXJyb3InIH0pO1xuICAgIH1cbiAgfVxufVxuXG4vLyBSZWdpc3RlciBmdW5jdGlvbiBtdXN0IGJlIGNhbGxlZCBhdCB0aGUgYmVnaW5pbmcgb2YgeW91ciBhcHAuanMgZmlsZS5cbi8vIENyZWF0ZXMgYSBuZXcgZXhwcmVzcyBSb3V0ZXIgdXNpbmcgdGhlIHBhcmVudCBhcHBsaWNhdGlvbidzIHZlcnNpb24gb2YgZXhwcmVzc1xuLy8gQW5kIGFkZHMgYSBtaWRkbGV3YXJlIHRoYXQgYXR0YWNoZXMgYSBuZXcgaW5zdGFuY2Ugb2YgdGhlIGFwaSBxdWVyeSBmdW5jdGlvblxuLy8gdG8gZWFjaCByZXF1ZXN0J3MgbG9jYWxzIG9iamVjdC5cbmV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uIGFwaShleHByZXNzOiBhbnksIGFwaVBhdGg6IHN0cmluZyA9IERFRkFVTFRfQVBJX0RJUikge1xuICBjb25zdCBzZXR1cFJvdXRlciA9IGV4cHJlc3MoKSBhcyBFeHByZXNzLkV4cHJlc3M7XG4gIGNvbnN0IHJvdXRlciA9IGV4cHJlc3MuUm91dGVyKCkgYXMgRXhwcmVzcy5Sb3V0ZXI7XG5cbiAgLy8gSGFja3kuIEZvcmNlIHRoZSBwYXJlbnQgcm91dGVyIHRvIGF0dGFjaCB0aGUgbG9jYWxzLmFwaSBpbnRlcmZhY2UgYXQgdGhlIGJlZ2luaW5nIG9mIGVhY2ggcmVxdWVzdFxuICBzZXR1cFJvdXRlci5vbignbW91bnQnLCBmdW5jdGlvbihwYXJlbnQpe1xuICAgIHBhcmVudC51c2UoKHJlcTogRXhwcmVzcy5SZXF1ZXN0LCByZXM6IEV4cHJlc3MuUmVzcG9uc2UsIG5leHQ6IEV4cHJlc3MuTmV4dEZ1bmN0aW9uKSA9PiB7XG4gICAgICByZXMubG9jYWxzLmFwaSA9IHtcbiAgICAgICAgZ2V0OiBmdW5jdGlvbiBHRVRfZmFjdG9yeShwYXRoOiBzdHJpbmcsIGJvZHk6IGFueSl7XG4gICAgICAgICAgcmV0dXJuIG5ldyBBcGlRdWVyeShyb3V0ZXIsICdHRVQnLCByZXEsIHJlcywgcGF0aCwgYm9keSk7XG4gICAgICAgIH0sXG4gICAgICAgIHBvc3Q6IGZ1bmN0aW9uIFBPU1RfZmFjdG9yeShwYXRoOiBzdHJpbmcsIGJvZHk6IGFueSl7XG4gICAgICAgICAgcmV0dXJuIG5ldyBBcGlRdWVyeShyb3V0ZXIsICdQT1NUJywgcmVxLCByZXMsIHBhdGgsIGJvZHkpO1xuICAgICAgICB9LFxuICAgICAgICBwdXQ6IGZ1bmN0aW9uIFBVVF9mYWN0b3J5KHBhdGg6IHN0cmluZywgYm9keTogYW55KXtcbiAgICAgICAgICByZXR1cm4gbmV3IEFwaVF1ZXJ5KHJvdXRlciwgJ1BVVCcsIHJlcSwgcmVzLCBwYXRoLCBib2R5KTtcbiAgICAgICAgfSxcbiAgICAgICAgZGVsZXRlOiBmdW5jdGlvbiBERUxFVEVfZmFjdG9yeShwYXRoOiBzdHJpbmcsIGJvZHk6IGFueSl7XG4gICAgICAgICAgcmV0dXJuIG5ldyBBcGlRdWVyeShyb3V0ZXIsICdERUxFVEUnLCByZXEsIHJlcywgcGF0aCwgYm9keSk7XG4gICAgICAgIH1cbiAgICAgIH07XG4gICAgICBuZXh0KCk7XG4gICAgfSk7XG4gICAgcGFyZW50Ll9yb3V0ZXIuc3RhY2suc3BsaWNlKDIsIDAsIHBhcmVudC5fcm91dGVyLnN0YWNrLnBvcCgpKTtcbiAgfSk7XG5cbiAgLy8gSWYgdGhpcyBpcyBub3QgYW4gYWpheCByZXF1ZXN0LCBhbmQgcmVxdWVzdCBpcyBmb3IgYW4gYXNzZXQgdGhhdCBhY2NlcHRzIGh0bWwsXG4gIC8vIHRoZW4gdGhpcyBtdXN0IGJlIGEgZmlyc3QgdGltZSByZW5kZXIgLSBqdXN0IHNlbmQgb3VyIGJhc2UgcGFnZSBkb3duLlxuICBzZXR1cFJvdXRlci51c2UoKHJlcTogRXhwcmVzcy5SZXF1ZXN0LCByZXM6IEV4cHJlc3MuUmVzcG9uc2UsIG5leHQ6IEV4cHJlc3MuTmV4dEZ1bmN0aW9uKSA9PiB7XG4gICAgaWYodHlwZW9mIHJlcSA9PT0gJ29iamVjdCcgJiYgIXJlcS54aHIgJiYgcmVxLmFjY2VwdHMoWycqLyonLCAndGV4dC9odG1sJ10pID09PSAndGV4dC9odG1sJykge1xuICAgICAgcmV0dXJuIHJlcy5zZW5kZmlsZShwYXRoLmpvaW4oYXBpUGF0aCwgJy9pbmRleC5odG1sJyksIHt9LCBmdW5jdGlvbiAoZXJyOiBhbnkpIHtcbiAgICAgICAgaWYgKGVycikgcmVzLnN0YXR1cygoZXJyKSA/IGVyci5zdGF0dXMgOiA1MDApO1xuICAgICAgICBlbHNlIHJlcy5zdGF0dXMoMjAwKTtcbiAgICAgIH0pO1xuICAgIH1cbiAgICBuZXh0KCk7XG4gIH0pO1xuXG4gIGNvbnNvbGUubG9nKGNoYWxrLmJvbGQuZ3JlZW4oJ+KAoiBEaXNjb3ZlcmluZyBBUEk6JykpO1xuICBkaXNjb3ZlckFQSShyb3V0ZXIsIGFwaVBhdGgpO1xuICBzZXR1cFJvdXRlci51c2Uocm91dGVyKTtcbiAgY29uc29sZS5sb2coY2hhbGsuYm9sZC5ncmVlbign4pyUIEFQSSBEaXNjb3ZlcnkgQ29tcGxldGUnKSk7XG4gIHJldHVybiBzZXR1cFJvdXRlcjtcbn0iXX0=