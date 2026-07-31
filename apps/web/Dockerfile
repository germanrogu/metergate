FROM node:22.14-slim

WORKDIR /workspace

COPY package.json package-lock.json* ./
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json

RUN npm install

COPY packages/shared packages/shared
COPY apps/web apps/web

WORKDIR /workspace/apps/web

CMD ["npm", "run", "dev"]
