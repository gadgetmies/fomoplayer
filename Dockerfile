FROM node:22 AS builder
WORKDIR /usr/src/app/
COPY . .
ARG NODE_ENV
ARG FRONTEND_URL
ARG API_URL
ARG PREVIEW_ENV
RUN yarn --frozen-lockfile
RUN FRONTEND_URL=${FRONTEND_URL} API_URL=${API_URL} NODE_ENV=${NODE_ENV} PREVIEW_ENV=${PREVIEW_ENV} yarn build
# patches/ are applied by patch-package on postinstall; any later `yarn add/remove/upgrade`
# re-links node_modules from the cache and silently reverts them. Fail the build if that happened.
RUN node -e "require('minio')"
# Migrations run as Railway's pre-deploy command (railway.json) with the
# service's runtime variables. Passing DATABASE_URL in as a build ARG printed
# the password in the build log and kept it in the image metadata.
CMD ["yarn", "start:prod"]
