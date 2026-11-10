import {sqliteTable,text,integer} from 'drizzle-orm/sqlite-core';
export const settings=sqliteTable('settings',{key:text('key').primaryKey(),value:text('value').notNull()});
export const snapshots=sqliteTable('snapshots',{id:text('id').primaryKey(),symbol:text('symbol').notNull(),tf:text('tf').notNull(),data:text('data').notNull(),updated:text('updated').notNull()});
export const reports=sqliteTable('reports',{id:integer('id').primaryKey({autoIncrement:true}),symbol:text('symbol').notNull(),tf:text('tf').notNull(),data:text('data').notNull(),created:text('created').notNull()});
