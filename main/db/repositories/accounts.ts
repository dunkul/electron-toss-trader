import type { DatabaseSync } from 'node:sqlite';
import type { AccountRow } from '../schema';

export function listAccounts(db: DatabaseSync): AccountRow[] {
  return db.prepare('SELECT * FROM accounts ORDER BY id').all() as unknown as AccountRow[];
}

export function upsertAccount(
  db: DatabaseSync,
  input: { accountSeq: string; alias?: string | null; accountType?: string | null },
): void {
  db.prepare(
    `INSERT INTO accounts (account_seq, alias, account_type) VALUES (?, ?, ?)
     ON CONFLICT(account_seq) DO UPDATE SET alias = excluded.alias, account_type = excluded.account_type`,
  ).run(input.accountSeq, input.alias ?? null, input.accountType ?? null);
}
