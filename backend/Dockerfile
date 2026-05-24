FROM rust:alpine AS builder

RUN apk add --no-cache musl-dev

WORKDIR /app

# Copy everything, including the vendor folder and project files
COPY . .

# Create the .cargo directory, then force‑create the vendor configuration
RUN mkdir -p .cargo && \
    echo '[source.crates-io]' > .cargo/config.toml && \
    echo 'replace-with = "vendored-sources"' >> .cargo/config.toml && \
    echo '[source.vendored-sources]' >> .cargo/config.toml && \
    echo 'directory = "vendor"' >> .cargo/config.toml

# Build completely offline – all crates are already in ./vendor
RUN cargo build --release --offline

# ── Runtime stage ──
FROM alpine:latest

RUN apk --no-cache add ca-certificates

COPY --from=builder /app/target/release/backend /app/server
RUN chmod +x /app/server

EXPOSE 8080
CMD ["/app/server"]