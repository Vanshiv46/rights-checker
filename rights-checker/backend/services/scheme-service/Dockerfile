# Build context: the backend/ folder (see docker-compose.yml). Plain JavaScript: no build step.
FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/common/package.json packages/common/
COPY services/scheme-service/package.json services/scheme-service/
RUN npm ci --omit=dev --workspace @rec/common --workspace @rec/scheme-service && npm cache clean --force
COPY packages/common/src packages/common/src
COPY services/scheme-service/src services/scheme-service/src
COPY services/scheme-service/.sequelizerc services/scheme-service/.sequelizerc
COPY services/scheme-service/migrations services/scheme-service/migrations
COPY services/scheme-service/seeders services/scheme-service/seeders
COPY services/scheme-service/seed-data services/scheme-service/seed-data
WORKDIR /app/services/scheme-service
USER node
EXPOSE 4003
CMD ["node", "src/server.js"]
