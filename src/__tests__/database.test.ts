import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

describe("Database Basic Tests", () => {
  let sqlite: Database.Database;

  beforeEach(() => {
    // Create in-memory SQLite database for testing
    sqlite = new Database(":memory:");
  });

  afterEach(() => {
    sqlite.close();
  });

  describe("SQLite Connection", () => {
    it("should create in-memory database", () => {
      expect(sqlite).toBeDefined();
      expect(sqlite.open).toBe(true);
    });

    it("should execute basic SQL commands", () => {
      sqlite.exec(`
        CREATE TABLE test_table (
          id INTEGER PRIMARY KEY,
          name TEXT NOT NULL
        );
      `);

      const insert = sqlite.prepare("INSERT INTO test_table (name) VALUES (?)");
      const result = insert.run("test name");

      expect(result.changes).toBe(1);
      expect(result.lastInsertRowid).toBe(1);
    });

    it("should query data from tables", () => {
      sqlite.exec(`
        CREATE TABLE movies_test (
          uid TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          year INTEGER
        );
      `);

      const insert = sqlite.prepare(
        "INSERT INTO movies_test (uid, title, year) VALUES (?, ?, ?)",
      );
      insert.run("test-1", "Test Movie", 2024);

      const select = sqlite.prepare("SELECT * FROM movies_test WHERE uid = ?");
      const row = select.get("test-1") as
        | { uid: string; title: string; year: number }
        | undefined;

      expect(row).toBeDefined();
      expect(row?.title).toBe("Test Movie");
      expect(row?.year).toBe(2024);
    });

    it("should enforce unique constraints", () => {
      sqlite.exec(`
        CREATE TABLE unique_test (
          id INTEGER PRIMARY KEY,
          email TEXT UNIQUE
        );
      `);

      const insert = sqlite.prepare(
        "INSERT INTO unique_test (email) VALUES (?)",
      );
      insert.run("test@example.com");

      expect(() => {
        insert.run("test@example.com");
      }).toThrow();
    });

    it("should handle foreign key relationships", () => {
      sqlite.exec(`
        PRAGMA foreign_keys = ON;
        
        CREATE TABLE authors (
          id INTEGER PRIMARY KEY,
          name TEXT NOT NULL
        );
        
        CREATE TABLE books (
          id INTEGER PRIMARY KEY,
          title TEXT NOT NULL,
          author_id INTEGER,
          FOREIGN KEY (author_id) REFERENCES authors (id)
        );
      `);

      const insertAuthor = sqlite.prepare(
        "INSERT INTO authors (name) VALUES (?)",
      );
      const authorResult = insertAuthor.run("Test Author");

      const insertBook = sqlite.prepare(
        "INSERT INTO books (title, author_id) VALUES (?, ?)",
      );
      insertBook.run("Test Book", authorResult.lastInsertRowid);

      const selectBook = sqlite.prepare(`
        SELECT b.title, a.name as author_name 
        FROM books b 
        JOIN authors a ON b.author_id = a.id
      `);
      const book = selectBook.get() as
        | { title: string; author_name: string }
        | undefined;

      expect(book?.title).toBe("Test Book");
      expect(book?.author_name).toBe("Test Author");
    });

    it("should handle transactions", () => {
      sqlite.exec(`
        CREATE TABLE transaction_test (
          id INTEGER PRIMARY KEY,
          value INTEGER
        );
      `);

      const insert = sqlite.prepare(
        "INSERT INTO transaction_test (value) VALUES (?)",
      );

      const transaction = sqlite.transaction((values: number[]) => {
        for (const value of values) {
          insert.run(value);
        }
      });

      transaction([1, 2, 3, 4, 5]);

      const count = sqlite
        .prepare("SELECT COUNT(*) as count FROM transaction_test")
        .get() as { count: number };
      expect(count.count).toBe(5);
    });

    it("should validate data types", () => {
      sqlite.exec(`
        CREATE TABLE type_test (
          id INTEGER PRIMARY KEY,
          text_field TEXT,
          integer_field INTEGER,
          real_field REAL
        );
      `);

      const insert = sqlite.prepare(`
        INSERT INTO type_test (text_field, integer_field, real_field) 
        VALUES (?, ?, ?)
      `);
      insert.run("test string", 42, 3.14);

      const select = sqlite.prepare("SELECT * FROM type_test");
      const row = select.get() as {
        id: number;
        text_field: string;
        integer_field: number;
        real_field: number;
      };

      expect(typeof row.text_field).toBe("string");
      expect(typeof row.integer_field).toBe("number");
      expect(typeof row.real_field).toBe("number");
      expect(row.text_field).toBe("test string");
      expect(row.integer_field).toBe(42);
      expect(row.real_field).toBe(3.14);
    });
  });
});
