import type { DatabaseSync, SQLInputValue, StatementSync } from 'node:sqlite';
import { SqliteDialect, type SqliteDatabase, type SqliteStatement } from 'kysely';

// node:sqlite의 StatementSync는 kysely가 기대하는 better-sqlite3 스타일 인터페이스와
// 두 가지가 다르다: all()/run()/iterate()가 파라미터 배열 하나가 아니라 가변인자를 받고,
// 이 문(statement)이 행을 반환하는지 알려주는 `reader` 속성이 없다(컬럼 개수로 대신 판별).
class NodeSqliteStatementAdapter implements SqliteStatement {
  readonly reader: boolean;

  constructor(private readonly stmt: StatementSync) {
    this.reader = this.stmt.columns().length > 0;
  }

  all(parameters: ReadonlyArray<unknown>): unknown[] {
    return this.stmt.all(...(parameters as SQLInputValue[]));
  }

  run(parameters: ReadonlyArray<unknown>): { changes: number | bigint; lastInsertRowid: number | bigint } {
    return this.stmt.run(...(parameters as SQLInputValue[]));
  }

  iterate(parameters: ReadonlyArray<unknown>): IterableIterator<unknown> {
    return this.stmt.iterate(...(parameters as SQLInputValue[])) as IterableIterator<unknown>;
  }
}

class NodeSqliteDatabaseAdapter implements SqliteDatabase {
  constructor(private readonly db: DatabaseSync) {}

  close(): void {
    this.db.close();
  }

  prepare(sql: string): SqliteStatement {
    return new NodeSqliteStatementAdapter(this.db.prepare(sql));
  }
}

export function createNodeSqliteDialect(db: DatabaseSync): SqliteDialect {
  return new SqliteDialect({ database: new NodeSqliteDatabaseAdapter(db) });
}
