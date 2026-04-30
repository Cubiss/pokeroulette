FROM golang:1.22-alpine AS builder
WORKDIR /src
COPY server/go.mod server/go.sum ./
RUN go mod download
COPY server/ .
RUN CGO_ENABLED=0 go build -o /server ./cmd/server

FROM alpine:3.20
WORKDIR /app
COPY --from=builder /server /app/server
COPY client/ /app/client/
RUN mkdir -p /app/data
ENV CLIENT_DIR=/app/client
EXPOSE 8080
ENTRYPOINT ["/app/server"]
