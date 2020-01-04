# 🍭 Loll
## Easy REST Apis for the Lazy Developer
- - -
#### What is this?
Loll enables you to use the file system to declare RESTful API endpoints for your Express application.

Express is a powerful tool for building Node servers. However, for better or worse, it is rather un-opinionated and it can difficult to know how best to organize your API services.

### How To Use
- - -
Simply:
``` Shell
$ npm install --save loll
$ ### or ###
$ yarn add loll
```

Then, in your app.js file:
``` JavaScript
// Get our dependencies
  const express = require('express');
  const api     = require('loll');
  
// Init Core
  const app = express();
  app.set('port', PORT);

  
/******************************************* 
       Additional Middleware Go Here
*******************************************/
  
  
// Automatically discover API endpoints. Defaults to the `/api` directory.
  app.use('/api', api(express));

// Start Server
  http.createServer(app).listen(app.get('port'), function(){
    console.log(('Express server listening on port ' + app.get('port')));
  });
```

### How It Works
- - -

Its quite simple really – the Loll middleware checks `req.xhr`:

**If the request *is* an AJAX request**, it will attempt to roue to an API endpoint defined in your project's `/api` directory and send a JSON response back to the client. 

#### There are three concepts to understand before coding with the Loll middleware

### 1) API Discovery
When starting, the Loll middleware will look for a directory called `/api` at the root of your project. This directory contains all the files that will define your api (how that works is described below), the paths of which define your public facing API paths.

The project on the left in the below image, will show its corresponding output when you start your server. This example will be referred to throughout this section:

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
Loll will display the paths discovered in your console for your debugging pleasure. If there is an error in one of your API files, it will not kill your server. Instead, it will print a nice big, red error for that route along with the error and line number that caused it. Convenient!

### 2) Writing API Files

> I will be using [jSend](http://labs.omniti.com/labs/jsend), a simple (and personal favorite) JSON format for sending data back and forth between the server and frontend, in these examples. Feel free to use whatever specification you like best!

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

**For you other lazy people out there – a tl;dr**:
  - Your HTTP method implementations **are middleware** and are passed the `req` and `res` objects.
  - These API definitions do not accept a `next` callback – they are always the last middleware before a response.
  - These HTTP methods are defined as named exports from your API file. Automatically discovered methods are `ALL`, `GET`, `POST`, `UPDATE` and `DELETE`.
  - These middleware should always return either **`POJO`**  or a **`Promise`** that resolves to a **`POJO`**.
  - The response value will be sent back to the client.
    - If the response is a `Promise`, Loll will wait for it to resolve and send its value.
    - If the response JSON has the property `code`, it will be use as the HTTP status code of the response.
  - If an error occurs in your API call, Loll will:
    - Gracefully catch the error
    - Log it in the console
    - Send a `500 Internal Service Error` response back to the client
  - If no route is found that matches the request, a `400 Bad Request` response is sent back to the client

**The full explanation**:
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

An API method implementation may choose to return a Promise, or be defined as an async function. Loll will wait for the promise to resolve or reject and sent its resolved or rejected value back to the client. Great for asynchronous database calls:
``` JavaScript
module.GET = function(req, res){
 // Make an async database call or something here
  return new Promise(function(resolve, _reject){
    resolve({
      status: 'success',
      data: {
        firstName: 'Luke',
        lastName: 'Skywalker'
      }
    });
  });
};

module.POST = async function(req, res){
 // Do some async validation or something here
  return {
    status: 'error',
    code: '403',  // If the response has a property `code`, it will be used as the http response code.
    message: 'You are not authorized to post to this endpoint!'
  };
};
```

### 3) Calling APIs Server Side

The Loll middleware puts an `api` property on on the `res.locals` object at the beginning of every new request and is accessible to every middleware in your express app. It exposes `get`, `post`, `put` and `delete` methods which each take a url and optional data object. This allows you to consume your API calls server side to build more powerful services, as well as client side.

A server side call looks like this:

``` JavaScript
res.locals.api.get('/user/123')
   .then(function(result){
     // You have access to the API result here
   });
```

An internal API call will always return a Promise, regardless of if the API function returns a Promise itself, or just a JSON blob.

You are able to pass internal API calls an optional JSON object as a second parameter. This object will replace `req.body` on the original request object only for the lifetime of the internal API call.
> Our API file `/api/user/:uid.js`
``` JavaScript
exports.POST = function(req, res){
  console.log(req.body);
  return { status: 'success', data: { yell: "Gotta Catch 'Em All!" }}
}
```

> Middleware posting to `/user/:uid`
``` JavaScript
async function(req, res){
  // Logs: { numPkmn: 6 }
  console.log(req.body);

  // Logs: { firstName: 'Ash' }
  const res = await res.locals.api.post('/user/123', { firstName: 'Ash' })

  // Logs: { yell: "Gotta Catch 'Em All!" }
  console.log(res.data);
}
```

The fact that internal APIs always return a promise allows us to do some creative things while drafting dependent API calls, like consuming existing APIs to create new ones.

> An API file `/api/profile/:uid.js`. This endpoint returns an entire profile object. So much info!
``` JavaScript
exports.GET = function(req, res){
  return { 
    status: 'success', 
    data: { 
      firstName: 'Ash',
      lastName: 'Ketchum',
      numPkmn: 151,
      hometown: 'Pallet Town'
    }
  }
}
```

> An API file `/api/miniprofile/:uid.js`. This mini-profile API endpoint will only return the `firstName` and `lastName` properties of the full profile.
``` JavaScript
exports.GET = function(req, res){
  const result = res.locals.api.get('/user/' + req.params.uid)
  return {
    status: 'success',
    data: {
      firstName: result.data.firstName,
      lastName: result.data.lastName
    }
  };
}
```
