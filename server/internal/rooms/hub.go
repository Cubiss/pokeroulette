package rooms

import (
	"encoding/json"
	"sync"
)

// Client represents one SSE connection.
type Client struct {
	Username string
	Send     chan []byte
	Done     chan struct{}
}

// Hub manages all SSE clients for all rooms.
type Hub struct {
	mu    sync.RWMutex
	rooms map[string]map[*Client]struct{} // roomCode -> set of clients
}

func NewHub() *Hub {
	return &Hub{rooms: make(map[string]map[*Client]struct{})}
}

func (h *Hub) AddClient(roomCode string, c *Client) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.rooms[roomCode] == nil {
		h.rooms[roomCode] = make(map[*Client]struct{})
	}
	h.rooms[roomCode][c] = struct{}{}
}

func (h *Hub) RemoveClient(roomCode string, c *Client) {
	h.mu.Lock()
	defer h.mu.Unlock()
	delete(h.rooms[roomCode], c)
	if len(h.rooms[roomCode]) == 0 {
		delete(h.rooms, roomCode)
	}
}

// Broadcast sends a named SSE event to all clients in the room except excludeUsername.
// Pass empty excludeUsername to broadcast to everyone.
func (h *Hub) Broadcast(roomCode, event string, data any, excludeUsername string) {
	payload, _ := json.Marshal(data)
	msg := formatSSE(event, payload)

	h.mu.RLock()
	clients := make([]*Client, 0, len(h.rooms[roomCode]))
	for c := range h.rooms[roomCode] {
		if c.Username != excludeUsername {
			clients = append(clients, c)
		}
	}
	h.mu.RUnlock()

	for _, c := range clients {
		select {
		case c.Send <- msg:
		default:
			// slow client; drop
		}
	}
}

// CloseRoom closes all SSE connections for a room.
func (h *Hub) CloseRoom(roomCode string) {
	h.mu.Lock()
	clients := h.rooms[roomCode]
	delete(h.rooms, roomCode)
	h.mu.Unlock()

	for c := range clients {
		close(c.Done)
	}
}

func formatSSE(event string, data []byte) []byte {
	out := "event: " + event + "\ndata: " + string(data) + "\n\n"
	return []byte(out)
}

func Heartbeat() []byte {
	return []byte(": ping\n\n")
}
