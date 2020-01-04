/* global describe, it, before, afterEach */
import * as assert from 'assert';
import * as http from 'http';
import * as path from 'path';

import * as express from 'express';
import fetch from 'node-fetch';

import loll from '../src';

const GET = async (url: string, obj: any) => assert.deepStrictEqual(await fetch(`http://localhost:3000${url}`, { method: 'GET' }).then(res => res.json()), obj);
const POST = async (url: string, body: any, obj: any) => assert.deepStrictEqual(await fetch(`http://localhost:3000${url}`, { method: 'POST', body }).then(res => res.json()), obj);
const PUT = async (url: string, body: any, obj: any) => assert.deepStrictEqual(await fetch(`http://localhost:3000${url}`, { method: 'PUT', body }).then(res => res.json()), obj);
const DELETE = async (url: string, obj: any) => assert.deepStrictEqual(await fetch(`http://localhost:3000${url}`, { method: 'DELETE' }).then(res => res.json()), obj);
const ERROR_RESPONSE = { code: 400, status: 'error', message: 'Method Not Implemented' };

const app = express();
const api = loll(express, {
  root: path.join(__dirname, 'fixtures', 'discovery'),
});
app.use('/api', api);

// Start Server
http.createServer(app).listen(3000, function(){
  console.log(('Express server listening on port ' + app.get('port')));
});

describe('API Discovery', function() {
  describe('it should', function() {

    it('work with default exports', async function() {
      await GET('/api', { status: 'success', data: 'ok' });
    });

    it('work with named GET exports', async function() {
      await GET('/api/named', { status: 'success', data: 'get' });
    });

    it('work with named POST exports', async function() {
      await POST('/api/named', {}, { status: 'success', data: 'post' });
    });

    it('work with named PUT exports', async function() {
      await PUT('/api/named', {}, { status: 'success', data: 'put' });
    });

    it('work with named DELETE exports', async function() {
      await DELETE('/api/named', { status: 'success', data: 'delete' });
    });

    it('work with path patterns', async function() {
      await GET('/api/pathpatterns', { status: 'success', data: 'Path Patterns' });
      await GET('/api/pathptterns', { status: 'success', data: 'Path Patterns' });
    });

    it('work with named required params', async function() {
      await GET('/api/required-params/what', { dynamic: 'what' });
      await GET('/api/required-params', ERROR_RESPONSE);
    });

    it('work with named optional params', async function() {
      await GET('/api/optional-params/what', { dynamic: 'what' });
      await GET('/api/optional-params', {});
    });

  });
});
