/* global describe, it, before, afterEach */
import * as assert from 'assert';
import * as http from 'http';
import * as path from 'path';
import express from 'express';
import { fileURLToPath } from 'url';

import loll from '../src/index.js';

const PORT = 3030;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const GET = async (url: string, obj: any): Promise<Response> => {
  const res = await fetch(`http://localhost:${PORT}${url}`, { method: 'GET' });
  assert.deepStrictEqual(await res.json(), obj);
  return res;
}
const PATCH = async (url: string, body: any, obj: any, code?: number) => { const res = await fetch(`http://localhost:${PORT}${url}`, { method: 'PATCH', body }); assert.deepStrictEqual(await res.json(), obj); code && assert.deepStrictEqual(res.status, code); };
const POST = async (url: string, body: any, obj: any) => assert.deepStrictEqual(await fetch(`http://localhost:${PORT}${url}`, { method: 'POST', body }).then(res => res.json()), obj);
const PUT = async (url: string, body: any, obj: any) => assert.deepStrictEqual(await fetch(`http://localhost:${PORT}${url}`, { method: 'PUT', body }).then(res => res.json()), obj);
const DELETE = async (url: string, obj: any) => assert.deepStrictEqual(await fetch(`http://localhost:${PORT}${url}`, { method: 'DELETE' }).then(res => res.json()), obj);
const ERROR_RESPONSE = { code: 400, status: 'error', message: 'Method Not Implemented' };

const app = express();
const api = await loll(express, {
  root: path.join(__dirname, 'fixtures', 'discovery'),
});
app.use('/api', api);

// Start Server
const server = http.createServer(app).listen(PORT, function(){
  console.log(('Express server listening on port ' + app.get('port')));
});

describe('API Discovery', function() {
  describe('it should', function() {

    this.afterAll(() => {
      server.close();
    })

    it('work with default exports', async function() {
      await GET('/api', { status: 'success', data: false });
    });

    it('default export instances retain state', async function() {
      await GET('/api', { status: 'success', data: true });
    });

    it('allows custom response codes', async function() {
      const res = await GET('/api/status', { status: 'error', message: 'Unauthorized.' });
      assert.strictEqual(res.status, 401);
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

    it('work with named PATCH exports', async function() {
      await PATCH('/api/named', {}, { status: 'error', message: 'This Always Fails', code: 418 }, 418);
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


    it('work with named required params – windows', async function() {
      await GET('/api/windows-required/win/what', { required: 'what', path: 'win' });
      await GET('/api/windows-required', ERROR_RESPONSE);
    });

    it('work with named optional params – windows', async function() {
      await GET('/api/windows-optional/win/what', { dynamic: 'what', path: 'win' });
      await GET('/api/windows-optional/win', { path: 'win' });
    });

  });
});
