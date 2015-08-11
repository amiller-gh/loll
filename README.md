# Rebound Express API
### Express middleware to enable declarative API creation
---

Express is a powerful tool for building Node servers. However, for better or worse, it is very un-opinionated and it can difficult to know how best to organize your API services. This module enables you to use your file system to declare your API endpoints. 

To use, simply:
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

The middleware will catch all requests, so it must be the last middleware in you express server. When called, it will look for a directory called `/api` at the root of your project.

![api_screenshots](https://cloud.githubusercontent.com/assets/7856443/9190079/fb0c9d2a-3fa5-11e5-8565-bbfedc1307af.jpg)


