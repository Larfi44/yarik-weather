# Stage 1: Build the static binary
FROM rust:alpine AS builder

RUN apk add --no-cache musl-dev

WORKDIR /app
COPY . .
RUN cargo build --release

# Stage 2: Minimal runtime
FROM alpine:latest

# Required for HTTPS requests
RUN apk --no-cache add ca-certificates

COPY --from=builder /app/target/release/backend /app/server
RUN chmod +x /app/server

EXPOSE 8080
CMD ["/app/server"]