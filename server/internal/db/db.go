package db

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	_ "modernc.org/sqlite"
)

type DB struct {
	*sql.DB
}

func Open(path string) (*DB, error) {
	sqldb, err := sql.Open("sqlite", path+"?_journal_mode=WAL&_foreign_keys=on")
	if err != nil {
		return nil, err
	}
	d := &DB{sqldb}
	return d, d.migrate()
}

func (d *DB) migrate() error {
	_, err := d.Exec(`
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  token_version INTEGER NOT NULL DEFAULT 0,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS rooms (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  code       TEXT NOT NULL UNIQUE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS room_members (
  room_id    INTEGER NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role       TEXT NOT NULL CHECK(role IN ('host', 'moderator', 'guest')),
  joined_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (room_id, user_id)
);

CREATE TABLE IF NOT EXISTS room_lists (
  room_id    INTEGER NOT NULL REFERENCES rooms(id) ON DELETE CASCADE PRIMARY KEY,
  lists_json TEXT NOT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);`)
	return err
}

// ── USERS ──

type User struct {
	ID           int64
	Username     string
	PasswordHash string
	TokenVersion int
}

func (d *DB) CreateUser(username, hash string) (int64, error) {
	res, err := d.Exec(
		`INSERT INTO users (username, password_hash) VALUES (?, ?)`,
		username, hash,
	)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func (d *DB) GetUserByUsername(username string) (*User, error) {
	u := &User{}
	err := d.QueryRow(
		`SELECT id, username, password_hash, token_version FROM users WHERE username = ?`,
		username,
	).Scan(&u.ID, &u.Username, &u.PasswordHash, &u.TokenVersion)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	return u, err
}

func (d *DB) GetUserByID(id int64) (*User, error) {
	u := &User{}
	err := d.QueryRow(
		`SELECT id, username, password_hash, token_version FROM users WHERE id = ?`,
		id,
	).Scan(&u.ID, &u.Username, &u.PasswordHash, &u.TokenVersion)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	return u, err
}

func (d *DB) UpdatePassword(userID int64, newHash string) error {
	_, err := d.Exec(
		`UPDATE users SET password_hash = ?, token_version = token_version + 1 WHERE id = ?`,
		newHash, userID,
	)
	return err
}

// ── ROOMS ──

type Lists struct {
	Pool []string `json:"pool"`
	Done []string `json:"done"`
	Todo []string `json:"todo"`
}

type Member struct {
	UserID string `json:"user_id"`
	Role   string `json:"role"`
}

func (d *DB) CreateRoom(code string, lists Lists) error {
	tx, err := d.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	res, err := tx.Exec(`INSERT INTO rooms (code) VALUES (?)`, code)
	if err != nil {
		return err
	}
	roomID, _ := res.LastInsertId()

	j, _ := json.Marshal(lists)
	_, err = tx.Exec(`INSERT INTO room_lists (room_id, lists_json) VALUES (?, ?)`, roomID, string(j))
	if err != nil {
		return err
	}
	return tx.Commit()
}

func (d *DB) GetRoomID(code string) (int64, error) {
	var id int64
	err := d.QueryRow(`SELECT id FROM rooms WHERE code = ?`, code).Scan(&id)
	if err == sql.ErrNoRows {
		return 0, nil
	}
	return id, err
}

func (d *DB) AddMember(roomID, userID int64, role string) error {
	_, err := d.Exec(
		`INSERT OR IGNORE INTO room_members (room_id, user_id, role) VALUES (?, ?, ?)`,
		roomID, userID, role,
	)
	return err
}

func (d *DB) GetMemberRole(roomID, userID int64) (string, error) {
	var role string
	err := d.QueryRow(
		`SELECT role FROM room_members WHERE room_id = ? AND user_id = ?`,
		roomID, userID,
	).Scan(&role)
	if err == sql.ErrNoRows {
		return "", nil
	}
	return role, err
}

func (d *DB) GetMembers(roomID int64) ([]Member, error) {
	rows, err := d.Query(
		`SELECT u.username, rm.role FROM room_members rm JOIN users u ON u.id = rm.user_id WHERE rm.room_id = ?`,
		roomID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var members []Member
	for rows.Next() {
		var m Member
		if err := rows.Scan(&m.UserID, &m.Role); err != nil {
			return nil, err
		}
		members = append(members, m)
	}
	if members == nil {
		members = []Member{}
	}
	return members, nil
}

func (d *DB) GetLists(roomID int64) (Lists, error) {
	var j string
	err := d.QueryRow(`SELECT lists_json FROM room_lists WHERE room_id = ?`, roomID).Scan(&j)
	if err != nil {
		return Lists{}, err
	}
	var l Lists
	json.Unmarshal([]byte(j), &l)
	if l.Pool == nil {
		l.Pool = []string{}
	}
	if l.Done == nil {
		l.Done = []string{}
	}
	if l.Todo == nil {
		l.Todo = []string{}
	}
	return l, nil
}

func (d *DB) UpdateLists(roomID int64, lists Lists) error {
	j, _ := json.Marshal(lists)
	_, err := d.Exec(
		`UPDATE room_lists SET lists_json = ?, updated_at = ? WHERE room_id = ?`,
		string(j), time.Now(), roomID,
	)
	return err
}

func (d *DB) SetMemberRole(roomID int64, username, role string) error {
	if role == "host" {
		tx, err := d.Begin()
		if err != nil {
			return err
		}
		defer tx.Rollback()
		_, err = tx.Exec(
			`UPDATE room_members SET role = 'moderator' WHERE room_id = ? AND role = 'host'`,
			roomID,
		)
		if err != nil {
			return err
		}
		_, err = tx.Exec(
			`UPDATE room_members SET role = 'host' WHERE room_id = ? AND user_id = (SELECT id FROM users WHERE username = ?)`,
			roomID, username,
		)
		if err != nil {
			return err
		}
		return tx.Commit()
	}
	_, err := d.Exec(
		`UPDATE room_members SET role = ? WHERE room_id = ? AND user_id = (SELECT id FROM users WHERE username = ?)`,
		role, roomID, username,
	)
	return err
}

func (d *DB) RemoveMember(roomID, userID int64) error {
	_, err := d.Exec(`DELETE FROM room_members WHERE room_id = ? AND user_id = ?`, roomID, userID)
	return err
}

func (d *DB) MemberCount(roomID int64) (int, error) {
	var count int
	err := d.QueryRow(`SELECT COUNT(*) FROM room_members WHERE room_id = ?`, roomID).Scan(&count)
	return count, err
}

func (d *DB) DeleteRoom(code string) error {
	_, err := d.Exec(`DELETE FROM rooms WHERE code = ?`, code)
	return err
}

func (d *DB) GetMemberUsername(roomID int64, username string) (bool, error) {
	var count int
	err := d.QueryRow(
		`SELECT COUNT(*) FROM room_members rm JOIN users u ON u.id = rm.user_id WHERE rm.room_id = ? AND u.username = ?`,
		roomID, username,
	).Scan(&count)
	return count > 0, err
}

func IsDuplicateError(err error) bool {
	return err != nil && (strings.Contains(err.Error(), "UNIQUE constraint failed") || strings.Contains(err.Error(), "SQLITE_CONSTRAINT"))
}

func ValidRole(r string) bool {
	return r == "host" || r == "moderator" || r == "guest"
}

var ErrNotFound = fmt.Errorf("not found")
