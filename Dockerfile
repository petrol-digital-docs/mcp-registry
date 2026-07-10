FROM node:20-alpine

WORKDIR /app

# Zero runtime dependencies — just copy the app and data.
COPY package.json ./
COPY server.js ./
COPY registry.json ./

ENV PORT=8080
EXPOSE 8080

USER node
CMD ["node", "server.js"]
