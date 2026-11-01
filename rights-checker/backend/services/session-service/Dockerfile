# Build context: the backend/ folder (see docker-compose.yml). Plain JavaScript: no build step.
FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/common/package.json packages/common/
COPY services/session-service/package.json services/session-service/
RUN npm ci --omit=dev --workspace @rec/common --workspace @rec/session-service && npm cache clean --force
COPY packages/common/src packages/common/src
COPY services/session-service/src services/session-service/src
COPY services/session-service/.sequelizerc services/session-service/.sequelizerc
COPY services/session-service/migrations services/session-service/migrations
COPY services/session-service/seeders services/session-service/seeders
WORKDIR /app/services/session-service
USER node
EXPOSE 4001
CMD ["node", "src/server.js"]
