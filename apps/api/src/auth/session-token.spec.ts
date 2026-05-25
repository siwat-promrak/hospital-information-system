import { SignJWT } from 'jose';

import {
  readBearerToken,
  readSessionCookie,
  verifySessionToken,
} from './session-token';

const SECRET = 'test-secret-please-change';

async function sign(payload: Record<string, unknown>, options?: { expiresIn?: string }): Promise<string> {
  const key = new TextEncoder().encode(SECRET);
  let jwt = new SignJWT(payload).setProtectedHeader({ alg: 'HS256' }).setIssuedAt();

  if (options?.expiresIn) {
    jwt = jwt.setExpirationTime(options.expiresIn);
  }

  return jwt.sign(key);
}

describe('readSessionCookie', () => {
  it('returns null when no Cookie header is present', () => {
    expect(readSessionCookie(undefined)).toBeNull();
    expect(readSessionCookie('')).toBeNull();
  });

  it('reads the NextAuth v4 cookie name', () => {
    expect(readSessionCookie('next-auth.session-token=abc.def.ghi')).toBe('abc.def.ghi');
  });

  it('reads the Auth.js v5 cookie name', () => {
    expect(readSessionCookie('authjs.session-token=zzz.yyy.xxx')).toBe('zzz.yyy.xxx');
  });

  it('reads the production Secure variant', () => {
    expect(readSessionCookie('__Secure-next-auth.session-token=prod.token')).toBe('prod.token');
  });

  it('ignores unrelated cookies and decodes URL-encoded values', () => {
    const header = 'theme=dark; next-auth.session-token=foo%2Ebar; locale=en';
    expect(readSessionCookie(header)).toBe('foo.bar');
  });

  it('returns null when no known cookie is present', () => {
    expect(readSessionCookie('theme=dark; locale=en')).toBeNull();
  });
});

describe('readBearerToken', () => {
  it('returns null when the header is missing', () => {
    expect(readBearerToken(undefined)).toBeNull();
  });

  it('returns null for a non-Bearer scheme', () => {
    expect(readBearerToken('Basic abc')).toBeNull();
  });

  it('extracts a Bearer token regardless of casing', () => {
    expect(readBearerToken('Bearer abc.def.ghi')).toBe('abc.def.ghi');
    expect(readBearerToken('bearer abc.def.ghi')).toBe('abc.def.ghi');
  });
});

describe('verifySessionToken', () => {
  it('parses a valid HS256 token and returns the typed payload', async () => {
    const token = await sign({
      sub: 'user-1',
      userId: 'user-1',
      email: 'nurse1@gmail.com',
      roleCode: 'NURSE',
    });

    const payload = await verifySessionToken(token, SECRET);

    expect(payload.userId).toBe('user-1');
    expect(payload.roleCode).toBe('NURSE');
    expect(payload.email).toBe('nurse1@gmail.com');
  });

  it('rejects a token signed with a different secret', async () => {
    const token = await sign({
      sub: 'u',
      userId: 'u',
      email: 'a@b.c',
      roleCode: 'NURSE',
    });

    await expect(verifySessionToken(token, 'wrong-secret')).rejects.toBeDefined();
  });

  it('rejects a token missing the userId / roleCode claims', async () => {
    const token = await sign({ sub: 'u' });

    await expect(verifySessionToken(token, SECRET)).rejects.toThrow(/userId/);
  });

  it('rejects an expired token', async () => {
    const token = await sign(
      { sub: 'u', userId: 'u', email: 'a@b.c', roleCode: 'NURSE' },
      { expiresIn: '-1s' },
    );

    await expect(verifySessionToken(token, SECRET)).rejects.toBeDefined();
  });
});
