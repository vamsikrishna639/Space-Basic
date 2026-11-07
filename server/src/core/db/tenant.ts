import type { Schema, Query, Aggregate } from 'mongoose';

/**
 * tenantScope plugin (docs/architecture.md §6): every query on a tenant-owned model MUST filter by
 * institutionId, or it throws (fail closed). The only escape hatch is an explicit, grep-able
 *   Model.findOne({...}).setOptions({ unscoped: '<reason>' })
 * used for the documented global lookups (sign-in by email/phone, refresh by token hash, QR token jti).
 */
const QUERY_OPS = [
  'find', 'findOne', 'findOneAndUpdate', 'findOneAndDelete', 'findOneAndReplace',
  'updateOne', 'updateMany', 'deleteOne', 'deleteMany', 'replaceOne', 'countDocuments', 'distinct',
] as const;

export class TenantScopeError extends Error {}

export function tenantScope(schema: Schema): void {
  for (const op of QUERY_OPS) {
    schema.pre(op as 'find', function (this: Query<unknown, unknown>) {
      const opts = this.getOptions() as { unscoped?: string };
      if (opts.unscoped) return;
      const filter = this.getFilter() as Record<string, unknown>;
      if (!filter || filter.institutionId === undefined || filter.institutionId === null) {
        throw new TenantScopeError(`tenantScope: ${op} on ${this.model.modelName} without institutionId`);
      }
    });
  }
  schema.pre('aggregate', function (this: Aggregate<unknown>) {
    if ((this.options as { unscoped?: string }).unscoped) return;
    const first = this.pipeline()[0] as { $match?: Record<string, unknown> } | undefined;
    if (!first?.$match || first.$match.institutionId === undefined) {
      throw new TenantScopeError('tenantScope: aggregate must start with $match on institutionId');
    }
  });
}
