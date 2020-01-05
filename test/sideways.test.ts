/* global describe, it, before, afterEach */
import * as assert from 'assert';
import * as http from 'http';
import * as path from 'path';

import * as express from 'express';
import fetch from 'node-fetch';

import loll from '../src';

const GET = async (url: string, obj: any) => assert.deepStrictEqual(await fetch(`http://localhost:3001${url}`, { method: 'GET' }).then(res => res.json()), obj);
// const POST = async (url: string, body: any, obj: any) => assert.deepStrictEqual(await fetch(`http://localhost:3000${url}`, { method: 'POST', body }).then(res => res.json()), obj);
// const PUT = async (url: string, body: any, obj: any) => assert.deepStrictEqual(await fetch(`http://localhost:3000${url}`, { method: 'PUT', body }).then(res => res.json()), obj);
// const DELETE = async (url: string, obj: any) => assert.deepStrictEqual(await fetch(`http://localhost:3000${url}`, { method: 'DELETE' }).then(res => res.json()), obj);
// const ERROR_RESPONSE = { code: 400, status: 'error', message: 'Method Not Implemented' };

const app = express();
const api = loll(express, {
  root: path.join(__dirname, 'fixtures', 'sideways'),
});
app.use('/api', api);

// Start Server
http.createServer(app).listen(3001, function(){
  console.log(('Express server listening on port ' + app.get('port')));
});

describe('API Discovery', function() {
  describe('it should', function() {

    it('works at root', async function() {
      await GET('/api', { status: 'success', data: 'ok' });
    });

    it('works with route', async function() {
      await GET('/api/user', { firstName: 'Ash', lastName: 'Ketchum', pkmnCount: 151, age: 12 });
    });

    it('works with route sideways call', async function() {
      await GET('/api/miniprofile', { name: 'Ash Ketchum' });
    });
  });
});
