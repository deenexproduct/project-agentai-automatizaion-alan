import mongoose, { Schema, Document } from 'mongoose';

export interface IEvent extends Document {
    userId: mongoose.Types.ObjectId;
    assignedTo?: mongoose.Types.ObjectId;
    title: string;
    description?: string;
    date: Date;
    startTime: string; // HH:mm format
    endTime: string;   // HH:mm format
    type: 'meet' | 'physical';
    location?: string;
    googleEventId?: string;
    meetLink?: string;
    attendees: string[]; // array of emails
    linkedTo?: {
        contact?: mongoose.Types.ObjectId; // Legacy
        contacts?: mongoose.Types.ObjectId[];
        company?: mongoose.Types.ObjectId;
        deal?: mongoose.Types.ObjectId;
    };
    createdAt: Date;
    updatedAt: Date;
}

const EventSchema = new Schema(
    {
        userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        assignedTo: { type: Schema.Types.ObjectId, ref: 'User' },
        title: { type: String, required: true },
        description: { type: String },
        date: { type: Date, required: true },
        startTime: { type: String, required: true },
        endTime: { type: String, required: true },
        type: { type: String, enum: ['meet', 'physical'], default: 'meet' },
        location: { type: String }, // Address if physical
        googleEventId: { type: String },
        meetLink: { type: String },
        attendees: [{ type: String }], // Optional list of emails
        linkedTo: {
            contact: { type: Schema.Types.ObjectId, ref: 'CrmContact' },
            contacts: [{ type: Schema.Types.ObjectId, ref: 'CrmContact' }],
            company: { type: Schema.Types.ObjectId, ref: 'Company' },
            deal: { type: Schema.Types.ObjectId, ref: 'Deal' }
        }
    },
    { timestamps: true }
);

export const Event = mongoose.model<IEvent>('Event', EventSchema);
