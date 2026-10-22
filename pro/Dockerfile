# One small image: the Node service, the website, and the lessons.
FROM node:22.22-slim
WORKDIR /app
ENV NODE_ENV=production PORT=8080
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY server ./server
COPY web ./web
COPY content ./content
USER node
EXPOSE 8080
CMD ["node", "server/index.js"]
