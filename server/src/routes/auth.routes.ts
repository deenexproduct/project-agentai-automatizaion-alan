import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { UserModel } from '../models/user.model';
import { emailService } from '../services/email.service';
import { authMiddleware } from '../middleware/auth.middleware';
import { Task } from '../models/task.model';
import { Deal } from '../models/deal.model';
import { Goal } from '../models/goal.model';
import { Event } from '../models/event.model';
import { EventFair } from '../models/event-fair.model';
import { CrmContact } from '../models/crm-contact.model';
import { Company } from '../models/company.model';
import { Partner } from '../models/partner.model';
import { Activity } from '../models/activity.model';
import { WeeklyReport } from '../models/weeklyReport.model';

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
                role: user.role,
                platforms: user.platforms
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

        const { email, name, platforms } = req.body;

        if (!email || !email.includes('@')) {
            return res.status(400).json({ error: 'Se requiere un correo electrónico válido.' });
        }

        const normalizedEmail = email.toLowerCase().trim();
        const existingUser = await UserModel.findOne({ email: normalizedEmail });

        if (existingUser) {
            return res.status(400).json({ error: 'Este usuario ya está registrado en la plataforma.' });
        }

        // Validate platforms if provided
        const validPlatforms = ['comercial', 'operaciones'];
        const userPlatforms = Array.isArray(platforms) && platforms.length > 0
            ? platforms.filter((p: string) => validPlatforms.includes(p))
            : ['comercial'];

        const newUser = await UserModel.create({
            email: normalizedEmail,
            name: name?.trim(),
            role: 'user',
            platforms: userPlatforms,
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
                role: newUser.role,
                platforms: newUser.platforms
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
        const users = await UserModel.find({}, { otpCode: 0, otpExpiresAt: 0 })
            .sort({ createdAt: -1 })
            .lean();

        // Normalize: ensure all users have a platforms array (for pre-existing users)
        const normalized = users.map(u => ({
            ...u,
            platforms: (u as any).platforms?.length ? (u as any).platforms : ['comercial'],
        }));

        return res.json(normalized);
    } catch (error) {
        console.error(`Error in /users: ${(error as Error).message}`);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * @route   PUT /api/auth/users/:userId/role
 * @desc    Admin-only endpoint to update a user's role (admin/user)
 */
router.put('/users/:userId/role', authMiddleware, async (req: Request, res: Response) => {
    try {
        const adminUser = req.user as any;
        if (adminUser.role !== 'admin') {
            return res.status(403).json({ error: 'Solo administradores pueden cambiar roles.' });
        }

        const { userId } = req.params;
        const { role } = req.body;

        if (!['admin', 'user'].includes(role)) {
            return res.status(400).json({ error: 'Rol inválido. Usa "admin" o "user".' });
        }

        const updatedUser = await UserModel.findByIdAndUpdate(
            userId,
            { $set: { role } },
            { new: true, select: '-otpCode -otpExpiresAt' }
        ).lean();

        if (!updatedUser) {
            return res.status(404).json({ error: 'Usuario no encontrado.' });
        }

        return res.json({ user: updatedUser });
    } catch (error) {
        console.error(`Error in /users/:userId/role: ${(error as Error).message}`);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * @route   PUT /api/auth/profile
 * @desc    Update the current user's profile (name, photo)
 */
router.put('/profile', authMiddleware, async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user._id;
        const { name, profilePhotoUrl } = req.body;

        const updateFields: any = {};
        if (name !== undefined) updateFields.name = name.trim();
        if (profilePhotoUrl !== undefined) updateFields.profilePhotoUrl = profilePhotoUrl;

        const updatedUser = await UserModel.findByIdAndUpdate(
            userId,
            { $set: updateFields },
            { new: true, select: '-otpCode -otpExpiresAt' }
        ).lean();

        if (!updatedUser) {
            return res.status(404).json({ error: 'User not found' });
        }

        return res.json({ user: updatedUser });
    } catch (error) {
        console.error(`Error in /profile: ${(error as Error).message}`);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * @route   PUT /api/auth/users/:userId/platforms
 * @desc    Admin-only endpoint to update a user's platform access
 */
router.put('/users/:userId/platforms', authMiddleware, async (req: Request, res: Response) => {
    try {
        const { platforms } = req.body;
        const { userId } = req.params;

        const validPlatforms = ['comercial', 'operaciones'];
        if (!Array.isArray(platforms) || platforms.length === 0) {
            return res.status(400).json({ error: 'Se requiere al menos una plataforma.' });
        }

        const filtered = platforms.filter((p: string) => validPlatforms.includes(p));
        if (filtered.length === 0) {
            return res.status(400).json({ error: 'Plataformas inválidas.' });
        }

        const updatedUser = await UserModel.findByIdAndUpdate(
            userId,
            { $set: { platforms: filtered } },
            { new: true, select: '-otpCode -otpExpiresAt' }
        ).lean();

        if (!updatedUser) {
            return res.status(404).json({ error: 'Usuario no encontrado.' });
        }

        return res.json({ user: updatedUser });
    } catch (error) {
        console.error(`Error in /users/:userId/platforms: ${(error as Error).message}`);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * @route   DELETE /api/auth/users/:userId
 * @desc    Admin-only endpoint to delete a user and transfer their data
 */
router.delete('/users/:userId', authMiddleware, async (req: Request, res: Response) => {
    try {
        const adminUser = req.user as any;
        if (adminUser.role !== 'admin') {
            return res.status(403).json({ error: 'Solo administradores pueden eliminar usuarios.' });
        }

        const { userId } = req.params;
        const { transferTo } = req.query;

        if (!transferTo || typeof transferTo !== 'string') {
            return res.status(400).json({ error: 'Se requiere un usuario destino para la transferencia (transferTo).' });
        }

        if (userId === adminUser._id.toString()) {
            return res.status(400).json({ error: 'No puedes eliminarte a ti mismo.' });
        }

        if (userId === transferTo) {
            return res.status(400).json({ error: 'El usuario origen y destino no pueden ser el mismo.' });
        }

        // Validate users exist
        const [userToDelete, targetUser] = await Promise.all([
            UserModel.findById(userId),
            UserModel.findById(transferTo)
        ]);

        if (!userToDelete) return res.status(404).json({ error: 'El usuario a eliminar no existe.' });
        if (!targetUser) return res.status(404).json({ error: 'El usuario destino no existe.' });

        // Transfer all referenced data
        const results = {
            tasks: await Task.updateMany({ assignedTo: userId }, { assignedTo: transferTo }),
            tasksCreated: await Task.updateMany({ userId: userId }, { userId: transferTo }),
            deals: await Deal.updateMany({ assignedTo: userId }, { assignedTo: transferTo }),
            dealsOps: await Deal.updateMany({ opsAssignedTo: userId }, { opsAssignedTo: transferTo }),
            dealsCreated: await Deal.updateMany({ userId: userId }, { userId: transferTo }),
            goals: await Goal.updateMany({ assignedTo: userId }, { assignedTo: transferTo }),
            goalsCreated: await Goal.updateMany({ userId: userId }, { userId: transferTo }),
            events: await Event.updateMany({ assignedTo: userId }, { assignedTo: transferTo }),
            eventFairs: await EventFair.updateMany({ assignedTo: userId }, { assignedTo: transferTo }),
            eventFairsCreated: await EventFair.updateMany({ userId: userId }, { userId: transferTo }),
            contacts: await CrmContact.updateMany({ assignedTo: userId }, { assignedTo: transferTo }),
            companies: await Company.updateMany({ assignedTo: userId }, { assignedTo: transferTo }),
            partners: await Partner.updateMany({ assignedTo: userId }, { assignedTo: transferTo }),
            activities: await Activity.updateMany({ createdBy: userId }, { createdBy: transferTo }),
            reports: await WeeklyReport.updateMany(
                { 'assignedTo._id': userId },
                { $set: { assignedTo: { _id: targetUser._id, name: targetUser.name || targetUser.email } } }
            ),
            invitedUsers: await UserModel.updateMany({ invitedBy: userId }, { invitedBy: transferTo }),
        };

        // Delete the user
        await UserModel.findByIdAndDelete(userId);

        return res.json({
            message: 'Usuario eliminado y datos transferidos con éxito.',
            transferResults: results
        });
    } catch (error) {
        console.error(`Error in DELETE /users/:userId: ${(error as Error).message}`);
        return res.status(500).json({ error: 'Error interno al eliminar el usuario.' });
    }
});

export default router;
