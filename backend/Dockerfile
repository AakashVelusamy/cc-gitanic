FROM node:23-bullseye-slim

RUN apt-get update && apt-get install -y git curl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
# Change ownership to the non-root 'node' user for security
RUN chown -R node:node /app
USER node

RUN npm ci

# Explicitly copy source code instead of recursive COPY . . to prevent sensitive data leaks
COPY --chown=node:node tsconfig.json ./
COPY --chown=node:node src/ ./src/

RUN npm run build

EXPOSE 3000

# Railway config uses npm start by default
CMD ["npm", "start"]