import crypto from 'node:crypto';

export interface MockUser {
  id: string;
  username: string;
  email: string;
  passwordHash: string;
  displayName: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface MockSession {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  createdAt: Date;
}

export class MockDatabase {
  public users: Map<string, MockUser> = new Map();
  public sessions: Map<string, MockSession> = new Map();

  reset(): void {
    this.users.clear();
    this.sessions.clear();
  }

  get userDelegate() {
    return {
      findUnique: async ({ where, select }: { where: { id?: string; username?: string; email?: string }; select?: Record<string, boolean> }) => {
        let found: MockUser | undefined;
        if (where.id) {
          found = this.users.get(where.id);
        } else if (where.username) {
          found = Array.from(this.users.values()).find((u) => u.username === where.username.toLowerCase());
        } else if (where.email) {
          found = Array.from(this.users.values()).find((u) => u.email === where.email.toLowerCase());
        }

        if (!found) return null;
        return this.project(found, select);
      },

      findFirst: async ({ where, select }: { where: { OR?: Array<{ username?: string; email?: string }> }; select?: Record<string, boolean> }) => {
        let found: MockUser | undefined;
        if (where.OR) {
          found = Array.from(this.users.values()).find((u) =>
            where.OR!.some((cond) => {
              if (cond.username && u.username === cond.username.toLowerCase()) return true;
              if (cond.email && u.email === cond.email.toLowerCase()) return true;
              return false;
            })
          );
        }
        if (!found) return null;
        return this.project(found, select);
      },

      findMany: async ({ where, select, skip = 0, take = 20 }: { where?: any; select?: Record<string, boolean>; skip?: number; take?: number; orderBy?: any }) => {
        let list = Array.from(this.users.values());

        if (where) {
          if (where.id && where.id.not) {
            list = list.filter((u) => u.id !== where.id.not);
          }
          if (where.OR && Array.isArray(where.OR)) {
            list = list.filter((u) =>
              where.OR.some((cond: any) => {
                if (cond.username?.contains) {
                  const q = cond.username.contains.toLowerCase();
                  if (u.username.toLowerCase().includes(q)) return true;
                }
                if (cond.displayName?.contains) {
                  const q = cond.displayName.contains.toLowerCase();
                  if (u.displayName.toLowerCase().includes(q)) return true;
                }
                return false;
              })
            );
          }
        }

        return list.slice(skip, skip + take).map((u) => this.project(u, select));
      },

      count: async ({ where }: { where?: any }) => {
        let list = Array.from(this.users.values());
        if (where) {
          if (where.id && where.id.not) {
            list = list.filter((u) => u.id !== where.id.not);
          }
          if (where.OR && Array.isArray(where.OR)) {
            list = list.filter((u) =>
              where.OR.some((cond: any) => {
                if (cond.username?.contains) {
                  const q = cond.username.contains.toLowerCase();
                  if (u.username.toLowerCase().includes(q)) return true;
                }
                if (cond.displayName?.contains) {
                  const q = cond.displayName.contains.toLowerCase();
                  if (u.displayName.toLowerCase().includes(q)) return true;
                }
                return false;
              })
            );
          }
        }
        return list.length;
      },

      create: async ({ data, select }: { data: { username: string; email: string; passwordHash: string; displayName: string }; select?: Record<string, boolean> }) => {
        const id = crypto.randomUUID();
        const now = new Date();
        const newUser: MockUser = {
          id,
          username: data.username.toLowerCase(),
          email: data.email.toLowerCase(),
          passwordHash: data.passwordHash,
          displayName: data.displayName,
          createdAt: now,
          updatedAt: now,
        };
        this.users.set(id, newUser);
        return this.project(newUser, select);
      },

      update: async ({ where, data, select }: { where: { id: string }; data: Partial<MockUser>; select?: Record<string, boolean> }) => {
        const existing = this.users.get(where.id);
        if (!existing) throw new Error('User not found');
        const updated: MockUser = {
          ...existing,
          ...data,
          updatedAt: new Date(),
        };
        this.users.set(where.id, updated);
        return this.project(updated, select);
      },
    };
  }

  get sessionDelegate() {
    return {
      findUnique: async ({ where, include }: { where: { id?: string; tokenHash?: string }; include?: { user: boolean } }) => {
        let found: MockSession | undefined;
        if (where.id) {
          found = this.sessions.get(where.id);
        } else if (where.tokenHash) {
          found = Array.from(this.sessions.values()).find((s) => s.tokenHash === where.tokenHash);
        }

        if (!found) return null;

        if (include?.user) {
          const user = this.users.get(found.userId);
          return {
            ...found,
            user: user || null,
          };
        }

        return found;
      },

      create: async ({ data }: { data: { id: string; userId: string; tokenHash: string; expiresAt: Date } }) => {
        const newSession: MockSession = {
          id: data.id,
          userId: data.userId,
          tokenHash: data.tokenHash,
          expiresAt: data.expiresAt,
          createdAt: new Date(),
        };
        this.sessions.set(data.id, newSession);
        return newSession;
      },

      delete: async ({ where }: { where: { id?: string } }) => {
        if (where.id) {
          const s = this.sessions.get(where.id);
          this.sessions.delete(where.id);
          return s || null;
        }
        return null;
      },
    };
  }

  private project(item: any, select?: Record<string, boolean>): any {
    if (!select) return { ...item };
    const res: any = {};
    for (const [k, v] of Object.entries(select)) {
      if (v) res[k] = item[k];
    }
    return res;
  }
}

export const mockDb = new MockDatabase();
