package main

import (
	"encoding/json"
	"net/http"
	"regexp"
	"strings"

	"git.cubiss.cz/Cubiss/pokeroulette/server/internal/db"
)

var roomCodeRe = regexp.MustCompile(`^[a-z0-9]([a-z0-9-]*[a-z0-9])?$`)

func validRoomCode(code string) bool {
	return len(code) >= 3 && len(code) <= 32 && roomCodeRe.MatchString(code)
}

func handleCreateRoom(w http.ResponseWriter, r *http.Request) {
	claims := claimsFromContext(r)
	var body struct {
		Code   string          `json:"code"`
		Lists  db.Lists        `json:"lists"`
		Config json.RawMessage `json:"config"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		jsonError(w, http.StatusBadRequest, "invalid request")
		return
	}
	code := strings.ToLower(body.Code)
	if !validRoomCode(code) {
		jsonError(w, http.StatusBadRequest, "invalid room code")
		return
	}
	if err := database.CreateRoom(code, body.Lists, body.Config); err != nil {
		if db.IsDuplicateError(err) {
			jsonError(w, http.StatusConflict, "room code already in use")
			return
		}
		jsonError(w, http.StatusInternalServerError, "internal error")
		return
	}
	roomID, _ := database.GetRoomID(code)
	if err := database.AddMember(roomID, claims.UserID, "host"); err != nil {
		jsonError(w, http.StatusInternalServerError, "internal error")
		return
	}
	jsonResponse(w, http.StatusCreated, map[string]string{"code": code})
}

func handleJoinRoom(w http.ResponseWriter, r *http.Request) {
	claims := claimsFromContext(r)
	code := r.PathValue("code")

	roomID, err := database.GetRoomID(code)
	if err != nil || roomID == 0 {
		jsonError(w, http.StatusNotFound, "room not found")
		return
	}
	role, err := database.GetMemberRole(roomID, claims.UserID)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, "internal error")
		return
	}
	if role == "" {
		if err := database.AddMember(roomID, claims.UserID, "guest"); err != nil {
			jsonError(w, http.StatusInternalServerError, "internal error")
			return
		}
		role = "guest"
		hub.Broadcast(code, "member_joined", map[string]string{"user_id": claims.Username, "role": "guest"}, claims.Username)
	}
	members, _ := database.GetMembers(roomID)
	online := hub.OnlineUsernames(code)
	for i := range members {
		members[i].Online = online[members[i].UserID]
	}
	lists, _  := database.GetLists(roomID)
	config, _ := database.GetRoomConfig(roomID)
	jsonResponse(w, http.StatusOK, map[string]any{
		"code": code, "role": role, "lists": lists, "members": members, "config": config,
	})
}

func handleLeaveRoom(w http.ResponseWriter, r *http.Request) {
	claims := claimsFromContext(r)
	code := r.PathValue("code")

	roomID, err := database.GetRoomID(code)
	if err != nil || roomID == 0 {
		jsonError(w, http.StatusNotFound, "room not found")
		return
	}
	role, err := database.GetMemberRole(roomID, claims.UserID)
	if err != nil || role == "" {
		jsonError(w, http.StatusNotFound, "not a member of this room")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func handleCloseRoom(w http.ResponseWriter, r *http.Request) {
	claims := claimsFromContext(r)
	code := r.PathValue("code")

	roomID, err := database.GetRoomID(code)
	if err != nil || roomID == 0 {
		jsonError(w, http.StatusNotFound, "room not found")
		return
	}
	role, _ := database.GetMemberRole(roomID, claims.UserID)
	if role != "host" {
		jsonError(w, http.StatusForbidden, "only the host can close the room")
		return
	}
	hub.Broadcast(code, "room_closed", map[string]string{"closed_by": claims.Username}, "")
	hub.CloseRoom(code)
	database.DeleteRoom(code)
	w.WriteHeader(http.StatusNoContent)
}

func handleUpdateLists(w http.ResponseWriter, r *http.Request) {
	claims := claimsFromContext(r)
	code := r.PathValue("code")

	roomID, err := database.GetRoomID(code)
	if err != nil || roomID == 0 {
		jsonError(w, http.StatusNotFound, "room not found")
		return
	}
	role, _ := database.GetMemberRole(roomID, claims.UserID)
	if role == "" {
		jsonError(w, http.StatusForbidden, "not a member")
		return
	}
	if role == "guest" {
		jsonError(w, http.StatusForbidden, "guests cannot edit lists")
		return
	}
	var body struct {
		Lists db.Lists `json:"lists"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		jsonError(w, http.StatusBadRequest, "invalid request")
		return
	}
	if err := database.UpdateLists(roomID, body.Lists); err != nil {
		jsonError(w, http.StatusInternalServerError, "internal error")
		return
	}
	hub.Broadcast(code, "lists_updated", map[string]any{
		"lists": body.Lists, "updated_by": claims.Username,
	}, claims.Username)
	w.WriteHeader(http.StatusNoContent)
}

func handleUpdateConfig(w http.ResponseWriter, r *http.Request) {
	claims := claimsFromContext(r)
	code := r.PathValue("code")

	roomID, err := database.GetRoomID(code)
	if err != nil || roomID == 0 {
		jsonError(w, http.StatusNotFound, "room not found")
		return
	}
	role, _ := database.GetMemberRole(roomID, claims.UserID)
	if role == "" {
		jsonError(w, http.StatusForbidden, "not a member")
		return
	}
	if role == "guest" {
		jsonError(w, http.StatusForbidden, "guests cannot update config")
		return
	}
	var body struct {
		Config json.RawMessage `json:"config"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Config == nil {
		jsonError(w, http.StatusBadRequest, "invalid request")
		return
	}
	if err := database.UpdateRoomConfig(roomID, body.Config); err != nil {
		jsonError(w, http.StatusInternalServerError, "internal error")
		return
	}
	hub.Broadcast(code, "config_updated", map[string]any{
		"config": body.Config, "updated_by": claims.Username,
	}, claims.Username)
	w.WriteHeader(http.StatusNoContent)
}

func handleAssignRole(w http.ResponseWriter, r *http.Request) {
	claims := claimsFromContext(r)
	code           := r.PathValue("code")
	targetUsername := r.PathValue("username")

	var body struct {
		Role string `json:"role"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || !db.ValidRole(body.Role) {
		jsonError(w, http.StatusBadRequest, "invalid role")
		return
	}
	roomID, err := database.GetRoomID(code)
	if err != nil || roomID == 0 {
		jsonError(w, http.StatusNotFound, "room not found")
		return
	}
	callerRole, _ := database.GetMemberRole(roomID, claims.UserID)
	if callerRole == "" {
		jsonError(w, http.StatusForbidden, "not a member")
		return
	}
	if callerRole == "guest" {
		jsonError(w, http.StatusForbidden, "guests cannot assign roles")
		return
	}
	if callerRole == "moderator" && body.Role != "guest" {
		jsonError(w, http.StatusForbidden, "moderators can only assign guest role")
		return
	}
	exists, _ := database.GetMemberUsername(roomID, targetUsername)
	if !exists {
		jsonError(w, http.StatusNotFound, "member not found")
		return
	}
	if err := database.SetMemberRole(roomID, targetUsername, body.Role); err != nil {
		jsonError(w, http.StatusInternalServerError, "internal error")
		return
	}
	hub.Broadcast(code, "role_changed", map[string]string{
		"user_id": targetUsername, "role": body.Role, "changed_by": claims.Username,
	}, "")
	w.WriteHeader(http.StatusNoContent)
}
