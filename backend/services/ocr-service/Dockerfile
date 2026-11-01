# Build context: the backend/ folder (see docker-compose.yml). Plain JavaScript: no build step.
FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/common/package.json packages/common/
COPY services/ocr-service/package.json services/ocr-service/
RUN npm ci --omit=dev --workspace @rec/common --workspace @rec/ocr-service && npm cache clean --force
COPY packages/common/src packages/common/src
COPY services/ocr-service/src services/ocr-service/src
WORKDIR /app/services/ocr-service
USER node
EXPOSE 4006
CMD ["node", "src/server.js"]
