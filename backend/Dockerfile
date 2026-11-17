FROM oven/bun:1

WORKDIR /app

COPY ./package.json ./package.json
COPY ./bun.lock ./bun.lock

RUN bun install --frozen-lockfile

COPY ./prisma ./prisma

RUN bunx prisma generate

COPY . .

CMD ["bun", "run", "src/index.ts"]

