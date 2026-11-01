# Build context: the backend/ folder (see docker-compose.yml). Plain JavaScript: no build step.
FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/common/package.json packages/common/
COPY services/voice-service/package.json services/voice-service/
RUN npm ci --omit=dev --workspace @rec/common --workspace @rec/voice-service && npm cache clean --force
COPY packages/common/src packages/common/src
COPY services/voice-service/src services/voice-service/src
WORKDIR /app/services/voice-service
USER node
EXPOSE 4005
CMD ["node", "src/server.js"]
