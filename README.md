# 🍭 Loll – Easy REST APIs for the Lazy Developer

Loll enables you to use the file system to declare RESTful API endpoints for your Express application, encouraging convention over configuration for your server side Express code.

## How To Use

#### To install, simply:
``` Shell
npm install --save loll
### or ###
yarn add loll
```

#### Then, in your app.js file:
``` JavaScript
// Get our dependencies
const express = require('express');
const loll     = require('loll');
  
// Init Core
const app = express();
app.set('port', 8080);

/******************************************* 
       Additional Middleware Go Here
*******************************************/
  
// Automatically discover API endpoints. Defaults to the `/api` directory.
app.use('/api', loll(express));

// Start Server
http.createServer(app).listen(app.get('port'), () => {
  console.log(`Express server listening on port ${app.get('port')}`);
});
```

#### Configuration
Loll takes an optional configuration hash as a second argument that accepts the following settings.

| Name   | Type   | Default                           | Description                                                  |
|:-------|:-------|:----------------------------------|:-------------------------------------------------------------|
| `root` | String | `path.join(process.cwd(), 'api')` | The directory that Loll will crawl to discover API endpoints |


## How It Works

Its quite simple really – the Loll middleware will attempt to route an xhr or JSON compatible HTTP request to an API endpoint defined by the structure your project's `/api` directory, and send the JSON response back to the client.
 
**You can start writing powerful, declaritive REST endpoints with just three simple concepts:**

### 1) API Discovery
When starting, the Loll middleware will look for a directory called `/api` at the root of your project. This directory contains all the files that will define your api (how that works is described below), the paths of which define your public facing API paths.

The project on the left in the below image, will show its corresponding output when you start your server. This example will be referred to throughout this section:

![api_screenshots](https://cloud.githubusercontent.com/assets/7856443/9190079/fb0c9d2a-3fa5-11e5-8565-bbfedc1307af.jpg)

#### API File Paths:
The files paths in your `/api` directory **are** the Express routes you would normally write at the bottom of your app.js file to handle requests. [Here is the express router documentaiton](http://expressjs.com/guide/routing.html) if you need to brush up on how to write routes.

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
Keep in mind, `/path/index.js` files will take priority over similarly named `path.js` files.

#### API Path Specificity:
No more manually managing your route ordering! Your routes are automagically registered with express in order from most to least specific. For instance, above, the `user` paths are loaded in order from most to least specific: `/user/password/recovery` > `/user/login` > `/user/:uid?`. 

#### API Errors
Loll will display the paths discovered in your console for your debugging pleasure. If there is an error in one of your API files, it will not kill your server. Instead, it will print a nice big, red error for that route along with the error and line number that caused it. Convenient!

### 2) Writing API Files

The files in your `/api` folder export the different http methods implemented for this path. The methods implemented for a particular path are printed out next to the registered path in the console, as shown in section 1.

> I will be using [jSend](http://labs.omniti.com/labs/jsend), a simple (and personal favorite) JSON format for sending data back and forth between the server and frontend, in these examples. Feel free to use whatever specification you like best!

A simple API file may look like this: 
``` JavaScript
// This file implements the `GET` HTTP method, which returns a JSON blob. 
// This JSON is sent back to the client and the response is closed. 
export function GET(req, res) {
  return {
    status: 'success',
    data: {
      firstName: 'Luke',
      lastName: 'Skywalker'
    }
  };
};
```

**For you lazy developers like me out there – a tl;dr**:
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
An API file that export multiple HTTP method names (`GET`, `POST`, `PUT` and `DELETE`):
``` JavaScript
module.GET = function(req, res) {
 // Make a database call or something here
  return {
    status: 'success',
    data: {
      firstName: 'Luke',
      lastName: 'Skywalker'
    }
  };
};

module.POST = function(req, res) {
 // Update your database or something here
  return { status: 'success' };
};
```

If you'd like to handle **all** HTTP verbs, you can specify an `ALL` handler instead:
```
module.ALL = function(req, res) {
 // Update your database or something here
  return { status: 'success' };
};
```

If you are using ES6 modules, your named exports will be interperted as expected:
``` JavaScript
export function GET(req, res) {
  return { status: 'success' };
}

export function POST(req, res) {
  return { status: 'success' };
}
```


An API file that *only* exports a single Function or Class will treat that Function or Class as an API interface constructor. The constructor will be passed the express router.
```JavaScript
// Old School
function MyEndpoint(router) { /* ... */ };

MyEndpoint.prototype.GET = function(req, res) {
  return { status: 'success' };
}

module.exports = MyEndpoint;
```

This behavior is especially helpful with ES6 classes, where you can use decorators (experimental, you'll need a preprocessor) to augment your routes' behavior. Because these instances have a unique `this` context, these route endpoints may retain state.

> Reminder: As always with in-memory persistent state – know what you're doing, and use at your own risk!

```Typescript
function basicAuth() { /* Basic HTTP Auth Impl Here */ }

export default class MyEndpoint {
  private state: any = {};

  // Anyone may GET a process dependent key value pair.
  GET(req, res){
    return { status: 'success', data: this.state[req.params.key] };
  }
 
  // Only authenticated users may set values.
  @basicAuth POST(req, res){
    this.state[req.data.key] = req.data.value; 
    return { status: 'success' };
  }

}
```

An API method implementation may choose to return a Promise (or be an `async` function). Loll will wait for the promise to resolve or reject before sending the final value back to the client. Great for asynchronous database calls:
``` JavaScript
module.GET = function(req, res) {
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

module.POST = async function(req, res) {
  // Do some async validation or something here
  res.status(403); // Make sure you set your response status codes correctly!
  return {
    status: 'error',
    code: '403',
    message: 'You are not authorized to post to this endpoint!'
  };
};
```

### 3) Calling APIs Server Side

The Loll middleware also injects a special `api` property on the `res.locals` object at the beginning of every new Express request that is accessible to every API middleware. It exposes `get`, `post`, `put` and `delete` methods (sound familiar?). Each take a url, and optional data object. These convenience methods allow you to easily consume your own API endpoints server side to build more powerful services.

A server side call may look like this:

``` JavaScript
const result = await res.locals.api.get('/user/123');
```

> Note: Server side API calls will **always** return a Promise, regardless of if the defined API handler returns a Promise itself, or just a `**POJO**`.

As mentioned above, are able to pass internal API calls an optional JSON object as a second parameter. This object will replace `req.body` on the original request object, but only for the lifetime of the internal API call. Consider:

> File: `/api/user/:uid/shout.js`
``` JavaScript
export function POST(req, res) {
  console.log(req.body.firstName, 'yelled: "Gotta Catch 'Em All!"');
  return { status: 'success' };
}
```

> File: `/api/user/:uid/index.js`, POSTed too with `{ numPkmn: 6 }`
``` JavaScript
export async function PUT(req, res) {
  // Logs: { numPkmn: 6 }
  console.log(req.body);

  // Logs: Ash yelled "Gotta Catch 'Em All!"
  const res = await res.locals.api.post('/api/user/123/shout', { firstName: 'Ash' });

  // Logs: { status: 'success' }
  console.log(res.data);
}
```

This ability to easily compose internal APIs on the server allows us to do some creative things! Like, consuming our existing APIs to create new ones.

``` JavaScript
/** /api/profile/:uid.js **/

// This endpoint returns an entire profile object. So much info!
export function GET(req, res) {
  return { 
    status: 'success', 
    data: { 
      firstName: 'Ash',
      lastName: 'Ketchum',
      numPkmn: 151,
      hometown: 'Pallet Town'
    }
  };
}
```

``` JavaScript
/** /api/miniprofile/:uid.js **/

// This mini-profile API endpoint will only return the `firstName` and `lastName` properties of the full profile.
export function GET(req, res) {
  const result = await res.locals.api.get(`/profile/${req.params.uid}`);
  return {
    status: 'success',
    data: {
      firstName: result.data.firstName,
      lastName: result.data.lastName
    }
  };
};
```
