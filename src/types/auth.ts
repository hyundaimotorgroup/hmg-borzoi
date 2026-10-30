export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: string;
}

export type AppRole = 'admin' | 'developer' | 'viewer';
