FROM node:24-bookworm-slim

WORKDIR /app

COPY --chown=node:node . .

USER node

ENV HUSKY=0

RUN npm ci \
    && npm run build \
    && npm prune --omit=dev

ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080

CMD ["npm", "start"]
