FROM node:22 AS builder
WORKDIR /usr/src/app/
COPY . .
ARG DATABASE_URL
ARG NODE_ENV
ARG FRONTEND_URL
ARG API_URL
ARG PREVIEW_ENV
RUN yarn --frozen-lockfile
RUN FRONTEND_URL=${FRONTEND_URL} API_URL=${API_URL} NODE_ENV=${NODE_ENV} PREVIEW_ENV=${PREVIEW_ENV} yarn build
RUN npx update-browserslist-db@latest
RUN DATABASE_URL=${DATABASE_URL} NODE_ENV=${NODE_ENV} yarn db-migrate:prod
CMD ["yarn", "start:prod"]
