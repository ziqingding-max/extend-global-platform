
import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import * as schema from "../../../drizzle/schema";
import * as relations from "../../../drizzle/relations";

let _db: ReturnType<typeof drizzle<typeof schema & typeof relations>> | null = null;

export function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      // Ensure the URL starts with file: if it's a local file path
      const url = process.env.DATABASE_URL.includes("://") 
        ? process.env.DATABASE_URL 
        : `file:${process.env.DATABASE_URL}`;
        
      const client = createClient({ url });
      _db = drizzle(client, { schema: { ...schema, ...relations } });
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}
