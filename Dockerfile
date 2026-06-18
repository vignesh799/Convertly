FROM node:22-bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
      libreoffice-writer \
      libreoffice-core \
      fonts-dejavu \
      fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .

ENV NODE_ENV=production
ENV HOST=0.0.0.0
EXPOSE 10000

CMD ["npm", "start"]
