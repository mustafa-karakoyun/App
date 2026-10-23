# Depo kökünden derlenir (ortak paket gerekli): docker build -f server/Dockerfile .
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
RUN npm ci --workspace server --include-workspace-root
COPY shared shared
COPY server server
RUN npm run build --workspace server

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
RUN npm ci --workspace server --omit=dev && npm cache clean --force
COPY --from=build /app/server/dist server/dist
COPY server/migrations server/migrations
WORKDIR /app/server
EXPOSE 3000
CMD ["node", "dist/index.js"]
