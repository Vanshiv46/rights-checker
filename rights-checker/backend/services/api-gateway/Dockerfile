# Build context: the backend/ folder (see docker-compose.yml). Plain JavaScript: no build step.
FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/common/package.json packages/common/
COPY services/api-gateway/package.json services/api-gateway/
RUN npm ci --omit=dev --workspace @rec/common --workspace @rec/api-gateway && npm cache clean --force
COPY packages/common/src packages/common/src
COPY services/api-gateway/src services/api-gateway/src
COPY services/api-gateway/.sequelizerc services/api-gateway/.sequelizerc
COPY services/api-gateway/migrations services/api-gateway/migrations
COPY services/api-gateway/seeders services/api-gateway/seeders
WORKDIR /app/services/api-gateway
USER node
EXPOSE 4000
CMD ["node", "src/server.js"]
