import { SignJWT } from 'jose';

export interface TestJwtClaims {
  userId: string;
  roleCode: string;
  email: string;
}

/**
 * Mints a short-lived HS256 JWT shaped like the NextAuth session token the
 * real FE produces. Used by the e2e suite to stand in for a Google sign-in.
 */
export async function signTestJwt(
  claims: TestJwtClaims,
  secret: string,
  options: { expiresIn?: string } = { expiresIn: '5m' },
): Promise<string> {
  const key = new TextEncoder().encode(secret);
  let jwt = new SignJWT({
    userId: claims.userId,
    roleCode: claims.roleCode,
    email: claims.email,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setSubject(claims.userId);

  if (options.expiresIn) {
    jwt = jwt.setExpirationTime(options.expiresIn);
  }

  return jwt.sign(key);
}
