import type { Kysely } from 'kysely';
import type { Database } from '../schema';

export async function getSetting(db: Kysely<Database>, key: string): Promise<string | null> {
  const row = await db.selectFrom('settings').select('value').where('key', '=', key).executeTakeFirst();
  return row?.value ?? null;
}

export async function setSetting(db: Kysely<Database>, key: string, value: string): Promise<void> {
  await db
    .insertInto('settings')
    .values({ key, value })
    .onConflict((oc) => oc.column('key').doUpdateSet({ value }))
    .execute();
}
