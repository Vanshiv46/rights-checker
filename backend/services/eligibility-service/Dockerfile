# Build context: the backend/ folder (see docker-compose.yml). Plain JavaScript: no build step.
FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/common/package.json packages/common/
COPY services/eligibility-service/package.json services/eligibility-service/
RUN npm ci --omit=dev --workspace @rec/common --workspace @rec/eligibility-service && npm cache clean --force
COPY packages/common/src packages/common/src
COPY services/eligibility-service/src services/eligibility-service/src
COPY services/eligibility-service/.sequelizerc services/eligibility-service/.sequelizerc
COPY services/eligibility-service/migrations services/eligibility-service/migrations
COPY services/eligibility-service/seeders services/eligibility-service/seeders
WORKDIR /app/services/eligibility-service
USER node
EXPOSE 4002
CMD ["node", "src/server.js"]
