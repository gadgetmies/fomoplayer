# not in use
FROM node:18
RUN mkdir -p /usr/src/app
COPY . /usr/src/app
WORKDIR /usr/src/app/packages/front
RUN yarn
