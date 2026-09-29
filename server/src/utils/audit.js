import AuditLog from '../models/AuditLog.js';

export async function audit(actorId, action, entity, entityId = '', metadata = {}) {
  try {
    await AuditLog.create({ actorId, action, entity, entityId: String(entityId || ''), metadata });
  } catch (error) {
    console.error('[ZOTRIX] audit log failed:', error.message);
  }
}
