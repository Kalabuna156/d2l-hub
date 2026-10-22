import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fetchAlerts } from '../server/d2l-api';

type Mode = 'ok' | 'forbidden' | 'unauthorized' | 'missing-user';

let server: http.Server;
let base = '';
let mode: Mode = 'ok';

const ALERT = {
  Id: 1,
  OrgUnitId: 123,
  Category: 1,
  Title: 'Grade Updated',
  Message: '“Quiz 3” updated.',
  AlertDateTime: '2026-10-21T20:42:00Z',
};

beforeAll(async () => {
  server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    const send = (status: number, body: unknown) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(body));
    };

    if (url.pathname === '/d2l/api/versions/') {
      send(200, [{ ProductCode: 'lp', LatestVersion: '1.49' }]);
      return;
    }
    if (url.pathname === '/d2l/api/lp/1.49/users/whoami') {
      send(200, { Identifier: mode === 'missing-user' ? undefined : 77, FirstName: 'Test', LastName: 'User' });
      return;
    }
    if (url.pathname === '/d2l/api/lp/1.49/alerts/user/77') {
      if (mode === 'forbidden') {
        send(403, { error: 'Forbidden' });
        return;
      }
      if (mode === 'unauthorized') {
        send(401, { error: 'Unauthorized' });
        return;
      }
      const second = url.searchParams.get('page') === '2';
      send(200, {
        Next: second ? null : `${base}/d2l/api/lp/1.49/alerts/user/77?page=2`,
        Objects: [{ ...ALERT, Id: second ? 2 : 1 }],
      });
      return;
    }
    send(404, { error: 'Not found' });
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

const session = () => ({ baseUrl: base, cookies: [{ name: 'd2lSessionVal', value: 'test' }] });

describe('fetchAlerts', () => {
  it('follows the Next links and returns every page', async () => {
    mode = 'ok';
    const result = await fetchAlerts(session());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.alerts.map((alert) => alert.Id)).toEqual([1, 2]);
  });

  it('treats a forbidden route as unavailable, not an expired session', async () => {
    mode = 'forbidden';
    const result = await fetchAlerts(session());

    expect(result).toMatchObject({ ok: false, reason: 'unavailable', status: 403 });
  });

  it('still reports a real sign-out as expired', async () => {
    mode = 'unauthorized';
    const result = await fetchAlerts(session());

    expect(result).toMatchObject({ ok: false, reason: 'expired', status: 401 });
  });

  it('reports unavailable when D2L gives no user id to address', async () => {
    mode = 'missing-user';
    const result = await fetchAlerts(session());

    expect(result).toMatchObject({ ok: false, reason: 'unavailable' });
  });
});
