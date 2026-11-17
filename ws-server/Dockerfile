FROM oven/bun:1

WORKDIR /app

COPY ./package.json ./package.json
COPY ./bun.lock ./bun.lock

RUN bun install --frozen-lockfile

COPY . .

CMD ["bun", "index.ts" ]