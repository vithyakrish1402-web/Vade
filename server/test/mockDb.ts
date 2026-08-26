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

export interface MockPublicKey {
  id: string;
  userId: string;
  keyId: string;
  publicKey: string;
  algorithm: string;
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

export interface MockConversation {
  id: string;
  directKey: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface MockConversationMember {
  id: string;
  conversationId: string;
  userId: string;
  joinedAt: Date;
}

export interface MockMessage {
  id: string;
  conversationId: string;
  senderId: string;
  ciphertext: string;
  nonce: string;
  senderKeyId: string;
  recipientKeyId: string;
  algorithm: string;
  version: number;
  aad: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export class MockDatabase {
  public users: Map<string, MockUser> = new Map();
  public publicKeys: Map<string, MockPublicKey> = new Map();
  public sessions: Map<string, MockSession> = new Map();
  public conversations: Map<string, MockConversation> = new Map();
  public members: Map<string, MockConversationMember> = new Map();
  public messages: Map<string, MockMessage> = new Map();

  reset(): void {
    this.users.clear();
    this.publicKeys.clear();
    this.sessions.clear();
    this.conversations.clear();
    this.members.clear();
    this.messages.clear();
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

  get publicKeyDelegate() {
    return {
      findUnique: async ({ where, select }: { where: { userId?: string; keyId?: string }; select?: Record<string, boolean> }) => {
        let found: MockPublicKey | undefined;
        if (where.userId) {
          found = Array.from(this.publicKeys.values()).find((k) => k.userId === where.userId);
        } else if (where.keyId) {
          found = Array.from(this.publicKeys.values()).find((k) => k.keyId === where.keyId);
        }

        if (!found) return null;
        return this.project(found, select);
      },

      create: async ({ data, select }: { data: { userId: string; keyId: string; publicKey: string; algorithm?: string }; select?: Record<string, boolean> }) => {
        const id = crypto.randomUUID();
        const now = new Date();
        const newKey: MockPublicKey = {
          id,
          userId: data.userId,
          keyId: data.keyId,
          publicKey: data.publicKey,
          algorithm: data.algorithm || 'ECDH-P256',
          createdAt: now,
          updatedAt: now,
        };
        this.publicKeys.set(id, newKey);
        return this.project(newKey, select);
      },

      upsert: async ({ where, create, update, select }: { where: { userId: string }; create: any; update: any; select?: Record<string, boolean> }) => {
        const existing = Array.from(this.publicKeys.values()).find((k) => k.userId === where.userId);
        const now = new Date();
        if (existing) {
          const updated: MockPublicKey = {
            ...existing,
            ...update,
            updatedAt: now,
          };
          this.publicKeys.set(existing.id, updated);
          return this.project(updated, select);
        } else {
          const id = crypto.randomUUID();
          const newKey: MockPublicKey = {
            id,
            userId: create.userId,
            keyId: create.keyId,
            publicKey: create.publicKey,
            algorithm: create.algorithm || 'ECDH-P256',
            createdAt: now,
            updatedAt: now,
          };
          this.publicKeys.set(id, newKey);
          return this.project(newKey, select);
        }
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

  get conversationDelegate() {
    return {
      findUnique: async ({ where, include }: { where: { id?: string; directKey?: string }; include?: any }) => {
        let found: MockConversation | undefined;
        if (where.id) {
          found = this.conversations.get(where.id);
        } else if (where.directKey) {
          found = Array.from(this.conversations.values()).find((c) => c.directKey === where.directKey);
        }

        if (!found) return null;
        return this.hydrateConversation(found, include);
      },

      findMany: async ({ where, include, orderBy, skip = 0, take = 20 }: { where?: any; include?: any; orderBy?: any; skip?: number; take?: number }) => {
        let list = Array.from(this.conversations.values());

        if (where?.members?.some?.userId) {
          const targetUserId = where.members.some.userId;
          list = list.filter((conv) => {
            const m = Array.from(this.members.values()).filter((mem) => mem.conversationId === conv.id);
            return m.some((mem) => mem.userId === targetUserId);
          });
        }

        if (orderBy?.updatedAt === 'desc') {
          list.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
        }

        return list.slice(skip, skip + take).map((c) => this.hydrateConversation(c, include));
      },

      count: async ({ where }: { where?: any }) => {
        let list = Array.from(this.conversations.values());
        if (where?.members?.some?.userId) {
          const targetUserId = where.members.some.userId;
          list = list.filter((conv) => {
            const m = Array.from(this.members.values()).filter((mem) => mem.conversationId === conv.id);
            return m.some((mem) => mem.userId === targetUserId);
          });
        }
        return list.length;
      },

      create: async ({ data, include }: { data: { directKey: string; members?: { create: Array<{ userId: string }> } }; include?: any }) => {
        const id = crypto.randomUUID();
        const now = new Date();
        const newConv: MockConversation = {
          id,
          directKey: data.directKey,
          createdAt: now,
          updatedAt: now,
        };
        this.conversations.set(id, newConv);

        if (data.members?.create) {
          for (const m of data.members.create) {
            const memberId = crypto.randomUUID();
            this.members.set(memberId, {
              id: memberId,
              conversationId: id,
              userId: m.userId,
              joinedAt: now,
            });
          }
        }

        return this.hydrateConversation(newConv, include);
      },

      update: async ({ where, data }: { where: { id: string }; data: Partial<MockConversation> }) => {
        const existing = this.conversations.get(where.id);
        if (!existing) throw new Error('Conversation not found');
        const updated = {
          ...existing,
          ...data,
        };
        this.conversations.set(where.id, updated);
        return updated;
      },
    };
  }

  get conversationMemberDelegate() {
    return {
      findUnique: async ({ where }: { where: { conversationId_userId?: { conversationId: string; userId: string } } }) => {
        if (where.conversationId_userId) {
          const { conversationId, userId } = where.conversationId_userId;
          const found = Array.from(this.members.values()).find(
            (m) => m.conversationId === conversationId && m.userId === userId
          );
          return found || null;
        }
        return null;
      },
    };
  }

  get messageDelegate() {
    return {
      findUnique: async ({ where }: { where: { id: string } }) => {
        const found = this.messages.get(where.id);
        return found || null;
      },

      findMany: async ({ where, orderBy, take }: { where?: any; orderBy?: any; take?: number }) => {
        let list = Array.from(this.messages.values());

        if (where) {
          if (where.conversationId) {
            list = list.filter((m) => m.conversationId === where.conversationId);
          }
          if (where.createdAt?.lt) {
            const ltDate = new Date(where.createdAt.lt).getTime();
            list = list.filter((m) => m.createdAt.getTime() < ltDate);
          }
        }

        if (orderBy) {
          const orderArr = Array.isArray(orderBy) ? orderBy : [orderBy];
          const isDesc = orderArr.some((o: any) => o.createdAt === 'desc');
          if (isDesc) {
            list.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
          } else {
            list.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
          }
        }

        if (take !== undefined) {
          return list.slice(0, take);
        }

        return list;
      },

      create: async ({
        data,
      }: {
        data: {
          conversationId: string;
          senderId: string;
          ciphertext: string;
          nonce: string;
          senderKeyId: string;
          recipientKeyId: string;
          algorithm?: string;
          version?: number;
          aad?: string | null;
          createdAt?: Date;
          updatedAt?: Date;
        };
      }) => {
        const id = crypto.randomUUID();
        const now = data.createdAt || new Date();
        const newMsg: MockMessage = {
          id,
          conversationId: data.conversationId,
          senderId: data.senderId,
          ciphertext: data.ciphertext,
          nonce: data.nonce,
          senderKeyId: data.senderKeyId,
          recipientKeyId: data.recipientKeyId,
          algorithm: data.algorithm || 'AES-256-GCM',
          version: data.version ?? 1,
          aad: data.aad ?? null,
          createdAt: now,
          updatedAt: data.updatedAt || now,
        };
        this.messages.set(id, newMsg);
        return newMsg;
      },
    };
  }

  private hydrateConversation(conv: MockConversation, include?: any) {
    if (!include) return { ...conv };

    const res: any = { ...conv };
    if (include.members) {
      const convMembers = Array.from(this.members.values()).filter((m) => m.conversationId === conv.id);
      res.members = convMembers.map((m) => {
        const user = this.users.get(m.userId);
        return {
          ...m,
          user: user
            ? {
                id: user.id,
                username: user.username,
                displayName: user.displayName,
              }
            : null,
        };
      });
    }
    return res;
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
