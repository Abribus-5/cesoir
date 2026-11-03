FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --include=dev
COPY . .
RUN npm run build && npm prune --omit=dev
# Les données vivent sur un volume monté ici (DATA_DIR)
ENV DATA_DIR=/data
VOLUME ["/data"]
EXPOSE 5173
CMD ["node", "server/index.js"]
