import mongoose, { Schema, Document } from 'mongoose';

export interface ISmtpConfig {
    host: string;
    port: number;
    user: string;
    pass: string;
    secure: boolean;
}

export interface ICalendarConfig extends Document {
    userId: mongoose.Types.ObjectId;
    googleRefreshToken?: string;
    googleEmail?: string;
    smtp?: ISmtpConfig;
    emailTemplate?: string;
    createdAt: Date;
    updatedAt: Date;
}

const CalendarConfigSchema = new Schema(
    {
        userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
        googleRefreshToken: { type: String },
        googleEmail: { type: String },
        smtp: {
            host: { type: String },
            port: { type: Number },
            user: { type: String },
            pass: { type: String },
            secure: { type: Boolean, default: false }
        },
        emailTemplate: { type: String }
    },
    { timestamps: true }
);

export const CalendarConfig = mongoose.model<ICalendarConfig>('CalendarConfig', CalendarConfigSchema);
