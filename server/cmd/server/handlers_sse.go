package main

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/cubiss/pokeroulette-server/internal/rooms"
)

func handleSSE(w http.ResponseWriter, r *http.Request) {
	code := r.PathValue("code")

	claims, err := extractClaims(r)
	if err != nil || claims == nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	user, err := database.GetUserByID(claims.UserID)
	if err != nil || user == nil || user.TokenVersion != claims.TokenVersion {
		http.Error(w, "token invalidated", http.StatusUnauthorized)
		return
	}
	roomID, err := database.GetRoomID(code)
	if err != nil || roomID == 0 {
		http.Error(w, "room not found", http.StatusNotFound)
		return
	}
	role, _ := database.GetMemberRole(roomID, claims.UserID)
	if role == "" {
		http.Error(w, "not a member", http.StatusForbidden)
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")

	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming unsupported", http.StatusInternalServerError)
		return
	}

	client := &rooms.Client{
		Username: claims.Username,
		Send:     make(chan []byte, 32),
		Done:     make(chan struct{}),
	}
	hub.AddClient(code, client)
	defer hub.RemoveClient(code, client)

	members, _ := database.GetMembers(roomID)
	lists, _   := database.GetLists(roomID)
	config, _  := database.GetRoomConfig(roomID)
	payload, _ := json.Marshal(map[string]any{"lists": lists, "members": members, "role": role, "config": config})
	w.Write([]byte("event: connected\ndata: " + string(payload) + "\n\n"))
	flusher.Flush()

	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case msg := <-client.Send:
			w.Write(msg)
			flusher.Flush()
		case <-ticker.C:
			w.Write(rooms.Heartbeat())
			flusher.Flush()
		case <-client.Done:
			return
		case <-r.Context().Done():
			return
		}
	}
}
