import type { Kysely } from 'kysely';
import type { AccountRow, Database } from '../schema';

export async function listAccounts(db: Kysely<Database>): Promise<AccountRow[]> {
  return db.selectFrom('accounts').selectAll().orderBy('id').execute();
}

export async function upsertAccount(
  db: Kysely<Database>,
  input: { accountSeq: string; alias?: string | null; accountType?: string | null },
): Promise<void> {
  await db
    .insertInto('accounts')
    .values({
      account_seq: input.accountSeq,
      alias: input.alias ?? null,
      account_type: input.accountType ?? null,
    })
    .onConflict((oc) =>
      oc.column('account_seq').doUpdateSet({
        alias: input.alias ?? null,
        account_type: input.accountType ?? null,
      }),
    )
    .execute();
}
