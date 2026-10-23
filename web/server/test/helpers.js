// HTTP client with a cookie jar, so tests behave like a browser (cookies persist between requests).
export class Client {
  constructor(base) {
    this.base = base;
    this.jar = new Map();
  }

  cookieHeader() {
    return [...this.jar].map(([k, v]) => `${k}=${v}`).join('; ');
  }

  async request(method, path, body, { headers = {}, raw = false } = {}) {
    const res = await fetch(this.base + path, {
      method,
      headers: {
        ...(raw ? {} : { 'content-type': 'application/json' }),
        ...(this.jar.size ? { cookie: this.cookieHeader() } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : (raw ? body : JSON.stringify(body)),
      redirect: 'manual',
    });
    const setCookie = res.headers.getSetCookie();
    for (const line of setCookie) {
      const [pair, ...attrs] = line.split(';').map((s) => s.trim());
      const i = pair.indexOf('=');
      const name = pair.slice(0, i);
      const value = pair.slice(i + 1);
      const expired = attrs.some((a) => /^max-age=0$/i.test(a)) || attrs.some((a) => /^expires=/i.test(a) && new Date(a.slice(8)) < new Date());
      if (expired || !value) this.jar.delete(name); else this.jar.set(name, value);
    }
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null, headers: res.headers, setCookie };
  }

  /** Copy this client's cookies into a new client (a second tab or a page refresh). */
  fork() {
    const c = new Client(this.base);
    c.jar = new Map(this.jar);
    return c;
  }
}

export const newAsset = (over = {}) => ({
  id: 'T01', name: 'Test archive', category: 'Test', protocol: 'TLS 1.2',
  key_establishment: 'RSA-KT', signature: 'RSA-SIG', symmetric: 'AES-256', hash: 'SHA-256',
  forward_secrecy: false, confidentiality_years: 30, integrity_years: 0, migration_years: 6,
  sensitivity: 'restricted', exposure: 'internet', migration_difficulty: 'high', link_type: 'internet',
  notes: 'created by the API test', ...over,
});

export const PASSWORD = 'correct-horse-battery';
