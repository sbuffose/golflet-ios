/** Predicates for rows that are real GPS fixes.
 *  A reconstructed shot can have a null coordinate or a source other than gps.
 *  GPS aggregates and the routes older clients already decode must not see those rows. */

export function gpsShotSql(alias = "s"): string {
  return `${alias}.lat is not null and ${alias}.lng is not null and coalesce(${alias}.source, 'gps') = 'gps'`;
}

export function manualPuttSql(alias = "s"): string {
  return `(${alias}.club ~* '^(pt|putter)$' or ${alias}.lie = 'green') and coalesce(${alias}.source, 'gps') <> 'gps'`;
}

export function gpsPuttSql(alias = "s"): string {
  return `(${alias}.club ~* '^(pt|putter)$' or ${alias}.lie = 'green') and ${gpsShotSql(alias)}`;
}
