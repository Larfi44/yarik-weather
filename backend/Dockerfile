# Dockerfile
FROM alpine:latest

# Install CA certificates for HTTPS
RUN apk --no-cache add ca-certificates

# Copy the pre-built static binary
COPY target/x86_64-unknown-linux-musl/release/yarik-weather /app/server

# Make it executable
RUN chmod +x /app/server

# Expose port
EXPOSE 8080

# Run the server
CMD ["/app/server"]