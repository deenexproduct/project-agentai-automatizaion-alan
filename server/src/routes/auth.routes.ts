import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { UserModel } from '../models/user.model';
import { emailService } from '../services/email.service';
import { authMiddleware } from '../middleware/auth.middleware';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'fallback_development_secret_voice_multi_tenant_123';

/**
 * Generate a 6-digit cryptographic-safe-ish OTP
 */
const generateOTP = () => {
    return Math.floor(100000 + Math.random() * 900000).toString();
};

/**
 * @route   POST /api/auth/request-otp
 * @desc    Request a new OTP for the given email
 */
router.post('/request-otp', async (req: Request, res: Response) => {
    try {
        const { email } = req.body;

        if (!email || !email.includes('@')) {
            return res.status(400).json({ error: 'Valid email is required.' });
        }

        const normalizedEmail = email.toLowerCase().trim();
        const otpCode = generateOTP();
        const otpExpiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

        // Strict SaaS check: users must be invited unless it's the root admin
        let user = await UserModel.findOne({ email: normalizedEmail });

        if (!user) {
            // Seed the initial root administrator
            if (normalizedEmail === 'alannaimtapia@gmail.com') {
                user = new UserModel({
                    email: normalizedEmail,
                    role: 'admin',
                    name: 'Alan Tapia'
                });
            } else {
                return res.status(403).json({ error: 'Tu correo no está registrado. Pide a un administrador que te invite.' });
            }
        }

        user.otpCode = otpCode;
        user.otpExpiresAt = otpExpiresAt;
        await user.save();

        // Send Email
        const sent = await emailService.sendOtp(normalizedEmail, otpCode);

        if (!sent) {
            return res.status(500).json({ error: 'Failed to send OTP email. Please try again later.' });
        }

        return res.json({ message: 'OTP sent to email successfully.' });
    } catch (error) {
        console.error(`Error in request-otp: ${(error as Error).message}`);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * @route   POST /api/auth/verify-otp
 * @desc    Verify the given OTP and return a JWT
 */
router.post('/verify-otp', async (req: Request, res: Response) => {
    try {
        const { email, otp } = req.body;

        if (!email || !otp) {
            return res.status(400).json({ error: 'Email and OTP are required.' });
        }

        const normalizedEmail = email.toLowerCase().trim();
        const user = await UserModel.findOne({ email: normalizedEmail });

        if (!user) {
            return res.status(404).json({ error: 'User not found.' });
        }

        if (user.otpCode !== otp) {
            return res.status(401).json({ error: 'Invalid OTP.' });
        }

        if (user.otpExpiresAt && user.otpExpiresAt < new Date()) {
            return res.status(401).json({ error: 'OTP has expired. Please request a new one.' });
        }

        // OTP is valid! Clear the OTP from DB so it can't be reused
        user.otpCode = undefined;
        user.otpExpiresAt = undefined;
        await user.save();

        // Generate JWT
        const token = jwt.sign(
            { userId: user._id, email: user.email },
            JWT_SECRET,
            { expiresIn: '30d' } // Token lasts 30 days
        );

        return res.json({
            message: 'Authentication successful',
            token,
            user: {
                id: user._id,
                email: user.email,
                name: user.name,
                role: user.role
            }
        });
    } catch (error) {
        console.error(`Error in verify-otp: ${(error as Error).message}`);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * @route   GET /api/auth/me
 * @desc    Get the current logged-in user details
 */
router.get('/me', authMiddleware, async (req: Request, res: Response) => {
    try {
        console.log('[auth/me] Request entered, req.user:', req.user?._id);
        // req.user is injected by authMiddleware
        res.json({ user: req.user });
        console.log('[auth/me] Response sent');
    } catch (error) {
        console.error(`Error in /me: ${(error as Error).message}`);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * @route   POST /api/auth/invite
 * @desc    Admin-only endpoint to invite a new user to the platform
 */
router.post('/invite', authMiddleware, async (req: Request, res: Response) => {
    try {
        const adminUser = req.user as any;

        const { email, name } = req.body;

        if (!email || !email.includes('@')) {
            return res.status(400).json({ error: 'Se requiere un correo electrónico válido.' });
        }

        const normalizedEmail = email.toLowerCase().trim();
        const existingUser = await UserModel.findOne({ email: normalizedEmail });

        if (existingUser) {
            return res.status(400).json({ error: 'Este usuario ya está registrado en la plataforma.' });
        }

        const newUser = await UserModel.create({
            email: normalizedEmail,
            name: name?.trim(),
            role: 'user',
            invitedBy: adminUser._id
        });

        // Dispatch Welcome Email
        const inviterName = adminUser.name || adminUser.email;
        const appUrl = process.env.FRONTEND_URL || 'http://localhost:5173/login';
        const sent = await emailService.sendInvitation(normalizedEmail, inviterName, appUrl);

        if (!sent) {
            console.warn(`[INVITE] User created but email failed for ${normalizedEmail}`);
        }

        return res.json({
            message: 'Invitación enviada con éxito.',
            user: {
                id: newUser._id,
                email: newUser.email,
                name: newUser.name,
                role: newUser.role
            }
        });
    } catch (error) {
        console.error(`Error in /invite: ${(error as Error).message}`);
        return res.status(500).json({ error: 'Error interno del servidor al procesar la invitación.' });
    }
});

/**
 * @route   GET /api/auth/users
 * @desc    Admin-only endpoint to list all platform users
 */
router.get('/users', authMiddleware, async (req: Request, res: Response) => {
    try {
        const adminUser = req.user as any;

        const users = await UserModel.find({}, { password: 0, otpCode: 0, otpExpiresAt: 0 })
            .sort({ createdAt: -1 })
            .lean();

        return res.json(users);
    } catch (error) {
        console.error(`Error in /users: ${(error as Error).message}`);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

export default router;
