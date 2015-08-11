<p align="center">
  <img src="http://reboundjs.com/images/rebound-large.svg" alt="Rebound Logo" width="420px" />
  <h3 align="center">Express Middleware for Declarative API Creation</h3>
</p>
- - -
#### Wait, what is this again?
Express is a powerful tool for building Node servers. However, for better or worse, it is very un-opinionated and it can difficult to know how best to organize your API services. This module enables you to use your file system to declare your API endpoints. 

> Hey! This module has been spun off into its own project from the [Rebound Seed Project](www.github.org/reboundjs/rebound-seed) and can be used as a standalone library for API creation. Feel free to use this with or without the rest of [Rebound](www.github.org/reboundjs/rebound), though we definately recommend checking it out!

<p align="center">
  <h3 align="center">How To Use</h3>
</p>
- - -
Simply:
``` Shell
$ npm install --save rebound-api
```

Then, in your app.js file:
``` JavaScript
// Get our dependancies
  var express = require('express');
  var api     = require('rebound-api');
  
// Init Core
  var app = express();
  app.set('port', PORT);
  
  
/******************************************* 
       Additional Middleware Go Here 
*******************************************/
  
  
// Automatically discover API endpoints in `/api` directory. Must be last middleware.
  app.use(api(express));

// Start Server
  http.createServer(app).listen(app.get('port'), function(){
    console.log(('Express server listening on port ' + app.get('port')));
  });
```

<p align="center">
  <h3 align="center">How It Works</h3>
</p>
- - -

Its quite simple really – the Rebound API middleware checks `req.xhr`:

**If the request *is* an AJAX request**, it will attempt to roue to an API endpoint defined in your project's `/api` directory and send a JSON response back to the client. 

**If the request *is not* an AJAX request**, it will respond using a file that you specify (defaults to `/index.html`).

> **Important:** This middleware will catch all requests – both AJAX and otherwise – so it must be the last middleware in your express server.


<h5 align="center">There are three concepts to understand before coding with the Rebound API middleware</h5>


### 1) API Discovery
When starting, the Rebound API middleware will look for a directory called `/api` at the root of your project. This directory contains all the files that will define your api (how that works is described below), the paths of which define your public facing API paths. 

The project on the left in the below image, will show its corrosponding output when you start your server. This example will be referred to throughout this section:

![api_screenshots](https://cloud.githubusercontent.com/assets/7856443/9190079/fb0c9d2a-3fa5-11e5-8565-bbfedc1307af.jpg)

##### API File Paths:
The files paths in your `/api` directory **are** the express routes you would normally write at the bottom of your app.js file to handle requests. [Here is the express router documentaiton](http://expressjs.com/guide/routing.html) if you need to brush up on how to write routes.

The file and directory names may be any valid string or string pattern used to describe an Express route. For example: `/user/:uid?.js`, as is shown in the above example, defines a route `user` that can accept an optional `uid` (User ID) parameter.

The file name `index.js` is special. Files named `index.js` will act as the root route for their parent directory. The `donate` directory in the above example shows this well. the directory structure:
```
api
 |--- donate
        |--- history.js
        |--- index.js
```
Defines two routes: `/donate/history` and `/donate`. An equivelent, but far less convenient, structure would be:
```
api
 |---donate
 |     |--- history.js
 |
 |---donate.js
```

##### API Path Specificity:
No more manually managing your route ordering! Your routes are automagically registered with express in order from most to least specific. For instance, above, the `user` paths are loaded in order from most to least specific: `/user/password/recovery` > `/user/login` > `/user/:uid?`. 

##### API Errors
The Rebound API middleware will display the paths discovered in your console for your debugging pleasure. If there is an error in one of your API files, it will not kill your server. Instead, it will print a nice big, red error for that route along with the error and line number that caused it. Convenient!

### 2) Writing API Files

> We will be using [jSend](http://labs.omniti.com/labs/jsend), a simple (and personal favorite) JSON format for sending data back and forth between the server and frontend, in these examples. Feel free to use whatever specification you like best!

The files in your `/api` folder export the different http methods implemented for this path. The methods implemented for a particular path are printed out next to the registered path in the console, as shown in section 1.

A simple API file may look like this: 
``` JavaScript
// This file implements the `GET` HTTP method, which returns a JSON blob. 
// This JSON is sent back to the client and the response is closed. 
exports.GET = function(req, res){
  return {
    status: 'success',
    data: {
      firstName: 'Luke',
      lastName: 'Skywalker'
    }
};
```

**For you lazy people out there – a tl;dr**:
 - These HTTP method implementations **are middleware**.
 - Different HTTP methods are named exports from your API file.
 - Like any other middleware, they are passed the `req` and `res` objects.
 - These API definitions do not accept a `next` callback – they are always the last middleware before a response.
 - These middleware should always return either **`JSON`** or a **`Promise`**.
 - The response value will be sent back to the client.
  - If the response is a `Promise`, the Rebound API will wait for it to resolve and send its value.
 - If an error occurs in your API call, it will be: 
  - Gracefully caught 
  - Logged in the console
  - And `500` response will be sent back to the client
 - If no route is found that matches the request, a `400` response is sent back to the client

**The full explaination**:
An API file that only exports a single function will default to the `GET` http method: 
``` JavaScript
// Same as the example above
module.exports = function(req, res){
  return {
    status: 'success',
    data: {
      firstName: 'Luke',
      lastName: 'Skywalker'
    }
  };
};
```

An API file that may export multiple HTTP method names:
``` JavaScript
module.GET = function(req, res){
 // Make a database call or something here
  return {
    status: 'success',
    data: {
      firstName: 'Luke',
      lastName: 'Skywalker'
    }
  };
};

module.POST = function(req, res){
 // Update your database or something here
  return { status: 'success' };
};
```

An API method implementation may return a Promise. Rebound API will wait for the promise to resolve or reject and sent its resolved or rejected value back to the client. Great for asynchronous database calls:
``` JavaScript
var Promise = require("bluebird");

module.GET = function(req, res){
 // Make an async database call or something here
  return new Promise(function(resolve, reject){
    resolve({
      status: 'success',
      data: {
        firstName: 'Luke',
        lastName: 'Skywalker'
      }
    });
  });
};

module.POST = function(req, res){
 // Do some async validation or something here
  return new Promise(function(resolve, reject){
    reject({
      status: 'error',
      code: '403',  // If the response has a property `code`, it will be used as the http response code.
      message: 'You are not authorized to post to this endpoint!'
    });
  });
};
```

### 3) Calling APIs Server Side

> Documentation on its way...

