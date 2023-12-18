# not in use
FROM node:18
ARG DATABASE_URL
ARG NODE_ENV
RUN mkdir -p /usr/src/app
COPY . /usr/src/app
WORKDIR /usr/src/app/
RUN yarn --frozen-lockfile && DATABASE_URL=${DATABASE_URL} NODE_ENV=${NODE_ENV} yarn workspace fomoplayer_back db-migrate:prod && yarn workspace fomoplayer_back start:prod
