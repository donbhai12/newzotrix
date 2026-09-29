import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { config } from '../config.js';

export function signToken(user) {
  return jwt.sign({ sub: String(user._id), role: user.role, loginId: user.loginId }, config.jwtSecret, { expiresIn: '12h' });
}

export function verifyToken(token) {
  return jwt.verify(token, config.jwtSecret);
}

export async function hashPassword(password) {
  return bcrypt.hash(password, 12);
}

export async function comparePassword(password, hash) {
  return bcrypt.compare(password, hash);
}

export function safeUser(user) {
  return {
    id: String(user._id),
    name: user.name,
    loginId: user.loginId,
    role: user.role,
    mobile: user.mobile,
    email: user.email,
    jobRole: user.jobRole,
    workerId: user.workerId ? String(user.workerId) : null,
    initials: user.initials,
    photoUrl: user.photoUrl,
    accountingCategories: user.accountingCategories || ['*'],
    accessControlEnabled: user.accessControlEnabled === true,
    allProjectAccess: user.allProjectAccess === true,
    projectAccess: (user.projectAccess || []).map(String),
    allWorkerAccess: user.allWorkerAccess === true,
    workerAccess: (user.workerAccess || []).map(String),
    unassignedExpenseAccess: user.unassignedExpenseAccess === true,
    active: user.active
  };
}
