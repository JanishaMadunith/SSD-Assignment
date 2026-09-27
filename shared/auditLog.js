async function writeAuditLog(pool, entry) {
  try {
    await pool.query(
      `
        INSERT INTO audit_log (action, actor_id, actor_role, ip, target_id, detail)
        VALUES ($1, $2, $3, $4, $5, $6::jsonb)
      `,
      [
        entry.action,
        entry.actorId ?? null,
        entry.actorRole ?? null,
        entry.ip ?? null,
        entry.targetId ?? null,
        JSON.stringify(entry.detail || {}),
      ]
    );
  } catch (error) {
    console.error('[AuditLog] Failed to write audit entry:', error.message);
  }
}

module.exports = { writeAuditLog };