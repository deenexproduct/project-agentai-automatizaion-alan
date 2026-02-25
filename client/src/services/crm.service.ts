import api from '../lib/axios';

// ── Types ────────────────────────────────────────────────────────

export type PipelineStage = {
    key: string;
    label: string;
    color: string;
    order: number;
    isFinal: boolean;
    isActive: boolean;
};

export type PipelineConfig = {
    _id: string;
    name: string;
    stages: PipelineStage[];
};

export type SystemConfig = {
    _id: string;
    companyCategories: string[];
    contactRoles: string[];
    contactPositions: string[];
};

export type PartnerData = {
    _id: string;
    name: string;
    email?: string;
    phone?: string;
    commissionPercentage?: number;
    notes?: string;
    assignedTo?: { _id: string; name: string; profilePhotoUrl?: string };
    createdAt?: string;
    companiesCount?: number;
    contactsCount?: number;
};

export type CompanyData = {
    _id: string;
    name: string;
    logo?: string;
    themeColor?: string;
    sector?: string;
    website?: string;
    description?: string;
    localesCount: number;
    costPerLocation?: number;
    category?: string;
    partner?: PartnerData;
    painPoints: string[];
    deliveries: string[];
    socialMedia?: {
        instagram?: string;
        linkedin?: string;
        twitter?: string;
        facebook?: string;
    };
    research?: {
        notes?: string;
        lastResearchedAt?: string;
    };
    assignedTo?: { _id: string; name: string; email: string; profilePhotoUrl?: string };
    contactsCount?: number;
    dealsCount?: number;
    createdAt: string;
};

export type ContactData = {
    _id: string;
    fullName: string;
    position?: string;
    role: string;
    channel: string;
    email?: string;
    phone?: string;
    profilePhotoUrl?: string;
    company?: { _id: string; name: string; logo?: string };
    companies?: { _id: string; name: string; logo?: string; sector?: string }[];
    partner?: PartnerData;
    assignedTo?: { _id: string; name: string; email: string; profilePhotoUrl?: string };
    linkedInContactId?: { _id: string; profileUrl: string };
    linkedInProfileUrl?: string;
    tags: string[];
    createdAt: string;
};

export type DealData = {
    _id: string;
    title: string;
    value: number;
    currency: string;
    status: string;
    company?: { _id: string; name: string; logo?: string; themeColor?: string; sector?: string; localesCount?: number; costPerLocation?: number };
    primaryContact?: { _id: string; fullName: string; position?: string; profilePhotoUrl?: string };
    contacts?: { _id: string; fullName: string; position?: string; profilePhotoUrl?: string; email?: string; phone?: string }[];
    assignedTo?: { _id: string; name: string; email: string; profilePhotoUrl?: string };
    expectedCloseDate?: string;
    daysInStatus?: number;
    pendingTasks?: number;
    createdAt: string;
};

export type TaskData = {
    _id: string;
    title: string;
    type: 'call' | 'meeting' | 'follow_up' | 'proposal' | 'research' | 'other';
    priority: 'low' | 'medium' | 'high' | 'urgent';
    status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
    dueDate?: string;
    contact?: { _id: string; fullName: string; profilePhotoUrl?: string };
    deal?: { _id: string; title: string };
    company?: { _id: string; name: string; logo?: string };
    assignedTo?: { _id: string; name: string; email: string; profilePhotoUrl?: string };
    isOverdue?: boolean;
    createdAt: string;
};

export type ActivityData = {
    _id: string;
    type: 'call' | 'whatsapp' | 'linkedin_message' | 'email' | 'meeting' | 'note' | 'task_completed';
    description: string;
    contact?: { _id: string; fullName: string; profilePhotoUrl?: string };
    deal?: { _id: string; title: string };
    company?: { _id: string; name: string; logo?: string };
    createdBy?: { _id: string; name: string; profilePhotoUrl?: string };
    createdAt: string;
};

export type DashboardStats = {
    companies: {
        totalLocales: number;
        totalCompanies: number;
        growthFromLastMonth: number;
    };
    revenue: {
        wonThisMonth: { currency: string; amount: number }[];
        pipelineForecast: { currency: string; amount: number }[];
    };
    traceability: {
        activitiesThisWeek: { type: string; count: number }[];
    };
    contacts: {
        total: number;
        newThisMonth: number;
        byRole: { role: string; count: number }[];
    };
    tasks: {
        total: number;
        overdue: number;
        completionRateThisWeek: number;
    };
    conversion: {
        totalDeals: number;
        winRate: number;
        leadToWon: number;
        leadToRejected: number;
        leadToMeeting: number;
        leadToScheduling: number;
        dealsWon: number;
        dealsLost: number;
        dealsPaused: number;
        funnel: {
            step: number;
            key: string;
            label: string;
            count: number;
        }[];
    };
};

export type CalendarConfigData = {
    _id?: string;
    googleEmail?: string;
    googleRefreshToken?: string;
    smtp?: {
        host: string;
        port: number;
        user: string;
        pass: string;
        secure?: boolean;
    };
    emailTemplate?: string;
};

export type EventData = {
    _id: string;
    sourceId?: string;
    userId: { _id: string; name: string; email: string };
    assignedTo?: { _id: string; name: string; email: string };
    title: string;
    description?: string;
    date: string;
    startTime: string;
    endTime: string;
    type: 'meet' | 'physical' | 'task';
    taskType?: 'call' | 'meeting' | 'follow_up' | 'proposal' | 'research' | 'other';
    taskStatus?: 'pending' | 'in_progress' | 'completed' | 'cancelled';
    taskPriority?: 'low' | 'medium' | 'high' | 'urgent';
    location?: string;
    googleEventId?: string;
    meetLink?: string;
    attendees: string[];
    linkedTo?: {
        contact?: { _id: string; fullName: string; profilePhotoUrl?: string }; // Legacy
        contacts?: { _id: string; fullName: string; profilePhotoUrl?: string }[];
        company?: { _id: string; name: string; logo?: string };
        deal?: { _id: string; title: string };
    };
    createdAt: string;
};

// ── API Methods ──────────────────────────────────────────────────

export const getPipelineConfig = async () => (await api.get<PipelineConfig>('/crm/pipeline/config')).data;
export const updatePipelineConfig = async (data: Partial<PipelineConfig>) => (await api.put<PipelineConfig>('/crm/pipeline/config', data)).data;
export const resetPipelineConfig = async () => (await api.post<PipelineConfig>('/crm/pipeline/config/seed')).data;

// Team Users
export type TeamUser = {
    _id: string;
    name?: string;
    email: string;
    profilePhotoUrl?: string;
    role?: string;
};
export const getTeamUsers = async () => (await api.get<TeamUser[]>('/auth/users')).data;

// System Config
export const getSystemConfig = async () => (await api.get<SystemConfig>('/system-config')).data;
export const addCompanyCategory = async (category: string) => (await api.post<SystemConfig>('/system-config/categories', { category })).data;
export const extractLogo = async (url: string) => (await api.get<{ logo: string; themeColor: string | null }>(`/system-config/extract-logo?url=${encodeURIComponent(url)}`)).data;
export const addContactRole = async (role: string) => (await api.post<SystemConfig>('/system-config/roles', { role })).data;
export const addContactPosition = async (position: string) => (await api.post<SystemConfig>('/system-config/positions', { position })).data;

// Partners
export const getPartners = async () => (await api.get<{ partners: PartnerData[] }>('/partners')).data;
export const createPartner = async (data: Partial<PartnerData>) => (await api.post<PartnerData>('/partners', data)).data;
export const updatePartner = async (id: string, data: Partial<PartnerData>) => (await api.patch<PartnerData>(`/partners/${id}`, data)).data;
export const deletePartner = async (id: string) => (await api.delete(`/partners/${id}`)).data;

// Dashboard
export const getDashboardStats = async () => (await api.get<DashboardStats>('/dashboard/metrics')).data;

// Companies
export const getCompanies = async (params: any) => (await api.get<{ companies: CompanyData[]; total: number; pages: number }>('/crm/companies', { params })).data;
export const getCompany = async (id: string) => (await api.get<CompanyData & { contacts: ContactData[], deals: DealData[], tasks: TaskData[], activities: ActivityData[] }>(`/crm/companies/${id}`)).data;
export const createCompany = async (data: Partial<CompanyData>) => (await api.post<CompanyData>('/crm/companies', data)).data;
export const updateCompany = async (id: string, data: Partial<CompanyData>) => (await api.patch<CompanyData>(`/crm/companies/${id}`, data)).data;
export const deleteCompany = async (id: string) => (await api.delete(`/crm/companies/${id}`)).data;

// Contacts
export const getContacts = async (params: any) => (await api.get<{ contacts: ContactData[]; total: number; pages: number }>('/crm/contacts', { params })).data;
export const getContact = async (id: string) => (await api.get<ContactData & { tasks: TaskData[], activities: ActivityData[], deals: DealData[] }>(`/crm/contacts/${id}`)).data;
export const createContact = async (data: Partial<ContactData>) => (await api.post<ContactData>('/crm/contacts', data)).data;
export const updateContact = async (id: string, data: Partial<ContactData>) => (await api.patch<ContactData>(`/crm/contacts/${id}`, data)).data;
export const deleteContact = async (id: string) => (await api.delete(`/crm/contacts/${id}`)).data;
export const linkLinkedInContact = async (id: string, linkedInContactId: string) => (await api.post(`/crm/contacts/${id}/link-linkedin`, { linkedInContactId })).data;

// Deals
export const getDealsPipeline = async (params: any = {}) => (await api.get<{ stages: { key: string, label: string, color: string, deals: DealData[] }[] }>('/crm/deals', { params })).data;
export const getDeal = async (id: string) => (await api.get<DealData>(`/crm/deals/${id}`)).data;
export const createDeal = async (data: Partial<DealData>) => (await api.post<DealData>('/crm/deals', data)).data;
export const updateDeal = async (id: string, data: Partial<DealData>) => (await api.patch<DealData>(`/crm/deals/${id}`, data)).data;
export const getDealActivities = async (dealId: string) => (await api.get<{ activities: ActivityData[]; total: number }>(`/crm/deals/${dealId}/activities`)).data;

// Tasks
export const getTasks = async (params: any) => (await api.get<{ tasks: TaskData[]; total: number; pages: number }>('/crm/tasks', { params })).data;
export const getTask = async (id: string) => (await api.get<TaskData>(`/crm/tasks/${id}`)).data;
export const createTask = async (data: Partial<TaskData>) => (await api.post<TaskData>('/crm/tasks', data)).data;
export const updateTask = async (id: string, data: Partial<TaskData>) => (await api.patch<TaskData>(`/crm/tasks/${id}`, data)).data;
export const completeTask = async (id: string) => (await api.patch<{ success: boolean, task: TaskData }>(`/crm/tasks/${id}/complete`)).data;
export const deleteTask = async (id: string) => (await api.delete(`/crm/tasks/${id}`)).data;

// Activities
export const getActivities = async (params: any = {}) => (await api.get<{ activities: (ActivityData & { source?: string })[]; total: number; pages: number }>('/crm/activities', { params })).data;
export const createActivity = async (data: Partial<ActivityData>) => (await api.post<ActivityData>('/crm/activities', data)).data;

// ── Calendar Config & Events ──────────────────────────────────────

export const getCalendarConfig = async (): Promise<CalendarConfigData> => (await api.get('/calendar/config')).data;

export const updateCalendarConfig = async (data: Partial<CalendarConfigData>): Promise<CalendarConfigData> => (await api.put('/calendar/config', data)).data;

export const getEvents = async (filters: { start?: string; end?: string } = {}): Promise<{ events: EventData[] }> => {
    const params = new URLSearchParams();
    if (filters.start) params.append('start', filters.start);
    if (filters.end) params.append('end', filters.end);
    return (await api.get(`/calendar/events?${params.toString()}`)).data;
};

export const createEvent = async (data: Partial<EventData> & { sendInvite?: boolean }): Promise<{ success: boolean; event: EventData }> =>
    (await api.post('/calendar/events', data)).data;

export const updateEvent = async (id: string, data: Partial<EventData> & { sendInvite?: boolean }): Promise<{ success: boolean; event: EventData }> =>
    (await api.put(`/calendar/events/${id}`, data)).data;

export const deleteEvent = async (id: string): Promise<{ success: boolean }> =>
    (await api.delete(`/calendar/events/${id}`)).data;
