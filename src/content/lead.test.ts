import { beforeEach, describe, expect, it, vi } from 'vitest';

const put = vi.fn();
vi.mock('@vercel/blob', () => ({ put: (...a: unknown[]) => put(...a) }));
import { GET, parseLead, POST } from '../../api/lead.js';

const post = (body: unknown) => POST(new Request('https://fuzzynop.com/api/lead', { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body) }));
const good = { name: ' Ada ', email: 'Ada@Example.org', org: 'Example', need: 'Building a PinkCell', scale: 'A long-term program', notes: 'hello', website: '' };

describe('api/lead', () => {
  beforeEach(() => {
    put.mockReset();
    put.mockResolvedValue({});
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('trims, lowercases the email and stamps the lead', () => {
    const { lead } = parseLead(good, new Date('2026-11-19T00:00:00Z'));
    expect(lead).toEqual({ source: 'fuzzynop.com', name: 'Ada', email: 'ada@example.org', org: 'Example', need: 'Building a PinkCell', scale: 'A long-term program', notes: 'hello', receivedAt: '2026-11-19T00:00:00.000Z' });
  });

  it('saves one private file per brief', async () => {
    const res = await post(good);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(put).toHaveBeenCalledTimes(1);
    const [path, body, opts] = put.mock.calls[0];
    expect(path).toMatch(/^leads\/fuzzynop-com\/.+\.json$/);
    expect(JSON.parse(body).email).toBe('ada@example.org');
    expect(opts.access).toBe('private');
  });

  it('rejects a missing name, a bad email, bad JSON and oversized bodies without saving', async () => {
    expect((await post({ ...good, name: ' ' })).status).toBe(400);
    expect((await post({ ...good, email: 'nope' })).status).toBe(400);
    expect((await post('{')).status).toBe(400);
    expect((await post('null')).status).toBe(400);
    expect((await post({ ...good, notes: 'x'.repeat(9000) })).status).toBe(413);
    expect(put).not.toHaveBeenCalled();
  });

  it('answers ok to a filled honeypot but saves nothing', async () => {
    const res = await post({ ...good, website: 'http://spam' });
    expect(res.status).toBe(200);
    expect(put).not.toHaveBeenCalled();
  });

  it('reports a failed save so the page can offer the copy fallback', async () => {
    put.mockRejectedValue(new Error('no store'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await post(good);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ ok: false, error: 'save_failed' });
  });

  it('pings the notify hook with no email or notes, and a failed ping never loses the brief', async () => {
    vi.stubEnv('LEAD_NOTIFY_URL', 'https://hook.example/x');
    const hook = vi.fn().mockRejectedValue(new Error('down'));
    vi.stubGlobal('fetch', hook);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await post(good);
    expect(res.status).toBe(200);
    const sent = JSON.parse(hook.mock.calls[0][1].body).text as string;
    expect(sent).toContain('Building a PinkCell');
    expect(sent).not.toContain('ada@example.org');
    expect(sent).not.toContain('hello');
  });

  it('only accepts POST', () => {
    expect(GET().status).toBe(405);
  });
});
