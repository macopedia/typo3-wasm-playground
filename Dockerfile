FROM node:20 AS builder
WORKDIR /app

RUN apt-get update && apt-get install -y git

COPY package*.json ./
RUN npm install

COPY . .

RUN git submodule update --init --recursive

RUN npx nx reset

RUN npm run build
ENV TYPO3_CONTEXT="Production/Latest"

FROM nginx:alpine
COPY --from=builder /app/dist/packages/playground/wasm-typo3-net /usr/share/nginx/html
