import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { UserModel, IUser } from '../models/user.model';

// Augment Express Request to include user
declare global {
    namespace Express {
        interface Request {
            user?: IUser;
        }
    }
}

const JWT_SECRET = process.env.JWT_SECRET || 'fallback_development_secret_voice_multi_tenant_123';

export const authMiddleware = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        let token: string | undefined;

        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            token = authHeader.split(' ')[1];
        } else if (req.query.token) {
            token = req.query.token as string;
        }

        if (!token) {
            console.log('[authMiddleware] No token provided');
            res.status(401).json({ error: 'No token provided or invalid format.' });
            return;
        }

        console.log('[authMiddleware] Veryfying token signature');
        // Verify token
        let decoded: any;
        try {
            decoded = jwt.verify(token, JWT_SECRET);
        } catch (err) {
            console.warn(`[authMiddleware] Invalid JWT signature: ${(err as Error).message}`);
            res.status(401).json({ error: 'Invalid or expired token.' });
            return;
        }

        if (!decoded || !decoded.userId) {
            console.log('[authMiddleware] Malformed token');
            res.status(401).json({ error: 'Malformed token.' });
            return;
        }

        console.log(`[authMiddleware] Finding user by ID: ${decoded.userId}`);
        // Find user
        const user = await UserModel.findById(decoded.userId).select('-otpCode'); // don't push OTP back into req.user

        if (!user) {
            console.log('[authMiddleware] User not found');
            res.status(401).json({ error: 'User associated with token no longer exists.' });
            return;
        }

        console.log(`[authMiddleware] User found, injecting to req then calling next()`);
        // Inject user into request object
        req.user = user;

        next();
    } catch (error) {
        console.error(`Error in auth middleware: ${(error as Error).message}`);
        res.status(500).json({ error: 'Internal server error during authentication.' });
    }
};
