import api from '../lib/axios';

// ── Pipeline Config ──────────────────────────────────────────

export const getOpsPipelineConfig = async () => {
    const { data } = await api.get('/ops/pipeline/config');
    return data;
};

export const updateOpsPipelineConfig = async (stages: any[]) => {
    const { data } = await api.put('/ops/pipeline/config', { stages });
    return data;
};

// ── Ops Deals ────────────────────────────────────────────────

export const getOpsDeals = async (status?: string) => {
    const params = status ? { status } : {};
    const { data } = await api.get('/ops/deals', { params });
    return data;
};

export const getOpsDealsGrouped = async () => {
    const { data } = await api.get('/ops/deals/grouped');
    return data;
};

export const activateOpsDeal = async (dealId: string, opsAssignedTo?: string) => {
    const { data } = await api.put(`/ops/deals/${dealId}/activate`, { opsAssignedTo });
    return data;
};

export const updateOpsDealStatus = async (dealId: string, opsStatus: string) => {
    const { data } = await api.put(`/ops/deals/${dealId}/status`, { opsStatus });
    return data;
};

// ── Stats ────────────────────────────────────────────────────

export const getOpsStats = async () => {
    const { data } = await api.get('/ops/stats');
    return data;
};

// ── Companies & Contacts ─────────────────────────────────────

export const getOpsCompanies = async () => {
    const { data } = await api.get('/ops/companies');
    return data;
};

export const getOpsContacts = async () => {
    const { data } = await api.get('/ops/contacts');
    return data;
};

// ── Tasks ────────────────────────────────────────────────────

export const getOpsTasks = async (params: any) => {
    const { data } = await api.get('/ops/tasks', { params });
    return data;
};

export const getOpsTask = async (id: string) => {
    const { data } = await api.get(`/ops/tasks/${id}`);
    return data;
};

export const createOpsTask = async (taskData: any) => {
    const { data } = await api.post('/ops/tasks', taskData);
    return data;
};

export const updateOpsTask = async (id: string, taskData: any) => {
    const { data } = await api.patch(`/ops/tasks/${id}`, taskData);
    return data;
};

export const completeOpsTask = async (id: string) => {
    const { data } = await api.patch(`/ops/tasks/${id}/complete`);
    return data;
};

export const deleteOpsTask = async (id: string) => {
    const { data } = await api.delete(`/ops/tasks/${id}`);
    return data;
};

export const linkTaskToGoal = async (taskId: string, goalId: string | null) => {
    const { data } = await api.patch(`/ops/tasks/${taskId}/link-goal`, { goalId });
    return data;
};

// ── Goals ────────────────────────────────────────────────────

export const getOpsGoals = async (params?: any) => {
    const { data } = await api.get('/ops/goals', { params });
    return data;
};

export const getOpsGoal = async (id: string) => {
    const { data } = await api.get(`/ops/goals/${id}`);
    return data;
};

export const createOpsGoal = async (goalData: any) => {
    const { data } = await api.post('/ops/goals', goalData);
    return data;
};

export const updateOpsGoal = async (id: string, goalData: any) => {
    const { data } = await api.patch(`/ops/goals/${id}`, goalData);
    return data;
};

export const updateOpsGoalProgress = async (id: string, current: number, note?: string) => {
    const { data } = await api.patch(`/ops/goals/${id}/progress`, { current, note });
    return data;
};

export const completeOpsGoal = async (id: string) => {
    const { data } = await api.patch(`/ops/goals/${id}/complete`);
    return data;
};

export const reopenOpsGoal = async (id: string) => {
    const { data } = await api.patch(`/ops/goals/${id}/reopen`);
    return data;
};

export const deleteOpsGoal = async (id: string, reason?: string) => {
    const { data } = await api.delete(`/ops/goals/${id}`, { data: { reason } });
    return data;
};

export const duplicateOpsGoal = async (id: string) => {
    const { data } = await api.post(`/ops/goals/${id}/duplicate`);
    return data;
};

export const archiveOpsGoal = async (id: string) => {
    const { data } = await api.patch(`/ops/goals/${id}/archive`);
    return data;
};

export const manageOpsGoalMilestones = async (id: string, action: 'add' | 'toggle' | 'remove', payload: any) => {
    const { data } = await api.patch(`/ops/goals/${id}/milestones`, { action, ...payload });
    return data;
};

// ── Activities ──────────────────────────────────────────────

export const getOpsActivities = async (params?: any) => {
    const { data } = await api.get('/ops/activities', { params });
    return data;
};

// ── Weekly Reports ──────────────────────────────────────────

export const generateWeeklyReport = async () => {
    const { data } = await api.post('/ops/reports/weekly');
    return data;
};

export const getOpsReports = async () => {
    const { data } = await api.get('/ops/reports');
    return data;
};

export const getOpsReport = async (id: string) => {
    const { data } = await api.get(`/ops/reports/${id}`);
    return data;
};

export const deleteOpsReport = async (id: string) => {
    const { data } = await api.delete(`/ops/reports/${id}`);
    return data;
};
