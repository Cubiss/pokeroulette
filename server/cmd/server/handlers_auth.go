package main

import (
	"encoding/json"
	"net/http"
	"regexp"
	"strings"

	"git.cubiss.cz/Cubiss/pokeroulette/server/internal/auth"
	"git.cubiss.cz/Cubiss/pokeroulette/server/internal/db"
	"golang.org/x/crypto/bcrypt"
)

var usernameRe = regexp.MustCompile(`^[a-zA-Z0-9_-]{1,32}$`)

func handleRegister(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Username == "" || body.Password == "" {
		jsonError(w, http.StatusBadRequest, "username and password required")
		return
	}
	if !usernameRe.MatchString(body.Username) {
		jsonError(w, http.StatusBadRequest, "username must be 1–32 chars: letters, digits, hyphens, underscores")
		return
	}
	lower := strings.ToLower(body.Username)
	hash, err := bcrypt.GenerateFromPassword([]byte(body.Password), bcrypt.DefaultCost)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, "internal error")
		return
	}
	id, err := database.CreateUser(lower, string(hash))
	if err != nil {
		if db.IsDuplicateError(err) {
			jsonError(w, http.StatusConflict, "username already taken")
			return
		}
		jsonError(w, http.StatusInternalServerError, "internal error")
		return
	}
	tok, err := auth.IssueToken(id, lower, 0, jwtSecret)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, "internal error")
		return
	}
	jsonResponse(w, http.StatusOK, map[string]string{"token": tok})
}

func handleLogin(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Username == "" || body.Password == "" {
		jsonError(w, http.StatusBadRequest, "username and password required")
		return
	}
	user, err := database.GetUserByUsername(strings.ToLower(body.Username))
	if err != nil || user == nil {
		jsonError(w, http.StatusUnauthorized, "invalid credentials")
		return
	}
	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(body.Password)); err != nil {
		jsonError(w, http.StatusUnauthorized, "invalid credentials")
		return
	}
	tok, err := auth.IssueToken(user.ID, user.Username, user.TokenVersion, jwtSecret)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, "internal error")
		return
	}
	jsonResponse(w, http.StatusOK, map[string]string{"token": tok})
}

func handleChangePassword(w http.ResponseWriter, r *http.Request) {
	claims := claimsFromContext(r)
	var body struct {
		CurrentPassword string `json:"current_password"`
		NewPassword     string `json:"new_password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.CurrentPassword == "" || body.NewPassword == "" {
		jsonError(w, http.StatusBadRequest, "current_password and new_password required")
		return
	}
	user, err := database.GetUserByID(claims.UserID)
	if err != nil || user == nil {
		jsonError(w, http.StatusInternalServerError, "internal error")
		return
	}
	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(body.CurrentPassword)); err != nil {
		jsonError(w, http.StatusUnauthorized, "current password incorrect")
		return
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(body.NewPassword), bcrypt.DefaultCost)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, "internal error")
		return
	}
	if err := database.UpdatePassword(claims.UserID, string(hash)); err != nil {
		jsonError(w, http.StatusInternalServerError, "internal error")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
