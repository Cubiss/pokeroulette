package auth

import (
	"errors"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

const tokenTTL = 30 * 24 * time.Hour
const refreshThreshold = 15 * 24 * time.Hour

type Claims struct {
	UserID       int64  `json:"uid"`
	Username     string `json:"sub"`
	TokenVersion int    `json:"tv"`
	jwt.RegisteredClaims
}

func IssueToken(userID int64, username string, tokenVersion int, secret []byte) (string, error) {
	claims := Claims{
		UserID:       userID,
		Username:     username,
		TokenVersion: tokenVersion,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(tokenTTL)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	}
	tok := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return tok.SignedString(secret)
}

// ParseToken validates and returns claims. Returns nil if invalid.
func ParseToken(tokenStr string, secret []byte) (*Claims, error) {
	tok, err := jwt.ParseWithClaims(tokenStr, &Claims{}, func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, errors.New("unexpected signing method")
		}
		return secret, nil
	})
	if err != nil {
		return nil, err
	}
	claims, ok := tok.Claims.(*Claims)
	if !ok || !tok.Valid {
		return nil, errors.New("invalid token")
	}
	return claims, nil
}

// NeedsRefresh returns true when the token has less than refreshThreshold remaining.
func NeedsRefresh(claims *Claims) bool {
	remaining := time.Until(claims.ExpiresAt.Time)
	return remaining < refreshThreshold
}
