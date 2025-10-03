# not in use
FROM node:22
RUN mkdir -p /usr/src/app
COPY . /usr/src/app
WORKDIR /usr/src/app/packages/back
RUN yarn
