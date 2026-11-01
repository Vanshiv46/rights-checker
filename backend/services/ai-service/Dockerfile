# Build context: the backend/ folder (see docker-compose.yml). Plain JavaScript: no build step.
FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/common/package.json packages/common/
COPY services/ai-service/package.json services/ai-service/
RUN npm ci --omit=dev --workspace @rec/common --workspace @rec/ai-service && npm cache clean --force
COPY packages/common/src packages/common/src
COPY services/ai-service/src services/ai-service/src
WORKDIR /app/services/ai-service
USER node
EXPOSE 4004
CMD ["node", "src/server.js"]
