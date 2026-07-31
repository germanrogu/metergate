FROM node:22.14-slim

WORKDIR /workspace

COPY package.json package-lock.json* ./
COPY apps/api/package.json apps/api/package.json
COPY packages/shared/package.json packages/shared/package.json

RUN npm install

COPY packages/shared packages/shared
COPY apps/api apps/api

WORKDIR /workspace/apps/api

CMD ["npm", "run", "dev"]
