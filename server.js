const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const db = new sqlite3.Database('./library.db', (err) => {
  if (err) console.error('Database connection error:', err.message);
  else console.log('Connected to SQLite database.');
});

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS books (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      isbn TEXT NOT NULL,
      title TEXT NOT NULL,
      author TEXT NOT NULL,
      total INTEGER NOT NULL,
      available INTEGER NOT NULL
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS loans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      book_id INTEGER NOT NULL,
      book_title TEXT NOT NULL,
      student_name TEXT NOT NULL,
      student_id TEXT NOT NULL,
      due_date TEXT NOT NULL,
      FOREIGN KEY (book_id) REFERENCES books(id)
    )
  `);

  db.get('SELECT COUNT(*) AS count FROM books', (err, row) => {
    if (row && row.count === 0) {
      const stmt = db.prepare('INSERT INTO books (isbn, title, author, total, available) VALUES (?, ?, ?, ?, ?)');
      stmt.run('LIB-101', 'Things Fall Apart', 'Chinua Achebe', 4, 4);
      stmt.run('LIB-102', 'Introduction to Algorithms', 'Thomas H. Cormen', 2, 2);
      stmt.run('LIB-103', 'The Beautyful Ones Are Not Yet Born', 'Ayi Kwei Armah', 3, 3);
      stmt.finalize();
    }
  });
});

app.get('/api/data', (req, res) => {
  db.all('SELECT * FROM books ORDER BY id DESC', [], (err, books) => {
    if (err) return res.status(500).json({ error: err.message });
    db.all('SELECT * FROM loans ORDER BY id DESC', [], (err, loans) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ books, loans });
    });
  });
});

app.post('/api/books', (req, res) => {
  const { isbn, title, author, copies } = req.body;
  const sql = 'INSERT INTO books (isbn, title, author, total, available) VALUES (?, ?, ?, ?, ?)';
  db.run(sql, [isbn, title, author, copies, copies], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ id: this.lastID });
  });
});

app.delete('/api/books/:id', (req, res) => {
  const bookId = req.params.id;
  db.get('SELECT COUNT(*) AS count FROM loans WHERE book_id = ?', [bookId], (err, row) => {
    if (row.count > 0) {
      return res.status(400).json({ error: 'Cannot delete a book with active student loans.' });
    }
    db.run('DELETE FROM books WHERE id = ?', [bookId], (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true });
    });
  });
});

app.post('/api/loans', (req, res) => {
  const { bookId, studentName, studentId, dueDate } = req.body;
  db.get('SELECT title, available FROM books WHERE id = ?', [bookId], (err, book) => {
    if (!book || book.available < 1) {
      return res.status(400).json({ error: 'Book is not available.' });
    }
    db.run('UPDATE books SET available = available - 1 WHERE id = ?', [bookId], (err) => {
      if (err) return res.status(500).json({ error: err.message });
      const sql = 'INSERT INTO loans (book_id, book_title, student_name, student_id, due_date) VALUES (?, ?, ?, ?, ?)';
      db.run(sql, [bookId, book.title, studentName, studentId, dueDate], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: this.lastID });
      });
    });
  });
});

app.post('/api/loans/:id/return', (req, res) => {
  const loanId = req.params.id;
  db.get('SELECT book_id FROM loans WHERE id = ?', [loanId], (err, loan) => {
    if (!loan) return res.status(404).json({ error: 'Loan record not found.' });
    db.run('DELETE FROM loans WHERE id = ?', [loanId], (err) => {
      if (err) return res.status(500).json({ error: err.message });
      db.run('UPDATE books SET available = available + 1 WHERE id = ? AND available < total', [loan.book_id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
      });
    });
  });
});

app.listen(PORT, () => {
  console.log(`Library server running at http://localhost:${PORT}`);
});
