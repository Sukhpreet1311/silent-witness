# Use official lightweight Node.js image
FROM node:20-slim

WORKDIR /app

# Copy dependency manifests
COPY package*.json ./

# Install all dependencies (including devDependencies for TypeScript & Vite compilation)
RUN npm ci

# Copy all source files
COPY . .

# Build the React frontend production assets (outputs to ./dist)
RUN npm run build

# Prune development dependencies to keep the image slim
RUN npm prune --production

# Expose port 8080 (default Cloud Run port)
EXPOSE 8080

# Start the Express server
CMD ["node", "server.js"]
