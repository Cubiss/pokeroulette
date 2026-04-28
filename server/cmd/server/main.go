package main

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"strings"

	"github.com/cubiss/pokeroulette-server/internal/auth"
	"github.com/cubiss/pokeroulette-server/internal/db"
	"github.com/cubiss/pokeroulette-server/internal/rooms"
)

var (
	database       *db.DB
	hub            *rooms.Hub
	jwtSecret      []byte
	allowedOrigins []string
)

func main() {
	port   := envOr("PORT", "8080")
	dbPath := envOr("DB_PATH", "./data/pokeroulette.db")
	secret := os.Getenv("JWT_SECRET")
	if secret == "" {
		log.Fatal("JWT_SECRET is required")
	}
	jwtSecret = []byte(secret)

	allowedOrigins = strings.Split(envOr("ALLOWED_ORIGINS", "*"), ",")

	if idx := strings.LastIndex(dbPath, "/"); idx > 0 {
		if err := os.MkdirAll(dbPath[:idx], 0755); err != nil {
			log.Fatalf("mkdir data: %v", err)
		}
	}

	var err error
	database, err = db.Open(dbPath)
	if err != nil {
		log.Fatalf("open db: %v", err)
	}
	hub = rooms.NewHub()

	mux := http.NewServeMux()

	// Auth
	mux.HandleFunc("POST /api/v1/auth/register", handleRegister)
	mux.HandleFunc("POST /api/v1/auth/login", handleLogin)
	mux.HandleFunc("PUT /api/v1/auth/password", requireAuth(handleChangePassword))

	// Rooms
	mux.HandleFunc("POST /api/v1/rooms", requireAuth(handleCreateRoom))
	mux.HandleFunc("POST /api/v1/rooms/{code}/join", requireAuth(handleJoinRoom))
	mux.HandleFunc("POST /api/v1/rooms/{code}/leave", requireAuth(handleLeaveRoom))
	mux.HandleFunc("DELETE /api/v1/rooms/{code}", requireAuth(handleCloseRoom))
	mux.HandleFunc("PUT /api/v1/rooms/{code}/lists", requireAuth(handleUpdateLists))
	mux.HandleFunc("PUT /api/v1/rooms/{code}/config", requireAuth(handleUpdateConfig))
	mux.HandleFunc("PUT /api/v1/rooms/{code}/members/{username}/role", requireAuth(handleAssignRole))
	mux.HandleFunc("GET /api/v1/rooms/{code}/events", handleSSE)

	// API docs
	mux.HandleFunc("GET /api/v1/openapi.yaml", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/yaml")
		w.Write(openapiSpec)
	})
	mux.HandleFunc("GET /docs", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Write(swaggerUI)
	})

	// Static client files
	clientDir := envOr("CLIENT_DIR", "../client")
	mux.Handle("/", http.FileServer(http.Dir(clientDir)))

	log.Printf("listening on :%s (client from %s)", port, clientDir)
	log.Fatal(http.ListenAndServe(":"+port, corsMiddleware(mux)))
}

// ── MIDDLEWARE ──

type contextKey string

const claimsKey contextKey = "claims"

func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		allowed := allowedOrigins[0] == "*"
		if !allowed {
			for _, o := range allowedOrigins {
				if strings.TrimSpace(o) == origin {
					allowed = true
					break
				}
			}
		}
		if allowed {
			if allowedOrigins[0] == "*" {
				w.Header().Set("Access-Control-Allow-Origin", "*")
			} else {
				w.Header().Set("Access-Control-Allow-Origin", origin)
				w.Header().Set("Vary", "Origin")
			}
		}
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		w.Header().Set("Access-Control-Expose-Headers", "X-Refreshed-Token")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func requireAuth(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims, err := extractClaims(r)
		if err != nil || claims == nil {
			jsonError(w, http.StatusUnauthorized, "unauthorized")
			return
		}
		user, err := database.GetUserByID(claims.UserID)
		if err != nil || user == nil || user.TokenVersion != claims.TokenVersion {
			jsonError(w, http.StatusUnauthorized, "token invalidated")
			return
		}
		if auth.NeedsRefresh(claims) {
			if tok, err := auth.IssueToken(user.ID, user.Username, user.TokenVersion, jwtSecret); err == nil {
				w.Header().Set("X-Refreshed-Token", tok)
			}
		}
		r = r.WithContext(context.WithValue(r.Context(), claimsKey, claims))
		next(w, r)
	}
}

func extractClaims(r *http.Request) (*auth.Claims, error) {
	tok := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
	if tok == "" {
		tok = r.URL.Query().Get("token")
	}
	if tok == "" {
		return nil, nil
	}
	return auth.ParseToken(tok, jwtSecret)
}

func claimsFromContext(r *http.Request) *auth.Claims {
	v := r.Context().Value(claimsKey)
	if v == nil {
		return nil
	}
	return v.(*auth.Claims)
}

// ── HELPERS ──

func jsonResponse(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

func jsonError(w http.ResponseWriter, status int, msg string) {
	jsonResponse(w, status, map[string]string{"error": msg})
}

func envOr(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}
