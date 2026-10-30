import { cookies } from 'next/headers';
import { SessionUser } from '@/types/auth';
import { getSessionUser } from '@/lib/auth/session-store';

export async function getSession(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get('app_session')?.value;

  if (!token) {
    return null;
  }

  return getSessionUser(token);
}

export async function requireSession(): Promise<SessionUser> {
  const user = await getSession();
  if (!user) {
    throw new Error('Unauthorized');
  }
  return user;
}
