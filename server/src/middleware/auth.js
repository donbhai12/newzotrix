import User from '../models/User.js';
import { verifyToken } from '../utils/auth.js';

export async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!token) return res.status(401).json({ message: 'Authentication required' });
    const payload = verifyToken(token);
    const user = await User.findById(payload.sub);
    if (!user || !user.active) return res.status(401).json({ message: 'Session expired or account disabled' });
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
}

export function allowRoles(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) return res.status(403).json({ message: 'You do not have permission for this action' });
    next();
  };
}

function ids(user, key) {
  return Array.isArray(user?.[key]) ? user[key].map(String).filter(Boolean) : [];
}

export function isScopedAdmin(user) {
  return user?.role === 'admin' && user.accessControlEnabled === true;
}

export function projectAccessFilter(user) {
  if (!isScopedAdmin(user) || user.allProjectAccess) return {};
  return { _id: { $in: ids(user, 'projectAccess') } };
}

export function workerAccessFilter(user) {
  if (!isScopedAdmin(user)) return {};
  if (user.allProjectAccess) return { projectId: { $ne: null } };
  const projectIds = ids(user, 'projectAccess');
  return projectIds.length ? { projectId: { $in: projectIds } } : { _id: { $in: [] } };
}

export function expenseAccessFilter(user) {
  if (!isScopedAdmin(user)) return {};
  if (user.allProjectAccess) return { projectId: { $ne: null } };
  const projectIds = ids(user, 'projectAccess');
  return projectIds.length ? { projectId: { $in: projectIds } } : { _id: { $in: [] } };
}

export function canAccessProject(user, projectId) {
  if (!isScopedAdmin(user) || user.allProjectAccess) return true;
  return ids(user, 'projectAccess').includes(String(projectId));
}

export function canAccessWorker(user, worker) {
  if (!isScopedAdmin(user)) return true;
  if (!worker?.projectId) return false;
  return canAccessProject(user, worker.projectId);
}

export function canAccessExpense(user, { projectId = null } = {}) {
  if (!isScopedAdmin(user)) return true;
  return Boolean(projectId) && canAccessProject(user, projectId);
}

export function accountingCategoryFilter(user) {
  const categories = user.accountingCategories || ['*'];
  return user.role === 'admin' && !categories.includes('*') ? { category: { $in: categories } } : {};
}

export function canAccessAccountingCategory(user, category) {
  const categories = user.accountingCategories || ['*'];
  return user.role !== 'admin' || categories.includes('*') || categories.includes(category);
}