import type { Types } from 'mongoose';
import type { Role } from '@spacebasic/shared';

declare global {
  namespace Express {
    interface AuthContext {
      userId: Types.ObjectId;
      institutionId: Types.ObjectId;
      roles: Role[];
      sessionId: Types.ObjectId;
    }
    interface Request {
      requestId: string;
      ctx?: AuthContext;
      valid?: unknown;
    }
  }
}

export {};
