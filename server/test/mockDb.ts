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
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface MockDevice {
  id: string;
  userId: string;
  deviceName: string;
  platform: string;
  keyId: string;
  status: string;
  lastSeenAt: Date;
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
  public devices: Map<string, MockDevice> = new Map();
  public sessions: Map<string, MockSession> = new Map();
  public conversations: Map<string, MockConversation> = new Map();
  public members: Map<string, MockConversationMember> = new Map();
  public messages: Map<string, MockMessage> = new Map();

  reset(): void {
    this.users.clear();
    this.publicKeys.clear();
    this.devices.clear();
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

      findMany: async ({ where, select, take }: { where?: any; select?: Record<string, boolean>; take?: number }) => {
        let list = Array.from(this.users.values());
        if (where?.id?.not) {
          list = list.filter((u) => u.id !== where.id.not);
        }
        if (where?.OR) {
          list = list.filter((u) =>
            where.OR.some((cond: any) => {
              if (cond.username?.contains) {
                return u.username.toLowerCase().includes(cond.username.contains.toLowerCase());
              }
              if (cond.displayName?.contains) {
                return u.displayName.toLowerCase().includes(cond.displayName.contains.toLowerCase());
              }
              return false;
            })
          );
        }
        if (take) {
          list = list.slice(0, take);
        }
        return list.map((u) => this.project(u, select));
      },

      count: async ({ where }: { where?: any } = {}) => {
        let list = Array.from(this.users.values());
        if (where?.id?.not) {
          list = list.filter((u) => u.id !== where.id.not);
        }
        if (where?.OR) {
          list = list.filter((u) =>
            where.OR.some((cond: any) => {
              if (cond.username?.contains) {
                return u.username.toLowerCase().includes(cond.username.contains.toLowerCase());
              }
              if (cond.displayName?.contains) {
                return u.displayName.toLowerCase().includes(cond.displayName.contains.toLowerCase());
              }
              return false;
            })
          );
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

      create: async ({ data, select }: { data: { userId: string; keyId: string; publicKey: string; algorithm?: string; status?: string }; select?: Record<string, boolean> }) => {
        const id = crypto.randomUUID();
        const now = new Date();
        const newKey: MockPublicKey = {
          id,
          userId: data.userId,
          keyId: data.keyId,
          publicKey: data.publicKey,
          algorithm: data.algorithm || 'ECDH-P256',
          status: data.status || 'active',
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
            status: create.status || 'active',
            createdAt: now,
            updatedAt: now,
          };
          this.publicKeys.set(id, newKey);
          return this.project(newKey, select);
        }
      },
    };
  }

  get deviceDelegate() {
    return {
      findUnique: async ({ where, select }: { where: { id: string }; select?: Record<string, boolean> }) => {
        const found = this.devices.get(where.id);
        if (!found) return null;
        return this.project(found, select);
      },

      findMany: async ({ where, orderBy, select }: { where?: { userId?: string; status?: string }; orderBy?: any; select?: Record<string, boolean> }) => {
        let list = Array.from(this.devices.values());
        if (where?.userId) {
          list = list.filter((d) => d.userId === where.userId);
        }
        if (where?.status) {
          list = list.filter((d) => d.status === where.status);
        }
        if (orderBy?.createdAt === 'desc') {
          list.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        }
        return list.map((d) => this.project(d, select));
      },

      create: async ({ data, select }: { data: { userId: string; deviceName: string; platform?: string; keyId: string; status?: string }; select?: Record<string, boolean> }) => {
        const id = crypto.randomUUID();
        const now = new Date();
        const newDevice: MockDevice = {
          id,
          userId: data.userId,
          deviceName: data.deviceName,
          platform: data.platform || 'web',
          keyId: data.keyId,
          status: data.status || 'active',
          lastSeenAt: now,
          createdAt: now,
          updatedAt: now,
        };
        this.devices.set(id, newDevice);
        return this.project(newDevice, select);
      },

      update: async ({ where, data, select }: { where: { id: string }; data: Partial<MockDevice>; select?: Record<string, boolean> }) => {
        const existing = this.devices.get(where.id);
        if (!existing) throw new Error('Device not found');

        const updated: MockDevice = {
          ...existing,
          ...data,
          updatedAt: new Date(),
        };
        this.devices.set(where.id, updated);
        return this.project(updated, select);
      },
    };
  }

  get sessionDelegate() {
    return {
      findUnique: async ({ where, include }: { where: { id?: string; tokenHash?: string }; include?: { user: { select: Record<string, boolean> } } }) => {
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
            user: user ? this.project(user, include.user.select) : null,
          };
        }
        return found;
      },

      create: async ({ data }: { data: { id?: string; userId: string; tokenHash: string; expiresAt: Date } }) => {
        const id = data.id || crypto.randomUUID();
        const session: MockSession = {
          id,
          userId: data.userId,
          tokenHash: data.tokenHash,
          expiresAt: data.expiresAt,
          createdAt: new Date(),
        };
        this.sessions.set(id, session);
        return session;
      },

      delete: async ({ where }: { where: { id?: string; tokenHash?: string } }) => {
        if (where.id && this.sessions.has(where.id)) {
          const s = this.sessions.get(where.id);
          this.sessions.delete(where.id);
          return s;
        }
        if (where.tokenHash) {
          const found = Array.from(this.sessions.entries()).find(([, s]) => s.tokenHash === where.tokenHash);
          if (found) {
            this.sessions.delete(found[0]);
            return found[1];
          }
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
        return this.populateConversation(found, include);
      },

      findMany: async ({ where, include, orderBy, skip, take }: { where?: any; include?: any; orderBy?: any; skip?: number; take?: number }) => {
        let list = Array.from(this.conversations.values());
        if (where?.members?.some?.userId) {
          const uid = where.members.some.userId;
          list = list.filter((conv) => {
            return Array.from(this.members.values()).some((m) => m.conversationId === conv.id && m.userId === uid);
          });
        }
        if (orderBy?.updatedAt === 'desc') {
          list.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
        }
        if (skip) {
          list = list.slice(skip);
        }
        if (take) {
          list = list.slice(0, take);
        }
        return list.map((c) => this.populateConversation(c, include));
      },

      count: async ({ where }: { where?: any } = {}) => {
        let list = Array.from(this.conversations.values());
        if (where?.members?.some?.userId) {
          const uid = where.members.some.userId;
          list = list.filter((conv) => {
            return Array.from(this.members.values()).some((m) => m.conversationId === conv.id && m.userId === uid);
          });
        }
        return list.length;
      },

      create: async ({ data, include }: { data: { directKey: string; members: { create: Array<{ userId: string }> } }; include?: any }) => {
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
          data.members.create.forEach((m) => {
            const mId = crypto.randomUUID();
            this.members.set(mId, {
              id: mId,
              conversationId: id,
              userId: m.userId,
              joinedAt: now,
            });
          });
        }

        return this.populateConversation(newConv, include);
      },

      update: async ({ where, data }: { where: { id: string }; data: { updatedAt: Date } }) => {
        const existing = this.conversations.get(where.id);
        if (existing) {
          existing.updatedAt = data.updatedAt;
          this.conversations.set(where.id, existing);
        }
        return existing;
      },
    };
  }

  get conversationMemberDelegate() {
    return {
      findUnique: async ({ where }: { where: { conversationId_userId: { conversationId: string; userId: string } } }) => {
        const found = Array.from(this.members.values()).find(
          (m) =>
            m.conversationId === where.conversationId_userId.conversationId &&
            m.userId === where.conversationId_userId.userId
        );
        return found || null;
      },
    };
  }

  get messageDelegate() {
    return {
      findUnique: async ({ where }: { where: { id: string } }) => {
        return this.messages.get(where.id) || null;
      },

      findMany: async ({ where, orderBy, take }: { where?: any; orderBy?: any; take?: number }) => {
        let list = Array.from(this.messages.values());
        if (where?.conversationId) {
          list = list.filter((m) => m.conversationId === where.conversationId);
        }
        if (where?.createdAt?.lt) {
          const ltDate = new Date(where.createdAt.lt);
          list = list.filter((m) => m.createdAt < ltDate);
        }

        const isDesc = Array.isArray(orderBy)
          ? orderBy.some((o: any) => o.createdAt === 'desc')
          : orderBy?.createdAt === 'desc';

        if (isDesc) {
          list.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        } else {
          list.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
        }

        if (take) {
          list = list.slice(0, take);
        }
        return list;
      },

      create: async ({ data }: { data: { conversationId: string; senderId: string; ciphertext: string; nonce: string; senderKeyId: string; recipientKeyId: string; algorithm?: string; version?: number; aad?: string } }) => {
        const id = crypto.randomUUID();
        const now = new Date();
        const newMsg: MockMessage = {
          id,
          conversationId: data.conversationId,
          senderId: data.senderId,
          ciphertext: data.ciphertext,
          nonce: data.nonce,
          senderKeyId: data.senderKeyId,
          recipientKeyId: data.recipientKeyId,
          algorithm: data.algorithm || 'AES-256-GCM',
          version: data.version || 1,
          aad: data.aad || null,
          createdAt: now,
          updatedAt: now,
        };
        this.messages.set(id, newMsg);

        const conv = this.conversations.get(data.conversationId);
        if (conv) {
          conv.updatedAt = now;
          this.conversations.set(conv.id, conv);
        }

        return newMsg;
      },
    };
  }

  private populateConversation(conv: MockConversation, include?: any) {
    if (!include) return conv;
    const result: any = { ...conv };

    if (include.members) {
      const convMembers = Array.from(this.members.values()).filter((m) => m.conversationId === conv.id);
      result.members = convMembers.map((m) => {
        if (include.members?.include?.user) {
          const user = this.users.get(m.userId);
          return {
            ...m,
            user: user ? this.project(user, include.members.include.user.select) : null,
          };
        }
        if (include.members?.select) {
          return this.project(m, include.members.select);
        }
        return m;
      });
    }

    if (include.messages) {
      const convMsgs = Array.from(this.messages.values())
        .filter((m) => m.conversationId === conv.id)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      result.messages = include.messages.take ? convMsgs.slice(0, include.messages.take) : convMsgs;
    }

    return result;
  }

  private project(item: any, select?: Record<string, boolean>) {
    if (!select) return item;
    const projected: any = {};
    for (const key of Object.keys(select)) {
      if (select[key]) {
        projected[key] = item[key];
      }
    }
    return projected;
  }
}

export const mockDb = new MockDatabase();
